import Anthropic from '@anthropic-ai/sdk';
import { DRAFTS_PER_VISITOR, DRAFT_MAX_TOKENS, DRAFT_MODEL, DRAFT_SCHEMA, DRAFT_SYSTEM, POSTCARD_SCHEMA, POSTCARD_SYSTEM, draftMessage, parseDraft, parseDraftBody, parsePostcard } from './draft';
import { DEFAULT_REVIEW_MONTHLY_CAP_CENTS, REVIEW_LOCK_SECONDS, REVIEW_MAX_BODY_BYTES, REVIEW_MAX_TOKENS, REVIEW_MODEL, REVIEW_RESERVE_MICROS, REVIEW_SCHEMA, REVIEW_SYSTEM, budgetMonth, parseReview, parseReviewBody, reviewBlock, reviewMessage, type ReviewError, type ReviewEvent, type ReviewStatus, type SavedReview } from './review';
import { ORDER_MAX_BODY_BYTES, ORDER_MAX_TOKENS, ORDER_MODEL, ORDER_SYSTEM, ORDER_TURNS_PER_VISITOR, TURN_SCHEMA, orderMessage, parseOrderBody } from './order';
import { parseTurn, type BotTurn } from '../src/pizza/orderbot';
import { GEOCODE_PER_VISITOR } from '../src/pizza/geocode';
import { censusLookUp, findAddress, parseGeocodeBody, type GeocodeReply, type LookUp } from './geocode';
import { PhoneLine, type LineNamespace } from './line';
import { NOT_SET_UP, say, VoiceSession, callTicket, callerFrom, connectTwiml, doneTwiml, fromTwilio, readTicket, tenDigits, twiml, type KitchenLoad, type SavedCustomer } from './voice';
import { geocodeQuery } from '../src/pizza/geocode';
import type { Deal } from '../src/pizza/deals';
import { PRACTICE_CALLS, report, runPractice } from './practice';
import { greeting } from '../src/pizza/orderbot';

export { PhoneLine };
import { DEFAULT_DAILY_CAP_CENTS, MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, MODEL, OUTPUT_SCHEMA, QUESTIONS_PER_VISITOR, PIZZA_SYSTEM, SYSTEM, budgetDay, costMicros, parseBody, parseReply, userMessage, type AskError, type AskReply, type Usage } from './ask';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Ctx { waitUntil(promise: Promise<unknown>): void }

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Keeps the day's spending. Without it no question is sent to Claude. */
  USAGE?: KV;
  /** The shop owner's own Anthropic API key, stored as a Cloudflare secret. */
  ANTHROPIC_API_KEY?: string;
  /** The most the chat may spend in one day, in cents. */
  DAILY_CAP_CENTS?: string;
  /** The most the deep review may spend in one month, in cents. */
  REVIEW_MONTHLY_CAP_CENTS?: string;
  /** The Twilio account's Auth Token, stored as a Cloudflare secret. Without it no phone call is answered. */
  TWILIO_AUTH_TOKEN?: string;
  /** Each shop phone line's orders and regulars. */
  PHONE_LINE?: LineNamespace;
}

export interface ModelResult {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: Usage;
}

/** Sends one question to Claude. Swapped for a stand-in by the tests. */
export type CallModel = (apiKey: string, user: string, system?: string) => Promise<ModelResult>;

const callClaude: CallModel = async (apiKey, user, system = SYSTEM) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 40_000 });
  return client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // If the model declines a question, Anthropic's recommended stand-in model answers it in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
};

/** Headers on every /api answer: never cached, never sniffed as something else, never framed. */
const API_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };

const json = (body: AskReply | BotTurn | GeocodeReply | ReviewStatus | { text: string } | { error: AskError | ReviewError } | { ready: boolean }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...API_HEADERS } });

/**
 * True when the request came from one of the app's own pages. Browsers always send Origin on a POST,
 * so other websites cannot spend the shop's AI budget from a visitor's browser. A missing, "null"
 * or garbled Origin is turned away instead of crashing the request.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const DAY = 60 * 60 * 24;

/**
 * Writes down what was spent. The store refuses a second write to the same key within a second, which happens when
 * two calls answer at once (found by the practice calls, 2026-11-16). A refused write is tried once more, and it
 * never throws: an answer that was already paid for must still reach the customer.
 */
export async function saveSpend(usage: KV, key: string, value: string, retryAfterMs = 1200): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await usage.put(key, value, { expirationTtl: 40 * DAY }); return; } catch (error) {
      if (attempt === 1) { console.error('Could not record spending', String(error).slice(0, 200)); return; }
      await new Promise((done) => setTimeout(done, retryAfterMs));
    }
  }
}

export async function handleAsk(request: Request, env: Env, call: CallModel = callClaude, now = new Date()): Promise<Response> {
  const ready = !!env.ANTHROPIC_API_KEY && !!env.USAGE;
  if (request.method === 'GET') return json({ ready });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  if (!ready) return json({ error: 'off' }, 503);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'bad' }, 413);
  const body = parseBody(await request.text());
  if (!body) return json({ error: 'bad' }, 400);

  const usage = env.USAGE!;
  const day = budgetDay(now);
  const capMicros = Math.max(0, Number(env.DAILY_CAP_CENTS ?? DEFAULT_DAILY_CAP_CENTS) || 0) * 10_000;
  const spendKey = `spend:${day}`;
  const visitorKey = `asks:${day}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
  const [spent, asked] = (await Promise.all([usage.get(spendKey), usage.get(visitorKey)])).map((v) => Number(v ?? 0) || 0);
  if (spent >= capMicros) return json({ error: 'capped' }, 429);
  if (asked >= QUESTIONS_PER_VISITOR) return json({ error: 'limit' }, 429);
  await usage.put(visitorKey, String(asked + 1), { expirationTtl: 2 * DAY });

  let result: ModelResult;
  try {
    result = await call(env.ANTHROPIC_API_KEY!, userMessage(body), body.mode === 'pizza' ? PIZZA_SYSTEM : SYSTEM);
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error('Claude request failed', error.status, error.message);
    else console.error('Claude request failed', error);
    return json({ error: 'busy' }, 502);
  }
  // Read the count again so two questions at once do not lose each other's spending.
  const latest = Number((await usage.get(spendKey)) ?? 0) || 0;
  await saveSpend(usage, spendKey, String(latest + costMicros(result.usage)));

  if (result.stop_reason === 'refusal') return json({ error: 'refused' }, 200);
  const text = result.content.find((b) => b.type === 'text')?.text;
  const reply = text ? parseReply(text, body.decisions.map((d) => d.id)) : null;
  // A reply cut off at the length limit is not valid JSON, so it lands here too.
  if (!reply) return json({ error: 'busy' }, 502);
  return json(reply);
}

/** Rewrites one customer text. Swapped for a stand-in by the tests. */
const callDraft: CallModel = async (apiKey, user, system = DRAFT_SYSTEM) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  return client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: DRAFT_MAX_TOKENS,
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: system === POSTCARD_SYSTEM ? POSTCARD_SCHEMA : DRAFT_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
};

/** POST rewrites a customer text. It shares the chat's daily budget and has its own count per visitor. */
export async function handleDraft(request: Request, env: Env, call: CallModel = callDraft, now = new Date()): Promise<Response> {
  const ready = !!env.ANTHROPIC_API_KEY && !!env.USAGE;
  if (request.method === 'GET') return json({ ready });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  if (!ready) return json({ error: 'off' }, 503);
  const body = parseDraftBody(await request.text());
  if (!body) return json({ error: 'bad' }, 400);

  const usage = env.USAGE!;
  const day = budgetDay(now);
  const capMicros = Math.max(0, Number(env.DAILY_CAP_CENTS ?? DEFAULT_DAILY_CAP_CENTS) || 0) * 10_000;
  const spendKey = `spend:${day}`;
  const visitorKey = `drafts:${day}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
  const [spent, asked] = (await Promise.all([usage.get(spendKey), usage.get(visitorKey)])).map((v) => Number(v ?? 0) || 0);
  if (spent >= capMicros) return json({ error: 'capped' }, 429);
  if (asked >= DRAFTS_PER_VISITOR) return json({ error: 'limit' }, 429);
  await usage.put(visitorKey, String(asked + 1), { expirationTtl: 2 * DAY });

  let result: ModelResult;
  try {
    result = await call(env.ANTHROPIC_API_KEY!, draftMessage(body), body.kind === 'postcard' ? POSTCARD_SYSTEM : DRAFT_SYSTEM);
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error('Draft request failed', error.status, error.message);
    else console.error('Draft request failed', error);
    return json({ error: 'busy' }, 502);
  }
  const latest = Number((await usage.get(spendKey)) ?? 0) || 0;
  await saveSpend(usage, spendKey, String(latest + costMicros(result.usage, DRAFT_MODEL)));
  if (result.stop_reason === 'refusal') return json({ error: 'refused' }, 200);
  const raw = result.content.find((b) => b.type === 'text')?.text;
  if (body.kind === 'postcard') {
    const card = raw ? parsePostcard(raw, body.current) : null;
    return card ? json(card) : json({ error: 'busy' }, 502);
  }
  const text = raw ? parseDraft(raw) : null;
  if (!text) return json({ error: 'busy' }, 502);
  return json({ text });
}

/** One turn of a phone or text order. Swapped for a stand-in by the tests. */
const callOrder: CallModel = async (apiKey, user) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
  return client.beta.messages.create({
    model: ORDER_MODEL,
    max_tokens: ORDER_MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // The rules and the whole menu never change between turns, so every turn after the first reads them from the cache.
    system: [{ type: 'text', text: ORDER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    // No thinking pass before the reply: a caller is waiting on the line, and the order is checked by KneadOS afterwards.
    thinking: { type: 'between_tools' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TURN_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
};

/**
 * The same turn on the fast model, for phone calls only, where every second of silence is felt.
 * Elias's second real call (2026-11-16) waited 2 to 4.5 seconds per reply on the model above.
 * KneadOS still prices and checks every order itself, and any turn this model cannot answer in time
 * goes to the model above instead.
 */
export const VOICE_FAST_MODEL = 'claude-haiku-5-5';
const VOICE_FAST_TIMEOUT_MS = 5_000;
const callOrderFast: CallModel = async (apiKey, user) => {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: VOICE_FAST_TIMEOUT_MS });
  return client.messages.create({
    model: VOICE_FAST_MODEL,
    max_tokens: ORDER_MAX_TOKENS,
    system: [{ type: 'text', text: ORDER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TURN_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
};

/**
 * POST takes the next thing a customer said on a call or in a text and returns what the AI says back
 * plus the whole order. It shares the chat's daily budget and has its own count per visitor.
 * Prices are never taken from the reply: the page (and, live, the server) works them out from the order.
 */
export async function handleOrder(request: Request, env: Env, call: CallModel = callOrder, now = new Date()): Promise<Response> {
  const ready = !!env.ANTHROPIC_API_KEY && !!env.USAGE;
  if (request.method === 'GET') return json({ ready });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  if (!ready) return json({ error: 'off' }, 503);
  if (Number(request.headers.get('content-length') ?? 0) > ORDER_MAX_BODY_BYTES) return json({ error: 'bad' }, 413);
  const body = parseOrderBody(await request.text());
  if (!body) return json({ error: 'bad' }, 400);

  const usage = env.USAGE!;
  const day = budgetDay(now);
  const capMicros = Math.max(0, Number(env.DAILY_CAP_CENTS ?? DEFAULT_DAILY_CAP_CENTS) || 0) * 10_000;
  const spendKey = `spend:${day}`;
  const visitorKey = `orders:${day}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
  const [spent, asked] = (await Promise.all([usage.get(spendKey), usage.get(visitorKey)])).map((v) => Number(v ?? 0) || 0);
  if (spent >= capMicros) return json({ error: 'capped' }, 429);
  if (asked >= ORDER_TURNS_PER_VISITOR) return json({ error: 'limit' }, 429);
  await usage.put(visitorKey, String(asked + 1), { expirationTtl: 2 * DAY });

  let result: ModelResult;
  try {
    result = await call(env.ANTHROPIC_API_KEY!, orderMessage(body));
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error('Order turn failed', error.status, error.message);
    else console.error('Order turn failed', error);
    return json({ error: 'busy' }, 502);
  }
  const latest = Number((await usage.get(spendKey)) ?? 0) || 0;
  await saveSpend(usage, spendKey, String(latest + costMicros(result.usage, ORDER_MODEL)));
  if (result.stop_reason === 'refusal') return json({ error: 'refused' }, 200);
  const text = result.content.find((b) => b.type === 'text')?.text;
  const turn = text ? parseTurn(text) : null;
  if (!turn) return json({ error: 'busy' }, 502);
  return json(turn);
}

/**
 * Real address lookup for the AI order taker: is this a real street address, and how far is it from the shop?
 * Only the address itself is sent to the US Census Bureau's public geocoder. Answers are kept for a month so a repeat is instant.
 */
export async function handleGeocode(request: Request, env: Env, lookUp: LookUp = censusLookUp, now = new Date()): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  const query = parseGeocodeBody(await request.text());
  if (!query) return json({ found: false });
  const usage = env.USAGE;
  const cacheKey = `geo:${query.toLowerCase()}`;
  if (usage) {
    const cached = await usage.get(cacheKey);
    if (cached) return json(JSON.parse(cached) as GeocodeReply);
    const visitorKey = `geocodes:${budgetDay(now)}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
    const asked = Number((await usage.get(visitorKey)) ?? 0) || 0;
    if (asked >= GEOCODE_PER_VISITOR) return json({ error: 'limit' }, 429);
    await usage.put(visitorKey, String(asked + 1), { expirationTtl: 2 * DAY });
  }
  let reply: GeocodeReply;
  try {
    const address = await findAddress(query, lookUp);
    reply = address ? { found: true, address } : { found: false };
  } catch (error) {
    console.error('Address lookup failed', error);
    return json({ error: 'busy' }, 502);
  }
  if (usage) await usage.put(cacheKey, JSON.stringify(reply), { expirationTtl: 30 * DAY });
  return json(reply);
}

/** Writes the deep review. Reports how much has been written so far, so the page can show progress. Swapped for a stand-in by the tests. */
export type CallReview = (apiKey: string, user: string, onProgress: (chars: number) => void) => Promise<ModelResult>;

const callReview: CallReview = async (apiKey, user, onProgress) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 280_000 });
  let chars = 0;
  // Streamed, because a careful review takes a minute or two to write.
  const stream = client.beta.messages.stream({
    model: REVIEW_MODEL,
    max_tokens: REVIEW_MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: REVIEW_SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
  stream.on('text', (delta) => { chars += delta.length; onProgress(chars); });
  return stream.finalMessage();
};

const REVIEW_KEY = 'review:latest';
const LOCK_KEY = 'review:lock';

async function reviewState(env: Env, now: Date) {
  const ready = !!env.ANTHROPIC_API_KEY && !!env.USAGE;
  const capMicros = Math.max(0, Number(env.REVIEW_MONTHLY_CAP_CENTS ?? DEFAULT_REVIEW_MONTHLY_CAP_CENTS) || 0) * 10_000;
  const spendKey = `reviewspend:${budgetMonth(now)}`;
  if (!env.USAGE) return { ready, saved: null as SavedReview | null, capMicros, spendKey, spentMicros: 0, blocked: 'off' as const, nextAt: undefined };
  const [rawSaved, lock, spent] = await Promise.all([env.USAGE.get(REVIEW_KEY), env.USAGE.get(LOCK_KEY), env.USAGE.get(spendKey)]);
  let saved: SavedReview | null = null;
  try { saved = rawSaved ? (JSON.parse(rawSaved) as SavedReview) : null; } catch { saved = null; }
  const spentMicros = Number(spent ?? 0) || 0;
  return { ready, saved, capMicros, spendKey, spentMicros, ...reviewBlock({ ready, locked: !!lock, lastAt: saved?.at, spentMicros, capMicros, now }) };
}

/**
 * GET returns the last review and whether a new one can start.
 * POST writes a new one and streams progress as one JSON object per line, ending with the review.
 */
export async function handleReview(request: Request, env: Env, ctx: Ctx, call: CallReview = callReview, now = new Date()): Promise<Response> {
  const state = await reviewState(env, now);
  if (request.method === 'GET') return json({ ready: state.ready, saved: state.saved, blocked: state.blocked, nextAt: state.nextAt });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  if (state.blocked) return json({ error: state.blocked }, state.blocked === 'off' ? 503 : 429);
  if (Number(request.headers.get('content-length') ?? 0) > REVIEW_MAX_BODY_BYTES) return json({ error: 'bad' }, 413);
  const body = parseReviewBody(await request.text());
  if (!body) return json({ error: 'bad' }, 400);

  const usage = env.USAGE!;
  // Take the lock and hold back the budget before the model is called, so a run that is cut off is still counted.
  await Promise.all([
    usage.put(LOCK_KEY, now.toISOString(), { expirationTtl: REVIEW_LOCK_SECONDS }),
    usage.put(state.spendKey, String(state.spentMicros + REVIEW_RESERVE_MICROS), { expirationTtl: 70 * DAY }),
  ]);

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let open = true;
  // The reader may leave before the review is done. The review is still finished and saved.
  const send = (event: ReviewEvent) => (open ? writer.write(encoder.encode(JSON.stringify(event) + '\n')).catch(() => { open = false; }) : Promise.resolve());

  const work = (async () => {
    let written = 0;
    void send({ t: 'start' });
    const beat = setInterval(() => void send({ t: 'wait', chars: written }), 5000);
    let outcome: ReviewEvent;
    let actualMicros = REVIEW_RESERVE_MICROS;
    try {
      const result = await call(env.ANTHROPIC_API_KEY!, reviewMessage(body), (chars) => { written = chars; });
      actualMicros = costMicros(result.usage, REVIEW_MODEL);
      const text = result.content.find((b) => b.type === 'text')?.text;
      const review = result.stop_reason !== 'refusal' && text ? parseReview(text) : null;
      if (review) {
        const saved: SavedReview = { review, at: new Date().toISOString(), shop: body.facts.shop, costMicros: actualMicros };
        await usage.put(REVIEW_KEY, JSON.stringify(saved));
        outcome = { t: 'done', saved };
      } else {
        outcome = { t: 'error', why: result.stop_reason === 'refusal' ? 'refused' : 'busy' };
      }
    } catch (error) {
      if (error instanceof Anthropic.APIError) console.error('Deep review failed', error.status, error.message);
      else console.error('Deep review failed', error);
      // A request Anthropic turned away outright was not billed. Anything else may have been, so the reserve stays.
      if (error instanceof Anthropic.APIError && typeof error.status === 'number' && error.status >= 400 && error.status < 500) actualMicros = 0;
      outcome = { t: 'error', why: 'busy' };
    }
    clearInterval(beat);
    const latest = Number((await usage.get(state.spendKey)) ?? 0) || 0;
    await Promise.all([
      usage.put(state.spendKey, String(Math.max(0, latest - REVIEW_RESERVE_MICROS + actualMicros)), { expirationTtl: 70 * DAY }),
      usage.delete(LOCK_KEY),
    ]);
    await send(outcome);
    await writer.close().catch(() => undefined);
  })();
  ctx.waitUntil(work);
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson', ...API_HEADERS } });
}

/* ================================================================ the real phone line */

const lineFor = (env: Env, to: string) => env.PHONE_LINE!.get(env.PHONE_LINE!.idFromName(to));
const voiceReady = (env: Env) => !!env.TWILIO_AUTH_TOKEN && !!env.PHONE_LINE && !!env.ANTHROPIC_API_KEY && !!env.USAGE;

async function twilioForm(request: Request, env: Env): Promise<Record<string, string> | null> {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(await request.text())) params[k] = v;
  return (await fromTwilio(env.TWILIO_AUTH_TOKEN!, request.url, params, request.headers.get('x-twilio-signature'))) ? params : null;
}

/** A call comes in: Twilio asks what to do. We answer with the greeting and hand the conversation to /api/voice/ws. */
export async function handleVoice(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!voiceReady(env)) return twiml(`${say(NOT_SET_UP)}<Hangup/>`);
  const form = await twilioForm(request, env);
  if (!form) return json({ error: 'bad' }, 403);
  const to = tenDigits(form.To);
  if (!to) return twiml(`${say(NOT_SET_UP)}<Hangup/>`);
  const from = tenDigits(form.From);
  const { customer } = (await (await lineFor(env, to).fetch(`https://line/ring?from=${from}`)).json()) as { customer: SavedCustomer | null };
  const hello = greeting(callerFrom(from, customer), 'call');
  return connectTwiml(new URL(request.url).host, hello, await callTicket(env.TWILIO_AUTH_TOKEN!, from, to));
}

/** The conversation is over: hang up, or say what a live shop would do with a handed-off call. */
export async function handleVoiceDone(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST' || !env.TWILIO_AUTH_TOKEN) return json({ error: 'bad' }, 405);
  const form = await twilioForm(request, env);
  if (!form) return json({ error: 'bad' }, 403);
  return doneTwiml(form.HandoffData);
}

interface ServerSocket { accept(): void; send(data: string): void; close(code?: number, reason?: string): void; addEventListener(type: 'message' | 'close' | 'error', listener: (event: { data?: unknown }) => void): void }
declare const WebSocketPair: { new (): { 0: unknown; 1: ServerSocket } };

/** One answer on a call: the fast model first, the careful one when it cannot answer. Counts what it spends. */
function voiceModel(env: Env, call: CallModel, fast: CallModel | null) {
  const usage = env.USAGE!;
  return async (user: string) => {
    const spendKey = `spend:${budgetDay(new Date())}`;
    const capMicros = Math.max(0, Number(env.DAILY_CAP_CENTS ?? DEFAULT_DAILY_CAP_CENTS) || 0) * 10_000;
    const spent = Number((await usage.get(spendKey)) ?? 0) || 0;
    if (spent >= capMicros) return null;
    let spentNow = spent;
    const ask = async (which: CallModel, name: string) => {
      const result = await which(env.ANTHROPIC_API_KEY!, user);
      spentNow += costMicros(result.usage, name);
      // Not waited for: the caller is on the line, and the answer does not depend on the bookkeeping.
      void saveSpend(usage, spendKey, String(spentNow));
      if (result.stop_reason === 'refusal') return null;
      const text = result.content.find((b) => b.type === 'text')?.text;
      return text ? parseTurn(text) : null;
    };
    // The fast model answers first. Anything it cannot answer cleanly and in time goes to the careful one.
    if (fast) {
      try {
        const quick = await ask(fast, VOICE_FAST_MODEL);
        if (quick) return quick;
        console.log(JSON.stringify({ voice: 'fast_model_no_answer' }));
      } catch (error) {
        console.log(JSON.stringify({ voice: 'fast_model_failed', detail: String(error).slice(0, 200) }));
      }
    }
    try {
      return await ask(call, ORDER_MODEL);
    } catch (error) {
      console.error('Voice turn failed', error);
      return null;
    }
  };
}

/** The live conversation: Twilio sends what the caller said as text, we send back what to say. */
export function handleVoiceSocket(request: Request, env: Env, call: CallModel = callOrder, fast: CallModel | null = call === callOrder ? callOrderFast : null): Response {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'bad' }, 426);
  if (!voiceReady(env)) return json({ error: 'off' }, 503);
  const pair = new WebSocketPair();
  const socket = pair[1];
  socket.accept();
  const send = (message: object) => { try { socket.send(JSON.stringify(message)); } catch { /* the caller hung up */ } };
  let session: VoiceSession | null = null;
  let closed = false;

  const model = voiceModel(env, call, fast);

  socket.addEventListener('message', (event) => {
    let message: { type?: string; customParameters?: { t?: unknown }; voicePrompt?: unknown; last?: boolean; utteranceUntilInterrupt?: unknown };
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.type === 'setup') {
      void readTicket(env.TWILIO_AUTH_TOKEN!, message.customParameters?.t).then(async (ticket) => {
        if (!ticket) { console.log(JSON.stringify({ voice: 'bad_ticket' })); socket.close(1008, 'not a call we answered'); return; }
        const line = lineFor(env, ticket.to);
        const { customer, busy, deals } = (await (await line.fetch(`https://line/ring?from=${ticket.from}`)).json()) as { customer: SavedCustomer | null; busy?: KitchenLoad; deals?: Deal[] };
        const call4 = ticket.from.slice(-4);
        console.log(JSON.stringify({ voice: 'call_started', caller: call4, known: Boolean(customer) }));
        session = new VoiceSession(callerFrom(ticket.from, customer), {
          model,
          busy,
          deals,
          log: (entry) => console.log(JSON.stringify({ voice: entry.event, caller: call4, ...entry })),
          lookUp: async (said) => { try { return await findAddress(geocodeQuery(said) || said); } catch { return undefined; } },
          line: {
            place: async (order, phone) => ((await (await line.fetch('https://line/place', { method: 'POST', body: JSON.stringify({ order, phone }) })).json()) as { number: number }).number,
          },
          say: (text) => send({ type: 'text', token: text, last: true }),
          end: (afterMs, reason) => { setTimeout(() => { if (!closed) send({ type: 'end', handoffData: JSON.stringify({ reason }) }); }, afterMs); },
        });
      });
    } else if (message.type === 'prompt' && message.last !== false && typeof message.voicePrompt === 'string') {
      void session?.heard(message.voicePrompt);
    } else if (message.type === 'error') {
      console.log(JSON.stringify({ voice: 'twilio_error', detail: String((message as { description?: unknown }).description ?? '').slice(0, 300) }));
    } else if (message.type === 'interrupt' && typeof message.utteranceUntilInterrupt === 'string') {
      session?.interrupted(message.utteranceUntilInterrupt);
    }
  });
  socket.addEventListener('close', () => { closed = true; console.log(JSON.stringify({ voice: 'call_ended' })); });
  socket.addEventListener('error', () => { closed = true; });
  return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
}

/** Practice calls a day, across everyone. One full run is a call per script. */
export const PRACTICE_CALLS_PER_DAY = 80;

/**
 * Practice calls. GET lists the scripts; POST ?id= runs one against the real phone assistant and says what it got wrong.
 * Nothing reaches the make line. It spends from the same daily budget as real calls and has its own daily count.
 */
export async function handlePractice(request: Request, env: Env, call: CallModel = callOrder, fast: CallModel | null = call === callOrder ? callOrderFast : null, lookUp: LookUp = censusLookUp, now = new Date()): Promise<Response> {
  const plain = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  if (request.method === 'GET') return plain({ calls: PRACTICE_CALLS.map((c) => ({ id: c.id, title: c.title })) });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  if (!env.ANTHROPIC_API_KEY || !env.USAGE) return json({ error: 'off' }, 503);
  const script = PRACTICE_CALLS.find((c) => c.id === new URL(request.url).searchParams.get('id'));
  if (!script) return json({ error: 'bad' }, 400);
  const countKey = `practice:${budgetDay(now)}`;
  const ran = Number((await env.USAGE.get(countKey)) ?? 0) || 0;
  if (ran >= PRACTICE_CALLS_PER_DAY) return json({ error: 'limit' }, 429);
  try { await env.USAGE.put(countKey, String(ran + 1), { expirationTtl: 2 * DAY }); } catch { /* several practice calls started at once: the count is a guard, not a bill */ }
  const result = await runPractice(script, voiceModel(env, call, fast), async (said) => { try { return await findAddress(geocodeQuery(said) || said, lookUp); } catch { return undefined; } });
  return plain(report(script, result));
}

/** The make line asks for the phone orders it has not shown yet. Knowing the shop's phone number is what lets a browser see them. */
export async function handlePhoneOrders(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'bad' }, 405);
  const url = new URL(request.url);
  const line = tenDigits(url.searchParams.get('line') ?? '');
  if (!line || !env.PHONE_LINE) return json({ error: 'bad' }, 400);
  const since = url.searchParams.get('since') ?? '';
  return lineFor(env, line).fetch(`https://line/orders?since=${encodeURIComponent(since)}`);
}

/** Deals the owner turned on are sent to the shop's phone line, so callers are offered them. GET reads them back. */
export async function handlePhoneDeals(request: Request, env: Env): Promise<Response> {
  const line = tenDigits(new URL(request.url).searchParams.get('line') ?? '');
  if (!line || !env.PHONE_LINE) return json({ error: 'bad' }, 400);
  if (request.method === 'GET') return lineFor(env, line).fetch('https://line/deals');
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad' }, 403);
  const body = await request.text();
  if (body.length > 8000) return json({ error: 'bad' }, 413);
  return lineFor(env, line).fetch('https://line/deals', { method: 'POST', body });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/ask') return handleAsk(request, env);
    if (pathname === '/api/review') return handleReview(request, env, ctx);
    if (pathname === '/api/draft') return handleDraft(request, env);
    if (pathname === '/api/order') return handleOrder(request, env);
    if (pathname === '/api/geocode') return handleGeocode(request, env);
    if (pathname === '/api/voice') return handleVoice(request, env);
    if (pathname === '/api/voice/ws') return handleVoiceSocket(request, env);
    if (pathname === '/api/voice/done') return handleVoiceDone(request, env);
    if (pathname === '/api/practice') return handlePractice(request, env);
    if (pathname === '/api/phone-deals') return handlePhoneDeals(request, env);
    if (pathname === '/api/phone-orders') return handlePhoneOrders(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'bad' }, 404);
    return env.ASSETS.fetch(request);
  },
};

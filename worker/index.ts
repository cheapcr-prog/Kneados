import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_REVIEW_MONTHLY_CAP_CENTS, REVIEW_LOCK_SECONDS, REVIEW_MAX_BODY_BYTES, REVIEW_MAX_TOKENS, REVIEW_MODEL, REVIEW_RESERVE_MICROS, REVIEW_SCHEMA, REVIEW_SYSTEM, budgetMonth, parseReview, parseReviewBody, reviewBlock, reviewMessage, type ReviewError, type ReviewEvent, type ReviewStatus, type SavedReview } from './review';
import { DEFAULT_DAILY_CAP_CENTS, MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, MODEL, OUTPUT_SCHEMA, QUESTIONS_PER_VISITOR, SYSTEM, budgetDay, costMicros, parseBody, parseReply, userMessage, type AskError, type AskReply, type Usage } from './ask';

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
}

export interface ModelResult {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: Usage;
}

/** Sends one question to Claude. Swapped for a stand-in by the tests. */
export type CallModel = (apiKey: string, user: string) => Promise<ModelResult>;

const callClaude: CallModel = async (apiKey, user) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 40_000 });
  return client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // If the model declines a question, Anthropic's recommended stand-in model answers it in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
};

const json = (body: AskReply | ReviewStatus | { error: AskError | ReviewError } | { ready: boolean }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const DAY = 60 * 60 * 24;

export async function handleAsk(request: Request, env: Env, call: CallModel = callClaude, now = new Date()): Promise<Response> {
  const ready = !!env.ANTHROPIC_API_KEY && !!env.USAGE;
  if (request.method === 'GET') return json({ ready });
  if (request.method !== 'POST') return json({ error: 'bad' }, 405);
  // Only the app's own pages may ask, so other sites cannot spend the shop's budget from a visitor's browser.
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: 'bad' }, 403);
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
    result = await call(env.ANTHROPIC_API_KEY!, userMessage(body));
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error('Claude request failed', error.status, error.message);
    else console.error('Claude request failed', error);
    return json({ error: 'busy' }, 502);
  }
  // Read the count again so two questions at once do not lose each other's spending.
  const latest = Number((await usage.get(spendKey)) ?? 0) || 0;
  await usage.put(spendKey, String(latest + costMicros(result.usage)), { expirationTtl: 40 * DAY });

  if (result.stop_reason === 'refusal') return json({ error: 'refused' }, 200);
  const text = result.content.find((b) => b.type === 'text')?.text;
  const reply = text ? parseReply(text, body.decisions.map((d) => d.id)) : null;
  // A reply cut off at the length limit is not valid JSON, so it lands here too.
  if (!reply) return json({ error: 'busy' }, 502);
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
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: 'bad' }, 403);
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
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/ask') return handleAsk(request, env);
    if (pathname === '/api/review') return handleReview(request, env, ctx);
    if (pathname.startsWith('/api/')) return json({ error: 'bad' }, 404);
    return env.ASSETS.fetch(request);
  },
};

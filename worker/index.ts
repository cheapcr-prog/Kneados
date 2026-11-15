import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_DAILY_CAP_CENTS, MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, MODEL, OUTPUT_SCHEMA, QUESTIONS_PER_VISITOR, SYSTEM, budgetDay, costMicros, parseBody, parseReply, userMessage, type AskError, type AskReply, type Usage } from './ask';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Keeps the day's spending. Without it no question is sent to Claude. */
  USAGE?: KV;
  /** The shop owner's own Anthropic API key, stored as a Cloudflare secret. */
  ANTHROPIC_API_KEY?: string;
  /** The most the chat may spend in one day, in cents. */
  DAILY_CAP_CENTS?: string;
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

const json = (body: AskReply | { error: AskError } | { ready: boolean }, status = 200) =>
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/ask') return handleAsk(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'bad' }, 404);
    return env.ASSETS.fetch(request);
  },
};

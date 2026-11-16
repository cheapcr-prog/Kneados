import { describe, expect, it } from 'vitest';
import { budgetDay, costMicros, parseBody, parseReply, userMessage } from './ask';
import { handleAsk, type CallModel, type Env } from './index';

const facts = { shop: 'Good Batch Donuts' };
const decisions = [{ id: 'po:flour', area: 'Supplies', urgency: 'today', title: 'Order flour', why: 'Two days left', action: 'Send order' }];
const good = JSON.stringify({ question: 'What needs ordering?', facts, decisions });

function kv(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return { data, get: async (k: string) => data.get(k) ?? null, put: async (k: string, v: string) => void data.set(k, v), delete: async (k: string) => void data.delete(k) };
}
const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('page') }, USAGE: kv(), ANTHROPIC_API_KEY: 'test-key', ...over });
const post = (body: string, origin = 'https://kneados.app') => new Request('https://kneados.app/api/ask', { method: 'POST', body, headers: { origin, 'cf-connecting-ip': '1.2.3.4' } });
const reply = (answer: string, ids: string[] = []): CallModel => async () => ({
  stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify({ answer, decision_ids: ids }) }], usage: { input_tokens: 3000, output_tokens: 400 },
});
const now = new Date('2026-11-15T18:00:00Z');

describe('the question the browser sends', () => {
  it('accepts a question with the shop snapshot', () => {
    expect(parseBody(good)?.question).toBe('What needs ordering?');
  });
  it('turns away empty, overlong and malformed questions', () => {
    expect(parseBody('not json')).toBeNull();
    expect(parseBody(JSON.stringify({ question: '  ', facts }))).toBeNull();
    expect(parseBody(JSON.stringify({ question: 'x'.repeat(401), facts }))).toBeNull();
    expect(parseBody(JSON.stringify({ question: 'hi' }))).toBeNull();
  });
  it('keeps only the last three earlier turns', () => {
    const history = [1, 2, 3, 4, 5].map((n) => ({ q: `q${n}`, a: `a${n}` }));
    expect(parseBody(JSON.stringify({ question: 'hi', facts, history }))?.history?.map((h) => h.q)).toEqual(['q3', 'q4', 'q5']);
  });
  it('puts the snapshot first and the question last', () => {
    const text = userMessage(parseBody(good)!);
    expect(text.indexOf('Good Batch Donuts')).toBeLessThan(text.indexOf('What needs ordering?'));
    expect(text).toContain('po:flour');
  });
});

describe('the reply', () => {
  it('drops decision ids the model was not given', () => {
    expect(parseReply(JSON.stringify({ answer: 'Order flour.', decision_ids: ['po:flour', 'made-up'] }), ['po:flour'])).toEqual({ text: 'Order flour.', decisionIds: ['po:flour'] });
  });
  it('is rejected when it is not the expected shape', () => {
    expect(parseReply('{"answer": "cut off', [])).toBeNull();
    expect(parseReply('{"answer": ""}', [])).toBeNull();
  });
});

describe('the daily budget', () => {
  it('prices a reply at the list price', () => {
    // 3,000 tokens in at $2 per million and 400 out at $10 per million is 1 cent.
    expect(costMicros({ input_tokens: 3000, output_tokens: 400 })).toBe(10_000);
    expect(costMicros({ input_tokens: 3000, output_tokens: 400 }, 'claude-fable-5-2')).toBe(40_000);
  });
  it('starts over at midnight in the shop, not in London', () => {
    expect(budgetDay(new Date('2026-11-16T07:30:00Z'))).toBe('2026-11-15');
    expect(budgetDay(new Date('2026-11-16T08:30:00Z'))).toBe('2026-11-16');
  });
});

describe('/api/ask', () => {
  it('answers and records what the answer cost', async () => {
    const e = env();
    const res = await handleAsk(post(good), e, reply('Send the flour order.', ['po:flour']), now);
    expect(await res.json()).toEqual({ text: 'Send the flour order.', decisionIds: ['po:flour'] });
    expect(await e.USAGE!.get('spend:2026-11-15')).toBe('10000');
    expect(await e.USAGE!.get('asks:2026-11-15:1.2.3.4')).toBe('1');
  });
  it('stops for the day once the cap is spent, without calling Claude', async () => {
    let called = false;
    const e = env({ USAGE: kv({ 'spend:2026-11-15': '2000000' }) });
    const res = await handleAsk(post(good), e, async () => { called = true; throw new Error('should not run'); }, now);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'capped' });
    expect(called).toBe(false);
  });
  it('honors a lower cap set in Cloudflare', async () => {
    const e = env({ DAILY_CAP_CENTS: '1', USAGE: kv({ 'spend:2026-11-15': '10000' }) });
    expect((await handleAsk(post(good), e, reply('x'), now)).status).toBe(429);
  });
  it('limits how many questions one visitor can ask in a day', async () => {
    const e = env({ USAGE: kv({ 'asks:2026-11-15:1.2.3.4': '30' }) });
    expect(await (await handleAsk(post(good), e, reply('x'), now)).json()).toEqual({ error: 'limit' });
  });
  it('stays off until both the key and the spending counter are in place', async () => {
    expect(await (await handleAsk(post(good), env({ ANTHROPIC_API_KEY: undefined }), reply('x'), now)).json()).toEqual({ error: 'off' });
    expect(await (await handleAsk(post(good), env({ USAGE: undefined }), reply('x'), now)).json()).toEqual({ error: 'off' });
    const status = await handleAsk(new Request('https://kneados.app/api/ask'), env({ ANTHROPIC_API_KEY: undefined }));
    expect(await status.json()).toEqual({ ready: false });
  });
  it('refuses questions sent from another site', async () => {
    expect((await handleAsk(post(good, 'https://elsewhere.example'), env(), reply('x'), now)).status).toBe(403);
  });
  it('still counts the cost when the model declines', async () => {
    const e = env();
    const res = await handleAsk(post(good), e, async () => ({ stop_reason: 'refusal', content: [], usage: { input_tokens: 1000, output_tokens: 0 } }), now);
    expect(await res.json()).toEqual({ error: 'refused' });
    expect(await e.USAGE!.get('spend:2026-11-15')).toBe('2000');
  });
  it('reports a failed request without charging the budget', async () => {
    const e = env();
    const res = await handleAsk(post(good), e, async () => { throw new Error('network'); }, now);
    expect(await res.json()).toEqual({ error: 'busy' });
    expect(await e.USAGE!.get('spend:2026-11-15')).toBeNull();
  });
});

describe('pizza mode', () => {
  it('gives pizza shops their own instructions', async () => {
    const { PIZZA_SYSTEM, SYSTEM } = await import('./ask');
    expect(PIZZA_SYSTEM).not.toBe(SYSTEM);
    expect(PIZZA_SYSTEM).toContain('pizza shop');
    expect(PIZZA_SYSTEM).toContain('48 hours ahead');
  });
  it('sends the pizza instructions when a pizza shop asks', async () => {
    let used = '';
    const call: CallModel = async (_k, _u, system) => { used = system ?? ''; return reply('Make 60 large')(_k, _u); };
    const res = await handleAsk(post(JSON.stringify({ mode: 'pizza', question: 'How much dough?', facts, decisions })), env(), call, now);
    expect(res.status).toBe(200);
    expect(used).toContain('pizza shop');
  });
  it('keeps the donut instructions by default', async () => {
    let used = '';
    const call: CallModel = async (_k, _u, system) => { used = system ?? ''; return reply('ok')(_k, _u); };
    await handleAsk(post(good), env(), call, now);
    expect(used).toContain('donut shop');
  });
});

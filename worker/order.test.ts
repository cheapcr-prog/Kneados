import { describe, expect, it } from 'vitest';
import { handleOrder, type CallModel, type Env } from './index';
import { ORDER_SYSTEM, ORDER_TURNS_PER_VISITOR, orderMessage, parseOrderBody } from './order';

const context = { surface: 'call', caller: { number: '(562) 555-2000', known: true }, ticket: { lines: [], total: '$0.00' } };
const body = (over: Record<string, unknown> = {}) => JSON.stringify({ surface: 'call', transcript: [{ who: 'ai', text: 'Thanks for calling.' }, { who: 'customer', text: 'A large pepperoni for pickup' }], context, ...over });
function kv(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return { data, get: async (k: string) => data.get(k) ?? null, put: async (k: string, v: string) => void data.set(k, v), delete: async (k: string) => void data.delete(k) };
}
const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('page') }, USAGE: kv(), ANTHROPIC_API_KEY: 'test-key', ...over });
const post = (b = body(), origin = 'https://kneados.app') => new Request('https://kneados.app/api/order', { method: 'POST', body: b, headers: { origin, 'cf-connecting-ip': '1.2.3.4' } });
const turn = { say: 'Large pepperoni for pickup. Your total is {total}.', action: 'continue', order: { items: [{ kind: 'pizza', specialty: 'pepperoni', size: 'L', crust: '', sauce: '', cheese: '', add: [], remove: [], notes: [], side: '', qty: 1 }], fulfillment: 'pickup', name: '', address: '', payment: '', note: '' } };
const says = (t: unknown): CallModel => async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(t) }], usage: { input_tokens: 1000, output_tokens: 200 } });
const now = new Date('2026-11-16T18:00:00Z');

describe('a turn of a phone or text order', () => {
  it('needs a surface, a snapshot and a customer line last', () => {
    expect(parseOrderBody(body())?.transcript).toHaveLength(2);
    expect(parseOrderBody(body({ surface: 'fax' }))).toBeNull();
    expect(parseOrderBody(body({ context: null }))).toBeNull();
    expect(parseOrderBody(body({ transcript: [{ who: 'ai', text: 'Hi' }] }))).toBeNull();
    expect(parseOrderBody('not json')).toBeNull();
  });
  it('trims long lines and hands the model the snapshot and the conversation', () => {
    const b = parseOrderBody(body({ transcript: [{ who: 'customer', text: 'x'.repeat(900) }] }))!;
    expect(b.transcript[0].text).toHaveLength(500);
    const text = orderMessage(parseOrderBody(body())!);
    expect(text).toContain('<kneados_snapshot>');
    expect(text).toContain('Customer: A large pepperoni for pickup');
    expect(text).toContain('You: Thanks for calling.');
  });
  it('gives the model the menu and tells it never to say a price itself', () => {
    expect(ORDER_SYSTEM).toContain('supreme: The Supreme');
    expect(ORDER_SYSTEM).toContain('{total}');
    expect(ORDER_SYSTEM).toContain('Never take or repeat a card number');
  });
});

describe('/api/order', () => {
  it('returns what to say and the order, and adds the cost to the day', async () => {
    const e = env();
    const res = await handleOrder(post(), e, says(turn), now);
    expect(await res.json()).toEqual(turn);
    // 1,000 tokens in at $2 and 200 out at $10 per million is 4,000 millionths of a dollar.
    expect((e.USAGE as ReturnType<typeof kv>).data.get('spend:2026-11-16')).toBe('4000');
  });
  it('says whether the live AI is on', async () => {
    expect(await (await handleOrder(new Request('https://kneados.app/api/order'), env())).json()).toEqual({ ready: true });
    expect(await (await handleOrder(new Request('https://kneados.app/api/order'), env({ ANTHROPIC_API_KEY: undefined }))).json()).toEqual({ ready: false });
  });
  it('turns away other websites, bad requests and replies that are not an order', async () => {
    expect((await handleOrder(post(body(), 'https://evil.example'), env(), says(turn), now)).status).toBe(403);
    expect((await handleOrder(post('{}'), env(), says(turn), now)).status).toBe(400);
    expect((await handleOrder(post(), env(), says({ hello: 1 }), now)).status).toBe(502);
  });
  it('stops at the daily budget and at the visitor limit', async () => {
    expect((await handleOrder(post(), env({ USAGE: kv({ 'spend:2026-11-16': '2000000' }) }), says(turn), now)).status).toBe(429);
    const res = await handleOrder(post(), env({ USAGE: kv({ 'orders:2026-11-16:1.2.3.4': String(ORDER_TURNS_PER_VISITOR) }) }), says(turn), now);
    expect(await res.json()).toEqual({ error: 'limit' });
  });
});

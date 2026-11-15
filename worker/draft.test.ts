import { describe, expect, it } from 'vitest';
import { draftMessage, parseDraft, parseDraftBody } from './draft';
import { handleDraft, type CallModel, type Env } from './index';

const current = "Hi {name}, it's Good Batch Donuts. We miss you. Your next {favorite} is on us this week.";
const good = JSON.stringify({ kind: 'winback', shop: 'Good Batch Donuts', current });
function kv(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return { data, get: async (k: string) => data.get(k) ?? null, put: async (k: string, v: string) => void data.set(k, v), delete: async (k: string) => void data.delete(k) };
}
const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('page') }, USAGE: kv(), ANTHROPIC_API_KEY: 'test-key', ...over });
const post = (body = good, origin = 'https://kneados.app') => new Request('https://kneados.app/api/draft', { method: 'POST', body, headers: { origin, 'cf-connecting-ip': '1.2.3.4' } });
const writes = (text: string): CallModel => async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ text }) }], usage: { input_tokens: 400, output_tokens: 300 } });
const now = new Date('2026-11-15T18:00:00Z');

describe('a request to rewrite a text', () => {
  it('needs a known kind, a shop and wording', () => {
    expect(parseDraftBody(good)?.kind).toBe('winback');
    expect(parseDraftBody(JSON.stringify({ kind: 'spam', shop: 'x', current }))).toBeNull();
    expect(parseDraftBody(JSON.stringify({ kind: 'winback', shop: '', current }))).toBeNull();
    expect(parseDraftBody(JSON.stringify({ kind: 'winback', shop: 'x', current: 'hi' }))).toBeNull();
  });
  it('hands the model the kind, the shop and the wording', () => {
    const text = draftMessage(parseDraftBody(good)!);
    expect(text).toContain('Win-back');
    expect(text).toContain('{favorite}');
  });
  it('tidies the reply and turns away an empty one', () => {
    expect(parseDraft(JSON.stringify({ text: '  Hi {name},\n come back to Good Batch Donuts.  ' }))).toBe('Hi {name}, come back to Good Batch Donuts.');
    expect(parseDraft(JSON.stringify({ text: 'Hi' }))).toBeNull();
    expect(parseDraft('not json')).toBeNull();
  });
});

describe('/api/draft', () => {
  it('returns the rewritten text and adds the cost to the day', async () => {
    const e = env();
    const res = await handleDraft(post(), e, writes('Hi {name}, Good Batch Donuts here. Your next {favorite} is on us this week.'), now);
    expect(await res.json()).toEqual({ text: 'Hi {name}, Good Batch Donuts here. Your next {favorite} is on us this week.' });
    // 400 tokens in at 10 cents and 300 out at 50 cents per million is 190 millionths of a dollar.
    expect((e.USAGE as ReturnType<typeof kv>).data.get('spend:2026-11-15')).toBe('190');
  });
  it('stops at the daily budget, the visitor limit and other sites', async () => {
    expect((await handleDraft(post(), env({ USAGE: kv({ 'spend:2026-11-15': '2000000' }) }), writes('x'), now)).status).toBe(429);
    expect((await handleDraft(post(), env({ USAGE: kv({ 'drafts:2026-11-15:1.2.3.4': '40' }) }), writes('x'), now)).status).toBe(429);
    expect((await handleDraft(post(good, 'https://evil.example'), env(), writes('x'), now)).status).toBe(403);
    expect((await handleDraft(post(), env({ ANTHROPIC_API_KEY: undefined }), writes('x'), now)).status).toBe(503);
  });
});

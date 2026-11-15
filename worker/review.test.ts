import { describe, expect, it } from 'vitest';
import { handleReview, type CallReview, type Env } from './index';
import { REVIEW_RESERVE_MICROS, budgetMonth, parseReview, parseReviewBody, reviewBlock, reviewMessage, type ReviewEvent, type ReviewStatus, type SavedReview } from './review';

const facts = { shop: 'Good Batch Donuts', money: { salesCents: 4200000 } };
const good = JSON.stringify({ facts, decisions: [{ id: 'menu:tiger', area: 'Menu', urgency: 'week', title: 'Drop the tiger tail', why: 'It loses money', action: 'Drop it' }] });
const written = {
  headline: 'Waste on two items is eating the margin.',
  summary: 'The shop is steady.',
  sections: [{ area: 'Waste', title: 'Bake fewer crullers', finding: 'A third go unsold.', evidence: 'Waste rate 31%.', action: 'Cut the cruller bake by a tray.', impact: 'About a tray a day saved.', effort: 'quick' }],
  first_week: ['Cut the cruller bake.'], watch: ['Waste rate above 12%.'], not_tracked: [],
};

function kv(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return { data, get: async (k: string) => data.get(k) ?? null, put: async (k: string, v: string) => void data.set(k, v), delete: async (k: string) => void data.delete(k) };
}
const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('page') }, USAGE: kv(), ANTHROPIC_API_KEY: 'test-key', ...over });
const post = (body = good, origin = 'https://kneados.app') => new Request('https://kneados.app/api/review', { method: 'POST', body, headers: { origin } });
const get = () => new Request('https://kneados.app/api/review');
const now = new Date('2026-11-15T18:00:00Z');
const month = budgetMonth(now);
function ctx() {
  const jobs: Promise<unknown>[] = [];
  return { jobs, waitUntil: (p: Promise<unknown>) => void jobs.push(p) };
}
const writes = (usage = { input_tokens: 6000, output_tokens: 9000 }): CallReview => async (_key, _user, onProgress) => {
  onProgress(1200);
  return { stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(written) }], usage };
};
const events = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as ReviewEvent);

describe('what the browser sends for a review', () => {
  it('needs a shop snapshot', () => {
    expect(parseReviewBody(good)?.facts.shop).toBe('Good Batch Donuts');
    expect(parseReviewBody('nope')).toBeNull();
    expect(parseReviewBody(JSON.stringify({ decisions: [] }))).toBeNull();
    expect(parseReviewBody(JSON.stringify({ facts: {} }))).toBeNull();
  });
  it('sends the snapshot and the waiting decisions to the model', () => {
    const text = reviewMessage(parseReviewBody(good)!);
    expect(text).toContain('4200000');
    expect(text).toContain('Drop the tiger tail');
  });
});

describe('reading the review the model wrote', () => {
  it('keeps a well formed review', () => {
    const r = parseReview(JSON.stringify(written))!;
    expect(r.sections[0].effort).toBe('quick');
    expect(r.firstWeek).toEqual(['Cut the cruller bake.']);
  });
  it('turns away a review that was cut off or has no findings', () => {
    expect(parseReview(JSON.stringify(written).slice(0, 80))).toBeNull();
    expect(parseReview(JSON.stringify({ ...written, sections: [] }))).toBeNull();
  });
});

describe('when a new review may start', () => {
  const base = { ready: true, locked: false, spentMicros: 0, capMicros: 5_000_000, now };
  it('is open when nothing stands in the way', () => {
    expect(reviewBlock(base)).toEqual({});
  });
  it('waits while one is being written, after a recent one, and when the month is spent', () => {
    expect(reviewBlock({ ...base, locked: true }).blocked).toBe('running');
    expect(reviewBlock({ ...base, lastAt: '2026-11-15T15:00:00Z' })).toEqual({ blocked: 'recent', nextAt: '2026-11-15T21:00:00.000Z' });
    expect(reviewBlock({ ...base, lastAt: '2026-11-15T11:00:00Z' })).toEqual({});
    expect(reviewBlock({ ...base, spentMicros: 4_500_000 }).blocked).toBe('budget');
    expect(reviewBlock({ ...base, ready: false }).blocked).toBe('off');
  });
});

describe('/api/review', () => {
  it('says it is off until a key is added', async () => {
    const res = await handleReview(get(), env({ ANTHROPIC_API_KEY: undefined }), ctx(), writes(), now);
    expect(await res.json()).toMatchObject({ ready: false, saved: null, blocked: 'off' });
  });
  it('writes a review, saves it for the next visitor and records what it cost', async () => {
    const e = env();
    const c = ctx();
    const res = await handleReview(post(), e, c, writes(), now);
    const lines = await events(res);
    await Promise.all(c.jobs);
    expect(lines[0]).toEqual({ t: 'start' });
    const done = lines[lines.length - 1] as { t: 'done'; saved: SavedReview };
    expect(done.t).toBe('done');
    expect(done.saved.review.headline).toContain('Waste');
    // 6,000 tokens in at $8 and 9,000 out at $40 per million is 40.8 cents.
    expect(done.saved.costMicros).toBe(408_000);
    const store = (e.USAGE as ReturnType<typeof kv>).data;
    expect(store.get(`reviewspend:${month}`)).toBe('408000');
    expect(store.has('review:lock')).toBe(false);
    const status = (await (await handleReview(get(), e, ctx(), writes(), now)).json()) as ReviewStatus;
    expect(status.saved?.review.sections).toHaveLength(1);
    expect(status.blocked).toBe('recent');
  });
  it('does not start a second review right after one, or from another site', async () => {
    const e = env();
    const c = ctx();
    await events(await handleReview(post(), e, c, writes(), now));
    await Promise.all(c.jobs);
    let called = false;
    const spy: CallReview = async (...a) => { called = true; return writes()(...a); };
    expect((await handleReview(post(), e, ctx(), spy, now)).status).toBe(429);
    expect((await handleReview(post(good, 'https://evil.example'), env(), ctx(), spy, now)).status).toBe(403);
    expect(called).toBe(false);
  });
  it('stops when the month is spent', async () => {
    const e = env({ USAGE: kv({ [`reviewspend:${month}`]: '4600000' }) });
    const res = await handleReview(post(), e, ctx(), writes(), now);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'budget' });
  });
  it('keeps the reserve when the model fails, and frees the lock', async () => {
    const e = env();
    const c = ctx();
    const fails: CallReview = async () => { throw new Error('timeout'); };
    const lines = await events(await handleReview(post(), e, c, fails, now));
    await Promise.all(c.jobs);
    expect(lines[lines.length - 1]).toEqual({ t: 'error', why: 'busy' });
    const store = (e.USAGE as ReturnType<typeof kv>).data;
    expect(store.get(`reviewspend:${month}`)).toBe(String(REVIEW_RESERVE_MICROS));
    expect(store.has('review:lock')).toBe(false);
    expect(store.has('review:latest')).toBe(false);
  });
  it('reports a refusal and a cut off reply without saving them', async () => {
    const refused: CallReview = async () => ({ stop_reason: 'refusal', content: [], usage: { input_tokens: 100, output_tokens: 0 } });
    const c = ctx();
    const a = await events(await handleReview(post(), env(), c, refused, now));
    expect(a[a.length - 1]).toEqual({ t: 'error', why: 'refused' });
    const cut: CallReview = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"headline":"x' }], usage: { input_tokens: 100, output_tokens: 100 } });
    const b = await events(await handleReview(post(), env(), ctx(), cut, now));
    expect(b[b.length - 1]).toEqual({ t: 'error', why: 'busy' });
  });
});

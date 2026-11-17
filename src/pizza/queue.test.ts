import { describe, expect, it } from 'vitest';
import { recentStatus } from './orderbot';
import { mergeQueue, queueLoad, stageOf, type QueueTicket, type TicketIn } from './queue';

const now = Date.UTC(2026, 10, 17, 2, 0);
const min = 60_000;
const t = (id: string, pies: number, status: TicketIn['status'], o: Partial<TicketIn> & { placedAgo?: number; dueIn?: number } = {}): TicketIn => {
  const { placedAgo = 5, dueIn = 20, ...rest } = o;
  return { id, number: Number(id.slice(3)), channel: 'counter', fulfillment: 'pickup', pies, status, createdAt: new Date(now - placedAgo * min).toISOString(), promisedAt: new Date(now + dueIn * min).toISOString(), drive: 0, ...rest };
};
const q = (list: TicketIn[]): QueueTicket[] => mergeQueue([], list, now);

describe('one make line for every kind of order (Elias, 2026-11-17: "wait times should calculate all")', () => {
  it('with a make line screen open, counts what the crew tapped', () => {
    const queue = q([t('pz-1', 3, 'new'), t('pz-2', 2, 'oven', { channel: 'online' }), t('pz-3', 4, 'ready', { channel: 'phone' }), t('pz-4', 1, 'out'), t('pz-5', 6, 'done')]);
    expect(queueLoad(queue, now, true)).toEqual({ ahead: 3, inOven: 2 });
  });

  it('leaves out pre-orders for later, orders with no pizza, and tickets abandoned long ago', () => {
    const queue = q([t('pz-1', 8, 'new', { scheduled: true }), t('pz-2', 0, 'new'), t('pz-3', 5, 'new', { placedAgo: 200, dueIn: -120 }), t('pz-4', 2, 'new')]);
    expect(queueLoad(queue, now, true)).toEqual({ ahead: 2, inOven: 0 });
  });

  it('with no screen open, places open tickets by the clock', () => {
    const waiting = q([t('pz-1', 2, 'new', { dueIn: 20 })])[0];
    const baking = q([t('pz-2', 2, 'new', { dueIn: 6 })])[0];
    const due = q([t('pz-3', 2, 'new', { dueIn: -1 })])[0];
    const driving = q([t('pz-4', 2, 'new', { dueIn: 10, drive: 12, fulfillment: 'delivery' })])[0];
    expect([waiting, baking, due, driving].map((x) => stageOf(x, now, false))).toEqual(['new', 'oven', 'ready', 'ready']);
    expect(queueLoad([waiting, baking, due, driving], now, false)).toEqual({ ahead: 2, inOven: 2 });
    // A stage the crew tapped before the screen closed is kept when it is past the oven.
    expect(stageOf(q([t('pz-5', 1, 'out', { dueIn: 15 })])[0], now, false)).toBe('out');
  });

  it('only moves a ticket forward, unless it is a new order under the same id', () => {
    const start = q([t('pz-1', 2, 'oven')]);
    expect(mergeQueue(start, [t('pz-1', 2, 'new')], now)[0].status).toBe('oven');
    expect(mergeQueue(start, [t('pz-1', 2, 'ready')], now)[0].status).toBe('ready');
    expect(mergeQueue(start, [t('pz-1', 2, 'new', { placedAgo: 1 })], now)[0].status).toBe('new');
  });

  it('a demo reset swaps everything except phone orders', () => {
    const start = q([t('pz-1', 2, 'oven'), t('pz-2', 1, 'new'), t('pz-7001', 1, 'new', { channel: 'phone' })]);
    expect(mergeQueue(start, [t('pz-1', 2, 'new', { placedAgo: 2 })], now, true).map((x) => `${x.id}:${x.status}`).sort()).toEqual(['pz-1:new', 'pz-7001:new']);
  });
});

describe('what a caller hears about their order', () => {
  const recent = { number: 7004, fulfillment: 'delivery' as const, readyAt: now + 20 * min, summary: 'a large pepperoni' };
  it('says the stage only when the make line has it', () => {
    expect(recentStatus(recent, now)).toContain('is being made');
    expect(recentStatus({ ...recent, stage: 'new' }, now)).toContain('is on the make line and should be at your door around');
    expect(recentStatus({ ...recent, stage: 'oven' }, now)).toContain('is in the oven');
    expect(recentStatus({ ...recent, stage: 'ready' }, now)).toContain('boxed and waiting for a driver');
    expect(recentStatus({ ...recent, stage: 'out' }, now)).toContain('is out for delivery');
    expect(recentStatus({ ...recent, stage: 'done' }, now)).toContain('marked delivered');
    expect(recentStatus({ ...recent, fulfillment: 'pickup', stage: 'ready' }, now)).toContain('ready for pickup at the counter');
  });
  it('owns up when it is running behind', () => {
    expect(recentStatus({ ...recent, stage: 'oven' }, now + 25 * min)).toBe("Your order number 7004 is running behind, I'm sorry. It is in the oven right now.");
  });
});

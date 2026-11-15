import { describe, expect, it } from 'vitest';
import { MENU_BY_ID, STAFF_BY_ID } from '../data/shop';
import type { Order } from '../data/types';
import { packSeconds, planWorkload } from './workload';

const order = (number: number, pickupAt: string, qty: number, status: Order['status'] = 'new'): Order => ({
  id: `o-${number}`, number, source: 'online', createdAt: '2026-01-05T12:00:00.000Z', pickupAt, status,
  lines: [{ itemId: 'glazed', qty, lineCents: 0 }], subtotal: 0, tax: 0, tip: 0, total: 0, payment: 'online',
});
const now = new Date('2026-01-05T15:00:00.000Z');
const { jess, andre, danny, luis } = STAFF_BY_ID;

describe('planWorkload', () => {
  it('takes longer to pack a bigger order', () => {
    expect(packSeconds(order(1, '', 12), MENU_BY_ID)).toBeGreaterThan(packSeconds(order(2, '', 1), MENU_BY_ID));
  });

  it('gives each order to whoever has the least to pack, soonest first', () => {
    const orders = [order(3, '2026-01-05T16:00:00.000Z', 2), order(1, '2026-01-05T15:20:00.000Z', 24), order(2, '2026-01-05T15:30:00.000Z', 2)];
    const w = planWorkload(orders, [jess, andre, danny, luis], MENU_BY_ID, now);
    expect(w.packers.map((s) => s.id)).toEqual(['jess', 'andre']);
    expect(w.queue.map((a) => [a.orderId, a.staffId])).toEqual([['o-1', 'jess'], ['o-2', 'andre'], ['o-3', 'andre']]);
    expect(w.load.jess).toBe(packSeconds(orders[1], MENU_BY_ID));
  });

  it('says pack now once the start-by time has passed', () => {
    const w = planWorkload([order(1, '2026-01-05T15:04:00.000Z', 2), order(2, '2026-01-05T16:00:00.000Z', 2)], [jess], MENU_BY_ID, now);
    expect(w.queue.map((a) => a.packNow)).toEqual([true, false]);
  });

  it('falls back to a manager, then bakers, and to nobody when the shop is empty', () => {
    const orders = [order(1, '2026-01-05T15:20:00.000Z', 2)];
    expect(planWorkload(orders, [danny, luis], MENU_BY_ID, now).queue[0].staffId).toBe('danny');
    expect(planWorkload(orders, [luis], MENU_BY_ID, now).queue[0].staffId).toBe('luis');
    expect(planWorkload(orders, [], MENU_BY_ID, now).queue[0].staffId).toBeUndefined();
  });

  it('skips finished orders and does not count ready ones as work', () => {
    const w = planWorkload([order(1, '2026-01-05T15:20:00.000Z', 2, 'done'), order(2, '2026-01-05T15:30:00.000Z', 2, 'ready')], [jess], MENU_BY_ID, now);
    expect(w.queue.map((a) => a.orderId)).toEqual(['o-2']);
    expect(w.load.jess).toBe(0);
  });
});

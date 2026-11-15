import { describe, expect, it } from 'vitest';
import { delivered, draftPO, nextDelivery, onOrder, poEmail, type Supplier } from './purchasing';
import type { Supply, SupplyPlan, SupplyStatus } from './supplies';

const supplier: Supplier = { name: 'Bakery supplier', rep: 'Marco D.', email: 'orders@bakery.example', phone: '5625550160', account: 'GB-1', deliveryDays: [1, 2, 3, 4, 5, 6], minOrderCents: 15000, autoSend: true };

const plan = (id: string, status: SupplyStatus, packs: number, packCents: number, over: Partial<Supply> = {}): SupplyPlan => ({
  supply: { id, name: id, unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents, supplier: 'Bakery supplier', leadDays: 2, onHand: 0, ...over },
  stock: 0, dailyUse: 1, daysLeft: 1, runOut: null, orderBy: null, arrives: null, status, short: false, packs, cents: packs * packCents, reason: '',
});

// 2026-11-16 is a Monday.
const today = '2026-11-16';

describe('draftPO', () => {
  it('returns nothing when no supply is due today', () => {
    expect(draftPO(supplier, [plan('mix', 'order-soon', 2, 4000)], today)).toBeNull();
  });
  it('orders what is due and totals it', () => {
    const po = draftPO(supplier, [plan('shortening', 'order-now', 3, 7200), plan('mix', 'ok', 2, 4000), plan('cups', 'order-now', 1, 100, { supplier: 'Other' })], today)!;
    expect(po.lines.map((l) => [l.supplyId, l.packs, l.qty, l.early])).toEqual([['shortening', 3, 150, false]]);
    expect(po.totalCents).toBe(21600);
    expect(po.belowMinimum).toBe(false);
    expect(po.expected).toBe('2026-11-18');
  });
  it('pulls soon-due supplies forward to reach the minimum', () => {
    const po = draftPO(supplier, [plan('sugar', 'order-now', 1, 4100), plan('mix', 'order-soon', 2, 4000), plan('icing', 'order-soon', 1, 5800), plan('filling', 'order-soon', 1, 4600)], today)!;
    expect(po.lines.map((l) => [l.supplyId, l.early])).toEqual([['sugar', false], ['mix', true], ['icing', true]]);
    expect(po.totalCents).toBe(17900);
    expect(po.belowMinimum).toBe(false);
  });
  it('flags an order that stays under the minimum', () => {
    expect(draftPO(supplier, [plan('sugar', 'order-now', 1, 4100)], today)!.belowMinimum).toBe(true);
  });
});

describe('nextDelivery', () => {
  it('waits for a delivery day', () => {
    // Saturday the 21st, supplier delivers Tuesday and Thursday.
    expect(nextDelivery({ deliveryDays: [2, 4] }, '2026-11-21')).toBe('2026-11-24');
    expect(nextDelivery({ deliveryDays: [] }, '2026-11-21')).toBe('2026-11-21');
  });
});

describe('order totals', () => {
  it('counts sent orders as on the way and received ones as delivered', () => {
    const po = draftPO(supplier, [plan('shortening', 'order-now', 3, 7200)], today)!;
    expect(onOrder([po])).toEqual({});
    expect(onOrder([{ ...po, status: 'sent' }])).toEqual({ shortening: 150 });
    expect(delivered([{ ...po, status: 'received' }])).toEqual({ shortening: 150 });
  });
});

describe('poEmail', () => {
  it('addresses the rep and lists every line', () => {
    const po = { ...draftPO(supplier, [plan('shortening', 'order-now', 3, 7200)], today)!, number: 1001 };
    const mail = poEmail({ name: 'Good Batch Donuts', address: '123 Demo Street', phone: '(562) 555-0142' }, supplier, po, 'Wednesday, November 18');
    expect(mail.subject).toBe('PO-1001 from Good Batch Donuts (account GB-1)');
    expect(mail.body).toContain('Hi Marco,');
    expect(mail.body).toContain(' 3 x 50 lb bag, shortening: $216.00');
    expect(mail.body).toContain('Deliver by: Wednesday, November 18');
  });
});

import { describe, expect, it } from 'vitest';
import { invoiceState } from '../lib/channels';
import { WHOLESALE, buildChannelOrders, deliveryOrder, seedGiftCards, seedInvoices } from './channels';

describe('seeded sales channels', () => {
  // Wednesday mid-morning, while the shop is open.
  const now = new Date(2026, 10, 18, 9, 20);
  const orders = buildChannelOrders('2026-11-18', now);

  it('puts each standing order on its delivery days, today and tomorrow', () => {
    const ws = orders.filter((o) => o.channel === 'wholesale');
    const expected = WHOLESALE.filter((a) => a.days.includes(3)).length + WHOLESALE.filter((a) => a.days.includes(4)).length;
    expect(ws).toHaveLength(expected);
    expect(ws.every((o) => o.payment === 'invoice' && o.total === o.subtotal)).toBe(true);
    // The runs that were due before now have already gone out.
    expect(ws.filter((o) => new Date(o.pickupAt!) < now).every((o) => o.status === 'done')).toBe(true);
  });

  it('has a live delivery order waiting and takes the commission off each one', () => {
    const dl = orders.filter((o) => o.payment === 'app');
    expect(dl.some((o) => o.status === 'new' && new Date(o.pickupAt!) > now)).toBe(true);
    for (const o of dl) expect(o.feeCents).toBeGreaterThan(0);
  });

  it('prices a delivery order at the app price', () => {
    const o = deliveryOrder('doordash', 'Test', [['glazed', 2]], now, 'new', 0.2);
    expect(o.subtotal).toBe(420);
    expect(o.feeCents).toBe(105);
  });

  it('seeds one past-due invoice and no unpaid old ones besides it', () => {
    const inv = seedInvoices('2026-11-18');
    expect(inv).toHaveLength(WHOLESALE.length * 4);
    expect(inv.filter((i) => invoiceState(i, '2026-11-18') === 'overdue')).toHaveLength(1);
  });

  it('gives every seeded gift card its own code', () => {
    const cards = seedGiftCards('2026-11-18');
    expect(new Set(cards.map((c) => c.code)).size).toBe(cards.length);
  });
});

import { describe, expect, it } from 'vitest';
import { appPrice, breakEvenMarkup, deliveryCents, deliveryNet, giftCode, invoiceState, normalizeCode, redeemGift, type GiftCard, type Invoice, type WholesaleAccount } from './channels';

describe('delivery apps', () => {
  it('marks a price up and rounds to the next nickel', () => {
    expect(appPrice(175, 0.2)).toBe(210);
    expect(appPrice(275, 0.18)).toBe(325);
    expect(appPrice(100, 0)).toBe(100);
  });
  it('takes the commission off the order', () => {
    expect(deliveryNet(2000, 0.25)).toEqual({ feeCents: 500, netCents: 1500 });
  });
  it('finds the markup that cancels the commission', () => {
    expect(breakEvenMarkup(0.25)).toBeCloseTo(1 / 3);
    expect(deliveryNet(appPrice(1500, breakEvenMarkup(0.25)), 0.25).netCents).toBe(1500);
  });
});

describe('wholesale', () => {
  const cafe: WholesaleAccount = { id: 'c', name: 'Cafe', kind: 'Café', contact: '', email: '', discount: 0.3, termsDays: 15, days: [1, 3, 5], readyAt: '05:30', standing: { glazed: 24, maple: 12 } };
  it('prices a delivery at the wholesale discount', () => {
    expect(deliveryCents(cafe, { glazed: 175, maple: 175 })).toBe(Math.round(24 * 175 * 0.7) + Math.round(12 * 175 * 0.7));
  });
  it('ages invoices', () => {
    const inv: Invoice = { id: 'i', accountId: 'c', weekStart: '2026-11-01', deliveries: 3, totalCents: 1000, issued: '2026-11-08', due: '2026-11-23', paid: false };
    expect(invoiceState(inv, '2026-11-20')).toBe('open');
    expect(invoiceState(inv, '2026-11-24')).toBe('overdue');
    expect(invoiceState({ ...inv, paid: true }, '2026-11-24')).toBe('paid');
  });
});

describe('gift cards', () => {
  const card: GiftCard = { code: 'ABCD-2345', name: 'Tina', loadedCents: 2500, balanceCents: 2500, sold: '2026-11-01' };
  it('makes readable codes that differ', () => {
    expect(giftCode(1)).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(giftCode(1)).not.toBe(giftCode(2));
  });
  it('covers part of a bill and keeps the rest of the balance', () => {
    const r = redeemGift(card, 1050);
    expect([r.appliedCents, r.stillOwedCents, r.card.balanceCents]).toEqual([1050, 0, 1450]);
  });
  it('leaves the remainder to pay another way', () => {
    const r = redeemGift(card, 4000);
    expect([r.appliedCents, r.stillOwedCents, r.card.balanceCents]).toEqual([2500, 1500, 0]);
  });
  it('accepts a code typed loosely', () => {
    expect(normalizeCode('abcd 2345')).toBe('ABCD-2345');
  });
});

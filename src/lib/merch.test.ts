import { describe, expect, it } from 'vitest';
import { addReorder, merchLines, merchReport, merchTotals, onHand, takeFromStock, type MerchItem } from './merch';

const tee: MerchItem = { id: 'tee', name: 'Tee', blurb: '', kind: 'merch', priceCents: 2400, costCents: 900, sizes: ['S', 'M', 'L'], reorderAt: 6, reorderQty: 6, supplier: 'x', color: '#000' };
const mug: MerchItem = { id: 'mug', name: 'Mug', blurb: '', kind: 'merch', priceCents: 1400, costCents: 500, reorderAt: 4, reorderQty: 12, supplier: 'x', color: '#000' };
const byId = { tee, mug };

describe('merch', () => {
  it('prices cart lines and taxes them', () => {
    const lines = merchLines({ 'tee:M': 2, mug: 1, gone: 3, 'tee:S': 0 }, byId);
    expect(lines).toEqual([{ id: 'tee', size: 'M', qty: 2, cents: 4800 }, { id: 'mug', qty: 1, cents: 1400 }]);
    // $62.00 at 10.25% is $6.36 (6.355 rounds up)
    expect(merchTotals(lines)).toEqual({ subtotal: 6200, tax: 636, total: 6836 });
  });

  it('takes sold items off the shelf and never goes below zero', () => {
    const stock = takeFromStock({ 'tee:M': 1, mug: 5 }, [{ id: 'tee', size: 'M', qty: 2, cents: 0 }, { id: 'mug', qty: 2, cents: 0 }]);
    expect(stock).toEqual({ 'tee:M': 0, mug: 3 });
  });

  it('fills the lowest sizes first on a reorder', () => {
    const stock = addReorder({ 'tee:S': 0, 'tee:M': 3, 'tee:L': 1 }, tee);
    expect(onHand(tee, stock)).toBe(10);
    expect(stock).toEqual({ 'tee:S': 4, 'tee:M': 3, 'tee:L': 3 });
    expect(addReorder({ mug: 2 }, mug)).toEqual({ mug: 14 });
  });

  it('reports stock, margin and when to reorder', () => {
    const [t, m] = merchReport([tee, mug], { 'tee:S': 0, 'tee:M': 3, 'tee:L': 2, mug: 20 }, { tee: 14 });
    expect(t).toMatchObject({ onHand: 5, out: ['S'], sold28: 14, salesCents: 33600, profitCents: 21000, daysLeft: 10, reorder: true });
    expect(t.margin).toBeCloseTo(0.625);
    expect(m).toMatchObject({ onHand: 20, sold28: 0, daysLeft: undefined, reorder: false });
  });
});

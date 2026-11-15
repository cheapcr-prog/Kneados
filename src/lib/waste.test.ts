import { describe, expect, it } from 'vitest';
import { menuCosts, unitCost } from './costing';
import { suggestFate, summarizeLeftovers, wasteByItem } from './waste';

const supplies = [{ id: 'mix', packSize: 50, packCents: 4000 }, { id: 'icing', packSize: 20, packCents: 6000 }];

describe('costing', () => {
  it('prices a recipe from pack prices', () => {
    // 0.1 lb of mix at 80 cents a lb, 0.05 lb of icing at 3 dollars a lb.
    expect(unitCost({ mix: 0.1, icing: 0.05 }, supplies)).toBeCloseTo(23);
  });
  it('adds the price of items bought in finished and ignores unknown supplies', () => {
    expect(unitCost({ bags: 1 }, supplies, 210)).toBe(210);
    expect(menuCosts(['a', 'b'], { a: { mix: 1 } }, supplies, { b: 150 })).toEqual({ a: 80, b: 150 });
  });
});

describe('wasteByItem', () => {
  it('totals waste per item and sorts by cost', () => {
    const days = [
      { glazed: { made: 100, sold: 90, waste: 10 }, twist: { made: 48, sold: 30, waste: 18 } },
      { glazed: { made: 100, sold: 100, waste: 0 }, twist: { made: 48, sold: 36, waste: 12 } },
    ];
    const rows = wasteByItem(days, { glazed: 20, twist: 25 }, { glazed: 175, twist: 175 });
    expect(rows.map((r) => r.itemId)).toEqual(['twist', 'glazed']);
    expect(rows[0]).toMatchObject({ made: 96, wasted: 30, costCents: 750, retailCents: 5250, daysWithWaste: 2, soldOutDays: 0 });
    expect(rows[0].rate).toBeCloseTo(0.3125);
    expect(rows[1]).toMatchObject({ wasted: 10, soldOutDays: 1 });
  });
});

describe('leftovers', () => {
  it('fills the day-old rack and donates the rest', () => {
    expect(suggestFate('glazed', 20, true)).toEqual([{ itemId: 'glazed', qty: 12, fate: 'dayold' }, { itemId: 'glazed', qty: 8, fate: 'donated' }]);
    expect(suggestFate('custard', 5, false)).toEqual([{ itemId: 'custard', qty: 5, fate: 'tossed' }]);
    expect(suggestFate('glazed', 0, true)).toEqual([]);
  });
  it('adds up what is recovered and what is lost', () => {
    const s = summarizeLeftovers([...suggestFate('glazed', 20, true), ...suggestFate('custard', 5, false)], { glazed: 20, custard: 40 }, { glazed: 175, custard: 275 });
    expect(s).toEqual({ total: 25, dayOld: 12, donated: 8, tossed: 5, recoverCents: 1050, lostCents: 360 });
  });
});

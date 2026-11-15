import { describe, expect, it } from 'vitest';
import { MENU_BY_ID } from '../data/shop';
import { boxPrice, boxUpcharge, cartLines, linePrice, rewardDiscount, totals } from './pricing';

describe('pricing', () => {
  const glazed = MENU_BY_ID.glazed;

  it('charges the dozen price for every full dozen and singles for the rest', () => {
    expect(linePrice(glazed, 1)).toBe(175);
    expect(linePrice(glazed, 12)).toBe(1800);
    expect(linePrice(glazed, 14)).toBe(1800 + 2 * 175);
    expect(linePrice(glazed, 24)).toBe(3600);
    expect(linePrice(MENU_BY_ID.fritter, 12)).toBe(12 * 350);
  });

  it('taxes only taxable items', () => {
    const lines = [
      { itemId: 'glazed', qty: 12, lineCents: 1800 },
      { itemId: 'coffee', qty: 2, lineCents: 500 },
    ];
    const t = totals(lines, MENU_BY_ID);
    expect(t.subtotal).toBe(2300);
    expect(t.tax).toBe(51);
    expect(t.total).toBe(2351);
  });

  it('never discounts below zero and covers the cheapest donut', () => {
    const lines = [
      { itemId: 'custard', qty: 1, lineCents: 275 },
      { itemId: 'glazed', qty: 1, lineCents: 175 },
    ];
    expect(rewardDiscount(lines, MENU_BY_ID)).toBe(175);
    expect(rewardDiscount([{ itemId: 'coffee', qty: 1, lineCents: 250 }], MENU_BY_ID)).toBe(0);
    expect(totals([{ itemId: 'glazed', qty: 1, lineCents: 175 }], MENU_BY_ID, 999).total).toBe(0);
  });

  it('charges a mixed dozen the base price plus an extra for each specialty donut', () => {
    expect(boxUpcharge(MENU_BY_ID.glazed)).toBe(0);
    expect(boxUpcharge(MENU_BY_ID.maple)).toBe(50);
    expect(boxUpcharge(MENU_BY_ID.custard)).toBe(100);
    expect(boxUpcharge(MENU_BY_ID.fritter)).toBe(150);
    const box = [...Array(6).fill('glazed'), ...Array(4).fill('maple'), 'custard', 'fritter'];
    const p = boxPrice(box, MENU_BY_ID);
    expect(p.extras).toBe(4 * 50 + 100 + 150);
    expect(p.cents).toBe(1800 + p.extras);
    expect(p.singles).toBe(6 * 175 + 4 * 225 + 275 + 350);
    expect(boxPrice(Array(12).fill('glazed'), MENU_BY_ID)).toMatchObject({ cents: 1800, extras: 0 });
  });

  it('never charges more for a dozen of one donut in a box than its own dozen price', () => {
    for (const item of Object.values(MENU_BY_ID)) {
      if (item.dozenPrice) expect(boxPrice(Array(12).fill(item.id), MENU_BY_ID).cents).toBe(item.dozenPrice);
    }
  });

  it('merges boxes and loose items into one line per item', () => {
    const box = [...Array(11).fill('glazed'), 'maple'];
    const lines = cartLines({ glazed: 2, coffee: 1, maple: 0 }, [box], MENU_BY_ID);
    expect(lines).toEqual([
      { itemId: 'glazed', qty: 13, lineCents: 2 * 175 + 11 * 150 },
      { itemId: 'coffee', qty: 1, lineCents: 250 },
      { itemId: 'maple', qty: 1, lineCents: 200 },
    ]);
  });
});

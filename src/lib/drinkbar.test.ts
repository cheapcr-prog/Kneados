import { describe, expect, it } from 'vitest';
import { MENU, MENU_BY_ID } from '../data/shop';
import { DRINK_BAR, RECIPES, SUPPLIES } from '../data/supplies';
import { SUPPLIERS } from '../data/suppliers';
import { unitCost } from './costing';
import { amountLabel, barStock, cupsLeft } from './drinkbar';
import { packPlan } from './packing';
import { suggestOffers } from './upsell';

describe('drink bar stock', () => {
  it('takes scoops and ounces out of stock for every drink sold', () => {
    const stock = barStock({ strawmix: 500, taro: 100, tapioca: 50, jelly: 20 }, RECIPES, { 'smoothie-straw': 10, 'smoothie-straw-lg': 4, 'smoothie-taro': 6, 'addon-boba': 9 });
    const by = Object.fromEntries(stock.map((s) => [s.supplyId, s]));
    // 10 small at 5 fl oz and 4 large at 7.5 fl oz.
    expect(by.strawmix).toMatchObject({ used: 80, left: 420 });
    expect(by.taro).toMatchObject({ used: 18, left: 82 });
    expect(by.tapioca).toMatchObject({ used: 9, left: 41 });
    expect(by.jelly).toMatchObject({ used: 0, left: 20 });
  });
  it('never shows less than nothing on the shelf', () => {
    expect(barStock({ taro: 5 }, RECIPES, { 'smoothie-taro': 4 })[0]).toMatchObject({ used: 12, left: 0 });
  });
  it('says how many more cups the shelf can make', () => {
    expect(cupsLeft({ strawmix: 7.5, cups: 1 }, { strawmix: 40, cups: 500 })).toBe(5);
    expect(cupsLeft({ strawmix: 7.5, cups: 1 }, { strawmix: 40 }, ['strawmix'])).toBe(5);
    expect(cupsLeft({ taro: 3 }, {})).toBe(0);
  });
  it('writes amounts the way a person would', () => {
    expect([amountLabel(1, 'scoops'), amountLabel(4.5, 'scoops'), amountLabel(1250, 'fl oz')]).toEqual(['1 scoop', '4.5 scoops', '1,250 fl oz']);
  });
});

describe('the drink menu', () => {
  const drinks = MENU.filter((m) => m.category === 'Smoothies & boba');
  it('has a recipe for every drink and topping, using supplies that exist', () => {
    const ids = new Set(SUPPLIES.map((s) => s.id));
    for (const m of drinks) {
      expect(RECIPES[m.id], m.id).toBeDefined();
      for (const id of Object.keys(RECIPES[m.id])) expect(ids.has(id), `${m.id} uses ${id}`).toBe(true);
    }
  });
  it('follows the makers\' recipes: the large is one and a half smalls', () => {
    expect(RECIPES['smoothie-straw-lg'].strawmix).toBe(RECIPES['smoothie-straw'].strawmix * 1.5);
    expect(RECIPES['smoothie-taro'].taro).toBe(3);
  });
  it('sells every drink for more than it costs to make', () => {
    for (const m of drinks) expect(unitCost(RECIPES[m.id], SUPPLIES)).toBeLessThan(m.price * 0.6);
  });
  it('has a supplier profile and a checked listing for every drink bar product', () => {
    for (const s of DRINK_BAR) {
      expect(SUPPLIERS.some((x) => x.name === s.supplier && x.web), s.id).toBe(true);
      expect(s.product?.url.startsWith('https://'), s.id).toBe(true);
    }
  });
  it('puts smoothies in the cup holder and the topping with them, not in the bag', () => {
    const plan = packPlan({ lines: [{ itemId: 'smoothie-mango', qty: 2, lineCents: 0 }, { itemId: 'addon-boba', qty: 1, lineCents: 0 }, { itemId: 'glazed', qty: 1, lineCents: 0 }] }, MENU_BY_ID);
    expect(plan.cups).toEqual([['smoothie-mango', 2], ['addon-boba', 1]]);
    expect(plan.bag).toEqual([['glazed', 1]]);
  });
  it('offers boba with a smoothie that has no topping', () => {
    expect(suggestOffers([{ itemId: 'smoothie-taro', qty: 1 }], MENU_BY_ID)[0]).toMatchObject({ kind: 'addon', itemId: 'addon-boba', addCents: 75 });
    expect(suggestOffers([{ itemId: 'smoothie-taro', qty: 1 }, { itemId: 'addon-jelly', qty: 1 }], MENU_BY_ID).some((o) => o.kind === 'addon')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { attachTopping, clampToppings, cycleTopping, detachTopping, toppingLines, toppingTotals } from './toppings';

describe('drink toppings', () => {
  it('cycles a topping through the cups of one drink and back to none', () => {
    let t = cycleTopping({}, 'taro', 'boba', 2);
    expect(t.taro.boba).toBe(1);
    t = cycleTopping(t, 'taro', 'boba', 2);
    expect(t.taro.boba).toBe(2);
    t = cycleTopping(t, 'taro', 'boba', 2);
    expect(toppingLines(t)).toEqual([]);
  });

  it('never keeps more toppings than cups, and drops drinks that left the order', () => {
    const t = clampToppings({ taro: { boba: 3 }, mango: { jelly: 1 } }, { taro: 1 });
    expect(t).toEqual({ taro: { boba: 1 } });
  });

  it('totals toppings across drinks for charging', () => {
    expect(toppingTotals({ taro: { boba: 1, jelly: 1 }, mango: { boba: 2 } })).toEqual({ boba: 3, jelly: 1 });
  });

  it('attaches to the first drink with a cup free, and does nothing when there is none', () => {
    const drinks: [string, number][] = [['taro', 1], ['mango', 1]];
    let t = attachTopping({}, 'boba', drinks);
    t = attachTopping(t, 'boba', drinks);
    expect(t).toEqual({ taro: { boba: 1 }, mango: { boba: 1 } });
    expect(attachTopping(t, 'boba', drinks)).toBe(t);
    expect(attachTopping({}, 'boba', [])).toEqual({});
  });

  it('detaches from a named drink, or the last one that has it', () => {
    const t = { taro: { boba: 1 }, mango: { boba: 1 } };
    expect(toppingTotals(detachTopping(t, 'boba', 'taro'))).toEqual({ boba: 1 });
    expect(detachTopping(t, 'boba').mango.boba).toBe(0);
    expect(detachTopping({}, 'boba')).toEqual({});
  });
});

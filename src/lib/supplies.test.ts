import { describe, expect, it } from 'vitest';
import { planSupply, supplyUsage } from './supplies';
import type { Supply } from './supplies';

const flour: Supply = { id: 'flour', name: 'Flour', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 4000, supplier: 'S', leadDays: 2, onHand: 100 };
const today = '2026-01-05';
const flat = (perDay: number, days = 21) => Array<number>(days).fill(perDay);

describe('supplies', () => {
  it('adds up what a day of baking uses', () => {
    const recipes = { glazed: { flour: 0.1, sugar: 0.05 }, maple: { flour: 0.2 } };
    expect(supplyUsage(recipes, { glazed: 100, maple: 50, coffee: 9 })).toEqual({ flour: 20, sugar: 5 });
  });

  it('is fine when stock lasts past the days it looked at', () => {
    const p = planSupply(flour, flat(1), today);
    expect(p.status).toBe('ok');
    expect(p.runOut).toBeNull();
    expect(p.packs).toBe(0);
  });

  it('counts back from the run-out day through the cushion and the delivery time', () => {
    // 100 lb at 10 a day: the stock is used up on day 9, so day 10 is the first day short.
    const p = planSupply(flour, flat(10), today);
    expect(p.daysLeft).toBe(10);
    expect(p.runOut).toBe('2026-01-15');
    expect(p.orderBy).toBe('2026-01-11'); // 10 - 2 cushion - 2 delivery = day 6
    expect(p.arrives).toBe('2026-01-13');
    expect(p.status).toBe('ok');
  });

  it('says order soon, then order today, as the date gets close', () => {
    expect(planSupply({ ...flour, onHand: 70 }, flat(10), today).status).toBe('order-soon');
    const now = planSupply({ ...flour, onHand: 40 }, flat(10), today);
    expect(now.status).toBe('order-now');
    expect(now.orderBy).toBe(today);
    expect(now.short).toBe(false);
  });

  it('warns when it will run out before a delivery can arrive', () => {
    const p = planSupply({ ...flour, onHand: 15 }, flat(10), today);
    expect(p.status).toBe('order-now');
    expect(p.short).toBe(true);
  });

  it('orders enough packs to last a week past delivery, plus the cushion', () => {
    // Order today, arrives day 2, cover through day 9: 90 lb used, plus 20 cushion, minus 40 on hand = 70 lb = 2 bags.
    const p = planSupply({ ...flour, onHand: 40 }, flat(10), today);
    expect(p.packs).toBe(2);
    expect(p.cents).toBe(8000);
  });

  it('orders less of something that spoils', () => {
    const milk = planSupply({ ...flour, onHand: 40, leadDays: 0, coverDays: 3 }, flat(10), today);
    // Runs out day 4, order by day 2, cover 3 days from then: 50 used, plus 20 cushion, minus 40 = 30 = 1 pack.
    expect(milk.packs).toBe(1);
  });

  it('counts stock that is already on order', () => {
    const p = planSupply({ ...flour, onHand: 40 }, flat(10), today, 100);
    expect(p.stock).toBe(140);
    expect(p.status).toBe('ok');
  });
});

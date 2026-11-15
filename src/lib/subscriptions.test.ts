import { describe, expect, it } from 'vitest';
import { MIXES, addMinutes, deliversOn, itemsOf, miles, monthlyRecurring, planRoute, priceOf, type Subscription } from './subscriptions';

const sub = (id: string, lat: number, lon: number, extra: Partial<Subscription> = {}): Subscription => ({
  id, company: id, contact: '', email: '', address: '', lat, lon, dow: 5, dozens: 2, mix: 'classic', by: '09:00', since: '2026-10-01', status: 'active', skips: [], ...extra,
});
const shop = { lat: 33.76, lon: -118.13 };

describe('donut fridays', () => {
  it('fills every mix to exactly a dozen', () => {
    for (const m of MIXES) expect(Object.values(m.box).reduce((a, b) => a + b, 0)).toBe(12);
  });
  it('takes the subscriber discount and charges delivery on small orders', () => {
    expect(priceOf({ dozens: 2, mix: 'classic' })).toEqual({ boxesCents: 3600, discountCents: 360, deliveryCents: 500, weeklyCents: 3740 });
    expect(priceOf({ dozens: 3, mix: 'assorted' }).weeklyCents).toBe(6600 - 660);
  });
  it('counts the donuts in a delivery', () => {
    expect(itemsOf({ dozens: 3, mix: 'classic' })).toEqual({ glazed: 12, chocolate: 6, maple: 6, sprinkle: 6, oldfashioned: 6 });
  });
  it('skips paused subscriptions, skipped weeks and other days', () => {
    const s = sub('a', 0, 0, { skips: ['2026-11-20'] });
    expect(deliversOn(s, '2026-11-13', 5)).toBe(true);
    expect(deliversOn(s, '2026-11-20', 5)).toBe(false);
    expect(deliversOn(s, '2026-11-19', 4)).toBe(false);
    expect(deliversOn({ ...s, status: 'paused' }, '2026-11-13', 5)).toBe(false);
    expect(monthlyRecurring([s, { ...s, status: 'paused' }])).toBe(Math.round((3740 * 52) / 12));
  });
  it('measures distance', () => {
    expect(miles(shop, shop)).toBe(0);
    // One hundredth of a degree of latitude is about 0.69 miles.
    expect(miles(shop, { lat: 33.77, lon: -118.13 })).toBeCloseTo(0.69, 1);
  });
  it('drives to the nearest stop next and comes home', () => {
    const r = planRoute(shop, [sub('far', 33.80, -118.13), sub('near', 33.77, -118.13), sub('mid', 33.78, -118.13)], '07:30');
    expect(r.stops.map((s) => s.sub.id)).toEqual(['near', 'mid', 'far']);
    expect(r.totalMiles).toBeCloseTo(0.69 * 8 * 1.3, 0);
    expect(r.dozens).toBe(6);
    expect(r.stops[0].arriveMin).toBeLessThan(r.stops[1].arriveMin);
    expect(r.stops.some((s) => s.late)).toBe(false);
  });
  it('puts an earlier deadline first and flags a stop it cannot make', () => {
    const r = planRoute(shop, [sub('near', 33.77, -118.13), sub('early', 33.80, -118.13, { by: '08:00' })], '07:30');
    expect(r.stops[0].sub.id).toBe('early');
    expect(planRoute(shop, [sub('x', 34.2, -118.13, { by: '07:45' })], '07:30').stops[0].late).toBe(true);
  });
  it('adds minutes to a time', () => {
    expect(addMinutes('07:30', 45)).toBe('08:15');
  });
});

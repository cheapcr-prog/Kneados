import { describe, expect, it } from 'vitest';
import { explainForecast, forecastItem, learnRainEffect, learnTrend, roundUpToBatch, type ItemDayObservation } from './forecast';
import { addDays, dowOf } from './dates';

function steady(perDay: (dow: number, i: number) => number, days = 84, opts: Partial<ItemDayObservation> = {}): ItemDayObservation[] {
  const out: ItemDayObservation[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays('2026-11-16', -i);
    const dow = dowOf(date);
    const sold = perDay(dow, i);
    out.push({ date, dow, sold, made: sold + 12, rain: false, holidayFactor: 1, ...opts });
  }
  return out;
}

const monday = { date: '2026-11-16', dow: 1, rain: false, holidayFactor: 1, preorderQty: 0 };

describe('forecastItem', () => {
  it('uses same-weekday history, not the overall average', () => {
    const history = steady((dow) => (dow === 6 ? 200 : 100));
    const sat = forecastItem(history, { ...monday, date: '2026-11-21', dow: 6 });
    const mon = forecastItem(history, monday);
    expect(Math.round(sat.base)).toBe(200);
    expect(Math.round(mon.base)).toBe(100);
  });

  it('adds the buffer and rounds up to a half tray', () => {
    const f = forecastItem(steady(() => 100), monday);
    // 100 * 1.05 = 105, next multiple of 6 is 108.
    expect(f.qty).toBe(108);
    expect(f.qty % 6).toBe(0);
  });

  it('adds pre-orders on top of walk-in demand', () => {
    const history = steady(() => 100);
    const plain = forecastItem(history, monday);
    const withOrders = forecastItem(history, { ...monday, preorderQty: 60 });
    expect(withOrders.qty).toBeGreaterThanOrEqual(plain.qty + 60);
    expect(withOrders.parts.some((p) => p.label === 'Pre-orders already placed' && p.delta === 60)).toBe(true);
  });

  it('makes fewer on a rainy day when history shows rain hurts sales', () => {
    const history = steady(() => 100).map((h, i) => (i % 5 === 0 ? { ...h, rain: true, sold: 75 } : h));
    expect(learnRainEffect(history)).toBeCloseTo(0.75, 1);
    const dry = forecastItem(history, monday);
    const wet = forecastItem(history, { ...monday, rain: true });
    expect(wet.qty).toBeLessThan(dry.qty);
    // Past rainy days must not drag down a dry-day forecast.
    expect(Math.round(dry.base)).toBe(100);
  });

  it('raises the estimate for days that sold out', () => {
    const soldOut = steady(() => 100).map((h) => ({ ...h, made: 100 }));
    const f = forecastItem(soldOut, monday);
    expect(Math.round(f.base)).toBe(110);
  });

  it('applies the holiday multiplier and ignores past holidays in the base', () => {
    const history = steady(() => 100).map((h) => (h.date === '2026-11-09' ? { ...h, sold: 160, made: 172, holidayFactor: 1.6 } : h));
    const normal = forecastItem(history, monday);
    expect(Math.round(normal.base)).toBe(100);
    const holiday = forecastItem(history, { ...monday, holidayFactor: 1.3, holidayName: 'Day before Thanksgiving' });
    expect(Math.round(holiday.walkIn)).toBe(130);
  });

  it('follows a rising trend but caps it', () => {
    const rising = steady((_d, i) => (i <= 28 ? 150 : 100));
    expect(learnTrend(rising)).toBe(1.1);
    const flat = steady(() => 100);
    expect(learnTrend(flat)).toBe(1);
  });

  it('reports low confidence and zero with no history', () => {
    const f = forecastItem([], monday);
    expect(f.qty).toBe(0);
    expect(f.confidence).toBe('low');
    expect(explainForecast('Glazed', 'Monday', f)).toMatch(/No past Mondays/);
  });

  it('explains the number in one sentence', () => {
    const f = forecastItem(steady(() => 100), { ...monday, preorderQty: 24 });
    const text = explainForecast('Glazed', 'Monday', f);
    expect(text).toContain('averaged about 100 Glazed');
    expect(text).toContain('pre-orders already placed (+24)');
    expect(text).toContain(`Make ${f.qty}.`);
  });
});

describe('roundUpToBatch', () => {
  it('rounds up, never down', () => {
    expect(roundUpToBatch(0)).toBe(0);
    expect(roundUpToBatch(1)).toBe(6);
    expect(roundUpToBatch(6)).toBe(6);
    expect(roundUpToBatch(6.1)).toBe(12);
  });
});

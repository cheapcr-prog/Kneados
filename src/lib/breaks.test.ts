import { describe, expect, it } from 'vitest';
import { adviseBreaks, breakStatus, mealsOwed, restsOwed, unpaidHours, type Break } from './breaks';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m);
const brk = (kind: Break['kind'], h: number, m: number, mins?: number): Break => ({ kind, start: at(h, m).toISOString(), end: mins ? at(h, m + mins).toISOString() : undefined });

describe('break entitlements', () => {
  it('gives a rest break per 4 hours or major part of it', () => {
    expect([3, 3.5, 6, 6.5, 8, 10, 10.5].map(restsOwed)).toEqual([0, 1, 1, 2, 2, 2, 3]);
  });
  it('gives a meal over 5 hours and a second over 10', () => {
    expect([5, 5.5, 10, 10.5].map(mealsOwed)).toEqual([0, 1, 1, 2]);
  });
});

describe('breakStatus', () => {
  it('is ok early in a shift', () => {
    expect(breakStatus(at(5), 8, [], at(6)).state).toBe('ok');
  });
  it('asks for a rest break two hours in', () => {
    const s = breakStatus(at(5), 8, [], at(7, 5));
    expect(s.state).toBe('rest-due');
    expect(s.next).toBe('rest');
  });
  it('warns an hour before the meal deadline', () => {
    const s = breakStatus(at(5), 8, [brk('rest', 7, 0, 10)], at(9, 10));
    expect(s.state).toBe('meal-due');
    expect(s.mealDueBy).toBe(at(10).toISOString());
    expect(s.premiumOwed).toBe(false);
  });
  it('flags a late meal and the premium hour', () => {
    const s = breakStatus(at(5), 8, [], at(10, 20));
    expect(s.state).toBe('meal-late');
    expect(s.premiumOwed).toBe(true);
  });
  it('keeps the premium when the meal started late', () => {
    const s = breakStatus(at(5), 8, [brk('meal', 10, 15, 30)], at(11));
    expect(s.premiumOwed).toBe(true);
    expect(s.mealsTaken).toBe(1);
  });
  it('shows a running break and when it ends', () => {
    const s = breakStatus(at(5), 8, [brk('meal', 9, 0)], at(9, 10));
    expect(s.state).toBe('on-break');
    expect(s.backAt).toBe(at(9, 30).toISOString());
  });
  it('owes no meal on a short shift', () => {
    const s = breakStatus(at(6), 5, [], at(10, 30));
    expect(s.mealsOwed).toBe(0);
    expect(s.state).toBe('rest-due');
  });
});

describe('unpaidHours', () => {
  it('counts meals only', () => {
    expect(unpaidHours([brk('rest', 7, 0, 10), brk('meal', 9, 0, 30)], at(12))).toBe(0.5);
  });
  it('counts a running meal up to now', () => {
    expect(unpaidHours([brk('meal', 9, 0)], at(9, 15))).toBe(0.25);
  });
});

describe('adviseBreaks', () => {
  const person = (staffId: string, group: string, breaks: Break[], now: Date) => ({ staffId, group, status: breakStatus(at(5), 8, breaks, now) });
  it('sends one person per group, most urgent first', () => {
    const now = at(9, 30);
    const advice = adviseBreaks([
      person('a', 'counter', [brk('rest', 7, 0, 10)], now),
      person('b', 'counter', [brk('rest', 7, 0, 10), brk('meal', 8, 30, 30)], now),
      person('c', 'kitchen', [brk('rest', 7, 0, 10)], now),
    ]);
    expect(advice).toEqual([
      { staffId: 'a', kind: 'meal', covered: true, urgent: false },
      { staffId: 'c', kind: 'meal', covered: false, urgent: false },
    ]);
  });
  it('waits while a teammate is away, unless a meal is late', () => {
    const away = person('b', 'counter', [brk('meal', 9, 15)], at(9, 30));
    expect(adviseBreaks([person('a', 'counter', [brk('rest', 7, 0, 10)], at(9, 30)), away])).toEqual([]);
    const late = adviseBreaks([person('a', 'counter', [], at(10, 5)), { ...away, status: breakStatus(at(5), 8, [brk('meal', 9, 50)], at(10, 5)) }]);
    expect(late).toEqual([{ staffId: 'a', kind: 'meal', covered: false, urgent: true }]);
  });
});

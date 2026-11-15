import { describe, expect, it } from 'vitest';
import type { Shift } from '../data/types';
import { dayLabor, paidHours, reviewSchedule, setShift, swapShifts, type Person } from './schedule';

const people: Person[] = [
  { id: 'luis', name: 'Luis', role: 'baker', hourlyCents: 2200 },
  { id: 'jess', name: 'Jess', role: 'cashier', hourlyCents: 1800 },
  { id: 'andre', name: 'Andre', role: 'cashier', hourlyCents: 1800 },
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shift = (staffId: string, dow: number, start = '05:00', end = '13:00'): Shift => ({ staffId, dow, start, end });

describe('paidHours', () => {
  it('takes lunch off long shifts only', () => {
    expect(paidHours({ start: '05:00', end: '13:00' })).toBe(7.5);
    expect(paidHours({ start: '08:00', end: '12:30' })).toBe(4.5);
  });
});

describe('dayLabor', () => {
  it('adds up cost and compares it with sales', () => {
    const d = dayLabor(1, [shift('luis', 1), shift('jess', 1), shift('andre', 2)], people, 100000);
    expect(d.hours).toBe(15);
    expect(d.costCents).toBe(7.5 * 2200 + 7.5 * 1800);
    expect(d.pct).toBeCloseTo(0.3);
    expect([d.bakers, d.counter]).toEqual([1, 1]);
  });
});

describe('reviewSchedule', () => {
  it('flags heavy days, thin days and missing cover', () => {
    const shifts = [shift('luis', 1), shift('jess', 1), shift('andre', 1), shift('luis', 2), shift('jess', 2), shift('jess', 3)];
    const days = [dayLabor(1, shifts, people, 100000), dayLabor(2, shifts, people, 400000), dayLabor(3, shifts, people, 200000)];
    const notes = reviewSchedule(days, shifts, people, DAYS).map((n) => n.text);
    expect(notes[0]).toMatch(/^Monday is heavy: labor is 44% of forecast sales\. Trimming about 10 hours/);
    expect(notes[1]).toMatch(/^Tuesday is thin: labor is only 8%/);
    expect(notes[2]).toBe('Wednesday has no baker, so nothing gets made.');
  });
  it('flags overtime', () => {
    const shifts = [0, 1, 2, 3, 4, 5].map((d) => shift('jess', d));
    expect(reviewSchedule([], shifts, people, DAYS)[0].text).toBe('Jess is at 45.0 hours, so 5.0 of them are overtime at time and a half.');
  });
  it('says so when the week is fine', () => {
    expect(reviewSchedule([], [], people, DAYS)[0].tone).toBe('good');
  });
});

describe('editing', () => {
  it('swaps two people on one day, even when one is off', () => {
    const out = swapShifts([shift('jess', 1), shift('jess', 2)], 1, 'jess', 'andre');
    expect(out).toEqual([shift('andre', 1), shift('jess', 2)]);
  });
  it('sets and clears a shift', () => {
    const set = setShift([shift('jess', 1)], 'jess', 1, { start: '06:00', end: '12:00' });
    expect(set).toEqual([{ staffId: 'jess', dow: 1, start: '06:00', end: '12:00' }]);
    expect(setShift(set, 'jess', 1, null)).toEqual([]);
  });
});

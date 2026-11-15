import { describe, expect, it } from 'vitest';
import { PROVIDERS, monthlyCost, payLine, timesheetCsv } from './payroll';

describe('payLine', () => {
  it('pays plain hours at the regular rate', () => {
    const p = payLine('a', [7.5, 7.5, 7.5], 2000);
    expect([p.regular, p.overtime, p.double]).toEqual([22.5, 0, 0]);
    expect(p.grossCents).toBe(45000);
  });
  it('splits a long day into overtime and double time', () => {
    const p = payLine('a', [13], 2000);
    expect([p.regular, p.overtime, p.double]).toEqual([8, 4, 1]);
    expect(p.wagesCents).toBe(8 * 2000 + 4 * 3000 + 1 * 4000);
  });
  it('turns regular hours past 40 in the week into overtime', () => {
    const p = payLine('a', [8, 8, 8, 8, 8, 6], 2000);
    expect([p.regular, p.overtime]).toEqual([40, 6]);
  });
  it('adds the meal premium hour and tips', () => {
    const p = payLine('a', [8], 2000, 1, 1250);
    expect(p.wagesCents).toBe(18000);
    expect(p.grossCents).toBe(19250);
  });
});

describe('providers', () => {
  it('prices a provider for a team size', () => {
    const square = PROVIDERS.find((p) => p.id === 'square')!;
    expect(monthlyCost(square, 5)).toBe(6500);
  });
});

describe('timesheetCsv', () => {
  it('writes one row per person and quotes commas', () => {
    const line = { ...payLine('a', [8, 9], 1800, 0, 500), name: 'Perez, Jess', hourlyCents: 1800 };
    const csv = timesheetCsv({ start: '2026-11-15', end: '2026-11-21' }, [line]);
    expect(csv.split('\n')[1]).toBe('"Perez, Jess",2026-11-15,2026-11-21,18.00,16.00,1.00,0.00,0.00,5.00,320.00');
  });
});

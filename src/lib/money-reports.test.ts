import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, dayJournal, quickBooksCsv, xeroCsv, type DaySales } from './accounting';
import { rollup, suggestTransfers, type LocationDay } from './locations';
import { itemMargins, profitAndLoss, share } from './pnl';

describe('profit and loss', () => {
  const days = [
    { revenue: 100_000, orders: 300, items: { glazed: { made: 400, sold: 380, waste: 20 } } },
    { revenue: 80_000, orders: 250, items: { glazed: { made: 400, sold: 300, waste: 100 } } },
  ];
  const p = profitAndLoss({ days, cost: { glazed: 25 }, wagesCents: 40_000, payrollTaxRate: 0.1, overhead: [{ name: 'Rent', monthlyCents: 300_000 }], cardShare: 0.5, cardRate: 0.02, cardFixedCents: 10 });
  it('counts everything made as food cost and breaks out the waste', () => {
    expect(p.foodCost).toBe(20_000);
    expect(p.wasteCost).toBe(3_000);
  });
  it('adds payroll tax to wages and spreads monthly bills over the days', () => {
    expect(p.labor).toBe(44_000);
    expect(p.overhead).toEqual([{ name: 'Rent', cents: 20_000 }]);
  });
  it('charges card fees on the card share only', () => {
    expect(p.cardFees).toBe(1_800 + 2_750);
  });
  it('leaves net profit after every cost', () => {
    expect(p.net).toBe(180_000 - 20_000 - 44_000 - 4_550 - 20_000);
    expect(p.primeCost).toBe(64_000);
    expect(share(p.primeCost, p.sales)).toBeCloseTo(0.3556, 3);
    expect(share(1, 0)).toBe(0);
  });
  it('ranks items by profit after waste', () => {
    const m = itemMargins(days, { glazed: 25 }, { glazed: 175 });
    expect(m[0]).toMatchObject({ itemId: 'glazed', sold: 680, profitCents: 680 * 175 - 800 * 25 });
    expect(m[0].margin).toBeCloseTo(150 / 175);
  });
});

describe('accounting export', () => {
  const day: DaySales = { date: '2026-11-14', foodCents: 90_000, drinkCents: 20_000, taxCents: 2_050, tipsCents: 5_000, cardCents: 85_000 };
  it('balances every day', () => {
    const lines = dayJournal(day);
    expect(lines.reduce((a, l) => a + l.debit, 0)).toBe(lines.reduce((a, l) => a + l.credit, 0));
    expect(lines.find((l) => l.account === 'cash')!.debit).toBe(117_050 - 85_000);
  });
  it('drops empty lines', () => {
    expect(dayJournal({ ...day, tipsCents: 0, taxCents: 0 }).map((l) => l.account)).toEqual(['card', 'cash', 'food', 'drinks']);
  });
  it('writes a QuickBooks journal with one number per day', () => {
    const csv = quickBooksCsv([day], DEFAULT_ACCOUNTS).split('\n');
    expect(csv[0]).toBe('JournalNo,JournalDate,AccountName,Debits,Credits,Description');
    expect(csv[1]).toBe('KN-20261114,11/14/2026,"Card payments clearing",850.00,,"Daily sales 2026-11-14"');
    expect(csv).toHaveLength(7);
  });
  it('writes Xero amounts that sum to zero', () => {
    const rows = xeroCsv([day], DEFAULT_ACCOUNTS).split('\n').slice(1);
    expect(rows.reduce((a, r) => a + Number(r.split(',').pop()), 0)).toBeCloseTo(0);
    expect(rows[2]).toContain(',4000,');
  });
});

describe('locations', () => {
  const loc = (id: string, rack: number, need: number, extra: Partial<LocationDay> = {}): LocationDay => ({ id, name: id, salesCents: 100_000, typicalCents: 90_000, laborCents: 20_000, madeUnits: 500, wasteUnits: 25, rack: { glazed: rack }, need: { glazed: need }, alerts: 1, ...extra });
  it('adds locations up', () => {
    const r = rollup([loc('a', 0, 0), loc('b', 0, 0, { salesCents: 300_000 })]);
    expect(r.salesCents).toBe(400_000);
    expect(r.laborShare).toBeCloseTo(0.1);
    expect(r.wasteShare).toBeCloseTo(0.05);
    expect(r.alerts).toBe(2);
  });
  it('moves whole trays from a shop with extra to a shop that is short', () => {
    expect(suggestTransfers([loc('a', 40, 10), loc('b', 4, 20)])).toEqual([{ itemId: 'glazed', from: 'a', to: 'b', qty: 12 }]);
  });
  it('never takes what a shop still needs and skips less than a tray', () => {
    expect(suggestTransfers([loc('a', 14, 10), loc('b', 4, 20)])).toEqual([]);
    expect(suggestTransfers([loc('a', 10, 10), loc('b', 30, 30)])).toEqual([]);
  });
});

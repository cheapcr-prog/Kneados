import { describe, expect, it } from 'vitest';
import { daysBetween } from './campaigns';
import { DEFAULT_EVENT_RULES as R, activeFundraiser, bookingProblems, eventBoxes, eventLines, fundTotals, quote, type Fundraiser } from './events';

const today = '2026-11-15';

describe('event quotes', () => {
  it('prices dozens and splits out a 25% deposit', () => {
    // 3 classic at $18 and 2 premium at $28 is $110.
    expect(quote({ classic: 3, premium: 2 }, R)).toMatchObject({ dozens: 5, donuts: 60, totalCents: 11000, depositCents: 2750, balanceCents: 8250, noticeDays: 2 });
  });
  it('asks for more notice on a big order', () => {
    expect(quote({ classic: 10 }, R).noticeDays).toBe(4);
  });
  it('lists every donut, and the lines add up to the total exactly', () => {
    const lines = eventLines({ classic: 3, assorted: 1, premium: 2 });
    expect(lines.reduce((a, l) => a + l.qty, 0)).toBe(72);
    expect(lines.reduce((a, l) => a + l.lineCents, 0)).toBe(3 * 1800 + 2200 + 2 * 2800);
    expect(lines.find((l) => l.itemId === 'glazed')?.qty).toBe(3 * 4 + 3);
  });
});

describe('booking an event', () => {
  it('needs the minimum order, a date and enough notice', () => {
    expect(bookingProblems({ classic: 2 }, '2026-11-20', today, R, daysBetween)).toEqual(['Event orders start at 3 dozen.']);
    expect(bookingProblems({ classic: 3 }, '', today, R, daysBetween)).toEqual(['Pick the day of your event.']);
    expect(bookingProblems({ classic: 3 }, '2026-11-16', today, R, daysBetween)).toEqual(['Event orders need 2 days of notice.']);
    expect(bookingProblems({ classic: 12 }, '2026-11-18', today, R, daysBetween)).toEqual(['Orders of 10 dozen or more need 4 days of notice.']);
    expect(bookingProblems({ classic: 3 }, '2026-11-17', today, R, daysBetween)).toEqual([]);
  });
});

describe('fundraisers', () => {
  const f: Fundraiser = { id: 'f1', code: 'WILSONBAND', org: 'Wilson High Band', contact: 'Ms. Ortiz', start: '2026-11-10', end: '2026-11-24', share: 0.2, goalCents: 50000, priorSalesCents: 100000, priorOrders: 40 };
  it('finds a running fundraiser by its code, however it is typed', () => {
    expect(activeFundraiser(' wilson-band ', [f], today)?.org).toBe('Wilson High Band');
    expect(activeFundraiser('wilsonband', [f], '2026-11-25')).toBeUndefined();
    expect(activeFundraiser('nope', [f], today)).toBeUndefined();
    expect(activeFundraiser('', [f], today)).toBeUndefined();
  });
  it('gives back a share of sales before tax', () => {
    const t = fundTotals(f, [{ fundraiser: 'WILSONBAND', subtotal: 2500 }, { fundraiser: 'OTHER', subtotal: 9900 }, { subtotal: 500 }], today);
    expect(t).toMatchObject({ orders: 41, salesCents: 102500, giveBackCents: 20500, state: 'running' });
    expect(t.progress).toBeCloseTo(0.41);
  });
  it('knows when it has ended and when the check has gone out', () => {
    expect(fundTotals(f, [], '2026-11-25').state).toBe('ended');
    expect(fundTotals({ ...f, paidOut: '2026-11-26' }, [], '2026-11-27').state).toBe('paid');
    expect(fundTotals(f, [], '2026-11-01').state).toBe('upcoming');
  });
});

describe('event boxes', () => {
  it('makes one box of twelve per dozen', () => {
    const boxes = eventBoxes({ classic: 2, premium: 1 });
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.length === 12)).toBe(true);
  });
});

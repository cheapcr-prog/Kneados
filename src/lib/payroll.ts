/**
 * Turns a week of time clock hours into pay lines, the California way:
 *  - over 8 hours in a day is overtime at 1.5x, over 12 hours is double time
 *  - regular hours past 40 in the week are overtime at 1.5x
 *  - a late or missed lunch adds one hour of pay at the regular rate
 * The 7th-day rule and salaried staff are left out. This is a helper, not legal or tax advice.
 */

export interface PayLine {
  staffId: string;
  regular: number;
  overtime: number;
  double: number;
  /** Meal premium hours, paid at the regular rate. */
  premium: number;
  tipsCents: number;
  wagesCents: number;
  grossCents: number;
}

export function payLine(staffId: string, dailyHours: number[], hourlyCents: number, premiumHours = 0, tipsCents = 0): PayLine {
  let regular = 0;
  let overtime = 0;
  let double = 0;
  for (const h of dailyHours) {
    regular += Math.min(h, 8);
    overtime += Math.max(0, Math.min(h, 12) - 8);
    double += Math.max(0, h - 12);
  }
  if (regular > 40) {
    overtime += regular - 40;
    regular = 40;
  }
  const wagesCents = Math.round((regular + overtime * 1.5 + double * 2 + premiumHours) * hourlyCents);
  return { staffId, regular, overtime, double, premium: premiumHours, tipsCents, wagesCents, grossCents: wagesCents + tipsCents };
}

export interface PayrollProvider {
  id: string;
  name: string;
  baseCents: number;
  perEmployeeCents: number;
  /** False when the price is an outside estimate because the provider only gives quotes. */
  listPrice: boolean;
  /** How KneadOS gets hours to it. */
  link: 'direct' | 'file';
  note: string;
}

/**
 * Cheapest full-service plan of each provider (they file the payroll taxes).
 * List prices as published in late October 2026. ADP RUN does not publish prices, so its row is an outside estimate.
 */
export const PROVIDERS: PayrollProvider[] = [
  { id: 'patriot', name: 'Patriot Full Service', baseCents: 3700, perEmployeeCents: 500, listPrice: true, link: 'file', note: 'Lowest list price with tax filing. Hours go in by file.' },
  { id: 'roll', name: 'Roll by ADP', baseCents: 3900, perEmployeeCents: 500, listPrice: true, link: 'file', note: "ADP's app for small teams. Hours go in by file." },
  { id: 'square', name: 'Square Payroll', baseCents: 3500, perEmployeeCents: 600, listPrice: true, link: 'direct', note: 'A good fit if the shop already takes cards with Square.' },
  { id: 'gusto', name: 'Gusto Simple', baseCents: 4900, perEmployeeCents: 600, listPrice: true, link: 'direct', note: 'Handles tips and files federal, state and local taxes.' },
  { id: 'onpay', name: 'OnPay', baseCents: 4900, perEmployeeCents: 600, listPrice: true, link: 'file', note: 'One plan, everything included.' },
  { id: 'quickbooks', name: 'QuickBooks Payroll', baseCents: 5000, perEmployeeCents: 700, listPrice: true, link: 'file', note: 'Easiest if the books are already in QuickBooks.' },
  { id: 'adp', name: 'ADP RUN', baseCents: 7900, perEmployeeCents: 400, listPrice: false, link: 'file', note: 'Quote only. This is an outside estimate, and extra payroll runs can cost more.' },
];

export function monthlyCost(p: PayrollProvider, employees: number): number {
  return p.baseCents + p.perEmployeeCents * employees;
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** A timesheet file with one row per person. Every payroll provider can import a file shaped like this. */
export function timesheetCsv(period: { start: string; end: string }, rows: (PayLine & { name: string; hourlyCents: number })[]): string {
  const head = ['Employee', 'Period start', 'Period end', 'Hourly rate', 'Regular hours', 'Overtime hours', 'Double time hours', 'Meal premium hours', 'Tips', 'Gross pay'];
  const body = rows.map((r) => [
    r.name, period.start, period.end, (r.hourlyCents / 100).toFixed(2), r.regular.toFixed(2), r.overtime.toFixed(2), r.double.toFixed(2),
    r.premium.toFixed(2), (r.tipsCents / 100).toFixed(2), (r.grossCents / 100).toFixed(2),
  ]);
  return [head, ...body].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

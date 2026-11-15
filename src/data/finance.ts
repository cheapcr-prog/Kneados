import type { Overhead } from '../lib/pnl';

/** Example monthly bills for the demo shop. A real shop types in its own. */
export const OVERHEAD: Overhead[] = [
  { name: "Owner's pay", monthlyCents: 700_000 },
  { name: 'Rent', monthlyCents: 750_000 },
  { name: 'Gas, power and water', monthlyCents: 240_000 },
  { name: 'Insurance', monthlyCents: 65_000 },
  { name: 'Marketing', monthlyCents: 60_000 },
  { name: 'Software and phone', monthlyCents: 42_000 },
  { name: 'Repairs and cleaning', monthlyCents: 120_000 },
];

/** Employer payroll taxes and workers' comp on top of wages. An example rate. */
export const PAYROLL_TAX_RATE = 0.1;

/** Example card processing: share of sales on a card, and the fee on each card sale. */
export const CARD = { share: 0.72, rate: 0.026, fixedCents: 10 };

/** The demo shop's own goals, as a share of sales. Each owner sets theirs. */
export const TARGETS = { food: 0.3, labor: 0.3, prime: 0.6 };

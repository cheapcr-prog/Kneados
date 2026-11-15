/** Profit and loss for a set of days: what came in, what it cost to make, staff and run the shop, and what is left. */

export interface PnlDay {
  revenue: number;
  orders: number;
  items: Record<string, { made: number; sold: number; waste: number }>;
}

export interface Overhead {
  name: string;
  monthlyCents: number;
}

export interface PnlInput {
  days: PnlDay[];
  /** Ingredient and packaging cost of one of each item, in cents. */
  cost: Record<string, number>;
  /** Hourly wages paid over the same days, in cents. */
  wagesCents: number;
  /** Employer payroll taxes and workers' comp as a share of wages. */
  payrollTaxRate: number;
  overhead: Overhead[];
  /** Share of sales paid by card, and what the processor charges on them. */
  cardShare: number;
  cardRate: number;
  cardFixedCents: number;
}

export interface Pnl {
  days: number;
  sales: number;
  /** Cost of everything made, sold or not. */
  foodCost: number;
  /** The part of food cost that was made and never sold. */
  wasteCost: number;
  wages: number;
  payrollTax: number;
  labor: number;
  /** Food cost plus labor, the two costs an owner controls day to day. */
  primeCost: number;
  cardFees: number;
  overhead: { name: string; cents: number }[];
  overheadTotal: number;
  net: number;
}

export function profitAndLoss(input: PnlInput): Pnl {
  const { days, cost } = input;
  let sales = 0, foodCost = 0, wasteCost = 0, orders = 0;
  for (const d of days) {
    sales += d.revenue;
    orders += d.orders;
    for (const [id, it] of Object.entries(d.items)) {
      foodCost += it.made * (cost[id] ?? 0);
      wasteCost += it.waste * (cost[id] ?? 0);
    }
  }
  foodCost = Math.round(foodCost);
  wasteCost = Math.round(wasteCost);
  const wages = Math.round(input.wagesCents);
  const payrollTax = Math.round(wages * input.payrollTaxRate);
  const labor = wages + payrollTax;
  const cardFees = Math.round(sales * input.cardShare * input.cardRate + orders * input.cardShare * input.cardFixedCents);
  // Monthly bills are spread evenly over a 30 day month.
  const overhead = input.overhead.map((o) => ({ name: o.name, cents: Math.round((o.monthlyCents * days.length) / 30) }));
  const overheadTotal = overhead.reduce((a, o) => a + o.cents, 0);
  return { days: days.length, sales, foodCost, wasteCost, wages, payrollTax, labor, primeCost: foodCost + labor, cardFees, overhead, overheadTotal, net: sales - foodCost - labor - cardFees - overheadTotal };
}

export const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export interface ItemMargin {
  itemId: string;
  price: number;
  cost: number;
  /** Share of the price left after ingredients and packaging. */
  margin: number;
  sold: number;
  /** Profit over the period after ingredients, including what was made and wasted. */
  profitCents: number;
}

/** Margin per item, best earner first. */
export function itemMargins(days: PnlDay[], cost: Record<string, number>, price: Record<string, number>): ItemMargin[] {
  const tot: Record<string, { sold: number; made: number }> = {};
  for (const d of days) for (const [id, it] of Object.entries(d.items)) {
    const t = (tot[id] ??= { sold: 0, made: 0 });
    t.sold += it.sold;
    t.made += it.made;
  }
  return Object.entries(tot)
    .map(([itemId, t]) => {
      const p = price[itemId] ?? 0, c = cost[itemId] ?? 0;
      return { itemId, price: p, cost: c, margin: share(p - c, p), sold: t.sold, profitCents: Math.round(t.sold * p - t.made * c) };
    })
    .sort((a, b) => b.profitCents - a.profitCents);
}

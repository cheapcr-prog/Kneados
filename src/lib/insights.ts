/** Menu insights: what each item really earns once ingredients, waste and kitchen time are counted, and what to do about it. */

export interface ItemDay { made: number; sold: number; waste: number }

export type Verdict = 'losing' | 'waste' | 'thin' | 'drop' | 'runs-out' | 'earner' | 'fine';

export interface Insight {
  itemId: string;
  price: number;
  cost: number;
  soldPerDay: number;
  /** Share of the price left after ingredients. */
  margin: number;
  /** Share of what was made that went unsold. */
  wasteRate: number;
  /** Ingredient cost of what went unsold, per day, in cents. */
  wastePerDayCents: number;
  /** Sales less ingredients for everything made and the kitchen time to make it, per day, in cents. */
  profitPerDayCents: number;
  soldOutDays: number;
  days: number;
  verdict: Verdict;
  advice: string;
  /** What following the advice is worth in a 30 day month, in cents, when it can be worked out. */
  monthlyCents?: number;
  /** A new price, when the advice is a price change. */
  newPrice?: number;
  /** How many fewer to make a day, when the advice is to bake less. */
  bakeFewer?: number;
}

export interface InsightOptions {
  /** The shop's goal for ingredients as a share of the price. */
  foodTarget: number;
  /** Kitchen wages spread over every piece made, in cents. Zero for drinks and anything not made in the kitchen. */
  laborPerPiece: (itemId: string) => number;
  name: (itemId: string) => string;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ceil25 = (cents: number) => Math.ceil(cents / 25) * 25;

/** One row per item, the ones that need attention first and the biggest money first within each group. */
export function menuInsights(days: Record<string, ItemDay>[], cost: Record<string, number>, price: Record<string, number>, o: InsightOptions): Insight[] {
  const n = Math.max(1, days.length);
  const tot: Record<string, { made: number; sold: number; waste: number; soldOut: number }> = {};
  for (const day of days) for (const [id, d] of Object.entries(day)) {
    const t = (tot[id] ??= { made: 0, sold: 0, waste: 0, soldOut: 0 });
    t.made += d.made; t.sold += d.sold; t.waste += d.waste;
    if (d.made > 0 && d.waste === 0) t.soldOut += 1;
  }
  const rows = Object.entries(tot).map(([itemId, t]): Insight => {
    const p = price[itemId] ?? 0, c = cost[itemId] ?? 0;
    // Drinks are made to order, so every one made is one sold.
    const made = Math.max(t.made, t.sold);
    const profit = t.sold * p - made * (c + o.laborPerPiece(itemId));
    return {
      itemId, price: p, cost: c, soldPerDay: t.sold / n, margin: p > 0 ? (p - c) / p : 0, wasteRate: made > 0 ? t.waste / made : 0,
      wastePerDayCents: (t.waste * c) / n, profitPerDayCents: profit / n, soldOutDays: t.soldOut, days: n, verdict: 'fine', advice: '',
    };
  });
  const byProfit = [...rows].sort((a, b) => a.profitPerDayCents - b.profitPerDayCents);
  const lowProfit = byProfit[Math.floor(rows.length / 4)]?.profitPerDayCents ?? 0;
  const highProfit = byProfit[Math.floor((rows.length * 3) / 4)]?.profitPerDayCents ?? 0;

  for (const r of rows) {
    const name = o.name(r.itemId);
    const wastePerDay = r.wasteRate > 0 ? (r.soldPerDay / (1 - r.wasteRate)) * r.wasteRate : 0;
    const foodShare = 1 - r.margin;
    if (r.profitPerDayCents < 0) {
      r.verdict = 'losing';
      r.advice = `${name} loses ${usd(-r.profitPerDayCents)} a day once ingredients, waste and kitchen time are counted. Take it off the menu or raise the price.`;
      r.monthlyCents = Math.round(-r.profitPerDayCents * 30);
    } else if (foodShare > o.foodTarget + 0.05) {
      const raise = Math.min(50, ceil25(r.cost / o.foodTarget - r.price));
      r.verdict = 'thin';
      r.newPrice = r.price + raise;
      r.monthlyCents = Math.round(r.soldPerDay * raise * 30);
      r.advice = `Ingredients are ${pct(foodShare)} of the ${usd(r.price)} price, over your ${pct(o.foodTarget)} goal. Raise it to ${usd(r.newPrice)}.`;
    } else if (r.wasteRate >= 0.25 && r.profitPerDayCents <= lowProfit) {
      r.verdict = 'drop';
      r.advice = `${name} earns ${usd(r.profitPerDayCents)} a day and ${pct(r.wasteRate)} of it goes unsold. Make it only on your busiest days, or drop it and give the kitchen time to a better seller.`;
      r.monthlyCents = Math.round(r.wastePerDayCents * 30);
    } else if (r.wasteRate >= 0.22 && wastePerDay >= 8) {
      r.verdict = 'waste';
      r.bakeFewer = Math.max(2, Math.round(wastePerDay / 2));
      r.monthlyCents = Math.round(r.bakeFewer * r.cost * 30);
      r.advice = `${pct(r.wasteRate)} of the ${name} made goes unsold, about ${Math.round(wastePerDay)} a day. Make ${r.bakeFewer} fewer.`;
    } else if (r.soldOutDays >= r.days / 3 && r.wasteRate < 0.1) {
      r.verdict = 'runs-out';
      r.advice = `${name} sold out on ${r.soldOutDays} of the last ${r.days} days. Make more: every one you run out of is a sale you did not get.`;
    } else if (r.profitPerDayCents >= highProfit) {
      r.verdict = 'earner';
      r.advice = `One of your best earners at ${usd(r.profitPerDayCents)} a day. Keep it in front of customers and never let it run out.`;
    } else {
      r.advice = 'Earning its place. Nothing to change.';
    }
  }
  const ORDER: Verdict[] = ['losing', 'thin', 'drop', 'waste', 'runs-out', 'earner', 'fine'];
  return rows.sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || (b.monthlyCents ?? b.profitPerDayCents) - (a.monthlyCents ?? a.profitPerDayCents));
}

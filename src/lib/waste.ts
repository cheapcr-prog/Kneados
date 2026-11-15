/** Waste and day-old tracking: what was left at close, what happened to it, and what it cost. */

export type Fate = 'dayold' | 'donated' | 'tossed';

export interface LeftoverEntry {
  itemId: string;
  qty: number;
  fate: Fate;
}

export interface DayRecord {
  made: number;
  sold: number;
  waste: number;
}

export interface WasteRow {
  itemId: string;
  made: number;
  wasted: number;
  /** Share of what was made that went unsold. */
  rate: number;
  costCents: number;
  /** Retail value of what went unsold. */
  retailCents: number;
  /** How many of the days this item had leftovers. */
  daysWithWaste: number;
  days: number;
  /** How many of the days it sold out. */
  soldOutDays: number;
}

/** Totals per item over a set of days, worst first by cost. */
export function wasteByItem(days: Record<string, DayRecord>[], cost: Record<string, number>, price: Record<string, number>): WasteRow[] {
  const rows: Record<string, WasteRow> = {};
  for (const day of days) {
    for (const [itemId, d] of Object.entries(day)) {
      const r = (rows[itemId] ??= { itemId, made: 0, wasted: 0, rate: 0, costCents: 0, retailCents: 0, daysWithWaste: 0, days: 0, soldOutDays: 0 });
      r.made += d.made;
      r.wasted += d.waste;
      r.days += 1;
      if (d.waste > 0) r.daysWithWaste += 1;
      if (d.made > 0 && d.sold >= d.made) r.soldOutDays += 1;
    }
  }
  return Object.values(rows)
    .map((r) => ({ ...r, rate: r.made > 0 ? r.wasted / r.made : 0, costCents: Math.round(r.wasted * (cost[r.itemId] ?? 0)), retailCents: Math.round(r.wasted * (price[r.itemId] ?? 0)) }))
    .sort((a, b) => b.costCents - a.costCents);
}

/** Day-old donuts sell at this share of the regular price. */
export const DAY_OLD_PRICE = 0.5;

export interface LeftoverSummary {
  total: number;
  dayOld: number;
  donated: number;
  tossed: number;
  /** What the day-old rack brings in if it all sells. */
  recoverCents: number;
  /** Ingredient cost of what was donated or tossed. */
  lostCents: number;
}

export function summarizeLeftovers(entries: LeftoverEntry[], cost: Record<string, number>, price: Record<string, number>): LeftoverSummary {
  const sum = (fate: Fate) => entries.filter((e) => e.fate === fate).reduce((a, e) => a + e.qty, 0);
  return {
    total: entries.reduce((a, e) => a + e.qty, 0),
    dayOld: sum('dayold'), donated: sum('donated'), tossed: sum('tossed'),
    recoverCents: Math.round(entries.filter((e) => e.fate === 'dayold').reduce((a, e) => a + e.qty * (price[e.itemId] ?? 0) * DAY_OLD_PRICE, 0)),
    lostCents: Math.round(entries.filter((e) => e.fate !== 'dayold').reduce((a, e) => a + e.qty * (cost[e.itemId] ?? 0), 0)),
  };
}

/**
 * What to do with each leftover by default. Filled donuts and anything with dairy cream are not kept overnight.
 * Raised and cake donuts go on the day-old rack, up to a cap, and the rest is donated.
 */
export function suggestFate(itemId: string, qty: number, keepsOvernight: boolean, rackCap = 12): LeftoverEntry[] {
  if (qty <= 0) return [];
  if (!keepsOvernight) return [{ itemId, qty, fate: 'tossed' }];
  const rack = Math.min(qty, rackCap);
  return qty > rack ? [{ itemId, qty: rack, fate: 'dayold' }, { itemId, qty: qty - rack, fate: 'donated' }] : [{ itemId, qty: rack, fate: 'dayold' }];
}

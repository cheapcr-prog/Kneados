/** More than one shop: totals across locations and donuts worth moving between them. */

export interface LocationDay {
  id: string;
  name: string;
  salesCents: number;
  /** What this weekday usually brings in at this location. */
  typicalCents: number;
  laborCents: number;
  madeUnits: number;
  /** Units expected to be left at close at the current pace. */
  wasteUnits: number;
  /** What is on the rack right now, by item. */
  rack: Record<string, number>;
  /** What the location still expects to sell before close, by item. */
  need: Record<string, number>;
  /** Things waiting on the manager: supplies to order, overdue tasks, open repairs. */
  alerts: number;
}

export interface Rollup {
  salesCents: number;
  typicalCents: number;
  laborCents: number;
  laborShare: number;
  wasteShare: number;
  alerts: number;
}

export function rollup(locations: LocationDay[]): Rollup {
  const sum = (f: (l: LocationDay) => number) => locations.reduce((a, l) => a + f(l), 0);
  const salesCents = sum((l) => l.salesCents);
  const made = sum((l) => l.madeUnits);
  return {
    salesCents, typicalCents: sum((l) => l.typicalCents), laborCents: sum((l) => l.laborCents),
    laborShare: salesCents > 0 ? sum((l) => l.laborCents) / salesCents : 0,
    wasteShare: made > 0 ? sum((l) => l.wasteUnits) / made : 0,
    alerts: sum((l) => l.alerts),
  };
}

export interface Transfer {
  itemId: string;
  from: string;
  to: string;
  qty: number;
}

/**
 * Moves extra donuts to a shop that will run out. Only whole trays move (`tray` at a time),
 * and a shop never gives away what it still expects to sell itself.
 */
export function suggestTransfers(locations: LocationDay[], tray = 6): Transfer[] {
  const out: Transfer[] = [];
  const items = new Set(locations.flatMap((l) => [...Object.keys(l.rack), ...Object.keys(l.need)]));
  for (const itemId of items) {
    const gap = locations.map((l) => ({ id: l.id, extra: (l.rack[itemId] ?? 0) - (l.need[itemId] ?? 0) }));
    const short = gap.filter((g) => g.extra < 0).sort((a, b) => a.extra - b.extra);
    const spare = gap.filter((g) => g.extra > 0).sort((a, b) => b.extra - a.extra);
    for (const s of short) {
      for (const g of spare) {
        const qty = Math.floor(Math.min(-s.extra, g.extra) / tray) * tray;
        if (qty <= 0) continue;
        out.push({ itemId, from: g.id, to: s.id, qty });
        g.extra -= qty;
        s.extra += qty;
      }
    }
  }
  return out.sort((a, b) => b.qty - a.qty);
}

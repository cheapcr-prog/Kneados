import { DEMO_TAX_RATE } from './money';

/** Things the shop sells that are not food: shirts, mugs, and small extras that go with an order. */

export interface MerchItem {
  id: string;
  name: string;
  blurb: string;
  kind: 'merch' | 'extra';
  priceCents: number;
  /** What one costs the shop from its supplier. */
  costCents: number;
  sizes?: string[];
  /** Reorder when the stock, across all sizes, falls to this. */
  reorderAt: number;
  /** How many come in one reorder, split evenly across sizes. */
  reorderQty: number;
  supplier: string;
  color: string;
}

export interface MerchLine {
  id: string;
  size?: string;
  qty: number;
  /** What the customer paid for the line before tax, in cents. */
  cents: number;
}

/** One stock count per item, or per size for items that come in sizes. */
export type Stock = Record<string, number>;

export const stockKey = (id: string, size?: string) => (size ? `${id}:${size}` : id);
export const splitKey = (key: string): { id: string; size?: string } => {
  const [id, size] = key.split(':');
  return size ? { id, size } : { id };
};

export function merchLines(cart: Record<string, number>, byId: Record<string, MerchItem>): MerchLine[] {
  return Object.entries(cart)
    .filter(([key, qty]) => qty > 0 && byId[splitKey(key).id])
    .map(([key, qty]) => ({ ...splitKey(key), qty, cents: qty * byId[splitKey(key).id].priceCents }));
}

/** Merch is taxed like any other goods, unlike donuts to go. */
export function merchTotals(lines: MerchLine[]): { subtotal: number; tax: number; total: number } {
  const subtotal = lines.reduce((a, l) => a + l.cents, 0);
  const tax = Math.round(subtotal * DEMO_TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

export const onHand = (item: MerchItem, stock: Stock) => (item.sizes ? item.sizes.reduce((a, s) => a + (stock[stockKey(item.id, s)] ?? 0), 0) : stock[item.id] ?? 0);

export function takeFromStock(stock: Stock, lines: MerchLine[]): Stock {
  const next = { ...stock };
  for (const l of lines) next[stockKey(l.id, l.size)] = Math.max(0, (next[stockKey(l.id, l.size)] ?? 0) - l.qty);
  return next;
}

/** A reorder fills the sizes that are lowest first, so the delivery evens the rack out. */
export function addReorder(stock: Stock, item: MerchItem): Stock {
  const next = { ...stock };
  if (!item.sizes) {
    next[item.id] = (next[item.id] ?? 0) + item.reorderQty;
    return next;
  }
  for (let i = 0; i < item.reorderQty; i++) {
    const low = item.sizes.reduce((a, s) => ((next[stockKey(item.id, s)] ?? 0) < (next[stockKey(item.id, a)] ?? 0) ? s : a));
    next[stockKey(item.id, low)] = (next[stockKey(item.id, low)] ?? 0) + 1;
  }
  return next;
}

export interface MerchRow {
  item: MerchItem;
  onHand: number;
  /** Sizes with none left. */
  out: string[];
  sold28: number;
  salesCents: number;
  profitCents: number;
  margin: number;
  /** Days until it runs out at the recent pace. Undefined when it is not selling. */
  daysLeft?: number;
  reorder: boolean;
}

/** One line per item: what is on the shelf, how it sells and whether to reorder. */
export function merchReport(items: MerchItem[], stock: Stock, sold28: Record<string, number>): MerchRow[] {
  return items.map((item) => {
    const have = onHand(item, stock);
    const sold = sold28[item.id] ?? 0;
    const salesCents = sold * item.priceCents;
    const profitCents = sold * (item.priceCents - item.costCents);
    return {
      item, onHand: have, out: (item.sizes ?? []).filter((s) => (stock[stockKey(item.id, s)] ?? 0) === 0),
      sold28: sold, salesCents, profitCents, margin: item.priceCents > 0 ? (item.priceCents - item.costCents) / item.priceCents : 0,
      daysLeft: sold > 0 ? Math.floor(have / (sold / 28)) : undefined,
      reorder: have <= item.reorderAt,
    };
  });
}

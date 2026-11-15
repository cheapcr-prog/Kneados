import type { MenuItem, OrderLine } from '../data/types';
import { DEMO_TAX_RATE } from './money';

/** Dozen pricing kicks in on its own: every full 12 is charged at the dozen price. */
export function linePrice(item: MenuItem, qty: number): number {
  if (!item.dozenPrice) return item.price * qty;
  const dozens = Math.floor(qty / 12);
  return dozens * item.dozenPrice + (qty - dozens * 12) * item.price;
}

export const BOX_SIZE = 12;

/** A donut in a mixed dozen box is charged one twelfth of its own dozen price. */
export function boxItemCents(item: MenuItem, count: number): number {
  return Math.round((count * (item.dozenPrice ?? item.price * BOX_SIZE)) / BOX_SIZE);
}

/** Counts how many of each item sit in a box, in the order they first appear. */
export function boxCounts(box: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of box) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts];
}

/** Price of a full mixed dozen, and what the same donuts cost one at a time. */
export function boxPrice(box: string[], menu: Record<string, MenuItem>): { cents: number; singles: number } {
  let cents = 0;
  let singles = 0;
  for (const [id, n] of boxCounts(box)) {
    cents += boxItemCents(menu[id], n);
    singles += menu[id].price * n;
  }
  return { cents, singles };
}

/** Order lines for a cart of loose items plus mixed dozen boxes: one line per item. */
export function cartLines(loose: Record<string, number>, boxes: string[][], menu: Record<string, MenuItem>): OrderLine[] {
  const qty = new Map<string, number>();
  const cents = new Map<string, number>();
  const bump = (id: string, q: number, c: number) => {
    qty.set(id, (qty.get(id) ?? 0) + q);
    cents.set(id, (cents.get(id) ?? 0) + c);
  };
  for (const [id, q] of Object.entries(loose)) if (q > 0) bump(id, q, linePrice(menu[id], q));
  for (const box of boxes) for (const [id, n] of boxCounts(box)) bump(id, n, boxItemCents(menu[id], n));
  return [...qty].map(([itemId, q]) => ({ itemId, qty: q, lineCents: cents.get(itemId)! }));
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function totals(lines: OrderLine[], menu: Record<string, MenuItem>, discount = 0): Totals {
  const subtotal = lines.reduce((a, l) => a + l.lineCents, 0);
  const taxable = lines.filter((l) => menu[l.itemId]?.taxable).reduce((a, l) => a + l.lineCents, 0);
  const tax = Math.round(taxable * DEMO_TAX_RATE);
  const d = Math.min(discount, subtotal);
  return { subtotal, discount: d, tax, total: subtotal - d + tax };
}

/** A Dough Rewards freebie covers the cheapest single donut on the ticket. */
export function rewardDiscount(lines: OrderLine[], menu: Record<string, MenuItem>): number {
  const donuts = lines.map((l) => menu[l.itemId]).filter((m) => m && m.baked && m.category !== 'Specialty');
  if (donuts.length === 0) return 0;
  return Math.min(...donuts.map((m) => m.price));
}

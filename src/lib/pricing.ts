import type { MenuItem, OrderLine } from '../data/types';
import { DEMO_TAX_RATE } from './money';

/** Dozen pricing kicks in on its own: every full 12 is charged at the dozen price. */
export function linePrice(item: MenuItem, qty: number): number {
  if (!item.dozenPrice) return item.price * qty;
  const dozens = Math.floor(qty / 12);
  return dozens * item.dozenPrice + (qty - dozens * 12) * item.price;
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

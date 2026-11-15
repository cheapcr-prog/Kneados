import type { Order, OrderLine } from '../data/types';
import { MIXES, type MixId } from './subscriptions';

/** Event pre-orders with a deposit, and fundraisers where a share of sales goes back to a group. */

export interface EventRules {
  /** Fewest dozens for an event order. Smaller orders go through the normal shop page. */
  minDozens: number;
  /** Days of notice the kitchen needs. */
  noticeDays: number;
  /** Orders this big need more notice. */
  bigDozens: number;
  bigNoticeDays: number;
  /** Share of the total paid when booking. */
  depositShare: number;
}

export const DEFAULT_EVENT_RULES: EventRules = { minDozens: 3, noticeDays: 2, bigDozens: 10, bigNoticeDays: 4, depositShare: 0.25 };

export type Dozens = Partial<Record<MixId, number>>;

export const totalDozens = (d: Dozens) => MIXES.reduce((a, m) => a + Math.max(0, d[m.id] ?? 0), 0);

/** The donuts in an event order, item by item, priced so the lines add up to the dozen prices exactly. */
export function eventLines(d: Dozens): OrderLine[] {
  const qty: Record<string, number> = {};
  const cents: Record<string, number> = {};
  for (const m of MIXES) {
    const n = Math.max(0, d[m.id] ?? 0);
    if (n === 0) continue;
    const total = n * m.dozenCents;
    const items = Object.entries(m.box);
    let used = 0;
    items.forEach(([id, count], i) => {
      // The last item takes whatever is left, so rounding never loses a cent.
      const share = i === items.length - 1 ? total - used : Math.round((total * count) / 12);
      used += share;
      qty[id] = (qty[id] ?? 0) + count * n;
      cents[id] = (cents[id] ?? 0) + share;
    });
  }
  return Object.keys(qty).map((itemId) => ({ itemId, qty: qty[itemId], lineCents: cents[itemId] }));
}

/** One box per dozen, so the packing queue shows boxes to fill and not one big bag. */
export function eventBoxes(d: Dozens): string[][] {
  return MIXES.flatMap((m) => Array.from({ length: Math.max(0, d[m.id] ?? 0) }, () => Object.entries(m.box).flatMap(([id, n]) => Array<string>(n).fill(id))));
}

export interface Quote {
  dozens: number;
  donuts: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  /** Days of notice this order needs. */
  noticeDays: number;
}

export function quote(d: Dozens, rules: EventRules): Quote {
  const dozens = totalDozens(d);
  const totalCents = eventLines(d).reduce((a, l) => a + l.lineCents, 0);
  const depositCents = Math.round(totalCents * rules.depositShare);
  return { dozens, donuts: dozens * 12, totalCents, depositCents, balanceCents: totalCents - depositCents, noticeDays: dozens >= rules.bigDozens ? rules.bigNoticeDays : rules.noticeDays };
}

/** Why an event order cannot be booked yet. Empty when it can. */
export function bookingProblems(d: Dozens, date: string, today: string, rules: EventRules, daysBetween: (a: string, b: string) => number): string[] {
  const q = quote(d, rules);
  const out: string[] = [];
  if (q.dozens < rules.minDozens) out.push(`Event orders start at ${rules.minDozens} dozen.`);
  if (!date) out.push('Pick the day of your event.');
  else if (daysBetween(today, date) < q.noticeDays) out.push(`${q.dozens >= rules.bigDozens ? `Orders of ${rules.bigDozens} dozen or more` : 'Event orders'} need ${q.noticeDays} days of notice.`);
  return out;
}

export interface EventOrder {
  id: string;
  /** The order it created, which the bake plan and the pickup queue read. */
  orderId: string;
  name: string;
  phone: string;
  occasion: string;
  /** YYYY-MM-DD and HH:MM of the pickup. */
  date: string;
  time: string;
  dozens: Dozens;
  totalCents: number;
  depositCents: number;
  balancePaid: boolean;
  fundraiser?: string;
}

export interface Fundraiser {
  id: string;
  /** What supporters type at checkout. */
  code: string;
  org: string;
  contact: string;
  start: string;
  end: string;
  /** Share of each supporting order that goes back to the group. */
  share: number;
  goalCents: number;
  /** Example sales from before the demo started, so a running fundraiser is not empty. */
  priorSalesCents: number;
  priorOrders: number;
  /** The day the check went out. */
  paidOut?: string;
}

export const normalizeFundCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The fundraiser a code belongs to, if it is running on this day. */
export function activeFundraiser(code: string, list: Fundraiser[], today: string): Fundraiser | undefined {
  const c = normalizeFundCode(code);
  if (!c) return undefined;
  return list.find((f) => f.code === c && f.start <= today && today <= f.end);
}

export interface FundTotals {
  orders: number;
  salesCents: number;
  /** What the shop owes the group. */
  giveBackCents: number;
  /** Share of the goal reached, from 0 to 1. */
  progress: number;
  state: 'upcoming' | 'running' | 'ended' | 'paid';
}

/** Sales count before tax and tips, because that is what the shop actually earns on the order. */
export function fundTotals(f: Fundraiser, orders: Pick<Order, 'fundraiser' | 'subtotal'>[], today: string): FundTotals {
  const mine = orders.filter((o) => o.fundraiser === f.code);
  const salesCents = f.priorSalesCents + mine.reduce((a, o) => a + o.subtotal, 0);
  const giveBackCents = Math.round(salesCents * f.share);
  return {
    orders: f.priorOrders + mine.length, salesCents, giveBackCents,
    progress: f.goalCents > 0 ? Math.min(1, giveBackCents / f.goalCents) : 0,
    state: f.paidOut ? 'paid' : today < f.start ? 'upcoming' : today > f.end ? 'ended' : 'running',
  };
}

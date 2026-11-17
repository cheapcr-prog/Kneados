/**
 * Deals worked out from supply and demand.
 *
 * Supply: an ingredient the shop holds more of than it will sell before it spoils. The deal goes on the menu items
 * that use it, sized so the food that would have been thrown away pays for the discount.
 * Demand: the hours of today's weekday when the oven sits mostly idle. The deal pulls pickup orders into them.
 * When the kitchen is already busy, every deal is paused: nobody discounts a full oven.
 *
 * Every number here is arithmetic on the shop's own stock, recipes, prices and sales history. No AI picks a price.
 * The owner approves a deal before any customer hears it, and no deal can take an item below its margin floor.
 */
import { INVENTORY, PIZZA_SHOP, SIDE_BY_ID, SIDES, SPECIALTIES, type SizeId } from './data';
import { configFor, pizzaFoodCost, type Line, type PizzaDay, type StockLine } from './logic';

/** No deal takes more than this share off an item's price. */
export const MAX_OFF_SHARE = 0.25;
/** After the discount, food cost may be at most this share of what the customer pays. */
export const MAX_COST_SHARE = 0.4;
/** Deals are whole steps of this many cents, so they are easy to say. */
const STEP_CENTS = 50;
/** A quiet stretch is this many hours long. */
const SLOW_HOURS = 2;
/** Hours count as slow when they bring in at most this share of the busiest stretch. */
export const SLOW_SHARE = 0.45;
/** Pizzas waiting or baking at which the kitchen is busy enough that deals pause. */
export const BUSY_PIES = 10;
/** The most units of one item a deal covers on a single order. */
export const DEAL_MAX_UNITS = 4;

export interface Deal {
  id: string;
  kind: 'use-up' | 'slow-hours';
  /** Short name for the owner's screen. */
  title: string;
  /** Why this deal, with the numbers it came from. */
  why: string;
  /** One sentence a customer hears or reads. Written by code, so the price in it is always the real one. */
  pitch: string;
  /** Cents off each unit it applies to. */
  offCents: number;
  /** Sides it applies to. */
  sideIds?: string[];
  /** Pizza size it applies to (any pizza of that size). */
  size?: SizeId;
  /** Only for pickup orders. */
  pickupOnly?: boolean;
  /** Hours of the day it runs, shop time: from this hour up to (not including) that hour. */
  fromHour?: number;
  toHour?: number;
  /** Food that would otherwise be thrown away, in cents. */
  savesCents?: number;
}

const dollars = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const hourWord = (h: number) => `${((h + 11) % 12) + 1}${h < 12 || h === 24 ? 'am' : 'pm'}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The biggest step-sized discount that keeps an item inside both limits. Zero when there is no room. */
export function roomToDiscount(priceCents: number, costCents: number): number {
  const byShare = priceCents * MAX_OFF_SHARE;
  const byMargin = priceCents - costCents / MAX_COST_SHARE;
  return Math.max(0, Math.floor(Math.min(byShare, byMargin) / STEP_CENTS) * STEP_CENTS);
}

/** Supply: stock that will spoil before it sells at the normal pace. */
function useUpDeals(stock: readonly StockLine[]): Deal[] {
  const deals: Deal[] = [];
  for (const inv of INVENTORY) {
    const line = stock.find((s) => s.id === inv.id);
    const sides = SIDES.filter((s) => (s.uses as Record<string, number> | undefined)?.[inv.id]);
    if (!line || !sides.length || inv.shelfDays > 14 || line.perDay <= 0) continue;
    // Stock is treated as delivered today, which is the kindest case: older stock spoils sooner.
    const willSell = line.perDay * inv.shelfDays;
    const surplus = line.onHand - willSell;
    if (surplus < Math.max(1, line.perDay)) continue;
    const off = Math.min(...sides.map((s) => roomToDiscount(s.cents, s.costCents)));
    if (off <= 0) continue;
    const unitCents = inv.packCents / inv.pack;
    const names = sides.map((s) => s.name.replace(/ \(\d+\)$/, ''));
    // "Buffalo Wings" and "BBQ Wings" are both "Wings"; a single item keeps its own name.
    const label = sides.length > 1 ? names[0].split(' ').slice(-1)[0] : names[0];
    const are = /s$/i.test(label) ? 'are' : 'is';
    const example = sides[0];
    deals.push({
      id: `use-${inv.id}`, kind: 'use-up', sideIds: sides.map((s) => s.id), offCents: off,
      title: `${dollars(off)} off ${sides.length > 1 ? `all ${label.toLowerCase()}` : label}`,
      why: `${round1(line.onHand)} ${inv.unit} of ${inv.name.toLowerCase()} on hand with a ${inv.shelfDays} day shelf life. At ${round1(line.perDay)} ${inv.unit} a day you will sell ${round1(willSell)}, so about ${round1(surplus)} ${inv.unit} would be thrown away.`,
      pitch: sides.length > 1 ? `${label} ${are} ${dollars(off)} off today: ${example.name} for ${dollars(example.cents - off)}.` : `${label} ${are} ${dollars(off)} off today, down to ${dollars(example.cents - off)}.`,
      savesCents: Math.round(surplus * unitCents),
    });
  }
  return deals;
}

/** Average orders in each open hour for this weekday, over the last six of them. */
export function hourlyDemand(history: readonly PizzaDay[], dow: number): number[] {
  const days = history.filter((d) => d.dow === dow && !d.event).slice(-6);
  const hours = PIZZA_SHOP.closeHour - PIZZA_SHOP.openHour;
  return Array.from({ length: hours }, (_, i) => (days.length ? days.reduce((a, d) => a + (d.hourly[i] ?? 0), 0) / days.length : 0));
}

/** Demand: the quietest stretch of today's weekday, when it is far below the busiest one. */
function slowHoursDeal(history: readonly PizzaDay[], dow: number): Deal[] {
  const demand = hourlyDemand(history, dow);
  if (demand.length < SLOW_HOURS * 2) return [];
  const stretch = (from: number) => demand.slice(from, from + SLOW_HOURS).reduce((a, n) => a + n, 0) / SLOW_HOURS;
  const starts = demand.map((_, i) => i).filter((i) => i + SLOW_HOURS <= demand.length);
  const busiest = Math.max(...starts.map(stretch));
  // The first and last hour are always thin (opening and closing), so the quiet stretch is looked for in between.
  const inner = starts.filter((i) => i >= 1 && i + SLOW_HOURS <= demand.length - 1);
  if (!inner.length || busiest <= 0) return [];
  const slowest = inner.reduce((best, i) => (stretch(i) < stretch(best) ? i : best), inner[0]);
  if (stretch(slowest) > busiest * SLOW_SHARE) return [];
  // The deal has to be safe on every large pizza on the menu, so it is sized on the one with the least room.
  const off = Math.min(...SPECIALTIES.map((s) => roomToDiscount(s.prices.L, pizzaFoodCost(configFor(s.id, 'L')))));
  if (off <= 0) return [];
  const fromHour = PIZZA_SHOP.openHour + slowest;
  const toHour = fromHour + SLOW_HOURS;
  const busiestAt = PIZZA_SHOP.openHour + starts.reduce((best, i) => (stretch(i) > stretch(best) ? i : best), starts[0]);
  return [{
    id: `slow-${fromHour}`, kind: 'slow-hours', size: 'L', pickupOnly: true, fromHour, toHour, offCents: off,
    title: `${dollars(off)} off large pizzas, pickup, ${hourWord(fromHour)} to ${hourWord(toHour)}`,
    why: `On this weekday ${hourWord(fromHour)} to ${hourWord(toHour)} brings about ${round1(stretch(slowest))} orders an hour, against ${round1(busiest)} around ${hourWord(busiestAt)}. The oven and the crew are already paid for in those hours.`,
    pitch: `Every large pizza is ${dollars(off)} off for pickup between ${hourWord(fromHour)} and ${hourWord(toHour)} today.`,
  }];
}

/** Every deal the numbers support today, supply first. The owner picks which ones run. */
export function suggestDeals(input: { stock: readonly StockLine[]; history: readonly PizzaDay[]; dow: number }): Deal[] {
  return [...useUpDeals(input.stock), ...slowHoursDeal(input.history, input.dow)];
}

/** The deals a customer can get this minute: inside their hours, and not while the kitchen is slammed. */
export function dealsNow(deals: readonly Deal[], hour: number, piesAhead = 0): Deal[] {
  if (piesAhead >= BUSY_PIES) return [];
  return deals.filter((d) => d.fromHour === undefined || d.toHour === undefined || (hour >= d.fromHour && hour < d.toHour));
}

export interface AppliedDeal { id: string; title: string; cents: number }

/** What the deals take off an order. Each deal covers a few units, and never more than the item costs. */
export function applyDeals(lines: readonly Line[], deals: readonly Deal[], fulfillment: 'pickup' | 'delivery' | ''): { cents: number; applied: AppliedDeal[] } {
  const applied: AppliedDeal[] = [];
  for (const d of deals) {
    if (d.pickupOnly && fulfillment !== 'pickup') continue;
    const units = lines.reduce((n, l) => {
      const hit = l.kind === 'side' ? !!d.sideIds?.includes(l.sideId) : !!d.size && l.config.size === d.size;
      return n + (hit ? l.qty : 0);
    }, 0);
    const cents = Math.min(units, DEAL_MAX_UNITS) * d.offCents;
    if (cents > 0) applied.push({ id: d.id, title: d.title, cents });
  }
  return { cents: applied.reduce((a, d) => a + d.cents, 0), applied };
}

/**
 * Deals that arrive from a browser are checked before the phone line will say them: only known items, only
 * discounts inside the same limits the suggestions are held to, and only a handful at once.
 */
export function cleanDeals(raw: unknown): Deal[] {
  if (!Array.isArray(raw)) return [];
  const out: Deal[] = [];
  for (const r of raw.slice(0, 6)) {
    const d = r as Partial<Deal>;
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(d.id) || (d.kind !== 'use-up' && d.kind !== 'slow-hours')) continue;
    const off = Math.floor(Number(d.offCents));
    if (!Number.isFinite(off) || off <= 0) continue;
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>{}]/g, '').slice(0, max) : '');
    if (d.kind === 'use-up') {
      const sideIds = Array.isArray(d.sideIds) ? d.sideIds.filter((id): id is string => typeof id === 'string' && !!SIDE_BY_ID[id]) : [];
      if (!sideIds.length || sideIds.some((id) => off > roomToDiscount(SIDE_BY_ID[id].cents, SIDE_BY_ID[id].costCents))) continue;
      out.push({ id: d.id, kind: 'use-up', title: text(d.title, 80), why: text(d.why, 300), pitch: text(d.pitch, 200), offCents: off, sideIds });
    } else {
      const size = d.size === 'S' || d.size === 'M' || d.size === 'L' ? d.size : undefined;
      const from = Math.floor(Number(d.fromHour));
      const to = Math.floor(Number(d.toHour));
      if (!size || !(from >= 0 && to > from && to <= 24)) continue;
      if (SPECIALTIES.some((s) => off > roomToDiscount(s.prices[size], pizzaFoodCost(configFor(s.id, size))))) continue;
      out.push({ id: d.id, kind: 'slow-hours', title: text(d.title, 80), why: text(d.why, 300), pitch: text(d.pitch, 200), offCents: off, size, pickupOnly: true, fromHour: from, toHour: to });
    }
  }
  return out.filter((d) => d.pitch && d.title);
}

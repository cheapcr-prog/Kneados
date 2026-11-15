import { addDays, dowOf, holidayFor, isoDate } from '../lib/dates';
import { roundUpToBatch } from '../lib/forecast';
import { MENU, MENU_BY_ID, SCHEDULE, SHOP, shiftHours } from './shop';
import type { DayHistory, Order, OrderLine } from './types';

/** Small seeded random generator so the demo shows the same history to everyone on a given day. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** How busy each weekday is against an average weekday. */
const DOW_FACTOR = [1.4, 0.85, 0.8, 0.86, 0.92, 1.12, 1.55];
const RAIN_FACTOR = 0.78;
export const HISTORY_DAYS = 90;

/** Share of a day's sales by hour, 5am to 1pm. The 7 to 9 rush is most of the day. */
const HOUR_CURVE: Record<number, number> = { 5: 0.07, 6: 0.14, 7: 0.21, 8: 0.2, 9: 0.14, 10: 0.1, 11: 0.08, 12: 0.06 };

function demandFor(itemId: string, date: string, dayIndex: number): { demand: number; rain: boolean; holiday?: string } {
  const item = MENU_BY_ID[itemId];
  const dayRand = rng(hash('day:' + date));
  const rain = dayRand() < 0.11;
  const holiday = holidayFor(date);
  const r = rng(hash(itemId + ':' + date));
  // Sales grow slowly across the 90 days, about 6% end to end.
  const growth = 0.94 + 0.06 * (dayIndex / HISTORY_DAYS);
  const noise = 0.9 + r() * 0.2;
  let demand = item.baseDaily * DOW_FACTOR[dowOf(date)] * growth * noise;
  if (rain) demand *= RAIN_FACTOR;
  if (holiday) demand *= holiday.factor;
  return { demand: Math.round(demand), rain, holiday: holiday?.name };
}

/**
 * 90 days of made / sold / tossed per item, the way a shop running on gut feel looks:
 * the baker makes about the same amount every weekday and a bigger batch on weekends,
 * so slow days end with waste and busy days sell out early.
 */
export function buildHistory(today: string): DayHistory[] {
  const days: DayHistory[] = [];
  for (let i = HISTORY_DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const dow = dowOf(date);
    const dayIndex = HISTORY_DAYS - i;
    const items: DayHistory['items'] = {};
    let revenue = 0;
    let rain = false;
    let holiday: string | undefined;
    let units = 0;
    for (const item of MENU) {
      const dm = demandFor(item.id, date, dayIndex);
      rain = dm.rain;
      holiday = dm.holiday;
      if (!item.baked) {
        items[item.id] = { made: dm.demand, sold: dm.demand, waste: 0 };
        revenue += dm.demand * item.price;
        units += dm.demand;
        continue;
      }
      const weekend = dow === 0 || dow === 6;
      const gut = roundUpToBatch(item.baseDaily * (weekend ? 1.45 : 1.0), 12);
      const sold = Math.min(dm.demand, gut);
      items[item.id] = { made: gut, sold, waste: gut - sold };
      // Roughly a third of donuts go out by the dozen at the dozen price.
      const each = item.dozenPrice ? item.price * 0.67 + (item.dozenPrice / 12) * 0.33 : item.price;
      revenue += Math.round(sold * each);
      units += sold;
    }
    const orders = Math.round(units / 3.4);
    const laborHours = SCHEDULE.filter((s) => s.dow === dow).reduce((a, s) => a + shiftHours(s), 0);
    const tipRand = rng(hash('tips:' + date));
    const tips = SHOP.tippingEnabled ? Math.round(revenue * (0.045 + tipRand() * 0.02)) : 0;
    days.push({ date, dow, rain, holiday, items, revenue, tips, orders, laborHours });
  }
  return days;
}

export function hourShares(): { hour: number; share: number }[] {
  return Object.entries(HOUR_CURVE).map(([h, share]) => ({ hour: Number(h), share }));
}

/**
 * Today's walk-in sales so far, as finished register orders. Generated up to the current
 * time so the demo looks like a shop mid-shift whenever someone opens it.
 */
export function buildTodayOrders(today: string, now: Date): Order[] {
  const orders: Order[] = [];
  const r = rng(hash('today:' + today));
  const dow = dowOf(today);
  const holiday = holidayFor(today);
  const dayScale = DOW_FACTOR[dow] * (holiday?.factor ?? 1);
  const totalOrders = Math.round(190 * dayScale);
  const sellable = MENU.filter((m) => m.id !== 'milk');
  const weights = sellable.map((m) => m.baseDaily);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let x = r() * weightSum;
    for (let i = 0; i < sellable.length; i++) {
      x -= weights[i];
      if (x <= 0) return sellable[i];
    }
    return sellable[0];
  };
  // No item sells more than the shop would have made, so the rack never goes negative.
  const cap: Record<string, number> = {};
  const soldSoFar: Record<string, number> = {};
  for (const m of sellable) cap[m.id] = Math.round(m.baseDaily * dayScale * 0.93);
  let number = 100;
  for (const { hour, share } of hourShares()) {
    const count = Math.round(totalOrders * share);
    for (let i = 0; i < count; i++) {
      const at = new Date(now);
      at.setHours(hour, Math.floor(r() * 60), Math.floor(r() * 60), 0);
      const lineCount = 1 + Math.floor(r() * 3);
      const lines: OrderLine[] = [];
      for (let l = 0; l < lineCount; l++) {
        const item = pick();
        if (lines.some((x) => x.itemId === item.id)) continue;
        const left = cap[item.id] - (soldSoFar[item.id] ?? 0);
        if (left <= 0) continue;
        const dozen = item.dozenPrice && left >= 12 && r() < 0.12;
        const qty = dozen ? 12 : Math.min(left, 1 + Math.floor(r() * 2));
        soldSoFar[item.id] = (soldSoFar[item.id] ?? 0) + qty;
        lines.push({ itemId: item.id, qty, lineCents: dozen ? item.dozenPrice! : item.price * qty });
      }
      const subtotal = lines.reduce((a, x) => a + x.lineCents, 0);
      const taxable = lines.filter((x) => MENU_BY_ID[x.itemId].taxable).reduce((a, x) => a + x.lineCents, 0);
      const tax = Math.round(taxable * 0.1025);
      const card = r() < 0.72;
      const tip = SHOP.tippingEnabled && card && r() < 0.45 ? SHOP.tipChoices[Math.floor(r() * 3)] : 0;
      number += 1;
      if (lines.length === 0 || at.getTime() > now.getTime()) continue;
      orders.push({
        id: `seed-${number}`, number, source: 'register', createdAt: at.toISOString(), lines, subtotal, tax, tip,
        total: subtotal + tax + tip, payment: card ? 'card' : 'cash', status: 'done',
      });
    }
  }
  return orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Pre-orders already on the books: two for today's pickup window, three for tomorrow. */
export function buildPreorders(today: string, now: Date): Order[] {
  const at = (date: string, h: number, m: number) => {
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m).toISOString();
  };
  const tomorrow = addDays(today, 1);
  const placed = new Date(now.getTime() - 3 * 3600_000).toISOString();
  const mk = (id: string, number: number, name: string, phone: string, pickupAt: string, lines: OrderLine[], status: Order['status']): Order => {
    const subtotal = lines.reduce((a, x) => a + x.lineCents, 0);
    return { id, number, source: 'online', createdAt: placed, pickupAt, customerName: name, phone, lines, subtotal, tax: 0, tip: 0, total: subtotal, payment: 'online', status };
  };
  const doz = (itemId: string, dozens: number): OrderLine => ({ itemId, qty: dozens * 12, lineCents: MENU_BY_ID[itemId].dozenPrice! * dozens });
  // While the shop is open the two pickups are coming up soon. Outside opening hours they sit
  // at fixed morning times instead, already picked up if that time has passed.
  let soon = new Date(now.getTime() + 25 * 60_000);
  let later = new Date(now.getTime() + 70 * 60_000);
  const open = new Date(now); open.setHours(SHOP.openHour, 0, 0, 0);
  const close = new Date(now); close.setHours(SHOP.closeHour, 0, 0, 0);
  const duringHours = now >= open && later <= close;
  if (!duringHours) {
    soon = new Date(now); soon.setHours(9, 15, 0, 0);
    later = new Date(now); later.setHours(10, 30, 0, 0);
  }
  const state = (t: Date, live: Order['status']): Order['status'] => (duringHours ? live : t < now ? 'done' : 'new');
  return [
    mk('pre-1', 901, 'Harbor Dental', '5625550105', soon.toISOString(), [doz('glazed', 1), doz('sprinkle', 1)], state(soon, 'making')),
    mk('pre-2', 902, 'Tom H.', '5625550102', later.toISOString(), [{ itemId: 'fritter', qty: 2, lineCents: 700 }, { itemId: 'icedcoffee', qty: 2, lineCents: 790 }], state(later, 'new')),
    mk('pre-3', 903, 'Lincoln Elementary PTA', '5625550177', at(tomorrow, 6, 30), [doz('glazed', 4), doz('sprinkle', 2), doz('chocolate', 1)], 'new'),
    mk('pre-4', 904, 'Marcus L.', '5625550104', at(tomorrow, 7, 15), [doz('maple', 1), doz('glazed', 1)], 'new'),
    mk('pre-5', 905, 'Coastline Realty', '5625550188', at(tomorrow, 8, 0), [doz('glazed', 2), doz('oldfashioned', 1), doz('jelly', 1)], 'new'),
  ];
}

export function todayIso(): string {
  return isoDate(new Date());
}

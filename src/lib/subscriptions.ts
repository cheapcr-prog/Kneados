/** Donut Fridays: offices that get a standing box every week, delivered on the shop's own route. */

export type MixId = 'classic' | 'assorted' | 'premium';

export interface Mix {
  id: MixId;
  name: string;
  blurb: string;
  /** Price of one dozen before the subscriber discount, in cents. */
  dozenCents: number;
  /** What goes in one dozen: item id to count. Always adds up to 12. */
  box: Record<string, number>;
}

export const MIXES: Mix[] = [
  { id: 'classic', name: 'Classic dozen', blurb: 'Glazed, bars, sprinkles and old fashioned. Something for everyone.', dozenCents: 1800, box: { glazed: 4, chocolate: 2, maple: 2, sprinkle: 2, oldfashioned: 2 } },
  { id: 'assorted', name: 'Office favorite', blurb: 'The classics plus jelly and Boston cream.', dozenCents: 2200, box: { glazed: 3, chocolate: 2, maple: 2, sprinkle: 1, jelly: 2, custard: 2 } },
  { id: 'premium', name: 'The good stuff', blurb: 'Fritters, cinnamon rolls and filled donuts.', dozenCents: 2800, box: { fritter: 3, cinnamon: 3, jelly: 2, custard: 2, longjohn: 2 } },
];
export const MIX_BY_ID = Object.fromEntries(MIXES.map((m) => [m.id, m])) as Record<MixId, Mix>;

/** Subscribers pay this much less than the menu price. */
export const SUBSCRIBER_DISCOUNT = 0.1;
/** Delivery charge per drop, waived at `FREE_DELIVERY_DOZENS` or more. */
export const DELIVERY_CENTS = 500;
export const FREE_DELIVERY_DOZENS = 3;

export interface Subscription {
  id: string;
  company: string;
  contact: string;
  email: string;
  address: string;
  lat: number;
  lon: number;
  /** Day of the week it is delivered, 0 = Sunday. */
  dow: number;
  dozens: number;
  mix: MixId;
  /** Latest time it can arrive, HH:MM. */
  by: string;
  /** Date they signed up (YYYY-MM-DD). */
  since: string;
  status: 'active' | 'paused';
  /** Delivery dates the customer asked to skip. */
  skips: string[];
}

export interface Price {
  boxesCents: number;
  discountCents: number;
  deliveryCents: number;
  weeklyCents: number;
}

export function priceOf(sub: Pick<Subscription, 'dozens' | 'mix'>): Price {
  const boxesCents = sub.dozens * MIX_BY_ID[sub.mix].dozenCents;
  const discountCents = Math.round(boxesCents * SUBSCRIBER_DISCOUNT);
  const deliveryCents = sub.dozens >= FREE_DELIVERY_DOZENS ? 0 : DELIVERY_CENTS;
  return { boxesCents, discountCents, deliveryCents, weeklyCents: boxesCents - discountCents + deliveryCents };
}

/** Donuts in one delivery, by item. */
export function itemsOf(sub: Pick<Subscription, 'dozens' | 'mix'>): Record<string, number> {
  return Object.fromEntries(Object.entries(MIX_BY_ID[sub.mix].box).map(([id, n]) => [id, n * sub.dozens]));
}

/** True when this subscription gets a box on this date. */
export function deliversOn(sub: Subscription, date: string, dow: number): boolean {
  return sub.status === 'active' && sub.dow === dow && !sub.skips.includes(date) && sub.since <= date;
}

/** What the active subscriptions bring in over an average month. */
export function monthlyRecurring(subs: Subscription[]): number {
  return Math.round((subs.filter((s) => s.status === 'active').reduce((a, s) => a + priceOf(s).weeklyCents, 0) * 52) / 12);
}

interface Point { lat: number; lon: number }

/** Straight-line miles between two points. */
export function miles(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export interface Stop {
  sub: Subscription;
  /** Miles driven from the stop before. */
  legMiles: number;
  /** Minutes after leaving the shop that the driver arrives. */
  arriveMin: number;
  /** True when the driver gets there after the customer's latest time. */
  late: boolean;
}

export interface RoutePlan {
  stops: Stop[];
  totalMiles: number;
  /** Minutes from leaving the shop to being back. */
  totalMin: number;
  dozens: number;
}

const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * Orders the day's stops: always the nearest one next, except that a stop with an earlier deadline goes first.
 * Driving is estimated from straight-line distance, so times are a guide, not a promise.
 */
export function planRoute(shop: Point, subs: Subscription[], leaveAt: string, opts: { mph?: number; stopMin?: number; roadFactor?: number } = {}): RoutePlan {
  const { mph = 20, stopMin = 5, roadFactor = 1.3 } = opts;
  const left = [...subs];
  const stops: Stop[] = [];
  let at: Point = shop;
  let clock = 0;
  let total = 0;
  const depart = minutesOf(leaveAt);
  while (left.length > 0) {
    const earliest = Math.min(...left.map((s) => minutesOf(s.by)));
    // Among the stops due soonest, drive to the closest.
    const pool = left.filter((s) => minutesOf(s.by) === earliest);
    const next = pool.reduce((a, b) => (miles(at, b) < miles(at, a) ? b : a));
    const leg = miles(at, next) * roadFactor;
    clock += (leg / mph) * 60;
    total += leg;
    stops.push({ sub: next, legMiles: leg, arriveMin: Math.round(clock), late: depart + clock > minutesOf(next.by) });
    clock += stopMin;
    at = next;
    left.splice(left.indexOf(next), 1);
  }
  const home = stops.length > 0 ? miles(at, shop) * roadFactor : 0;
  return { stops, totalMiles: total + home, totalMin: Math.round(clock + (home / mph) * 60), dozens: subs.reduce((a, s) => a + s.dozens, 0) };
}

/** HH:MM plus some minutes, as HH:MM. */
export function addMinutes(hhmm: string, min: number): string {
  const t = minutesOf(hhmm) + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

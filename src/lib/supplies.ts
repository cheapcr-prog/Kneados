import { addDays } from './dates';

export interface Supply {
  id: string;
  name: string;
  /** What it is counted in, e.g. lb. */
  unit: string;
  /** How many units come in one pack from the supplier. */
  packSize: number;
  packLabel: string;
  packCents: number;
  supplier: string;
  /** Days from placing an order to having it in the shop. 0 means a same-day pickup run. */
  leadDays: number;
  onHand: number;
  /** How many days one order should last. Short for things that spoil, like milk. Defaults to COVER_DAYS. */
  coverDays?: number;
  /** The real product this is, when it was looked up on the supplier's own listing. */
  product?: { brand: string; url: string; checked: string; note: string };
}

/** Keep this many days of stock as a cushion, so a busy day or a late truck does not empty the shelf. */
export const SAFETY_DAYS = 2;
/** Each order should last about this many days after it arrives. */
export const COVER_DAYS = 7;
/** "Order soon" means the order-by date is within this many days. */
export const SOON_DAYS = 3;

export type SupplyStatus = 'order-now' | 'order-soon' | 'ok';

export interface SupplyPlan {
  supply: Supply;
  /** On hand plus anything already ordered. */
  stock: number;
  /** Average use per day over the next week. */
  dailyUse: number;
  /** Full days of stock left. Null when it lasts past the days we looked at. */
  daysLeft: number | null;
  runOut: string | null;
  orderBy: string | null;
  arrives: string | null;
  status: SupplyStatus;
  /** True when it will run out before a delivery could arrive, even if ordered today. */
  short: boolean;
  packs: number;
  cents: number;
  reason: string;
}

/** How much of each supply a set of items uses. `qty` is how many of each menu item. */
export function supplyUsage(recipes: Record<string, Record<string, number>>, qty: Record<string, number>): Record<string, number> {
  const use: Record<string, number> = {};
  for (const [itemId, n] of Object.entries(qty)) {
    for (const [supplyId, per] of Object.entries(recipes[itemId] ?? {})) use[supplyId] = (use[supplyId] ?? 0) + per * n;
  }
  return use;
}

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

/**
 * Decides whether a supply needs ordering, by when, and how much.
 * `usage[0]` is what today's bake plan uses, `usage[1]` tomorrow's, and so on.
 * `dayName` turns a date into the words shown to the owner.
 */
export function planSupply(supply: Supply, usage: number[], today: string, pending = 0, dayName: (iso: string) => string = (d) => d): SupplyPlan {
  const stock = supply.onHand + pending;
  const week = usage.slice(0, 7);
  const dailyUse = week.reduce((a, b) => a + b, 0) / Math.max(1, week.length);

  let left = stock;
  let runOutIdx: number | null = null;
  for (let i = 0; i < usage.length; i++) {
    left -= usage[i];
    if (left < 0) { runOutIdx = i; break; }
  }

  const base = { supply, stock, dailyUse };
  const have = `You have ${round(stock)} ${supply.unit}${pending > 0 ? `, counting the ${round(pending)} on order` : ''}`;
  if (runOutIdx === null || dailyUse === 0) {
    return { ...base, daysLeft: null, runOut: null, orderBy: null, arrives: null, status: 'ok', short: false, packs: 0, cents: 0,
      reason: dailyUse === 0 ? `${have}. Nothing on the bake plan uses it.` : `${have}, which lasts past the next ${usage.length} days of the bake plan.` };
  }

  const orderByIdx = runOutIdx - SAFETY_DAYS - supply.leadDays;
  const orderIdx = Math.max(0, orderByIdx);
  const arriveIdx = orderIdx + supply.leadDays;
  const short = arriveIdx > runOutIdx;
  const status: SupplyStatus = orderByIdx <= 0 ? 'order-now' : orderByIdx <= SOON_DAYS ? 'order-soon' : 'ok';

  const through = usage.slice(0, arriveIdx + (supply.coverDays ?? COVER_DAYS)).reduce((a, b) => a + b, 0);
  const packs = Math.max(1, Math.ceil((through + SAFETY_DAYS * dailyUse - stock) / supply.packSize));

  const runOut = addDays(today, runOutIdx);
  const orderBy = addDays(today, orderIdx);
  const arrives = addDays(today, arriveIdx);
  const lead = supply.leadDays === 0 ? 'It is a same-day pickup' : `Delivery takes ${supply.leadDays} day${supply.leadDays === 1 ? '' : 's'}`;
  const when = status === 'order-now' ? 'order today' : `order by ${dayName(orderBy)}`;
  const reason = `${have}. The bake plan uses about ${round(dailyUse)} a day, so it runs out ${runOutIdx === 0 ? 'today' : dayName(runOut)}. ${lead}, so ${when}.`
    + (short ? ' It may run short before the delivery arrives.' : '');

  return { ...base, daysLeft: runOutIdx, runOut, orderBy, arrives, status, short, packs, cents: packs * supply.packCents, reason };
}

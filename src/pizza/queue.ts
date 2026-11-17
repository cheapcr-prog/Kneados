/**
 * The shop's one make line, as the server keeps it. Every order feeds it, whatever took it: the counter, the
 * website, a text, a phone call or a delivery app. Wait times and "where is my order" answers are read from it.
 *
 * A ticket here is only what timing the kitchen needs: how many pizzas, what stage, when it was promised.
 * Names, phone numbers and addresses stay on the device that took the order.
 */
import { PIZZA_SHOP, ZONES } from './data';
import { MINUTE, piesIn, type Channel, type OrderStatus, type PizzaOrder } from './logic';

export interface QueueTicket {
  id: string;
  number: number;
  channel: Channel;
  fulfillment: 'delivery' | 'pickup';
  pies: number;
  status: OrderStatus;
  createdAt: string;
  promisedAt: string;
  /** Minutes on the road after it leaves the shop. Zero for pickup. */
  drive: number;
  /** Placed ahead for a set time (a game-day pre-order). It does not hold up tonight's line. */
  scheduled?: boolean;
  ovenAt?: string;
  readyAt?: string;
  outAt?: string;
  /** When the server last heard about it, in milliseconds. */
  at: number;
}
export type TicketIn = Omit<QueueTicket, 'at'>;

/** Pizzas waiting to be made, and pizzas baking. */
export interface KitchenLoad { ahead: number; inOven: number }

const RANK: Record<OrderStatus, number> = { new: 0, oven: 1, ready: 2, out: 3, done: 4 };
export const further = (a: OrderStatus, b: OrderStatus) => RANK[a] > RANK[b];

/** A make line screen that checked in this recently is open and being worked, so its stages are the truth. */
export const SCREEN_LIVE_MS = 90_000;
/** An open ticket this long past its promised time was abandoned (a demo tab closed), not a real wait. */
const STALE_MINUTES = 90;
const KEEP_HOURS = 24;
const KEEP_TICKETS = 150;
const MAX_PIES = 60;

const CHANNELS: Channel[] = ['online', 'phone', 'counter', 'doordash', 'ubereats', 'catering'];
const time = (v: unknown) => (typeof v === 'string' && v.length <= 30 && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : undefined);

export const driveFor = (o: Pick<PizzaOrder, 'fulfillment' | 'customer'>) => (o.fulfillment === 'delivery' ? ZONES.find((z) => z.id === o.customer.zone)?.driveMinutes ?? 12 : 0);

/** An order cut down to what the shared make line keeps. */
export function ticketOf(o: PizzaOrder): TicketIn {
  return {
    id: o.id, number: o.number, channel: o.channel, fulfillment: o.fulfillment, pies: piesIn(o), status: o.status, createdAt: o.createdAt, promisedAt: o.promisedAt, drive: driveFor(o),
    ...(o.scheduled ? { scheduled: true } : {}), ...(o.ovenAt ? { ovenAt: o.ovenAt } : {}), ...(o.readyAt ? { readyAt: o.readyAt } : {}), ...(o.outAt ? { outAt: o.outAt } : {}),
  };
}

/** Tickets that arrive from a browser are checked before they can move a wait time. */
export function cleanTickets(raw: unknown): TicketIn[] {
  if (!Array.isArray(raw)) return [];
  const out: TicketIn[] = [];
  for (const r of raw.slice(0, KEEP_TICKETS)) {
    const t = r as Partial<TicketIn>;
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !/^[a-z0-9-]{3,24}$/.test(t.id)) continue;
    const createdAt = time(t.createdAt);
    const promisedAt = time(t.promisedAt);
    const number = Math.floor(Number(t.number));
    const pies = Math.floor(Number(t.pies));
    const drive = Math.floor(Number(t.drive));
    if (!createdAt || !promisedAt || !(number > 0 && number < 1e7) || !(pies >= 0 && pies <= MAX_PIES) || !(drive >= 0 && drive <= 60)) continue;
    if (!CHANNELS.includes(t.channel as Channel) || !(String(t.status) in RANK)) continue;
    const ovenAt = time(t.ovenAt);
    const readyAt = time(t.readyAt);
    const outAt = time(t.outAt);
    out.push({
      id: t.id, number, channel: t.channel as Channel, fulfillment: t.fulfillment === 'delivery' ? 'delivery' : 'pickup', pies, status: t.status as OrderStatus, createdAt, promisedAt, drive,
      ...(t.scheduled ? { scheduled: true } : {}), ...(ovenAt ? { ovenAt } : {}), ...(readyAt ? { readyAt } : {}), ...(outAt ? { outAt } : {}),
    });
  }
  return out;
}

/**
 * Puts what a device knows onto the shared line. A ticket only moves forward (a slow tablet cannot pull a pizza
 * back out of the oven), unless it is a different order under the same id, which replaces the old one.
 * `replace` is a demo reset: everything that did not come from the phone is swapped for what was sent.
 */
export function mergeQueue(queue: readonly QueueTicket[], incoming: readonly TicketIn[], now: number, replace = false): QueueTicket[] {
  const byId = new Map((replace ? queue.filter((t) => t.channel === 'phone') : queue).map((t) => [t.id, t]));
  for (const t of incoming) {
    const old = byId.get(t.id);
    if (old && old.createdAt === t.createdAt && further(old.status, t.status)) byId.set(t.id, { ...old, promisedAt: t.promisedAt, at: now });
    else byId.set(t.id, { ...t, at: now });
  }
  const cutoff = now - KEEP_HOURS * 60 * MINUTE;
  return [...byId.values()].filter((t) => t.scheduled || Date.parse(t.promisedAt) > cutoff).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-KEEP_TICKETS);
}

/** When the kitchen's part is due: the promised time, less the drive. */
const kitchenDue = (t: QueueTicket) => Date.parse(t.promisedAt) - t.drive * MINUTE;

/**
 * The stage a ticket is at. With a make line screen open, that is the stage the crew tapped. With no screen open
 * nobody is tapping, so an open ticket is placed by the clock instead: on the make line, then baking for its last
 * minutes, then ready at the time it was promised.
 */
export function stageOf(t: QueueTicket, now: number, screenLive: boolean): OrderStatus {
  if (screenLive || further(t.status, 'oven')) return t.status;
  const due = kitchenDue(t);
  if (now >= due) return 'ready';
  return now >= due - (PIZZA_SHOP.bakeMinutes + 2) * MINUTE ? 'oven' : further(t.status, 'new') ? t.status : 'new';
}

/** Every pizza on the line right now, from every kind of order. */
export function queueLoad(queue: readonly QueueTicket[], now: number, screenLive: boolean): KitchenLoad {
  const load = { ahead: 0, inOven: 0 };
  for (const t of queue) {
    if (t.scheduled || !t.pies || now > Date.parse(t.promisedAt) + STALE_MINUTES * MINUTE) continue;
    const stage = stageOf(t, now, screenLive);
    if (stage === 'new') load.ahead += t.pies;
    else if (stage === 'oven') load.inOven += t.pies;
  }
  return load;
}

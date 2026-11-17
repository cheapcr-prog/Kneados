/**
 * One shop's memory on the server, kept in a Durable Object under the shop's phone number: the make line that
 * every order feeds (counter, website, text, delivery apps and phone), today's phone orders in full, the order
 * number counter, and the callers who have ordered before (so a regular is greeted by name and offered the usual).
 */
import { cleanDeals, type Deal } from '../src/pizza/deals';
import { ZONES } from '../src/pizza/data';
import { zoneFor } from '../src/pizza/logic';
import { SCREEN_LIVE_MS, cleanTickets, further, mergeQueue, queueLoad, stageOf, type QueueTicket, type TicketIn } from '../src/pizza/queue';
import type { PhoneOrder, SavedCustomer } from './voice';

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
export interface LineState { storage: Storage }

export interface LineStub { fetch(input: string, init?: RequestInit): Promise<Response> }
export interface LineNamespace { idFromName(name: string): unknown; get(id: unknown): LineStub }

/** Phone orders get their own number range, so they never collide with the demo's own tickets. */
export const FIRST_PHONE_NUMBER = 7001;
const KEEP_ORDERS = 40;
const KEEP_HOURS = 48;

/** A phone order's ticket has the id the make line screen gives it. */
const ticketId = (number: number) => `pz-${number}`;

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export class PhoneLine {
  constructor(private state: LineState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const store = this.state.storage;
    if (url.pathname === '/ring') {
      await store.put('lastCallAt', new Date().toISOString());
      const phone = url.searchParams.get('from') ?? '';
      const now = Date.now();
      const queue = (await store.get<QueueTicket[]>('queue')) ?? [];
      const live = now - ((await store.get<number>('screenAt')) ?? 0) < SCREEN_LIVE_MS;
      const customer = phone ? (await store.get<SavedCustomer>(`customer:${phone}`)) ?? null : null;
      // Where the caller's latest order is, for "where is my order". Only a stage the crew tapped is passed on:
      // with no make line screen open, an order still on the line or in the oven is not claimed to be at either.
      const last = customer?.last && queue.find((t) => t.id === ticketId(customer.last!.number));
      const stage = last && (live || further(last.status, 'oven')) ? stageOf(last, now, live) : undefined;
      return reply({ customer, busy: queueLoad(queue, now, live), deals: (await store.get<Deal[]>('deals')) ?? [], ...(stage ? { stage } : {}) });
    }
    if (url.pathname === '/place' && request.method === 'POST') {
      const { order, phone } = (await request.json()) as { order: Omit<PhoneOrder, 'id' | 'number'>; phone: string };
      const count = (await store.get<number>('count')) ?? 0;
      const number = FIRST_PHONE_NUMBER + count;
      const placed: PhoneOrder = { ...order, id: `ph-${number}`, number };
      const cutoff = Date.now() - KEEP_HOURS * 3_600_000;
      const orders = [...((await store.get<PhoneOrder[]>('orders')) ?? []), placed].filter((o) => Date.parse(o.at) > cutoff).slice(-KEEP_ORDERS);
      await store.put('count', count + 1);
      await store.put('orders', orders);
      // The order joins the shop's one make line straight away, so the next quote on any channel counts it.
      const pies = order.order.items.filter((i) => i.kind === 'pizza').reduce((n, i) => n + Math.max(1, i.qty), 0);
      const delivery = order.order.fulfillment === 'delivery';
      const drive = delivery ? ZONES.find((z) => z.id === (order.address ? zoneFor(order.address) : undefined))?.driveMinutes ?? 12 : 0;
      const at = Date.parse(order.at) || Date.now();
      const ticket: TicketIn = { id: ticketId(number), number, channel: 'phone', fulfillment: delivery ? 'delivery' : 'pickup', pies, status: 'new', createdAt: new Date(at).toISOString(), promisedAt: new Date(at + order.minutes * 60_000).toISOString(), drive };
      await store.put('queue', mergeQueue((await store.get<QueueTicket[]>('queue')) ?? [], [ticket], Date.now()));
      if (phone) {
        const before = await store.get<SavedCustomer>(`customer:${phone}`);
        const saved: SavedCustomer = {
          name: order.order.name, items: order.order.items, fulfillment: order.order.fulfillment === 'delivery' ? 'delivery' : 'pickup', orders: (before?.orders ?? 0) + 1,
          last: { number, at: order.at, minutes: order.minutes },
          address: order.order.fulfillment === 'delivery' ? order.address?.line ?? before?.address : before?.address,
        };
        await store.put(`customer:${phone}`, saved);
      }
      return reply({ number });
    }
    // The deals the owner turned on. They are checked again here, so the line never offers one outside the limits.
    if (url.pathname === '/deals' && request.method === 'POST') {
      const deals = cleanDeals(await request.json().catch(() => null));
      await store.put('deals', deals);
      return reply({ deals });
    }
    if (url.pathname === '/deals') return reply({ deals: (await store.get<Deal[]>('deals')) ?? [] });
    // A make line screen checks in: it sends the tickets it changed and gets the whole line back.
    if (url.pathname === '/queue' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { tickets?: unknown; replace?: unknown } | null;
      const incoming = cleanTickets(body?.tickets);
      const now = Date.now();
      const before = (await store.get<QueueTicket[]>('queue')) ?? [];
      const queue = incoming.length || body?.replace === true ? mergeQueue(before, incoming, now, body?.replace === true) : before;
      if (queue !== before) await store.put('queue', queue);
      if (now - ((await store.get<number>('screenAt')) ?? 0) > SCREEN_LIVE_MS / 3) await store.put('screenAt', now);
      return reply({ queue });
    }
    if (url.pathname === '/orders') {
      const since = url.searchParams.get('since') ?? '';
      const orders = ((await store.get<PhoneOrder[]>('orders')) ?? []).filter((o) => o.at > since);
      return reply({ lastCallAt: (await store.get<string>('lastCallAt')) ?? null, orders });
    }
    return reply({ error: 'bad' }, 404);
  }
}

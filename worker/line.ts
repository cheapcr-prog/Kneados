/**
 * One shop phone line's memory, kept in a Durable Object so an order placed on a call is visible to the
 * make line the very next second: today's phone orders, the order number counter, and the callers who have
 * ordered before (so a regular is greeted by name and offered the usual).
 */
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

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export class PhoneLine {
  constructor(private state: LineState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const store = this.state.storage;
    if (url.pathname === '/ring') {
      await store.put('lastCallAt', new Date().toISOString());
      const phone = url.searchParams.get('from') ?? '';
      return reply({ customer: phone ? (await store.get<SavedCustomer>(`customer:${phone}`)) ?? null : null });
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
    if (url.pathname === '/orders') {
      const since = url.searchParams.get('since') ?? '';
      const orders = ((await store.get<PhoneOrder[]>('orders')) ?? []).filter((o) => o.at > since);
      return reply({ lastCallAt: (await store.get<string>('lastCallAt')) ?? null, orders });
    }
    return reply({ error: 'bad' }, 404);
  }
}

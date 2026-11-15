import { useEffect } from 'react';
import { useShopState } from '../data/local';
import { MENU_BY_ID } from '../data/shop';
import { useDemo } from '../data/store';
import { ROUTE_LEAVES, placeNear, seedSubscriptions } from '../data/subscriptions';
import type { Order } from '../data/types';
import { addDays, dowOf } from '../lib/dates';
import { deliversOn, itemsOf, priceOf, type Subscription } from '../lib/subscriptions';

/** How many days ahead standing boxes are put on the books, so the bake plan and supply orders see them. */
const AHEAD = 14;

export type NewSubscription = Pick<Subscription, 'company' | 'contact' | 'email' | 'address' | 'dow' | 'dozens' | 'mix' | 'by'>;

export function useSubscriptions() {
  const demo = useDemo();
  const today = demo.state.today;
  const [subs, setSubs] = useShopState<Subscription[]>('subscriptions', () => seedSubscriptions(today));
  const patch = (id: string, f: (s: Subscription) => Subscription) => setSubs((list) => list.map((s) => (s.id === id ? f(s) : s)));
  /** The next date this subscription is due, whether or not it is skipped. */
  const nextDate = (s: Pick<Subscription, 'dow'>) => addDays(today, (s.dow - dowOf(today) + 7) % 7);
  return {
    subs, nextDate,
    add: (n: NewSubscription): Subscription => {
      const sub: Subscription = { ...n, ...placeNear(n.address), id: `s-${Date.now()}`, since: today, status: 'active', skips: [] };
      setSubs((list) => [sub, ...list]);
      return sub;
    },
    setStatus: (id: string, status: Subscription['status']) => patch(id, (s) => ({ ...s, status })),
    toggleSkip: (id: string, date: string) => patch(id, (s) => ({ ...s, skips: s.skips.includes(date) ? s.skips.filter((d) => d !== date) : [...s.skips, date] })),
  };
}

/**
 * Keeps an order on the books for every box due in the next two weeks.
 * That is how a subscription reaches the bake plan, the supply orders and the packing queue.
 */
export function SubscriptionSync() {
  const demo = useDemo();
  const { subs } = useSubscriptions();
  const { today, orders } = demo.state;
  const { syncOrders } = demo;
  useEffect(() => {
    const now = new Date();
    const [lh, lm] = ROUTE_LEAVES.split(':').map(Number);
    const existing = new Map(orders.filter((o) => o.id.startsWith('sub:')).map((o) => [o.id, o]));
    const wanted: Order[] = [];
    for (let d = 0; d < AHEAD; d++) {
      const date = addDays(today, d);
      const [y, mo, dd] = date.split('-').map(Number);
      const leaves = new Date(y, mo - 1, dd, lh, lm);
      subs.filter((s) => deliversOn(s, date, dowOf(date))).forEach((s, i) => {
        const id = `sub:${s.id}:${date}`;
        const items = itemsOf(s);
        const price = priceOf(s);
        const each = (price.boxesCents - price.discountCents) / (s.dozens * 12);
        wanted.push({
          id, number: 700 + d * 20 + i, source: 'online', channel: 'subscription', createdAt: `${s.since}T12:00:00.000Z`, pickupAt: leaves.toISOString(), customerName: s.company,
          lines: Object.entries(items).map(([itemId, qty]) => ({ itemId, qty, lineCents: Math.round(qty * each) })),
          boxes: Array.from({ length: s.dozens }, () => Object.entries(items).flatMap(([itemId, qty]) => Array<string>(qty / s.dozens).fill(itemId))),
          subtotal: price.weeklyCents, tax: 0, tip: 0, total: price.weeklyCents, payment: 'online',
          // A box keeps whatever the counter has done with it. A new one has already left if the van has.
          status: existing.get(id)?.status ?? (leaves < now ? 'done' : 'new'),
        });
      });
    }
    const sig = (list: Order[]) => list.map((o) => `${o.id}|${o.total}|${o.lines.map((l) => l.qty).join(',')}`).sort().join(';');
    if (sig(wanted) !== sig([...existing.values()])) syncOrders('sub:', wanted);
  }, [subs, today, orders, syncOrders]);
  return null;
}

export const itemNames = (s: Pick<Subscription, 'dozens' | 'mix'>) => Object.entries(itemsOf(s)).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ');

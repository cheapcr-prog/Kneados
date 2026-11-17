import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addDays, isoDate } from '../lib/dates';
import { addVisit } from '../lib/rewards';
import type { RewardsMember } from '../data/types';
import { ADDRESSES, DRIVERS, INVENTORY, PIZZA_SHOP, SIDE_BY_ID, TOPPING_ON_HAND, nextBigDay, type SizeId } from './data';
import {
  MINUTE, PACKS, buildPizzaHistory, invoiceFor, type PizzaInvoice, configFor, packLines, pizzaPrice, pizzaRewardText, pizzaUsage, preorderPies, forecastDay, rng, totals, zoneFor,
  DEPOSIT_SHARE, type Channel, type DriverState, type Line, type OrderStatus, type PizzaDay, type PizzaOrder,
} from './logic';
import { mailingList, seedCampaigns, type MailCampaign } from './mail';
import { PHONE_POLL_MS, fetchFeed, markSeen, saveLine, savedLine, seenOrders, syncQueue, ticketFromPhone } from './phoneLine';
import { further, queueLoad, ticketOf, type KitchenLoad, type QueueTicket } from './queue';

const KEY = 'kneados-pizza-v1';

export interface Text { to: string; body: string; at: string; kind: 'received' | 'ready' | 'out' | 'reward' | 'campaign' | 'paylink' }

export interface SentPO { id: string; number: number; supplier: string; cents: number; lines: { id: string; name: string; packs: number; packLabel: string; qty: number }[]; status: 'sent' | 'received'; at: string }

export interface PizzaState {
  today: string;
  orders: PizzaOrder[];
  nextNumber: number;
  drivers: Record<string, DriverState>;
  members: RewardsMember[];
  texts: Text[];
  /** Stock on hand: pounds for toppings and cheese, units for the rest. Goes down by recipe as pies go in the oven. */
  onHand: Record<string, number>;
  pos: SentPO[];
  /** Dough balls made so far tonight, by size. */
  doughMade: Record<SizeId, number>;
  /** Toppings and sides marked out of stock. */
  out: string[];
  /** Tomorrow's rain, set from the live forecast. */
  rain: boolean;
  /** Sales already rung before the staged rush, so the day's numbers look like a real evening. */
  earlier: { orders: number; salesCents: number; tipsCents: number };
  /** Catering orders billed to a company on net terms. */
  invoices: PizzaInvoice[];
  nextInvoice: number;
  /** Postcard mailings, newest first, with the orders their codes brought in. */
  campaigns: MailCampaign[];
}

/** Average ticket the seeded mailings were planned with, close to the generated history's. */
const SEED_TICKET_CENTS = 3400;
const seedMail = (today: string) => seedCampaigns(today, mailingList(today), SEED_TICKET_CENTS);

/** Company invoices: the upcoming office lunch is open, one from last month is paid and one is past due. */
function seedInvoices(today: string, orders: PizzaOrder[]): PizzaInvoice[] {
  const out: PizzaInvoice[] = [];
  const past = (company: string, email: string, contact: string, po: string | undefined, daysAgo: number, cents: number, n: number, paid: boolean) => {
    const day = addDays(today, -daysAgo);
    const inv = invoiceFor({ number: 2100 - n * 37, total: cents, customer: { name: contact } }, { company, email, po }, 'Office Lunch', day, addDays(day, -3), 1038 + n);
    return paid ? { ...inv, paid: true, paidOn: addDays(day, 9) } : { ...inv, reminders: [addDays(inv.due, 2)] };
  };
  out.push(past('Pacific Gateway Realty', 'accounts@pgrealty.example', 'Monica Reyes', 'PG-2207', 34, 17938, 0, true));
  out.push(past('Bixby Knolls Law Group', 'billing@bixbylaw.example', 'Tom Alvarez', undefined, 24, 35876, 1, false));
  let n = 1041;
  for (const o of orders.filter((x) => x.payment === 'invoice')) {
    out.push({ ...invoiceFor(o, { company: o.customer.name.replace(/ office$/, ''), email: 'ap@harbordental.example', po: '4471' }, `Office Lunch, ${o.event ?? 'catering'}`, o.promisedAt.slice(0, 10), addDays(today, -2), n++), contact: 'Dana Lee' });
  }
  return out;
}

const FIRST = ['Maya', 'Jordan', 'Chris', 'Priya', 'Leo', 'Alex', 'Sam', 'Taylor', 'Nina', 'Omar', 'Grace', 'Diego', 'Riley', 'Hana', 'Marcus', 'Ivy', 'Ben', 'Zoe', 'Andre', 'Lucy'];
const LAST = ['R.', 'T.', 'M.', 'K.', 'S.', 'L.', 'P.', 'G.', 'B.', 'W.', 'N.', 'H.'];

function seedMembers(today: string): RewardsMember[] {
  const r = rng(99);
  return Array.from({ length: 48 }, (_, i) => {
    const visits = 1 + Math.floor(r() * 28);
    const ago = Math.floor(r() * (i % 6 === 0 ? 75 : 25));
    return {
      phone: `562555${String(2000 + i * 37).slice(-4)}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      punches: visits % 10, rewards: i % 9 === 0 ? 1 : 0, visits, joined: addDays(today, -60 - Math.floor(r() * 200)), lastVisit: addDays(today, -ago),
      birthday: `${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 5) % 28)).padStart(2, '0')}`,
      favorite: ['pepperoni', 'supreme', 'cheese', 'bbq-chicken', 'double-pep', 'margherita'][i % 6],
    };
  });
}

const iso = (ms: number) => new Date(ms).toISOString();

function makeOrder(n: number, o: { lines: Line[]; channel: Channel; delivery: boolean; customer: string; phone: string; addr?: number; createdMin: number; promiseMin: number; status: OrderStatus; now: number; tip?: number; scheduledFor?: number; event?: string; deposit?: boolean; payment?: PizzaOrder['payment'] }): PizzaOrder {
  const a = o.addr !== undefined ? ADDRESSES[o.addr] : undefined;
  const zone = a ? zoneFor(a) : undefined;
  const t = totals(o.lines, { zone: o.delivery ? zone : undefined, tipCents: o.tip ?? 0 });
  const created = o.now - o.createdMin * MINUTE;
  const promised = o.scheduledFor ?? o.now + o.promiseMin * MINUTE;
  const order: PizzaOrder = {
    id: `pz-${n}`, number: n, channel: o.channel, fulfillment: o.delivery ? 'delivery' : 'pickup', createdAt: iso(created), promisedAt: iso(promised),
    customer: { name: o.customer, phone: o.phone, ...(a && o.delivery ? { address: a.line, x: a.x, y: a.y, zone } : {}) },
    lines: o.lines, ...t, payment: o.payment ?? (o.channel === 'doordash' || o.channel === 'ubereats' ? 'app' : o.channel === 'online' ? 'online' : 'card'), status: o.status,
    ...(o.scheduledFor ? { scheduled: true, event: o.event } : {}),
    ...(o.deposit ? { depositCents: Math.round(t.total * DEPOSIT_SHARE) } : {}),
  };
  if (o.status !== 'new') order.ovenAt = iso(o.now - (o.status === 'oven' ? Math.max(0.5, o.createdMin - 8) : Math.max(1, o.createdMin - 4)) * MINUTE);
  if (o.status === 'ready' || o.status === 'out' || o.status === 'done') order.readyAt = iso(o.now - Math.max(0, o.createdMin - 13) * MINUTE);
  if (o.status === 'out' || o.status === 'done') order.outAt = iso(o.now - Math.max(0, o.createdMin - 15) * MINUTE);
  if (o.status === 'done') order.doneAt = iso(o.now - Math.max(0, o.createdMin - 30) * MINUTE);
  return order;
}

const pz = (specialtyId: string, size: SizeId, qty = 1): Line => {
  const config = configFor(specialtyId, size);
  return { kind: 'pizza', config, specialtyId, qty, unitCents: pizzaPrice(config, specialtyId).cents };
};
const byo = (size: SizeId, toppings: Record<string, 'whole' | 'left' | 'right'>, qty = 1): Line => {
  const config = { size, crust: 'hand' as const, sauce: 'red' as const, cheese: 'regular' as const, toppings };
  return { kind: 'pizza', config, qty, unitCents: pizzaPrice(config).cents };
};
const side = (id: string, qty = 1): Line => ({ kind: 'side', sideId: id, qty, unitCents: SIDE_BY_ID[id].cents });

/** A dinner rush staged around the visitor's own clock, so every screen has live work whatever the hour. */
function seedOrders(today: string, now: number): PizzaOrder[] {
  let n = 2101;
  const list: PizzaOrder[] = [
    makeOrder(n++, { lines: [pz('pepperoni', 'L'), side('wings-buffalo')], channel: 'online', delivery: true, customer: 'Maya R.', phone: '5625552000', addr: 0, createdMin: 44, promiseMin: -6, status: 'done', now, tip: 600 }),
    makeOrder(n++, { lines: [pz('supreme', 'L'), pz('cheese', 'M')], channel: 'phone', delivery: true, customer: 'Jordan T.', phone: '5625552037', addr: 4, createdMin: 38, promiseMin: -2, status: 'out', now, tip: 500 }),
    makeOrder(n++, { lines: [pz('bbq-chicken', 'M')], channel: 'online', delivery: true, customer: 'Priya K.', phone: '5625552111', addr: 15, createdMin: 34, promiseMin: 2, status: 'out', now, tip: 400 }),
    makeOrder(n++, { lines: [pz('margherita', 'M'), side('caesar')], channel: 'counter', delivery: false, customer: 'Leo S.', phone: '5625552148', createdMin: 30, promiseMin: -5, status: 'done', now }),
    makeOrder(n++, { lines: [pz('double-pep', 'L'), side('garlic-knots'), side('soda-2l')], channel: 'online', delivery: true, customer: 'Alex L.', phone: '5625552185', addr: 2, createdMin: 21, promiseMin: 14, status: 'ready', now, tip: 700 }),
    makeOrder(n++, { lines: [pz('pepperoni', 'M', 2)], channel: 'online', delivery: true, customer: 'Taylor P.', phone: '5625552222', addr: 6, createdMin: 19, promiseMin: 16, status: 'ready', now, tip: 500 }),
    makeOrder(n++, { lines: [byo('L', { sausage: 'whole', mushroom: 'left', jalapeno: 'right' })], channel: 'phone', delivery: false, customer: 'Nina G.', phone: '5625552259', createdMin: 17, promiseMin: 3, status: 'ready', now }),
    makeOrder(n++, { lines: [pz('cheese', 'L'), pz('pepperoni', 'L'), side('wings-bbq')], channel: 'doordash', delivery: false, customer: 'DoorDash: Omar B.', phone: '', createdMin: 14, promiseMin: 6, status: 'oven', now }),
    makeOrder(n++, { lines: [pz('veggie', 'M')], channel: 'online', delivery: true, customer: 'Grace W.', phone: '5625552333', addr: 10, createdMin: 12, promiseMin: 24, status: 'oven', now, tip: 400 }),
    makeOrder(n++, { lines: [byo('S', { pineapple: 'whole', ham: 'whole' }), side('soda-can', 2)], channel: 'counter', delivery: false, customer: 'Diego N.', phone: '5625552370', createdMin: 9, promiseMin: 9, status: 'oven', now }),
    makeOrder(n++, { lines: [pz('white', 'L'), pz('pepperoni', 'S')], channel: 'online', delivery: true, customer: 'Riley H.', phone: '5625552407', addr: 1, createdMin: 6, promiseMin: 31, status: 'new', now, tip: 600 }),
    makeOrder(n++, { lines: [pz('sausage-mush', 'L'), side('garlic-knots')], channel: 'phone', delivery: true, customer: 'Hana M.', phone: '5625552444', addr: 3, createdMin: 4, promiseMin: 36, status: 'new', now, tip: 500 }),
    makeOrder(n++, { lines: [pz('pepperoni', 'L'), side('wings-buffalo')], channel: 'ubereats', delivery: false, customer: 'Uber Eats: Marcus T.', phone: '', createdMin: 2, promiseMin: 18, status: 'new', now }),
  ];
  // Game-day pre-orders for the next big day, placed over the last week.
  const big = nextBigDay(today);
  const [y, m, d] = big.date.split('-').map(Number);
  // Kickoff is 1 PM on game day, or a little later tonight when the demo is opened after that, so pre-orders are not hours in the past (it stays on game day).
  const kick = Math.min(Math.max(new Date(y, m - 1, d, 13, 0).getTime(), now + 100 * MINUTE), new Date(y, m - 1, d, 23, 45).getTime());
  const pre: [number, number, string, string, boolean, number?][] = [[0, -40, 'Ivy S.', '5625552481', true, 5], [1, -30, 'Ben K.', '5625552518', true, 8], [0, -30, 'Zoe L.', '5625552555', false], [2, 60 * 22, 'Harbor Dental office', '5625552592', true, 7], [1, -20, 'Andre P.', '5625552629', false], [0, -10, 'Lucy H.', '5625552666', true, 11]];
  for (const [packIdx, offsetMin, who, phone, delivery, addr] of pre) {
    const pack = PACKS[packIdx];
    list.push(makeOrder(n++, { lines: packLines(pack), channel: packIdx === 2 ? 'catering' : 'online', delivery, customer: who, phone, addr, createdMin: 60 * 24 * (2 + (n % 4)), promiseMin: 0, status: 'new', now, scheduledFor: kick + offsetMin * MINUTE, event: big.name, deposit: true, payment: packIdx === 2 ? 'invoice' : 'online' }));
  }
  return list;
}

function fresh(now = Date.now()): PizzaState {
  const today = isoDate(new Date(now));
  const drivers: Record<string, DriverState> = {};
  for (const d of DRIVERS) drivers[d.id] = { id: d.id, status: 'in', orderIds: [], runs: 0, miles: 0, tipsCents: 0 };
  const orders = seedOrders(today, now);
  const outIds = orders.filter((o) => o.status === 'out').map((o) => o.id);
  drivers.dev = { ...drivers.dev, status: 'out', orderIds: outIds, backAt: iso(now + 9 * MINUTE), runs: 3, miles: 14.2, tipsCents: 1900 };
  for (const o of orders) if (o.status === 'out') o.driverId = 'dev';
  drivers.sam = { ...drivers.sam, runs: 2, miles: 8.9, tipsCents: 1100 };
  drivers.chris = { ...drivers.chris, status: 'off' };
  const onHand: Record<string, number> = { ...TOPPING_ON_HAND };
  for (const i of INVENTORY) onHand[i.id] = i.onHand;
  const r = rng(Number(today.replace(/-/g, '')));
  return {
    today, orders, nextNumber: 2201, drivers, members: seedMembers(today), texts: [], onHand, pos: [],
    doughMade: { S: 0, M: 0, L: 0 }, out: [], rain: false,
    earlier: { orders: 41 + Math.floor(r() * 8), salesCents: 142000 + Math.floor(r() * 18000), tipsCents: 15600 },
    invoices: seedInvoices(today, orders), nextInvoice: 1050, campaigns: seedMail(today),
  };
}

const SEEN = `${KEY}-seen`;
const TIME_FIELDS = ['createdAt', 'promisedAt', 'ovenAt', 'readyAt', 'outAt', 'doneAt'] as const;

/**
 * The demo shop only runs while someone is looking at it. Coming back after a break moves every open
 * order (and the drivers) forward by the time away, so the rush picks up where it stopped instead of
 * every ticket showing hours late.
 */
function resume(s: PizzaState, awayMs: number): PizzaState {
  if (awayMs < 3 * MINUTE) return s;
  const fwd = (t?: string) => (t ? iso(new Date(t).getTime() + awayMs) : t);
  return {
    ...s,
    orders: s.orders.map((o) => {
      // Finished orders keep their times; game-day pre-orders keep their set time.
      if (o.status === 'done' || o.scheduled) return o;
      const moved = { ...o } as PizzaOrder;
      for (const f of TIME_FIELDS) if (moved[f]) (moved as unknown as Record<string, string | undefined>)[f] = fwd(moved[f]);
      return moved;
    }),
    drivers: Object.fromEntries(Object.entries(s.drivers).map(([id, d]) => [id, d.backAt ? { ...d, backAt: fwd(d.backAt) } : d])) as PizzaState['drivers'],
  };
}

function load(): PizzaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as PizzaState;
      if (s.today === isoDate(new Date()) && Array.isArray(s.orders)) {
        const seen = Number(localStorage.getItem(SEEN)) || 0;
        const withInvoices = Array.isArray(s.invoices) ? s : { ...s, invoices: seedInvoices(s.today, s.orders), nextInvoice: 1050 };
        const kept = Array.isArray(withInvoices.campaigns) ? withInvoices : { ...withInvoices, campaigns: seedMail(s.today) };
        // No last-seen time means an older save with stale clocks: start a fresh shift.
        return seen ? resume(kept, Date.now() - seen) : fresh();
      }
    }
  } catch {
    // Fall through to a fresh shift.
  }
  return fresh();
}

function usePizzaStore() {
  const [state, setState] = useState<PizzaState>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(SEEN, String(Date.now())); } catch { /* storage blocked: the demo still runs */ }
  }, [state]);
  // Remember when the demo was last open, so a later visit can pick the rush up from there.
  useEffect(() => {
    const mark = () => { try { localStorage.setItem(SEEN, String(Date.now())); } catch { /* storage blocked */ } };
    const id = setInterval(mark, 20_000);
    return () => clearInterval(id);
  }, []);
  const history = useMemo<PizzaDay[]>(() => buildPizzaHistory(state.today), [state.today]);
  const now = () => new Date().toISOString();
  const text = (to: string, body: string, kind: Text['kind']): Text[] => (to ? [{ to, body, at: now(), kind }] : []);

  const placeOrder = useCallback((o: Omit<PizzaOrder, 'id' | 'number'>, opts: { rewardPhone?: string; bill?: { company: string; email: string; po?: string; memo: string }; /** A ticket number given elsewhere (a real phone order is numbered on the call). */ number?: number } = {}) => {
    let placed: PizzaOrder | undefined;
    let invoice: PizzaInvoice | undefined;
    setState((s) => {
      if (opts.number && s.orders.some((x) => x.number === opts.number)) return s;
      const number = opts.number ?? s.nextNumber;
      const order: PizzaOrder = { ...o, id: `pz-${number}`, number };
      placed = order;
      // Billed to a company: the invoice is emailed with a pay link as soon as the order is booked.
      invoice = opts.bill ? invoiceFor(order, opts.bill, opts.bill.memo, order.promisedAt.slice(0, 10), s.today, s.nextInvoice) : undefined;
      const when = new Date(order.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const texts = [...text(order.customer.phone, `${PIZZA_SHOP.name}: Got your order #${order.number}. ${order.fulfillment === 'delivery' ? `At your door by about ${when}.` : `Ready for pickup at ${when}.`} We'll text you when it's ${order.fulfillment === 'delivery' ? 'on the way' : 'ready'}.`, 'received')];
      let members = s.members;
      const phone = opts.rewardPhone?.replace(/\D/g, '');
      if (phone && phone.length === 10) {
        const existing = members.find((m) => m.phone === phone);
        const base = existing ?? { phone, name: order.customer.name || 'Guest', punches: 0, rewards: 0, visits: 0, joined: s.today };
        const { member, earnedReward } = addVisit({ ...base, lastVisit: s.today });
        members = existing ? members.map((m) => (m.phone === phone ? member : m)) : [member, ...members];
        if (earnedReward) texts.push(...text(phone, pizzaRewardText(PIZZA_SHOP.name), 'reward'));
      }
      // A postcard code on the order: count it against the mailing it came from.
      const campaigns = order.promo ? s.campaigns.map((c) => (c.id !== order.promo!.campaignId ? c : {
        ...c, redemptions: [...c.redemptions, {
          code: order.promo!.code, orderNumber: order.number, date: s.today, name: order.customer.name || 'Guest', subtotalCents: order.subtotal, discountCents: order.promo!.discountCents,
          channel: order.channel === 'online' ? (order.promo!.viaQr ? 'Website (QR code)' : 'Website (typed code)') : order.channel === 'phone' ? 'Phone' : 'Counter',
          newCustomer: c.audience !== 'lapsed' && !s.members.some((m) => m.phone === order.customer.phone) && !s.orders.some((x) => x.customer.phone && x.customer.phone === order.customer.phone), live: true,
        }],
      })) : s.campaigns;
      return {
        ...s, campaigns, orders: [...s.orders, order], nextNumber: opts.number ? s.nextNumber : s.nextNumber + 1, texts: [...texts, ...s.texts], members,
        invoices: invoice ? [invoice, ...s.invoices] : s.invoices, nextInvoice: invoice ? s.nextInvoice + 1 : s.nextInvoice,
      };
    });
    return placed && { ...placed, invoice };
  }, []);

  /** The company paid through the link, or a check came in. */
  const payInvoice = useCallback((id: string) => {
    setState((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === id ? { ...i, paid: true, paidOn: s.today } : i)) }));
  }, []);
  const remindInvoice = useCallback((id: string) => {
    setState((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === id && !i.reminders.includes(s.today) ? { ...i, reminders: [...i.reminders, s.today] } : i)) }));
  }, []);

  const setStatus = useCallback((id: string, status: OrderStatus) => {
    setState((s) => {
      const o = s.orders.find((x) => x.id === id);
      if (!o) return s;
      const patch: Partial<PizzaOrder> = { status };
      const t = now();
      let onHand = s.onHand;
      let texts = s.texts;
      if (status === 'oven') {
        patch.ovenAt = t;
        // Stock comes off by recipe the moment a pie goes in the oven.
        onHand = { ...onHand };
        for (const l of o.lines) {
          const use: Record<string, number> = l.kind === 'pizza' ? pizzaUsage(l.config) : SIDE_BY_ID[l.sideId].uses ?? {};
          for (const [k, n] of Object.entries(use)) if (k in onHand) onHand[k] = Math.max(0, onHand[k] - n * l.qty);
        }
      }
      if (status === 'ready') {
        patch.readyAt = t;
        if (o.fulfillment === 'pickup') texts = [...text(o.customer.phone, `${PIZZA_SHOP.name}: Order #${o.number} is hot and ready at the counter.`, 'ready'), ...texts];
      }
      if (status === 'done') patch.doneAt = t;
      return { ...s, onHand, texts, orders: s.orders.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, []);

  /** Sends a driver out with a run. */
  const dispatch = useCallback((driverId: string, orderIds: string[], minutes: number, miles: number) => {
    setState((s) => {
      const t = now();
      const texts = orderIds.flatMap((id) => {
        const o = s.orders.find((x) => x.id === id);
        const name = s.drivers[driverId] ? driverId[0].toUpperCase() + driverId.slice(1) : 'Your driver';
        return o ? text(o.customer.phone, `${PIZZA_SHOP.name}: ${name} is on the way with order #${o.number}. Track it: kneados.app/t/${o.number}`, 'out') : [];
      });
      const d = s.drivers[driverId];
      return {
        ...s,
        texts: [...texts, ...s.texts],
        orders: s.orders.map((o) => (orderIds.includes(o.id) ? { ...o, status: 'out', outAt: t, driverId, readyAt: o.readyAt ?? t } : o)),
        drivers: { ...s.drivers, [driverId]: { ...d, status: 'out', orderIds, backAt: new Date(Date.now() + minutes * MINUTE).toISOString(), runs: d.runs + 1, miles: Math.round((d.miles + miles) * 10) / 10 } },
      };
    });
  }, []);

  const driverBack = useCallback((driverId: string) => {
    setState((s) => {
      const d = s.drivers[driverId];
      const t = now();
      const tips = s.orders.filter((o) => d.orderIds.includes(o.id)).reduce((a, o) => a + o.tip, 0);
      return {
        ...s,
        orders: s.orders.map((o) => (d.orderIds.includes(o.id) ? { ...o, status: 'done', doneAt: t } : o)),
        drivers: { ...s.drivers, [driverId]: { ...d, status: 'in', orderIds: [], backAt: undefined, tipsCents: d.tipsCents + tips } },
      };
    });
  }, []);

  const setDriverOn = useCallback((driverId: string, on: boolean) => {
    setState((s) => ({ ...s, drivers: { ...s.drivers, [driverId]: { ...s.drivers[driverId], status: on ? 'in' : 'off' } } }));
  }, []);

  const sendPO = useCallback((po: Omit<SentPO, 'id' | 'number' | 'status' | 'at'>) => {
    setState((s) => ({ ...s, pos: [{ ...po, id: `po-${s.pos.length + 1}`, number: 501 + s.pos.length, status: 'sent', at: now() }, ...s.pos] }));
  }, []);

  const receivePO = useCallback((id: string) => {
    setState((s) => {
      const po = s.pos.find((p) => p.id === id);
      if (!po || po.status === 'received') return s;
      const onHand = { ...s.onHand };
      for (const l of po.lines) onHand[l.id] = (onHand[l.id] ?? 0) + l.qty;
      return { ...s, onHand, pos: s.pos.map((p) => (p.id === id ? { ...p, status: 'received' } : p)) };
    });
  }, []);

  const bumpDough = useCallback((size: SizeId, delta: number) => {
    setState((s) => ({ ...s, doughMade: { ...s.doughMade, [size]: Math.max(0, s.doughMade[size] + delta) } }));
  }, []);

  const toggleOut = useCallback((id: string) => {
    setState((s) => ({ ...s, out: s.out.includes(id) ? s.out.filter((x) => x !== id) : [...s.out, id] }));
  }, []);

  // The real phone line: orders taken on a call show up here a few seconds later, on every page of the demo.
  const [phoneLine, setLine] = useState(savedLine);
  const [lastCallAt, setLastCallAt] = useState<string | null>(null);
  const setPhoneLine = useCallback((number: string) => { saveLine(number); setLine(savedLine()); setLastCallAt(null); }, []);

  // The shop's one make line lives on the server. This device sends it every ticket it changes (counter, website,
  // text and app orders, and each tap on the make line) and takes back what other devices did: a stage another
  // screen tapped, and the pizzas of orders this device has not seen, which its own quotes then count.
  const orders = useRef(state.orders);
  orders.current = state.orders;
  const sent = useRef(new Map<string, string>());
  const replaceNext = useRef(false);
  const [elsewhere, setElsewhere] = useState<KitchenLoad>({ ahead: 0, inOven: 0 });
  useEffect(() => { sent.current = new Map(); setElsewhere({ ahead: 0, inOven: 0 }); }, [phoneLine]);
  const shareLine = useCallback(async (line: string, stopped: () => boolean) => {
    const mine = orders.current.map(ticketOf);
    const replace = replaceNext.current;
    const changed = replace ? mine : mine.filter((t) => sent.current.get(t.id) !== JSON.stringify(t));
    const queue = await syncQueue(line, changed, replace);
    if (!queue || stopped()) return;
    if (replace) { replaceNext.current = false; sent.current = new Map(); }
    for (const t of changed) sent.current.set(t.id, JSON.stringify(t));
    const local = new Map(orders.current.map((o) => [o.id, o]));
    const ahead = queue.filter((t): t is QueueTicket => {
      const o = local.get(t.id);
      // The server is behind this device on a ticket (another device overwrote it): send ours again next time.
      if (o && (o.createdAt !== t.createdAt || further(o.status, t.status))) sent.current.delete(t.id);
      return !!o && o.createdAt === t.createdAt && further(t.status, o.status);
    });
    if (ahead.length) {
      const by = new Map(ahead.map((t) => [t.id, t]));
      setState((s) => ({
        ...s, orders: s.orders.map((o) => {
          const t = by.get(o.id);
          if (!t || o.createdAt !== t.createdAt || !further(t.status, o.status)) return o;
          const stamp = new Date().toISOString();
          return { ...o, status: t.status, ovenAt: t.ovenAt ?? o.ovenAt ?? stamp, ...(further(t.status, 'oven') ? { readyAt: t.readyAt ?? o.readyAt ?? stamp } : {}), ...(further(t.status, 'ready') ? { outAt: t.outAt ?? o.outAt ?? stamp } : {}), ...(t.status === 'done' ? { doneAt: o.doneAt ?? stamp } : {}) };
        }),
      }));
    }
    const load = queueLoad(queue.filter((t) => !local.has(t.id)), Date.now(), true);
    setElsewhere((e) => (e.ahead === load.ahead && e.inOven === load.inOven ? e : load));
  }, []);
  useEffect(() => {
    if (!phoneLine) return;
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      const feed = await fetchFeed(phoneLine);
      if (stop) return;
      if (feed) {
        setLastCallAt(feed.lastCallAt);
        const seen = new Set(seenOrders());
        const fresh = feed.orders.filter((o) => !seen.has(o.id));
        if (fresh.length) {
          markSeen(fresh.map((o) => o.id));
          for (const o of fresh) placeOrder(ticketFromPhone(o), { number: o.number });
        }
      }
      await shareLine(phoneLine, () => stop);
    };
    void check();
    const id = setInterval(() => void check(), PHONE_POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [phoneLine, placeOrder, shareLine]);

  const sendCampaign = useCallback((c: MailCampaign) => setState((s) => ({ ...s, campaigns: [c, ...s.campaigns] })), []);
  const addTexts = useCallback((list: Text[]) => setState((s) => ({ ...s, texts: [...list, ...s.texts] })), []);
  const setMembers = useCallback((members: RewardsMember[]) => setState((s) => ({ ...s, members })), []);
  const setRain = useCallback((rain: boolean) => setState((s) => (s.rain === rain ? s : { ...s, rain })), []);
  const reset = useCallback(() => { replaceNext.current = true; setState(fresh()); }, []);

  const tomorrow = addDays(state.today, 1);
  const forecastFor = useCallback((date: string) => forecastDay(history, date, { rain: date === tomorrow ? state.rain : false, preorderPies: preorderPies(state.orders, date) }), [history, tomorrow, state.rain, state.orders]);

  return { state, history, tomorrow, forecastFor, phoneLine, lastCallAt, elsewhere, setPhoneLine, placeOrder, setStatus, dispatch, driverBack, setDriverOn, sendPO, receivePO, bumpDough, toggleOut, addTexts, setMembers, setRain, reset, payInvoice, remindInvoice, sendCampaign };
}

export type PizzaDemo = ReturnType<typeof usePizzaStore>;
const Ctx = createContext<PizzaDemo | null>(null);

export function PizzaProvider({ children }: { children: ReactNode }) {
  const value = usePizzaStore();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePizza(): PizzaDemo {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePizza outside PizzaProvider');
  return v;
}

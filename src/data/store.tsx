import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { MEAL_MINUTES, REST_MINUTES, breakStatus, unpaidHours, type Break, type BreakKind, type BreakStatus } from '../lib/breaks';
import { addDays, dowOf, holidayFor, isoDate } from '../lib/dates';
import { forecastItem, type ItemDayObservation, type ItemForecast } from '../lib/forecast';
import { orderReadyText, orderReceivedText } from '../lib/notify';
import type { PurchaseOrder, Supplier } from '../lib/purchasing';
import { addVisit, redeemReward, rewardText } from '../lib/rewards';
import { buildHistory, buildPreorders, buildTodayOrders } from './history';
import { clearShopState } from './local';
import { SUPPLIERS } from './suppliers';
import { MENU, SCHEDULE, SEED_MEMBERS, SHOP, STAFF, shiftHours } from './shop';
import type { BakeProgress, DayHistory, Order, OrderStatus, RewardsMember } from './types';

const STORAGE_KEY = 'kneados-demo-v4';

interface ClockState {
  /** ISO time the person clocked in, when they are on the clock. */
  inAt?: string;
  /** Paid hours already finished today. Unpaid meal breaks are left out. */
  hours: number;
  /** Rest and meal breaks taken today. */
  breaks?: Break[];
}

export interface SentText {
  to: string;
  body: string;
  at: string;
  /** Set on texts about a pickup order. */
  orderId?: string;
  kind?: 'reward' | 'received' | 'ready';
}

interface DemoState {
  today: string;
  /** Orders created in this demo session plus the seeded pre-orders. */
  orders: Order[];
  nextNumber: number;
  bake: Record<string, BakeProgress>;
  members: RewardsMember[];
  clock: Record<string, ClockState>;
  texts: SentText[];
  tomorrowRain: boolean;
  tippingEnabled: boolean;
  /** Purchase orders drafted, sent and received. */
  pos: PurchaseOrder[];
  nextPo: number;
  /** The owner's edits to supplier profiles, by supplier name. */
  suppliers: Record<string, Partial<Supplier>>;
}

type Action =
  | { type: 'addOrder'; order: Order; text?: SentText }
  | { type: 'setStatus'; id: string; status: OrderStatus; text?: SentText }
  | { type: 'bumpMade'; itemId: string; delta: number }
  | { type: 'toggleSoldOut'; itemId: string }
  | { type: 'setMembers'; members: RewardsMember[]; text?: SentText }
  | { type: 'clock'; staffId: string; now: string }
  | { type: 'break'; staffId: string; now: string; kind?: BreakKind }
  | { type: 'savePO'; po: PurchaseOrder }
  | { type: 'setSupplier'; name: string; patch: Partial<Supplier> }
  | { type: 'setRain'; rain: boolean }
  | { type: 'setTipping'; on: boolean }
  | { type: 'reset'; state: DemoState };

function reducer(state: DemoState, a: Action): DemoState {
  switch (a.type) {
    case 'addOrder':
      return { ...state, orders: [...state.orders, a.order], nextNumber: state.nextNumber + 1, texts: a.text ? [a.text, ...state.texts] : state.texts };
    case 'setStatus':
      return { ...state, orders: state.orders.map((o) => (o.id === a.id ? { ...o, status: a.status } : o)), texts: a.text ? [a.text, ...state.texts] : state.texts };
    case 'bumpMade': {
      const cur = state.bake[a.itemId] ?? { made: 0, soldOut: false };
      return { ...state, bake: { ...state.bake, [a.itemId]: { ...cur, made: Math.max(0, cur.made + a.delta) } } };
    }
    case 'toggleSoldOut': {
      const cur = state.bake[a.itemId] ?? { made: 0, soldOut: false };
      return { ...state, bake: { ...state.bake, [a.itemId]: { ...cur, soldOut: !cur.soldOut } } };
    }
    case 'setMembers':
      return { ...state, members: a.members, texts: a.text ? [a.text, ...state.texts] : state.texts };
    case 'clock': {
      const cur = state.clock[a.staffId] ?? { hours: 0 };
      if (cur.inAt) {
        // Clocking out ends any break that is still running.
        const breaks = (cur.breaks ?? []).map((b) => (b.end ? b : { ...b, end: a.now }));
        const worked = (new Date(a.now).getTime() - new Date(cur.inAt).getTime()) / 3600_000 - unpaidHours(breaks, new Date(a.now), cur.inAt);
        return { ...state, clock: { ...state.clock, [a.staffId]: { hours: cur.hours + Math.max(0, worked), breaks } } };
      }
      return { ...state, clock: { ...state.clock, [a.staffId]: { ...cur, inAt: a.now } } };
    }
    case 'break': {
      const cur = state.clock[a.staffId];
      if (!cur?.inAt) return state;
      const breaks = cur.breaks ?? [];
      const running = breaks.some((b) => !b.end);
      // With a kind it starts a break, without one it ends the running break.
      const next = a.kind
        ? running ? breaks : [...breaks, { kind: a.kind, start: a.now }]
        : breaks.map((b) => (b.end ? b : { ...b, end: a.now }));
      return { ...state, clock: { ...state.clock, [a.staffId]: { ...cur, breaks: next } } };
    }
    case 'savePO': {
      const existing = state.pos.find((p) => p.id === a.po.id);
      if (existing) return { ...state, pos: state.pos.map((p) => (p.id === a.po.id ? { ...a.po, number: existing.number } : p)) };
      return { ...state, pos: [{ ...a.po, number: state.nextPo }, ...state.pos], nextPo: state.nextPo + 1 };
    }
    case 'setSupplier':
      return { ...state, suppliers: { ...state.suppliers, [a.name]: { ...state.suppliers[a.name], ...a.patch } } };
    case 'setRain':
      return { ...state, tomorrowRain: a.rain };
    case 'setTipping':
      return { ...state, tippingEnabled: a.on };
    case 'reset':
      return a.state;
  }
}

function observations(history: DayHistory[], itemId: string): ItemDayObservation[] {
  return history.map((h) => ({
    date: h.date, dow: h.dow, sold: h.items[itemId]?.sold ?? 0, made: h.items[itemId]?.made ?? 0,
    rain: h.rain, holidayFactor: holidayFor(h.date)?.factor ?? 1,
  }));
}

function preorderQty(orders: Order[], date: string, itemId: string): number {
  return orders
    .filter((o) => o.source === 'online' && o.pickupAt && isoDate(new Date(o.pickupAt)) === date)
    .reduce((a, o) => a + o.lines.filter((l) => l.itemId === itemId).reduce((b, l) => b + l.qty, 0), 0);
}

export function forecastFor(history: DayHistory[], orders: Order[], date: string, itemId: string, rain: boolean): ItemForecast {
  const holiday = holidayFor(date);
  return forecastItem(observations(history, itemId), {
    date, dow: dowOf(date), rain, holidayFactor: holiday?.factor ?? 1, holidayName: holiday?.name,
    preorderQty: preorderQty(orders, date, itemId),
  });
}

function freshState(now: Date): DemoState {
  const today = isoDate(now);
  const history = buildHistory(today);
  const orders = buildPreorders(today, now);
  const hour = now.getHours() + now.getMinutes() / 60;
  // Bakers start at 2am and have the full plan out by about 8am.
  const progress = Math.min(1, Math.max(0, (hour - 2) / 6));
  const bake: Record<string, BakeProgress> = {};
  const sold: Record<string, number> = {};
  const pickedUpToday = orders.filter((o) => o.pickupAt && isoDate(new Date(o.pickupAt)) === today);
  for (const o of [...buildTodayOrders(today, now), ...pickedUpToday]) for (const l of o.lines) sold[l.itemId] = (sold[l.itemId] ?? 0) + l.qty;
  for (const item of MENU.filter((m) => m.baked)) {
    const plan = forecastFor(history, orders, today, item.id, false).qty;
    const onPace = Math.round((plan * progress) / 6) * 6;
    // The kitchen is always at least half a tray ahead of what has sold.
    const ahead = Math.ceil(((sold[item.id] ?? 0) + 6) / 6) * 6;
    bake[item.id] = { made: Math.max(onPace, ahead), soldOut: false };
  }
  const clock: Record<string, ClockState> = {};
  const dow = dowOf(today);
  for (const s of SCHEDULE.filter((x) => x.dow === dow)) {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const start = new Date(now); start.setHours(sh, sm, 0, 0);
    const end = new Date(now); end.setHours(eh, em, 0, 0);
    if (now < start) continue;
    // Breaks already taken by this point in the shift: a rest break 2 hours in, lunch at 4 hours, a second rest at 6.
    const breaks: Break[] = [];
    const until = Math.min(now.getTime(), end.getTime());
    const length = shiftHours(s);
    const plan: [BreakKind, number, number][] = [['rest', 2, REST_MINUTES], ['meal', 4, MEAL_MINUTES], ['rest', 6, REST_MINUTES]];
    for (const [kind, atHour, minutes] of plan) {
      if (kind === 'meal' && length <= 5) continue;
      if (kind === 'rest' && atHour === 6 && length <= 6) continue;
      const from = start.getTime() + atHour * 3600_000;
      const to = from + minutes * 60_000;
      if (to <= until) breaks.push({ kind, start: new Date(from).toISOString(), end: new Date(to).toISOString() });
    }
    if (now >= end) clock[s.staffId] = { hours: (end.getTime() - start.getTime()) / 3600_000 - unpaidHours(breaks, end), breaks };
    else clock[s.staffId] = { inAt: start.toISOString(), hours: 0, breaks };
  }
  return { today, orders, nextNumber: 1001, bake, members: SEED_MEMBERS, clock, texts: [], tomorrowRain: false, tippingEnabled: SHOP.tippingEnabled, pos: [], nextPo: 1001, suppliers: {} };
}

function load(now: Date): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as DemoState;
      // A new day starts a new demo shift.
      if (saved.today === isoDate(now) && Array.isArray(saved.orders)) return saved;
    }
  } catch {
    // Unreadable saved state: start fresh.
  }
  return freshState(now);
}

export interface Demo {
  state: DemoState;
  history: DayHistory[];
  /** Every order for today: generated walk-in sales so far plus orders made in the demo. */
  todayOrders: Order[];
  soldToday: Record<string, number>;
  tomorrow: string;
  forecastToday: (itemId: string) => ItemForecast;
  forecastTomorrow: (itemId: string) => ItemForecast;
  /** Paid hours today. Unpaid meal breaks are left out. */
  hoursToday: (staffId: string) => number;
  /** Where this person stands on breaks. Undefined when they are not clocked in. */
  breakOf: (staffId: string) => BreakStatus | undefined;
  breaksToday: (staffId: string) => Break[];
  startBreak: (staffId: string, kind: BreakKind) => void;
  endBreak: (staffId: string) => void;
  placeOrder: (o: Omit<Order, 'id' | 'number' | 'createdAt'>) => Order;
  setStatus: (id: string, status: OrderStatus) => void;
  bumpMade: (itemId: string, delta: number) => void;
  toggleSoldOut: (itemId: string) => void;
  findMember: (phone: string) => RewardsMember | undefined;
  joinRewards: (phone: string, name: string) => RewardsMember;
  punchVisit: (phone: string, name?: string) => { earnedReward: boolean };
  redeem: (phone: string) => void;
  clockToggle: (staffId: string) => void;
  /** Supplier profiles with the owner's edits applied. */
  suppliers: Supplier[];
  /** Saves a purchase order. A new one gets the next PO number. */
  savePO: (po: PurchaseOrder) => void;
  updateSupplier: (name: string, patch: Partial<Supplier>) => void;
  setRain: (rain: boolean) => void;
  setTipping: (on: boolean) => void;
  reset: () => void;
}

const Ctx = createContext<Demo | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => load(new Date()));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the demo still works for this visit.
    }
  }, [state]);

  const history = useMemo(() => buildHistory(state.today), [state.today]);
  const seeded = useMemo(() => buildTodayOrders(state.today, new Date()), [state.today]);

  const demo = useMemo<Demo>(() => {
    const isToday = (o: Order) => isoDate(new Date(o.pickupAt ?? o.createdAt)) === state.today;
    const todayOrders = [...seeded, ...state.orders.filter(isToday)];
    const soldToday: Record<string, number> = {};
    for (const o of todayOrders) for (const l of o.lines) soldToday[l.itemId] = (soldToday[l.itemId] ?? 0) + l.qty;
    const tomorrow = addDays(state.today, 1);
    const findMember = (phone: string) => state.members.find((m) => m.phone === phone.replace(/\D/g, ''));
    return {
      state, history, todayOrders, soldToday, tomorrow,
      forecastToday: (id) => forecastFor(history, state.orders, state.today, id, false),
      forecastTomorrow: (id) => forecastFor(history, state.orders, tomorrow, id, state.tomorrowRain),
      hoursToday: (staffId) => {
        const c = state.clock[staffId];
        if (!c) return 0;
        const live = c.inAt ? Math.max(0, (Date.now() - new Date(c.inAt).getTime()) / 3600_000 - unpaidHours(c.breaks ?? [], new Date(), c.inAt)) : 0;
        return c.hours + live;
      },
      breakOf: (staffId) => {
        const c = state.clock[staffId];
        if (!c?.inAt) return undefined;
        const shift = SCHEDULE.find((x) => x.staffId === staffId && x.dow === dowOf(state.today));
        return breakStatus(new Date(c.inAt), shift ? shiftHours(shift) : 0, c.breaks ?? [], new Date());
      },
      breaksToday: (staffId) => state.clock[staffId]?.breaks ?? [],
      startBreak: (staffId, kind) => dispatch({ type: 'break', staffId, kind, now: new Date().toISOString() }),
      endBreak: (staffId) => dispatch({ type: 'break', staffId, now: new Date().toISOString() }),
      placeOrder: (o) => {
        const order: Order = { ...o, id: `o-${state.nextNumber}`, number: state.nextNumber, createdAt: new Date().toISOString() };
        // An online order with a phone number gets a text right away.
        const text: SentText | undefined = order.source === 'online' && order.phone
          ? { to: order.phone, body: orderReceivedText(SHOP.name, order), at: order.createdAt, orderId: order.id, kind: 'received' }
          : undefined;
        dispatch({ type: 'addOrder', order, text });
        return order;
      },
      setStatus: (id, status) => {
        const order = state.orders.find((o) => o.id === id);
        // The moment an order is packed, the customer gets one text. Never a second one for the same order.
        const already = state.texts.some((t) => t.orderId === id && t.kind === 'ready');
        const text: SentText | undefined = status === 'ready' && order?.phone && !already
          ? { to: order.phone, body: orderReadyText(SHOP.name, order), at: new Date().toISOString(), orderId: id, kind: 'ready' }
          : undefined;
        dispatch({ type: 'setStatus', id, status, text });
      },
      bumpMade: (itemId, delta) => dispatch({ type: 'bumpMade', itemId, delta }),
      toggleSoldOut: (itemId) => dispatch({ type: 'toggleSoldOut', itemId }),
      findMember,
      joinRewards: (phone, name) => {
        const digits = phone.replace(/\D/g, '');
        const existing = findMember(digits);
        if (existing) return existing;
        const member: RewardsMember = { phone: digits, name: name || 'Guest', punches: 0, rewards: 0, visits: 0, joined: state.today };
        dispatch({ type: 'setMembers', members: [...state.members, member] });
        return member;
      },
      punchVisit: (phone, name) => {
        const digits = phone.replace(/\D/g, '');
        const current = findMember(digits) ?? { phone: digits, name: name || 'Guest', punches: 0, rewards: 0, visits: 0, joined: state.today };
        const { member, earnedReward } = addVisit(current);
        const others = state.members.filter((m) => m.phone !== digits);
        const text = earnedReward ? { to: digits, body: rewardText(SHOP.name), at: new Date().toISOString() } : undefined;
        dispatch({ type: 'setMembers', members: [...others, member], text });
        return { earnedReward };
      },
      redeem: (phone) => {
        const digits = phone.replace(/\D/g, '');
        dispatch({ type: 'setMembers', members: state.members.map((m) => (m.phone === digits ? redeemReward(m) : m)) });
      },
      clockToggle: (staffId) => dispatch({ type: 'clock', staffId, now: new Date().toISOString() }),
      suppliers: SUPPLIERS.map((x) => ({ ...x, ...state.suppliers[x.name] })),
      savePO: (po) => dispatch({ type: 'savePO', po }),
      updateSupplier: (name, patch) => dispatch({ type: 'setSupplier', name, patch }),
      setRain: (rain) => dispatch({ type: 'setRain', rain }),
      setTipping: (on) => dispatch({ type: 'setTipping', on }),
      reset: () => { clearShopState(); dispatch({ type: 'reset', state: freshState(new Date()) }); },
    };
  }, [state, history, seeded]);

  return <Ctx.Provider value={demo}>{children}</Ctx.Provider>;
}

export function useDemo(): Demo {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemo must be used inside DemoProvider');
  return v;
}

export { STAFF };

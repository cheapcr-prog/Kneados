/**
 * Pizza mode's working parts: prices, recipes, the sales history, the dough plan, stock, quote times and dispatch.
 * Every figure the screens and the AI show is worked out here from the demo data. Nothing is guessed.
 */
import { addDays, dowOf } from '../lib/dates';
import {
  ADDRESSES, CHEESES, CRUSTS, DOUGH_RECIPE, DOUGH_TOTAL_PCT, INVENTORY, MILEAGE_CENTS, PIZZA_SHOP, PIZZA_SUPPLIERS, SAUCES, SIDES, SIDE_BY_ID,
  SIZES, SIZE_BY_ID, SPECIALTIES, SPECIALTY_BY_ID, TOPPINGS, TOPPING_BY_ID, TOPPING_ON_HAND, TOPPING_SUPPLIER, ZONES,
  pizzaDayFactor, type Address, type PizzaConfig, type SizeId, type Zone,
} from './data';

/* ================================================================ orders */

export interface PizzaLine { kind: 'pizza'; config: PizzaConfig; specialtyId?: string; qty: number; unitCents: number }
export interface SideLine { kind: 'side'; sideId: string; qty: number; unitCents: number }
export type Line = PizzaLine | SideLine;

export type Channel = 'online' | 'phone' | 'counter' | 'doordash' | 'ubereats' | 'catering';
export type OrderStatus = 'new' | 'oven' | 'ready' | 'out' | 'done';

export interface Customer {
  name: string;
  phone: string;
  address?: string;
  x?: number;
  y?: number;
  zone?: Zone['id'];
}

export interface PizzaOrder {
  id: string;
  number: number;
  channel: Channel;
  fulfillment: 'delivery' | 'pickup';
  createdAt: string;
  /** When the customer was told it would be ready (pickup) or at the door (delivery). */
  promisedAt: string;
  /** Set on orders placed ahead, like game-day pre-orders. The make line holds them until it is time to fire. */
  scheduled?: boolean;
  /** The game day or event a pre-order is for. */
  event?: string;
  customer: Customer;
  lines: Line[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  tip: number;
  total: number;
  /** Delivery app commission, in cents. */
  appFeeCents?: number;
  /** Paid ahead on a pre-order, in cents. */
  depositCents?: number;
  payment: 'card' | 'cash' | 'online' | 'app' | 'invoice';
  status: OrderStatus;
  ovenAt?: string;
  readyAt?: string;
  outAt?: string;
  doneAt?: string;
  driverId?: string;
  rewardRedeemed?: boolean;
  note?: string;
}

/* ================================================================ prices */

const roundNickel = (c: number) => Math.ceil(c / 5) * 5;

/** One topping's price on a pizza: full price on the whole pie, half price on a half. */
export function toppingCents(size: SizeId, toppingId: string, side: 'whole' | 'left' | 'right'): number {
  const s = SIZE_BY_ID[size];
  const t = TOPPING_BY_ID[toppingId];
  if (!t) return 0;
  const full = t.premium ? s.premiumCents : s.toppingCents;
  return side === 'whole' ? full : roundNickel(full / 2);
}

/** What one pizza costs the customer, in cents, with a line for each charge. */
export function pizzaPrice(config: PizzaConfig, specialtyId?: string): { cents: number; parts: { label: string; cents: number }[] } {
  const size = SIZE_BY_ID[config.size];
  const sp = specialtyId ? SPECIALTY_BY_ID[specialtyId] : undefined;
  const parts: { label: string; cents: number }[] = [];
  if (sp) parts.push({ label: `${size.label} ${sp.name}`, cents: sp.prices[config.size] });
  else parts.push({ label: `${size.label} ${size.inches}" cheese pizza`, cents: size.baseCents });
  const crust = CRUSTS.find((c) => c.id === config.crust);
  if (crust?.extraCents) parts.push({ label: crust.label, cents: crust.extraCents });
  const sauce = SAUCES.find((s) => s.id === config.sauce);
  if (sauce?.extraCents && sauce.id !== sp?.sauce) parts.push({ label: sauce.label, cents: sauce.extraCents });
  const cheese = CHEESES.find((c) => c.id === config.cheese);
  if (cheese && cheese.extra[config.size] && cheese.id !== sp?.cheese) parts.push({ label: cheese.label, cents: cheese.extra[config.size] });
  for (const [id, side] of Object.entries(config.toppings)) {
    // A specialty's own toppings are in its price. Only extras are charged.
    if (sp?.toppings.includes(id)) continue;
    const t = TOPPING_BY_ID[id];
    if (!t) continue;
    parts.push({ label: `${t.name}${side === 'whole' ? '' : ` (${side} half)`}`, cents: toppingCents(config.size, id, side) });
  }
  return { cents: parts.reduce((a, p) => a + p.cents, 0), parts };
}

export function configFor(specialtyId: string, size: SizeId = 'L'): PizzaConfig {
  const sp = SPECIALTY_BY_ID[specialtyId];
  return { size, crust: 'hand', sauce: sp.sauce, cheese: sp.cheese, toppings: Object.fromEntries(sp.toppings.map((t) => [t, 'whole'])) };
}

export const plainConfig = (size: SizeId = 'L'): PizzaConfig => ({ size, crust: 'hand', sauce: 'red', cheese: 'regular', toppings: {} });

/** A short name for a line on a ticket or receipt. */
export function pizzaTitle(l: PizzaLine): string {
  const size = SIZE_BY_ID[l.config.size];
  const sp = l.specialtyId ? SPECIALTY_BY_ID[l.specialtyId] : undefined;
  return `${size.label} ${sp ? sp.name : 'Build your own'}`;
}

/** What the make line needs to read: crust, sauce and cheese when not the usual, and toppings by half. */
export function pizzaDetails(c: PizzaConfig, specialtyId?: string): string[] {
  const sp = specialtyId ? SPECIALTY_BY_ID[specialtyId] : undefined;
  const out: string[] = [];
  if (c.crust !== 'hand') out.push(CRUSTS.find((x) => x.id === c.crust)!.label);
  if (c.sauce !== (sp?.sauce ?? 'red')) out.push(SAUCES.find((x) => x.id === c.sauce)!.label);
  if (c.cheese !== (sp?.cheese ?? 'regular')) out.push(CHEESES.find((x) => x.id === c.cheese)!.label);
  const by = (side: string) => Object.entries(c.toppings).filter(([, s]) => s === side).map(([id]) => TOPPING_BY_ID[id]?.name).filter(Boolean);
  const listed = (ids: string[]) => ids;
  if (sp) {
    const missing = sp.toppings.filter((t) => !c.toppings[t]).map((t) => `No ${TOPPING_BY_ID[t].name.toLowerCase()}`);
    out.push(...missing);
    const extra = Object.entries(c.toppings).filter(([id]) => !sp.toppings.includes(id));
    for (const [id, side] of extra) out.push(`+ ${TOPPING_BY_ID[id].name}${side === 'whole' ? '' : ` (${side})`}`);
    for (const [id, side] of Object.entries(c.toppings)) if (sp.toppings.includes(id) && side !== 'whole') out.push(`${TOPPING_BY_ID[id].name} ${side} half only`);
  } else {
    const whole = listed(by('whole') as string[]);
    if (whole.length) out.push(`Whole: ${whole.join(', ')}`);
    const left = by('left');
    if (left.length) out.push(`Left: ${left.join(', ')}`);
    const right = by('right');
    if (right.length) out.push(`Right: ${right.join(', ')}`);
    if (!whole.length && !left.length && !right.length) out.push('Cheese only');
  }
  if (c.notes?.length) out.push(...c.notes);
  return out;
}

/** Bake and cut notes in groups: only one from each group can be on a pizza. */
export const NOTE_GROUPS: { label: string; options: string[]; needsSauce?: boolean }[] = [
  { label: 'Bake', options: ['Well done', 'Light bake'] },
  { label: 'Cut', options: ['Square cut', 'Uncut'] },
  { label: 'Sauce amount', options: ['Light sauce', 'Extra sauce'], needsSauce: true },
];

/** Turns a note on or off. Turning one on turns off the others in its group; sauce amounts need a sauce. */
export function toggleNote(notes: string[] = [], note: string, sauce: PizzaConfig['sauce']): string[] {
  const group = NOTE_GROUPS.find((g) => g.options.includes(note));
  if (!group || (group.needsSauce && sauce === 'none')) return notes.filter((n) => n !== note);
  if (notes.includes(note)) return notes.filter((n) => n !== note);
  return [...notes.filter((n) => !group.options.includes(n)), note];
}

/** Drops notes that no longer make sense, such as a sauce amount on a pizza with no sauce. */
export function validNotes(notes: string[] = [], sauce: PizzaConfig['sauce']): string[] {
  const sauceNotes = NOTE_GROUPS.find((g) => g.needsSauce)!.options;
  return notes.filter((n) => !(sauce === 'none' && sauceNotes.includes(n)));
}

export const lineCents = (l: Line) => l.unitCents * l.qty;
export const piesIn = (o: Pick<PizzaOrder, 'lines'>) => o.lines.reduce((a, l) => a + (l.kind === 'pizza' ? l.qty : 0), 0);

export interface Totals { subtotal: number; deliveryFee: number; tax: number; tip: number; total: number }

/** Order totals. California taxes hot prepared food, so everything here is taxed, delivery fee included. */
export function totals(lines: Line[], opts: { zone?: Zone['id']; tipCents?: number; discountCents?: number } = {}): Totals {
  const subtotal = Math.max(0, lines.reduce((a, l) => a + lineCents(l), 0) - (opts.discountCents ?? 0));
  const deliveryFee = opts.zone ? ZONES.find((z) => z.id === opts.zone)!.feeCents : 0;
  const tax = Math.round((subtotal + deliveryFee) * PIZZA_SHOP.taxRate);
  const tip = opts.tipCents ?? 0;
  return { subtotal, deliveryFee, tax, tip, total: subtotal + deliveryFee + tax + tip };
}

/* ================================================================ recipes: what one pizza uses */

/** Ingredient use for one pizza. Toppings and cheese in pounds, dough in balls, boxes and shells in units. */
export function pizzaUsage(c: PizzaConfig): Record<string, number> {
  const size = SIZE_BY_ID[c.size];
  const lb = (g: number) => g / 453.6;
  const use: Record<string, number> = {};
  const add = (k: string, n: number) => { use[k] = (use[k] ?? 0) + n; };
  if (c.crust === 'gf') add('gf-shell', 1);
  else add(`dough-${c.size}`, 1);
  const cheese = CHEESES.find((x) => x.id === c.cheese)!;
  if (cheese.amount > 0) add('mozz', lb(size.cheeseGrams * cheese.amount));
  if (c.sauce === 'red') add('sauce', lb(size.sauceGrams));
  for (const [id, side] of Object.entries(c.toppings)) {
    const t = TOPPING_BY_ID[id];
    if (t) add(id, lb(t.grams * size.toppingScale * (side === 'whole' ? 1 : 0.5)));
  }
  add(`box-${c.size}`, 1);
  return use;
}

const INV_COST_PER_UNIT: Record<string, number> = Object.fromEntries(INVENTORY.map((i) => [i.id, i.packCents / i.pack]));

/** Cost of one unit of any ingredient key, in cents. Dough balls are priced from the flour in them. */
export function unitCost(key: string): number {
  if (key.startsWith('dough-')) {
    const grams = SIZE_BY_ID[key.slice(6) as SizeId].doughGrams;
    const flourLb = (grams * (DOUGH_RECIPE.flour / DOUGH_TOTAL_PCT)) / 453.6;
    // Flour plus about 15% for oil, salt, sugar and yeast.
    return flourLb * INV_COST_PER_UNIT.flour * 1.15;
  }
  if (TOPPING_BY_ID[key]) return TOPPING_BY_ID[key].costPerLbCents;
  return INV_COST_PER_UNIT[key] ?? 0;
}

/** What one pizza costs to make, in cents. */
export function pizzaFoodCost(c: PizzaConfig): number {
  return Math.round(Object.entries(pizzaUsage(c)).reduce((a, [k, n]) => a + unitCost(k) * n, 0));
}

/** Food cost as a share of price for every specialty and size, for the menu screen and the AI. */
export function menuMargins() {
  return SPECIALTIES.flatMap((sp) => SIZES.map((s) => {
    const cost = pizzaFoodCost(configFor(sp.id, s.id));
    const price = sp.prices[s.id];
    return { id: sp.id, name: sp.name, size: s.id, priceCents: price, costCents: cost, costShare: cost / price };
  }));
}

/* ================================================================ seeded random, so every visitor sees the same shop */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => [...s].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7);

/* ================================================================ sales history */

export interface PizzaDay {
  date: string;
  dow: number;
  rain: boolean;
  event?: string;
  orders: number;
  pizzas: Record<SizeId, number>;
  bySpecialty: Record<string, number>;
  /** Pounds of each topping used. */
  toppingLb: Record<string, number>;
  sides: Record<string, number>;
  channels: Record<Channel, number>;
  deliveries: number;
  revenueCents: number;
  foodCostCents: number;
  appFeesCents: number;
  tipsCents: number;
  laborHours: number;
  doughMade: Record<SizeId, number>;
  doughUsed: Record<SizeId, number>;
  avgDeliveryMin: number;
  lateDeliveries: number;
  /** Orders in each hour from 11am. */
  hourly: number[];
}

/** Orders on a normal day, Sunday first. */
export const DOW_ORDERS = [96, 58, 66, 64, 74, 138, 128];
const SIZE_MIX: Record<SizeId, number> = { S: 0.17, M: 0.41, L: 0.42 };
const HOUR_WEIGHTS = [4, 7, 6, 4, 3, 4, 9, 15, 16, 12, 8, 5];
export const CHANNEL_MIX: Record<Channel, number> = { online: 0.37, phone: 0.21, counter: 0.15, doordash: 0.18, ubereats: 0.08, catering: 0.01 };
export const APP_FEE_SHARE: Partial<Record<Channel, number>> = { doordash: 0.25, ubereats: 0.27 };
/** Share of each channel's orders that are delivered by the shop's own drivers. */
const OWN_DELIVERY: Record<Channel, number> = { online: 0.56, phone: 0.6, counter: 0, doordash: 0, ubereats: 0, catering: 0.8 };
/** Rain moves people from pickup to delivery and adds a little overall. */
export const RAIN_FACTOR = 1.08;
const AVG_TOPPINGS_BYO = 2.2;

const TOPPING_WEIGHT: Record<string, number> = {
  pepperoni: 10, sausage: 6, mushroom: 6, onion: 4, greenpepper: 4, olive: 3.5, bacon: 3, jalapeno: 2.5, pineapple: 2.5, ham: 2,
  chicken: 2, spinach: 1.5, tomato: 1.5, banana: 1.5, garlic: 1.2, meatball: 1.2, freshmozz: 1, ricotta: 1, basil: 0.8, cupchar: 1.5,
};

function splitBy<K extends string>(total: number, mix: Record<K, number>, r: () => number): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(mix) as K[]) out[k] = Math.max(0, Math.round(total * mix[k] * (0.9 + r() * 0.2)));
  return out;
}

/** Ninety days of made-up sales up to yesterday, the same for everyone on a given day. */
export function buildPizzaHistory(today: string, days = 90): PizzaDay[] {
  const out: PizzaDay[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    const r = rng(seedOf('pizza' + date));
    const dow = dowOf(date);
    const ev = pizzaDayFactor(date);
    const rain = r() < (([11, 12, 1, 2, 3].includes(Number(date.slice(5, 7)))) ? 0.16 : 0.04);
    const trend = 1 + (days - i) * 0.0012;
    const orders = Math.round(DOW_ORDERS[dow] * (ev?.factor ?? 1) * (rain ? RAIN_FACTOR : 1) * trend * (0.92 + r() * 0.16));
    const pizzaCount = Math.round(orders * (1.5 + r() * 0.12) * (ev && ev.factor > 1.1 ? 1.12 : 1));
    const pizzas = splitBy(pizzaCount, SIZE_MIX, r);
    const bySpecialty: Record<string, number> = { byo: 0 };
    const toppingLb: Record<string, number> = {};
    let revenue = 0;
    let food = 0;
    for (const size of SIZES) {
      const n = pizzas[size.id];
      let left = n;
      for (const sp of SPECIALTIES) {
        const k = Math.round(n * sp.share * (0.85 + r() * 0.3));
        left -= k;
        bySpecialty[sp.id] = (bySpecialty[sp.id] ?? 0) + k;
        const cfg = configFor(sp.id, size.id);
        revenue += k * sp.prices[size.id];
        food += k * pizzaFoodCost(cfg);
        for (const [t, lb] of Object.entries(pizzaUsage(cfg))) if (TOPPING_BY_ID[t]) toppingLb[t] = (toppingLb[t] ?? 0) + lb * k;
      }
      const byo = Math.max(0, left);
      bySpecialty.byo += byo;
      revenue += byo * (size.baseCents + AVG_TOPPINGS_BYO * size.toppingCents * 1.08);
      food += byo * pizzaFoodCost(plainConfig(size.id));
      const totalW = Object.values(TOPPING_WEIGHT).reduce((a, b) => a + b, 0);
      for (const t of TOPPINGS) {
        const portions = byo * AVG_TOPPINGS_BYO * (TOPPING_WEIGHT[t.id] / totalW);
        const lb = (t.grams * size.toppingScale * portions) / 453.6;
        toppingLb[t.id] = (toppingLb[t.id] ?? 0) + lb;
        food += lb * t.costPerLbCents;
      }
    }
    const sides: Record<string, number> = {};
    for (const s of SIDES) {
      const gameBoost = s.category === 'Wings' && ev && ev.factor > 1.1 ? 1.6 : 1;
      const n = Math.round(orders * s.attach * gameBoost * (0.85 + r() * 0.3));
      sides[s.id] = n;
      revenue += n * s.cents;
      food += n * s.costCents;
    }
    const channels = splitBy(orders, CHANNEL_MIX, r);
    let deliveries = 0;
    let appFees = 0;
    for (const ch of Object.keys(channels) as Channel[]) {
      deliveries += Math.round(channels[ch] * OWN_DELIVERY[ch] * (rain ? 1.2 : 1));
      appFees += Math.round((revenue * (channels[ch] / Math.max(1, orders))) * (APP_FEE_SHARE[ch] ?? 0));
    }
    revenue = Math.round(revenue);
    const tips = Math.round(deliveries * 450 + (orders - deliveries) * 90);
    const doughUsed = { ...pizzas };
    doughUsed.M += Math.round((sides['garlic-knots'] ?? 0) * 0.5);
    // The plan made two days ahead was usually close, sometimes over on a slow night.
    const doughMade = Object.fromEntries(SIZES.map((s) => [s.id, Math.ceil((doughUsed[s.id] * (1.04 + r() * 0.1)) / 6) * 6])) as Record<SizeId, number>;
    const busy = dow === 5 || dow === 6 || (ev?.factor ?? 1) > 1.2;
    const avgDeliveryMin = Math.round(29 + (busy ? 6 : 0) + (rain ? 5 : 0) + r() * 4);
    const lateShare = Math.max(0, (avgDeliveryMin - 30) * 0.025 + r() * 0.03);
    const hourly = HOUR_WEIGHTS.map((w) => w);
    const wsum = hourly.reduce((a, b) => a + b, 0);
    out.push({
      date, dow, rain, event: ev?.name, orders, pizzas, bySpecialty, toppingLb, sides, channels, deliveries,
      revenueCents: revenue, foodCostCents: Math.round(food), appFeesCents: appFees, tipsCents: tips,
      laborHours: Math.round(34 + orders * 0.19), doughMade, doughUsed, avgDeliveryMin,
      lateDeliveries: Math.round(deliveries * lateShare),
      hourly: hourly.map((w) => Math.round((orders * w) / wsum)),
    });
  }
  return out;
}

/* ================================================================ forecast: pizzas by size for a day */

export interface PizzaForecast {
  date: string;
  pizzas: Record<SizeId, number>;
  orders: number;
  deliveries: number;
  wings: number;
  reasons: string[];
}

/**
 * Same weekday over the last six weeks, newest weighted most, with rain and big days taken out,
 * then tomorrow's own weather and event put back in, plus pre-orders already placed.
 */
export function forecastDay(history: PizzaDay[], date: string, opts: { rain?: boolean; preorderPies?: Record<SizeId, number> } = {}): PizzaForecast {
  const dow = dowOf(date);
  const same = history.filter((h) => h.dow === dow).slice(-6);
  const ev = pizzaDayFactor(date);
  const norm = (h: PizzaDay) => (pizzaDayFactor(h.date)?.factor ?? 1) * (h.rain ? RAIN_FACTOR : 1);
  let wsum = 0;
  const base: Record<SizeId, number> = { S: 0, M: 0, L: 0 };
  let orders = 0;
  let deliveries = 0;
  let wings = 0;
  same.forEach((h, i) => {
    const w = i + 1;
    wsum += w;
    const n = norm(h);
    for (const s of SIZES) base[s.id] += (h.pizzas[s.id] / n) * w;
    orders += (h.orders / n) * w;
    deliveries += (h.deliveries / n) * w;
    wings += (((h.sides['wings-buffalo'] ?? 0) + (h.sides['wings-bbq'] ?? 0)) / n) * w;
  });
  const factor = (ev?.factor ?? 1) * (opts.rain ? RAIN_FACTOR : 1);
  const reasons = [`Average of the last ${same.length} ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][dow]}, newest counted most`];
  if (ev) reasons.push(`${ev.name}: ${ev.factor > 1 ? '+' : ''}${Math.round((ev.factor - 1) * 100)}% on past years' pattern`);
  if (opts.rain) reasons.push(`Rain in the forecast: +${Math.round((RAIN_FACTOR - 1) * 100)}% orders, more of them delivery`);
  const pre = opts.preorderPies ?? { S: 0, M: 0, L: 0 };
  const preTotal = pre.S + pre.M + pre.L;
  if (preTotal) reasons.push(`${preTotal} pies already pre-ordered`);
  const pizzas = Object.fromEntries(SIZES.map((s) => [s.id, Math.round((base[s.id] / Math.max(1, wsum)) * factor) + pre[s.id]])) as Record<SizeId, number>;
  const big = ev && ev.factor > 1.1 ? 1.15 : 1;
  return {
    date, pizzas,
    orders: Math.round((orders / Math.max(1, wsum)) * factor),
    deliveries: Math.round((deliveries / Math.max(1, wsum)) * factor * (opts.rain ? 1.12 : 1)),
    wings: Math.round((wings / Math.max(1, wsum)) * factor * big),
    reasons,
  };
}

/* ================================================================ the dough plan */

export const DOUGH_BUFFER = 0.06;
/** A 60 quart mixer takes about 25 lb of flour at a time. */
export const MIXER_FLOUR_LB = 25;

export interface DoughPlan {
  forDate: string;
  balls: Record<SizeId, number>;
  /** Grams of each ingredient for the whole batch. */
  grams: Record<keyof typeof DOUGH_RECIPE, number>;
  flourLb: number;
  mixes: number;
  reasons: string[];
}

/** How many dough balls to make tonight. Dough cold-ferments 48 hours, so tonight's dough is for the day after tomorrow. */
export function doughPlan(f: PizzaForecast, garlicBreadPerOrder: number): DoughPlan {
  const balls = Object.fromEntries(SIZES.map((s) => {
    const garlic = s.id === 'M' ? Math.round(f.orders * garlicBreadPerOrder * 0.5) : 0;
    // Gluten-free pies use bought-in shells, about 1% of smalls.
    const need = (f.pizzas[s.id] + garlic) * (1 + DOUGH_BUFFER);
    return [s.id, Math.ceil(need / 6) * 6];
  })) as Record<SizeId, number>;
  const totalDough = SIZES.reduce((a, s) => a + balls[s.id] * s.doughGrams, 0);
  const flourG = (totalDough * DOUGH_RECIPE.flour) / DOUGH_TOTAL_PCT;
  const grams = Object.fromEntries(Object.entries(DOUGH_RECIPE).map(([k, pct]) => [k, Math.round((flourG * pct) / DOUGH_RECIPE.flour)])) as DoughPlan['grams'];
  const flourLb = flourG / 453.6;
  return {
    forDate: f.date, balls, grams, flourLb, mixes: Math.ceil(flourLb / MIXER_FLOUR_LB),
    reasons: [...f.reasons, `Garlic bread uses half a medium ball each`, `+${Math.round(DOUGH_BUFFER * 100)}% buffer, rounded up to a full tray of 6`],
  };
}

/* ================================================================ stock and ordering */

export interface StockLine {
  id: string;
  name: string;
  unit: string;
  supplier: string;
  onHand: number;
  /** Expected use per day over the coming week. */
  perDay: number;
  daysLeft: number;
  /** Day it is expected to run out, when that is within the coming week. */
  runsOut?: string;
  /** Days until this supplier's next delivery, counting an order placed today. */
  nextDeliveryIn: number;
  reorder: boolean;
  packs: number;
  packLabel: string;
  /** Units in one pack. */
  packSize: number;
  cents: number;
}

/** Pounds of each topping used per pizza over the last four weeks. */
export function toppingPerPizza(history: PizzaDay[]): Record<string, number> {
  const recent = history.slice(-28);
  const pies = recent.reduce((a, h) => a + h.pizzas.S + h.pizzas.M + h.pizzas.L, 0);
  const out: Record<string, number> = {};
  for (const h of recent) for (const [t, lb] of Object.entries(h.toppingLb)) out[t] = (out[t] ?? 0) + lb;
  for (const k of Object.keys(out)) out[k] /= Math.max(1, pies);
  return out;
}

/** Days from `today` until a supplier next delivers, for an order placed now. */
export function daysToDelivery(today: string, hour: number, deliveryDays: number[], cutoffHour: number): number {
  for (let i = 1; i <= 8; i++) {
    const dow = dowOf(addDays(today, i));
    if (!deliveryDays.includes(dow)) continue;
    // Past today's cutoff, tomorrow's delivery is out of reach.
    if (i === 1 && hour >= cutoffHour) continue;
    return i;
  }
  return 7;
}

/**
 * What to order and from whom. Expected use comes from the coming week's forecast and the recipe for every pizza,
 * so the order covers until the delivery after next plus two days of safety.
 */
export function stockPlan(history: PizzaDay[], week: PizzaForecast[], onHand: Record<string, number>, today: string, hour: number): StockLine[] {
  const perPie = toppingPerPizza(history);
  const days = Math.max(1, week.length);
  const pies = week.reduce((a, f) => a + f.pizzas.S + f.pizzas.M + f.pizzas.L, 0) / days;
  const piesBy = Object.fromEntries(SIZES.map((s) => [s.id, week.reduce((a, f) => a + f.pizzas[s.id], 0) / days])) as Record<SizeId, number>;
  const orders = week.reduce((a, f) => a + f.orders, 0) / days;
  const recent = history.slice(-28);
  const sideRate = (id: string) => recent.reduce((a, h) => a + (h.sides[id] ?? 0), 0) / Math.max(1, recent.reduce((a, h) => a + h.orders, 0));

  const lines: Omit<StockLine, 'daysLeft' | 'runsOut' | 'nextDeliveryIn' | 'reorder' | 'packs' | 'packSize' | 'cents'>[] = [];
  const cheeseLb = SIZES.reduce((a, s) => a + piesBy[s.id] * (s.cheeseGrams / 453.6), 0);
  const sauceLb = SIZES.reduce((a, s) => a + piesBy[s.id] * 0.85 * (s.sauceGrams / 453.6), 0);
  const doughLb = SIZES.reduce((a, s) => a + piesBy[s.id] * s.doughGrams, 0) / 453.6;
  const flourLb = (doughLb * DOUGH_RECIPE.flour) / DOUGH_TOTAL_PCT;
  const wingsPerDay = week.reduce((a, f) => a + f.wings, 0) / days;
  const perDayOf: Record<string, number> = {
    flour: flourLb * 1.05, mozz: cheeseLb, sauce: sauceLb, wings: wingsPerDay * 1.1, romaine: orders * sideRate('caesar') * 0.35,
    'box-S': piesBy.S, 'box-M': piesBy.M, 'box-L': piesBy.L, 'soda-2l': orders * sideRate('soda-2l'), 'soda-can': orders * sideRate('soda-can'),
    'gf-shell': piesBy.S * 0.05,
  };
  for (const i of INVENTORY) lines.push({ id: i.id, name: i.name, unit: i.unit, supplier: i.supplier, onHand: onHand[i.id] ?? i.onHand, perDay: perDayOf[i.id] ?? 0, packLabel: i.packLabel });
  for (const t of TOPPINGS) lines.push({ id: t.id, name: t.name, unit: 'lb', supplier: TOPPING_SUPPLIER(t), onHand: onHand[t.id] ?? TOPPING_ON_HAND[t.id] ?? 0, perDay: (perPie[t.id] ?? 0) * pies, packLabel: '' });

  return lines.map((l) => {
    const sup = PIZZA_SUPPLIERS.find((s) => s.name === l.supplier)!;
    const next = daysToDelivery(today, hour, sup.deliveryDays, sup.cutoffHour);
    const after = next + daysToDelivery(addDays(today, next), 0, sup.deliveryDays, 24);
    const daysLeft = l.perDay > 0 ? l.onHand / l.perDay : 99;
    const runsOut = daysLeft < 7 ? addDays(today, Math.floor(daysLeft)) : undefined;
    const reorder = daysLeft < next + 1;
    const inv = INVENTORY.find((i) => i.id === l.id);
    const t = TOPPING_BY_ID[l.id];
    // Toppings are bought by the pound in 5 lb packs (2 lb for herbs).
    const pack = inv?.pack ?? (t && t.grams < 20 ? 1 : 5);
    const packCents = inv?.packCents ?? Math.round(pack * (t?.costPerLbCents ?? 0));
    const want = Math.max(0, l.perDay * (after + 2) - l.onHand);
    const packs = reorder ? Math.max(1, Math.ceil(want / pack)) : 0;
    return { ...l, daysLeft, runsOut, nextDeliveryIn: next, reorder, packs, packLabel: inv?.packLabel ?? `${pack} lb`, packSize: pack, cents: packs * packCents };
  });
}

export interface DraftPO { supplier: string; lines: StockLine[]; cents: number; belowMinimum: boolean; deliversIn: number }

export function draftOrders(plan: StockLine[]): DraftPO[] {
  return PIZZA_SUPPLIERS.map((s) => {
    const lines = plan.filter((l) => l.supplier === s.name && l.reorder);
    const cents = lines.reduce((a, l) => a + l.cents, 0);
    return { supplier: s.name, lines, cents, belowMinimum: cents > 0 && cents < s.minOrderCents, deliversIn: lines[0]?.nextDeliveryIn ?? 0 };
  }).filter((p) => p.lines.length);
}

/* ================================================================ make line and oven: quote times */

export const MINUTE = 60_000;
const at = (iso: string) => new Date(iso).getTime();

export interface Quote { minutes: number; parts: { label: string; minutes: number }[] }

/**
 * How long until a new order is ready or at the door, from what is on the make line right now.
 * Two cooks share the make line; the oven takes `ovenSlots` pies at a time.
 */
export function quoteTime(active: PizzaOrder[], newPies: number, opts: { zone?: Zone['id']; cooks?: number; driversFreeInMin?: number }): Quote {
  const cooks = Math.max(1, opts.cooks ?? 2);
  const ahead = active.filter((o) => o.status === 'new' && !o.scheduled).reduce((a, o) => a + piesIn(o), 0);
  const inOven = active.filter((o) => o.status === 'oven').reduce((a, o) => a + piesIn(o), 0);
  const make = Math.ceil(((ahead + Math.max(1, newPies)) * PIZZA_SHOP.makeMinutes) / cooks);
  const ovenWait = Math.max(0, Math.ceil((inOven + ahead + newPies - PIZZA_SHOP.ovenSlots) / PIZZA_SHOP.ovenSlots)) * Math.ceil(PIZZA_SHOP.bakeMinutes / 2);
  const parts = [
    { label: ahead ? `Make line (${ahead} pies ahead)` : 'Make line', minutes: make },
    ...(ovenWait ? [{ label: 'Wait for oven space', minutes: ovenWait }] : []),
    { label: 'Bake', minutes: PIZZA_SHOP.bakeMinutes },
    { label: 'Cut and box', minutes: 2 },
  ];
  if (opts.zone) {
    const zone = ZONES.find((z) => z.id === opts.zone)!;
    const kitchen = parts.reduce((a, p) => a + p.minutes, 0);
    const wait = Math.max(0, (opts.driversFreeInMin ?? 0) - kitchen);
    if (wait) parts.push({ label: 'Wait for a driver', minutes: wait });
    parts.push({ label: 'Drive', minutes: zone.driveMinutes });
  }
  const minutes = parts.reduce((a, p) => a + p.minutes, 0);
  // Quotes go out in 5 minute steps, rounded up so the shop beats them.
  return { minutes: Math.ceil(minutes / 5) * 5, parts };
}

export function zoneFor(a: Pick<Address, 'x' | 'y'>): Zone['id'] | undefined {
  const miles = Math.hypot(a.x, a.y) * 1.25;
  return ZONES.find((z) => miles <= z.maxMiles)?.id;
}

export const roadMiles = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) * 1.25;

/** When an order should go in the oven so it is ready on time. */
export function fireAt(o: PizzaOrder): number {
  const drive = o.fulfillment === 'delivery' ? ZONES.find((z) => z.id === o.customer.zone)?.driveMinutes ?? 12 : 0;
  return at(o.promisedAt) - (drive + PIZZA_SHOP.bakeMinutes + PIZZA_SHOP.makeMinutes + 4) * MINUTE;
}

/** Minutes late (positive) or early (negative) an order is running, by its best possible finish. */
export function lateBy(o: PizzaOrder, now: number): number {
  const drive = o.fulfillment === 'delivery' ? ZONES.find((z) => z.id === o.customer.zone)?.driveMinutes ?? 12 : 0;
  const left = { new: PIZZA_SHOP.makeMinutes + PIZZA_SHOP.bakeMinutes + 2 + drive, oven: Math.max(0, PIZZA_SHOP.bakeMinutes - (now - at(o.ovenAt ?? o.createdAt)) / MINUTE) + 2 + drive, ready: drive, out: o.outAt ? Math.max(0, drive - (now - at(o.outAt)) / MINUTE) : drive, done: 0 }[o.status];
  return Math.round((now + left * MINUTE - at(o.promisedAt)) / MINUTE);
}

/* ================================================================ dispatch */

export interface DriverState {
  id: string;
  status: 'in' | 'out' | 'off';
  /** When an out driver is expected back. */
  backAt?: string;
  orderIds: string[];
  /** Tonight so far. */
  runs: number;
  miles: number;
  tipsCents: number;
}

export interface RunPlan {
  driverId: string;
  orderIds: string[];
  miles: number;
  minutes: number;
  /** When this driver can leave, in ms. */
  leaveAt: number;
  mileageCents: number;
  why: string;
}

/** The order of stops that keeps the drive shortest (nearest stop next), and how far it is there and back. */
export function route(stops: { x: number; y: number }[]): { order: number[]; miles: number } {
  const left = stops.map((_, i) => i);
  const order: number[] = [];
  let cur = { x: 0, y: 0 };
  let miles = 0;
  while (left.length) {
    left.sort((a, b) => roadMiles(cur, stops[a]) - roadMiles(cur, stops[b]));
    const next = left.shift()!;
    miles += roadMiles(cur, stops[next]);
    cur = stops[next];
    order.push(next);
  }
  miles += roadMiles(cur, { x: 0, y: 0 });
  return { order, miles };
}

const MIN_PER_MILE = 2.6;
const MIN_PER_STOP = 3;

/**
 * Groups delivery orders that are ready (or about to be) into runs and gives each to a driver.
 * Orders whose doors are close together ride together, up to three, as long as nobody's food waits past its promise.
 */
export function planRuns(orders: PizzaOrder[], drivers: DriverState[], now: number): RunPlan[] {
  const waiting = orders
    .filter((o) => o.fulfillment === 'delivery' && !o.driverId && (o.status === 'ready' || (o.status === 'oven' && at(o.ovenAt ?? o.createdAt) + PIZZA_SHOP.bakeMinutes * MINUTE - now < 4 * MINUTE)))
    .sort((a, b) => at(a.promisedAt) - at(b.promisedAt));
  const free = drivers.filter((d) => d.status !== 'off')
    .map((d) => ({ d, freeAt: d.status === 'in' ? now : Math.max(now, at(d.backAt ?? new Date(now).toISOString())) }))
    .sort((a, b) => a.freeAt - b.freeAt);
  const runs: RunPlan[] = [];
  const used = new Set<string>();
  for (const first of waiting) {
    if (used.has(first.id) || !free.length) continue;
    const group = [first];
    used.add(first.id);
    for (const o of waiting) {
      if (group.length >= 3 || used.has(o.id)) continue;
      const near = group.some((g) => roadMiles({ x: g.customer.x ?? 0, y: g.customer.y ?? 0 }, { x: o.customer.x ?? 0, y: o.customer.y ?? 0 }) <= 1.3);
      if (!near) continue;
      // Adding a stop must not make anyone already on the run late.
      const trial = [...group, o];
      const r = route(trial.map((g) => ({ x: g.customer.x ?? 0, y: g.customer.y ?? 0 })));
      const finish = now + (r.miles * MIN_PER_MILE + trial.length * MIN_PER_STOP) * MINUTE;
      if (trial.some((g) => finish > at(g.promisedAt) + 5 * MINUTE)) continue;
      group.push(o);
      used.add(o.id);
    }
    const slot = free.shift()!;
    const r = route(group.map((g) => ({ x: g.customer.x ?? 0, y: g.customer.y ?? 0 })));
    const minutes = Math.round(r.miles * MIN_PER_MILE + group.length * MIN_PER_STOP);
    runs.push({
      driverId: slot.d.id, orderIds: r.order.map((i) => group[i].id), miles: Math.round(r.miles * 10) / 10, minutes, leaveAt: slot.freeAt,
      mileageCents: Math.round(r.miles * MILEAGE_CENTS),
      why: group.length > 1 ? `${group.length} stops within about a mile of each other, ${Math.round(r.miles * 10) / 10} mi round trip` : `Due soonest; nothing else is close enough to ride along`,
    });
  }
  return runs;
}

/* ================================================================ upsells at checkout */

export interface Upsell { id: string; title: string; why: string; line: Line }

/** Suggestions for the cart, each with the numbers that back it. Shown on the website and the register. */
export function upsells(lines: Line[], history: PizzaDay[], gameDay?: string): Upsell[] {
  const out: Upsell[] = [];
  const has = (id: string) => lines.some((l) => l.kind === 'side' && l.sideId === id);
  const pies = lines.filter((l): l is PizzaLine => l.kind === 'pizza');
  if (!pies.length) return out;
  const recent = history.slice(-28);
  const orders = recent.reduce((a, h) => a + h.orders, 0) || 1;
  const rate = (id: string) => Math.round((recent.reduce((a, h) => a + (h.sides[id] ?? 0), 0) / orders) * 100);
  const small = pies.find((p) => p.config.size === 'S');
  if (small) {
    const up = { ...small.config, size: 'M' as SizeId };
    const diff = pizzaPrice(up, small.specialtyId).cents - small.unitCents;
    const area = (i: number) => Math.PI * (i / 2) ** 2;
    const more = Math.round((area(14) / area(10) - 1) * 100);
    out.push({ id: 'size-up', title: `Make it a medium for $${(diff / 100).toFixed(2)} more`, why: `A 14" has ${more}% more pizza than a 10"`, line: { ...small, config: up, unitCents: small.unitCents + diff } });
  }
  if (gameDay && !has('wings-buffalo') && !has('wings-bbq')) out.push({ id: 'wings', title: 'Add 10 Buffalo wings', why: `It's ${gameDay}. Wings go out on most game-day orders.`, line: { kind: 'side', sideId: 'wings-buffalo', qty: 1, unitCents: SIDE_BY_ID['wings-buffalo'].cents } });
  if (!has('garlic-knots')) out.push({ id: 'garlic', title: 'Add garlic bread', why: `${rate('garlic-knots')}% of orders here include it`, line: { kind: 'side', sideId: 'garlic-knots', qty: 1, unitCents: SIDE_BY_ID['garlic-knots'].cents } });
  const piesN = pies.reduce((a, p) => a + p.qty, 0);
  if (piesN >= 2 && !has('soda-2l')) out.push({ id: 'soda', title: 'Add a 2 liter soda', why: `${piesN} pizzas feeds a group`, line: { kind: 'side', sideId: 'soda-2l', qty: 1, unitCents: SIDE_BY_ID['soda-2l'].cents } });
  return out.slice(0, 3);
}

/* ================================================================ game-day packs and pre-orders */

export interface Pack { id: string; name: string; blurb: string; cents: number; lines: Line[]; feeds: string }

export const PACKS: Pack[] = [
  {
    id: 'kickoff', name: 'Kickoff Pack', feeds: 'Feeds 4 to 5', blurb: '2 large one-topping pizzas, 10 Buffalo wings, a 2 liter soda.', cents: 5499,
    lines: [
      { kind: 'pizza', config: configFor('pepperoni', 'L'), specialtyId: 'pepperoni', qty: 1, unitCents: 0 },
      { kind: 'pizza', config: configFor('cheese', 'L'), specialtyId: 'cheese', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'wings-buffalo', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'soda-2l', qty: 1, unitCents: 0 },
    ],
  },
  {
    id: 'tailgate', name: 'Tailgate Pack', feeds: 'Feeds 10 to 12', blurb: '5 large pizzas (your pick), 30 wings, garlic bread, two 2 liter sodas.', cents: 13999,
    lines: [
      { kind: 'pizza', config: configFor('pepperoni', 'L'), specialtyId: 'pepperoni', qty: 2, unitCents: 0 },
      { kind: 'pizza', config: configFor('supreme', 'L'), specialtyId: 'supreme', qty: 1, unitCents: 0 },
      { kind: 'pizza', config: configFor('cheese', 'L'), specialtyId: 'cheese', qty: 1, unitCents: 0 },
      { kind: 'pizza', config: configFor('bbq-chicken', 'L'), specialtyId: 'bbq-chicken', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'wings-buffalo', qty: 2, unitCents: 0 },
      { kind: 'side', sideId: 'wings-bbq', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'garlic-knots', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'soda-2l', qty: 2, unitCents: 0 },
    ],
  },
  {
    id: 'office', name: 'Office Lunch', feeds: 'Feeds 15 to 20', blurb: '6 large pizzas, 2 Caesar salads, 12 cans of soda. Invoice your company.', cents: 16499,
    lines: [
      { kind: 'pizza', config: configFor('pepperoni', 'L'), specialtyId: 'pepperoni', qty: 2, unitCents: 0 },
      { kind: 'pizza', config: configFor('cheese', 'L'), specialtyId: 'cheese', qty: 2, unitCents: 0 },
      { kind: 'pizza', config: configFor('veggie', 'L'), specialtyId: 'veggie', qty: 1, unitCents: 0 },
      { kind: 'pizza', config: configFor('margherita', 'L'), specialtyId: 'margherita', qty: 1, unitCents: 0 },
      { kind: 'side', sideId: 'caesar', qty: 2, unitCents: 0 },
      { kind: 'side', sideId: 'soda-can', qty: 12, unitCents: 0 },
    ],
  },
];

/** What the pack items would cost one by one, so the saving shown is real. */
export function packValue(p: Pack): number {
  return p.lines.reduce((a, l) => a + l.qty * (l.kind === 'pizza' ? pizzaPrice(l.config, l.specialtyId).cents : SIDE_BY_ID[l.sideId].cents), 0);
}

/** Spreads a pack's price across its lines in proportion to their menu prices, so reports by item still add up. */
export function packLines(p: Pack): Line[] {
  const full = packValue(p);
  let left = p.cents;
  return p.lines.map((l, i) => {
    const each = l.kind === 'pizza' ? pizzaPrice(l.config, l.specialtyId).cents : SIDE_BY_ID[l.sideId].cents;
    const share = i === p.lines.length - 1 ? left : Math.round((p.cents * each * l.qty) / full);
    left -= share;
    return { ...l, unitCents: Math.round(share / l.qty) };
  });
}

export const DEPOSIT_SHARE = 0.25;

/* ================================================================ company invoices */

/** Days a company has to pay after the lunch is delivered. */
export const INVOICE_TERMS_DAYS = 15;

/** A catering order billed to a company instead of a card: emailed with a pay link, paid on net terms. */
export interface PizzaInvoice {
  id: string;
  number: number;
  orderId?: string;
  orderNumber: number;
  company: string;
  /** Who ordered. */
  contact: string;
  /** Where the invoice and reminders are emailed. */
  email: string;
  /** The company's purchase order number, printed on the invoice. */
  po?: string;
  /** What it was for, like "Office Lunch, Thanksgiving". */
  memo: string;
  /** The day the food is delivered (YYYY-MM-DD). */
  serviceDate: string;
  issued: string;
  due: string;
  totalCents: number;
  paid: boolean;
  paidOn?: string;
  /** Dates a reminder email went out. */
  reminders: string[];
}

/** Builds the invoice for a catering order: due a set number of days after the food is delivered. */
export function invoiceFor(o: { id?: string; number: number; total: number; customer: { name: string } }, bill: { company: string; email: string; po?: string }, memo: string, serviceDate: string, issued: string, number: number): PizzaInvoice {
  return {
    id: `inv-${number}`, number, orderId: o.id, orderNumber: o.number, company: bill.company.trim(), contact: o.customer.name, email: bill.email.trim(),
    po: bill.po?.trim() || undefined, memo, serviceDate, issued, due: addDays(serviceDate, INVOICE_TERMS_DAYS), totalCents: o.total, paid: false, reminders: [],
  };
}

/** The link in the invoice email. */
export const payPath = (inv: Pick<PizzaInvoice, 'id'>) => `/pizza/demo/pay/${inv.id}`;

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** The reminder email for an unpaid invoice, firmer once it is late. */
export function reminderEmail(inv: PizzaInvoice, today: string, shop: string): { subject: string; body: string } {
  const late = inv.due < today;
  const days = Math.round((new Date(today).getTime() - new Date(inv.due).getTime()) / 86_400_000);
  const amount = `$${(inv.totalCents / 100).toFixed(2)}`;
  const first = inv.contact.split(' ')[0];
  return {
    subject: `${late ? 'Past due: ' : ''}Invoice ${inv.number} from ${shop}${inv.po ? ` (PO ${inv.po})` : ''}`,
    body: late
      ? `Hi ${first}, invoice ${inv.number} for ${amount} was due ${days} day${days === 1 ? '' : 's'} ago. You can pay it by card or bank transfer here: kneados.app${payPath(inv)}. Thanks again for ordering from ${shop}.`
      : `Hi ${first}, a friendly reminder that invoice ${inv.number} for ${amount} is due ${inv.due}. Pay by card or bank transfer here: kneados.app${payPath(inv)}.`,
  };
}


/** Pies by size in pre-orders for one day. */
export function preorderPies(orders: PizzaOrder[], date: string): Record<SizeId, number> {
  const out: Record<SizeId, number> = { S: 0, M: 0, L: 0 };
  for (const o of orders) {
    if (!o.scheduled || o.promisedAt.slice(0, 10) !== date) continue;
    for (const l of o.lines) if (l.kind === 'pizza') out[l.config.size] += l.qty;
  }
  return out;
}

/* ================================================================ money */

export const CARD_FEE = 0.029;
export const CARD_FEE_FIXED = 30;
/** Monthly fixed costs for the demo shop, in cents. */
export const FIXED_MONTHLY = { rent: 650000, utilities: 210000, insurance: 62000, software: 19900, other: 90000 };

export function pnl(days: PizzaDay[]) {
  const sum = (f: (h: PizzaDay) => number) => days.reduce((a, h) => a + f(h), 0);
  const revenue = sum((h) => h.revenueCents);
  const food = sum((h) => h.foodCostCents);
  const laborCents = Math.round(sum((h) => h.laborHours) * 2050 * 1.12);
  const appFees = sum((h) => h.appFeesCents);
  const cardFees = Math.round(revenue * 0.62 * CARD_FEE + sum((h) => h.orders) * 0.62 * CARD_FEE_FIXED);
  const mileage = Math.round(sum((h) => h.deliveries) * 3.4 * MILEAGE_CENTS);
  const fixed = Math.round((Object.values(FIXED_MONTHLY).reduce((a, b) => a + b, 0) * days.length) / 30);
  const profit = revenue - food - laborCents - appFees - cardFees - mileage - fixed;
  return { revenue, food, laborCents, appFees, cardFees, mileage, fixed, profit, foodShare: food / Math.max(1, revenue), laborShare: laborCents / Math.max(1, revenue) };
}

/* ================================================================ rewards */

export function pizzaRewardText(shop: string): string {
  return `Dough Rewards: You earned a free medium one-topping pizza at ${shop}! Show this text or say your number when you order. Reply STOP to opt out.`;
}

export const nearestAddress = (i: number) => ADDRESSES[((i % ADDRESSES.length) + ADDRESSES.length) % ADDRESSES.length];

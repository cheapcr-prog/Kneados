/**
 * The AI order taker for phone calls and text messages.
 *
 * Claude does the talking: it listens, asks, suggests and reads the order back. It never does the math.
 * Each turn it hands back the whole order as plain choices from the menu (sizes, crusts, toppings by half),
 * and this file turns that into priced ticket lines with the same price code the register uses. Money and
 * times in what it says are placeholders such as {total}, filled in here from the real numbers.
 * The stolen card and prank order rules are checked here too, so a reply can never talk its way past them.
 */
import { formatPhone, money } from '../lib/money';
import { DEFAULT_FRAUD, type FraudSettings } from '../lib/fraud';
import {
  ADDRESSES, CHEESES, CRUSTS, PIZZA_SHOP, SAUCES, SIDES, SIDE_BY_ID, SIZES, SPECIALTIES, SPECIALTY_BY_ID, TOPPINGS, TOPPING_BY_ID, ZONES,
  type Address, type CheeseId, type CrustId, type PizzaConfig, type SauceId, type Side, type SizeId,
} from './data';
import { NOTE_GROUPS, configFor, pizzaDetails, pizzaPrice, pizzaTitle, plainConfig, totals, zoneFor, type Line, type PizzaLine, type PizzaOrder, type Totals } from './logic';

export type Surface = 'call' | 'text';

/* ================================================================ what Claude hands back each turn */

export interface BotTopping { topping: string; side: Side; extra: boolean }

export interface BotItem {
  kind: 'pizza' | 'side';
  /** A specialty id, "byo" for build your own, or "" for a side. */
  specialty: string;
  size: SizeId | '';
  /** "" means the usual for this pizza. */
  crust: CrustId | '';
  sauce: SauceId | '';
  cheese: CheeseId | '';
  /** Toppings added on top of the specialty (or every topping on a build your own), by half. */
  add: BotTopping[];
  /** Specialty toppings the caller does not want. */
  remove: string[];
  notes: string[];
  /** A side or drink id. */
  side: string;
  qty: number;
}

export type Payment = 'pay_at_pickup' | 'pay_link' | 'cash_at_door' | '';

export interface BotOrder {
  items: BotItem[];
  fulfillment: 'pickup' | 'delivery' | '';
  name: string;
  /** The delivery address as the caller said it. */
  address: string;
  payment: Payment;
  /** What the kitchen or driver needs that the menu cannot carry: soda flavors, wing dip, "side door". */
  note: string;
}

export type BotAction = 'continue' | 'place_order' | 'transfer' | 'end';

export interface BotTurn {
  /** What the AI says (or texts). May hold placeholders like {total}. */
  say: string;
  order: BotOrder;
  action: BotAction;
}

export const EMPTY_ORDER: BotOrder = { items: [], fulfillment: '', name: '', address: '', payment: '', note: '' };

const NOTES = NOTE_GROUPS.flatMap((g) => g.options);

/** The JSON shape Claude must answer in. Every choice is a list of real menu ids, so it cannot invent an item. */
export const TURN_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'What to say to the customer next. Use placeholders for every price and time.' },
    order: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['pizza', 'side'] },
              specialty: { type: 'string', enum: [...SPECIALTIES.map((s) => s.id), 'byo', ''] },
              size: { type: 'string', enum: ['S', 'M', 'L', ''] },
              crust: { type: 'string', enum: [...CRUSTS.map((c) => c.id), ''] },
              sauce: { type: 'string', enum: [...SAUCES.map((s) => s.id), ''] },
              cheese: { type: 'string', enum: [...CHEESES.map((c) => c.id), ''] },
              add: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    topping: { type: 'string', enum: TOPPINGS.map((t) => t.id) },
                    side: { type: 'string', enum: ['whole', 'left', 'right'] },
                    extra: { type: 'boolean' },
                  },
                  required: ['topping', 'side', 'extra'],
                  additionalProperties: false,
                },
              },
              remove: { type: 'array', items: { type: 'string', enum: TOPPINGS.map((t) => t.id) } },
              notes: { type: 'array', items: { type: 'string', enum: NOTES } },
              side: { type: 'string', enum: [...SIDES.map((s) => s.id), ''] },
              qty: { type: 'integer' },
            },
            required: ['kind', 'specialty', 'size', 'crust', 'sauce', 'cheese', 'add', 'remove', 'notes', 'side', 'qty'],
            additionalProperties: false,
          },
        },
        fulfillment: { type: 'string', enum: ['pickup', 'delivery', ''] },
        name: { type: 'string' },
        address: { type: 'string' },
        payment: { type: 'string', enum: ['pay_at_pickup', 'pay_link', 'cash_at_door', ''] },
        note: { type: 'string', description: 'Short note for the kitchen or driver: soda flavors, wing dip, gate code. Empty when there is none.' },
      },
      required: ['items', 'fulfillment', 'name', 'address', 'payment', 'note'],
      additionalProperties: false,
    },
    action: { type: 'string', enum: ['continue', 'place_order', 'transfer', 'end'] },
  },
  required: ['say', 'order', 'action'],
  additionalProperties: false,
} as const;

/* ================================================================ the menu, written out for Claude */

/** The full menu with ids, written the same way every time so it can be cached. Prices are only for answering "how much is a large?". */
export function menuText(): string {
  const sizes = SIZES.map((s) => `${s.id} = ${s.label} ${s.inches}" (${s.slices} slices)`).join('; ');
  const pies = SPECIALTIES.map((s) => `- ${s.id}: ${s.name}. ${s.blurb} Toppings: ${s.toppings.join(', ') || 'none'}. Sauce ${s.sauce}, cheese ${s.cheese}. S ${money(s.prices.S)}, M ${money(s.prices.M)}, L ${money(s.prices.L)}.`).join('\n');
  const byo = `- byo: Build your own. Cheese pizza S ${money(SIZES[0].baseCents)}, M ${money(SIZES[1].baseCents)}, L ${money(SIZES[2].baseCents)}. Each topping on the whole pie S/M/L ${SIZES.map((s) => money(s.toppingCents)).join('/')}, premium ${SIZES.map((s) => money(s.premiumCents)).join('/')}. A topping on one half is half price.`;
  const crusts = CRUSTS.map((c) => `${c.id} = ${c.label} (${c.note}${c.extraCents ? `, +${money(c.extraCents)}` : ''}; sizes ${c.sizes.join('/')})`).join('; ');
  const sauces = SAUCES.map((s) => `${s.id} = ${s.label}${s.extraCents ? ` (+${money(s.extraCents)})` : ''}`).join('; ');
  const cheeses = CHEESES.map((c) => `${c.id} = ${c.label}`).join('; ');
  const tops = TOPPINGS.map((t) => `${t.id} = ${t.name}${t.premium ? ' (premium)' : ''}`).join('; ');
  const sides = SIDES.map((s) => `- ${s.id}: ${s.name}, ${money(s.cents)}. ${s.blurb}`).join('\n');
  const zones = ZONES.map((z) => `${z.label}: ${money(z.feeCents)} delivery fee`).join('; ');
  return [
    `Shop: ${PIZZA_SHOP.name}, ${PIZZA_SHOP.address}. ${PIZZA_SHOP.hours}. Phone ${PIZZA_SHOP.phone}.`,
    `Sizes: ${sizes}.`,
    `Pizzas:\n${pies}\n${byo}`,
    `Crusts: ${crusts}.`,
    `Sauces: ${sauces}.`,
    `Cheese: ${cheeses}.`,
    `Toppings: ${tops}.`,
    `Bake and cut notes: ${NOTES.join(', ')}.`,
    `Wings, sides and drinks:\n${sides}`,
    `Delivery: ${zones}. Over 5 miles is too far.`,
  ].join('\n\n');
}

/* ================================================================ turning Claude's order into ticket lines */

export interface Built {
  lines: Line[];
  /** Things that are not possible as asked. Read to Claude on the next turn, and shown on screen. */
  problems: string[];
}

const clampQty = (n: number) => Math.max(1, Math.min(20, Math.round(Number(n) || 1)));

/** Builds priced ticket lines from Claude's order. Anything off the menu, sold out or not possible is left off and named. */
export function buildLines(items: readonly BotItem[], out: readonly string[] = []): Built {
  const lines: Line[] = [];
  const problems: string[] = [];
  for (const it of items) {
    if (it.kind === 'side') {
      const s = SIDE_BY_ID[it.side];
      if (!s) continue;
      if (out.includes(s.id)) { problems.push(`${s.name} is sold out tonight`); continue; }
      lines.push({ kind: 'side', sideId: s.id, qty: clampQty(it.qty), unitCents: s.cents });
      continue;
    }
    const sp = it.specialty && it.specialty !== 'byo' ? SPECIALTY_BY_ID[it.specialty] : undefined;
    const name = sp ? sp.name : 'build your own pizza';
    if (!it.size) { problems.push(`Size still needed for the ${name}`); continue; }
    const config: PizzaConfig = sp ? configFor(sp.id, it.size) : plainConfig(it.size);
    if (it.crust) {
      const crust = CRUSTS.find((c) => c.id === it.crust)!;
      if (!crust.sizes.includes(it.size)) {
        problems.push(`${crust.label} only comes in ${crust.sizes.map((s) => SIZES.find((x) => x.id === s)!.label.toLowerCase()).join(' or ')}`);
      } else config.crust = crust.id;
    }
    if (it.sauce) config.sauce = it.sauce;
    if (it.cheese) config.cheese = it.cheese;
    for (const id of it.remove) delete config.toppings[id];
    const extra: string[] = [];
    for (const t of it.add) {
      const top = TOPPING_BY_ID[t.topping];
      if (!top) continue;
      if (out.includes(top.id)) { problems.push(`${top.name} is out tonight`); continue; }
      // A specialty topping asked for on one half only moves to that half.
      config.toppings[top.id] = t.side;
      if (t.extra) extra.push(top.id);
    }
    // A specialty topping that is out: the pizza still goes, without it, and the caller is told.
    if (sp) for (const id of sp.toppings) if (out.includes(id) && config.toppings[id]) { delete config.toppings[id]; problems.push(`${TOPPING_BY_ID[id].name} is out tonight, so the ${sp.name} comes without it`); }
    if (extra.length) config.extra = extra;
    const notes = it.notes.filter((n) => NOTES.includes(n) && !(config.sauce === 'none' && NOTE_GROUPS.find((g) => g.needsSauce)!.options.includes(n)));
    // Only one note from each group.
    const kept = NOTE_GROUPS.flatMap((g) => notes.filter((n) => g.options.includes(n)).slice(0, 1));
    if (kept.length) config.notes = kept;
    lines.push({ kind: 'pizza', config, ...(sp ? { specialtyId: sp.id } : {}), qty: clampQty(it.qty), unitCents: pizzaPrice(config, sp?.id).cents });
  }
  return { lines, problems };
}

/** A ticket line as words, for the AI and the screen. */
export function lineText(l: Line): string {
  if (l.kind === 'side') return `${l.qty > 1 ? `${l.qty} x ` : ''}${SIDE_BY_ID[l.sideId].name}`;
  const details = pizzaDetails(l.config, l.specialtyId);
  return `${l.qty > 1 ? `${l.qty} x ` : ''}${pizzaTitle(l as PizzaLine)}${details.length ? ` (${details.join(', ')})` : ''}`;
}

/* ================================================================ addresses */

const norm = (s: string) => s.toLowerCase().replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|highway|hwy)\b/g, (w) => ({ street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr', road: 'rd', highway: 'hwy' } as Record<string, string>)[w] ?? w).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finds the delivery address the caller said. The demo knows a list of example Long Beach streets;
 * a live shop looks the address up with a maps service instead.
 */
/** Addresses checked against the real address file this visit: what was said, and where it is (null when no such address exists). */
const LOOKED_UP = new Map<string, Address | null>();
/** Saves the answer of a real address lookup, so the ticket can price the delivery. */
export function rememberAddress(said: string, found: Address | null) { LOOKED_UP.set(norm(said), found); }
/** True when this address still has to be looked up: it is not one the shop knows and has not been checked yet. */
export function needsLookup(said: string): boolean {
  const s = norm(said);
  return !!s && /\d/.test(s) && !LOOKED_UP.has(s) && !matchAddress(said);
}

export function matchAddress(said: string): Address | undefined {
  const s = norm(said);
  if (!s) return undefined;
  const exact = ADDRESSES.find((a) => s.includes(norm(a.line)));
  if (exact) return exact;
  if (LOOKED_UP.has(s)) return LOOKED_UP.get(s) ?? undefined;
  // The street alone ("Termino", "4th street"), or the same house said another way ("1180 east 4th street").
  // A different house number on a known street is never swapped for the one we know.
  const words = s.split(' ');
  const numbers = words.filter((w) => /^\d+$/.test(w));
  return ADDRESSES.find((a) => {
    const [house, ...rest] = norm(a.line).split(' ');
    const street = rest.filter((w) => !['e', 'w', 'n', 's', 'st', 'ave', 'blvd', 'dr', 'rd', 'hwy'].includes(w));
    return street.length > 0 && street.every((w) => words.includes(w)) && (numbers.length === 0 || numbers.includes(house));
  });
}

/* ================================================================ who is calling */

export interface Caller {
  /** Ten digits, or "" when the number is hidden. */
  phone: string;
  known: boolean;
  name?: string;
  address?: string;
  /** Their last order, as ticket lines, so "the usual" can be put back on the ticket in one step. */
  lastLines?: Line[];
  lastFulfillment?: 'pickup' | 'delivery';
  orders?: number;
  punches?: number;
  freePizza?: number;
  favorite?: string;
}

/** Ticket lines back into the shape Claude edits, so "my usual" lands on the ticket exactly. */
export function linesToItems(lines: readonly Line[]): BotItem[] {
  return lines.map((l) => {
    if (l.kind === 'side') return { kind: 'side', specialty: '', size: '', crust: '', sauce: '', cheese: '', add: [], remove: [], notes: [], side: l.sideId, qty: l.qty };
    const sp = l.specialtyId ? SPECIALTY_BY_ID[l.specialtyId] : undefined;
    const c = l.config;
    const add: BotTopping[] = Object.entries(c.toppings)
      .filter(([id, side]) => !sp || !sp.toppings.includes(id) || side !== 'whole' || c.extra?.includes(id))
      .map(([id, side]) => ({ topping: id, side, extra: !!c.extra?.includes(id) }));
    return {
      kind: 'pizza', specialty: sp?.id ?? 'byo', size: c.size, crust: c.crust === 'hand' ? '' : c.crust,
      sauce: c.sauce === (sp?.sauce ?? 'red') ? '' : c.sauce, cheese: c.cheese === (sp?.cheese ?? 'regular') ? '' : c.cheese,
      add, remove: sp ? sp.toppings.filter((t) => !c.toppings[t]) : [], notes: c.notes ?? [], side: '', qty: l.qty,
    };
  });
}

/* ================================================================ the rules every phone and text order follows */

export interface Policy {
  /** Ways this order may be paid. */
  payments: Payment[];
  /** Delivery is not offered (hidden number, or the address is not in the delivery area). */
  noDelivery?: string;
  /** Photo ID that matches the name on the card at handoff. */
  idCheck: boolean;
  /** The bank is asked to confirm the pay link payment (3D Secure). */
  bankConfirm: boolean;
  /** Too big for the AI: a manager takes it. */
  transfer?: string;
  /** Plain reasons, read to Claude so it can explain them kindly. */
  reasons: string[];
}

export const TRANSFER_OVER_CENTS = 25000;
export const TRANSFER_OVER_PIES = 12;

/**
 * The order rules. Prank deliveries and stolen cards are the two ways a phone order costs a pizza shop money:
 * - A hidden number cannot get delivery or a pay link: pickup, paid at the counter.
 * - The AI never takes a card number by voice or text. Cards are paid on a secure pay link.
 * - A first delivery from a new number at or above the shop's "big first order" amount is paid on the link before it is made, not cash at the door.
 * - A pay link order at or above the ID check amount has the name on the card checked against photo ID at handoff.
 * - Very big orders go to a manager.
 */
export function orderPolicy(o: { totalCents: number; pies: number; fulfillment: BotOrder['fulfillment']; caller: Caller; addressFound: boolean; addressSaid: boolean; payLinks?: boolean }, s: FraudSettings = DEFAULT_FRAUD): Policy {
  const reasons: string[] = [];
  const hidden = !o.caller.phone;
  let noDelivery: string | undefined;
  if (hidden) { noDelivery = 'The number is hidden, so this order is pickup only and paid at the counter.'; reasons.push(noDelivery); }
  else if (o.fulfillment === 'delivery' && o.addressSaid && !o.addressFound) { noDelivery = 'That address could not be found in the delivery area. Offer pickup or a different address.'; reasons.push(noDelivery); }
  let payments: Payment[];
  if (hidden) payments = ['pay_at_pickup'];
  else if (o.fulfillment === 'delivery') {
    const bigNew = !o.caller.known && s.bigFirstOrderCents > 0 && o.totalCents >= s.bigFirstOrderCents;
    payments = bigNew ? ['pay_link'] : ['pay_link', 'cash_at_door'];
    if (bigNew) reasons.push(`First order from this number and over ${money(s.bigFirstOrderCents)}: delivery is paid on the secure pay link before it is made, not cash at the door.`);
  } else payments = ['pay_at_pickup', 'pay_link'];
  // A line that cannot text a pay link only offers the ways to pay that need none. An order that must be prepaid goes to the manager.
  let needsLink = false;
  if (o.payLinks === false) { needsLink = payments.length === 1 && payments[0] === 'pay_link'; payments = payments.filter((p) => p !== 'pay_link'); }
  const idCheck = payments.includes('pay_link') && s.idCheckOverCents > 0 && o.totalCents >= s.idCheckOverCents;
  if (idCheck) reasons.push(`If they pay on the link, ${o.fulfillment === 'delivery' ? 'the driver' : 'the counter'} checks photo ID against the name on the card (orders over ${money(s.idCheckOverCents)}).`);
  const bankConfirm = s.threeDSOverCents > 0 && o.totalCents >= s.threeDSOverCents;
  let transfer: string | undefined;
  if (o.totalCents >= TRANSFER_OVER_CENTS || o.pies > TRANSFER_OVER_PIES) { transfer = `Orders over ${money(TRANSFER_OVER_CENTS)} or ${TRANSFER_OVER_PIES} pizzas go to the manager on duty (catering pricing and timing).`; reasons.push(transfer); }
  if (needsLink && !transfer) { transfer = 'A first delivery this size is paid ahead by card, and this phone line cannot text a pay link yet, so the manager on duty takes it.'; reasons.push(transfer); }
  return { payments, noDelivery, idCheck, bankConfirm, transfer, reasons };
}

/* ================================================================ one turn, worked out */

export interface Ticket {
  lines: Line[];
  problems: string[];
  totals: Totals;
  zone?: 'A' | 'B' | 'C';
  address?: Address;
  quoteMinutes: number;
  policy: Policy;
}

export interface ShopNow {
  /** The honest wait, in minutes, for an order with this many pizzas: from tonight's make line, oven and drivers. */
  quote: (pies: number, zone?: 'A' | 'B' | 'C') => number;
  out: string[];
  open: boolean;
  fraud: FraudSettings;
  /** False on a line that cannot text a pay link yet (a real phone number before its texting is registered). */
  payLinks?: boolean;
}

export function ticketFor(order: BotOrder, caller: Caller, shop: ShopNow): Ticket {
  const { lines, problems } = buildLines(order.items, shop.out);
  const address = order.fulfillment === 'delivery' ? matchAddress(order.address) : undefined;
  const zone = address ? zoneFor(address) : undefined;
  const t = totals(lines, { zone: order.fulfillment === 'delivery' ? zone : undefined });
  const pies = lines.reduce((a, l) => a + (l.kind === 'pizza' ? l.qty : 0), 0);
  const quoteMinutes = shop.quote(Math.max(1, pies), order.fulfillment === 'delivery' ? zone ?? 'B' : undefined);
  const policy = orderPolicy({ totalCents: t.total, pies, fulfillment: order.fulfillment, caller, addressFound: !!zone, addressSaid: !!order.address.trim(), payLinks: shop.payLinks }, shop.fraud);
  return { lines, problems, totals: t, zone, address, quoteMinutes, policy };
}

export type NeedCode = 'transfer' | 'items' | 'problem' | 'fulfillment' | 'address' | 'name' | 'payment' | 'payment_not_allowed';

export interface Need {
  /** Which thing is open, so code never has to read the wording. */
  code: NeedCode;
  /** What is still open, in plain words. Claude reads it and the ticket shows it. */
  note: string;
  /** For the customer, when KneadOS has to ask itself because the AI tried to send the order too early. */
  ask: string;
}

const PAY_WORDS: Record<Exclude<Payment, ''>, string> = { pay_at_pickup: 'pay at the counter', pay_link: 'a secure pay link by text', cash_at_door: 'cash at the door' };
export const payWords = (p: Payment) => (p ? PAY_WORDS[p] : '');
/** What the customer taps to answer "how would you like to pay?". */
export const PAY_REPLY: Record<Exclude<Payment, ''>, string> = { pay_link: 'Text me a card link', cash_at_door: 'Cash at the door', pay_at_pickup: 'Pay at the counter' };

/** What is still missing before this order can go to the make line. Empty means it can be placed. */
export function missing(order: BotOrder, ticket: Ticket, surface: Surface): Need[] {
  const m: Need[] = [];
  const options = ticket.policy.payments.map(payWords).join(' or ');
  if (ticket.policy.transfer) m.push({ code: 'transfer', note: ticket.policy.transfer, ask: /pay link/.test(ticket.policy.transfer) ? 'Our manager finishes a first delivery this size. Let me get them for you.' : 'An order this size goes to our manager so you get catering pricing. Let me get them for you.' });
  if (!ticket.lines.length) m.push({ code: 'items', note: 'Nothing is on the order yet.', ask: 'What can I get started for you?' });
  for (const p of ticket.problems) m.push({ code: 'problem', note: p, ask: `One thing: ${p[0].toLowerCase()}${p.slice(1)}. What would you like instead?` });
  if (!order.fulfillment) m.push({ code: 'fulfillment', note: 'Pickup or delivery is not known yet.', ask: 'Is this for pickup or delivery?' });
  if (order.fulfillment === 'delivery' && ticket.policy.noDelivery) {
    const far = ticket.address && !ticket.zone;
    m.push({
      code: 'address',
      note: far ? `${ticket.address!.line} is past the delivery area (over ${ZONES[ZONES.length - 1].maxMiles} miles). Offer pickup or a different address.` : ticket.policy.noDelivery,
      ask: caller_hidden(ticket) ? 'With the number hidden I can only set this up for pickup. Does pickup work?'
        : far ? `Sorry, ${ticket.address!.line} is past our delivery area. Would you like to switch to pickup or use a different address?`
          : `Sorry, I couldn't find ${order.address.trim().slice(0, 60)} in our delivery area. Would you like to switch to pickup or give me a different address?`,
    });
  }
  else if (order.fulfillment === 'delivery' && !ticket.zone) m.push({ code: 'address', note: 'A delivery address inside the delivery area is needed.', ask: "What's the delivery address?" });
  if (!order.name.trim() && surface === 'call') m.push({ code: 'name', note: 'A name for the order is needed.', ask: 'What name should I put on the order?' });
  if (order.fulfillment && !order.payment) m.push({ code: 'payment', note: `How they will pay: ${options}.`, ask: `How would you like to pay: ${options}?` });
  else if (order.payment && !ticket.policy.payments.includes(order.payment)) m.push({ code: 'payment_not_allowed', note: `This order cannot be paid with ${payWords(order.payment)}. It can be ${options}.`, ask: ticket.policy.payments.length === 1 && ticket.policy.payments[0] === 'pay_link' ? "That's on the order. Since it's a first order this size, delivery is paid ahead on a secure link I text you, instead of cash at the door. Is that OK?" : `That's on the order. For this one we can do ${options}. Which works for you?` });
  return m;
}

/**
 * One question per turn. If the AI stacks two ("Is that the right address? And how would you like to pay?"),
 * a plain "yes" cannot be understood, so everything after the first question is held for the next turn.
 */
export function oneQuestion(say: string): string {
  const first = say.indexOf('?');
  if (first < 0 || say.indexOf('?', first + 1) < 0) return say;
  return say.slice(0, first + 1).trim();
}

/**
 * The AI asked for a name the order does not need (a text order, or a caller the shop already knows):
 * the question is swapped for the next thing that really is open.
 */
export function skipNameQuestion(say: string, open: Need[]): string {
  const q = say.lastIndexOf('?');
  if (q < 0 || open.some((n) => n.code === 'name') || !open.length) return say;
  const start = Math.max(say.lastIndexOf('.', q), say.lastIndexOf('!', q), say.lastIndexOf('\n', q)) + 1;
  if (!/\bname\b/i.test(say.slice(start, q + 1))) return say;
  return `${say.slice(0, start).trim()} ${open[0].ask}`.trim();
}

/** What the customer taps when an address cannot be delivered to. */
export const ADDRESS_REPLY = ['Switch to pickup', 'Different address'] as const;

const MACHINERY = /\b(the|our|my) (system|computer|software|database)\b|\bkneados\b|\bsnapshot\b/i;
/** Customers hear a person taking their order, never the machinery: any sentence about "the system" is dropped. */
export function hideMachinery(say: string): string {
  if (!MACHINERY.test(say)) return say;
  const kept = (say.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [say]).filter((part) => !MACHINERY.test(part)).join('').trim();
  return kept || 'Got it.';
}

const WRONG_FOR: Record<'pickup' | 'delivery', RegExp> = {
  delivery: /\b(at|when you|if you) (the )?(pick ?up|counter|come)|pay at pickup|pick pay/i,
  pickup: /at (the|your) door/i,
};
/** True when what the AI said offers a way to pay that does not fit this order (paying at the counter on a delivery, cash at the door on a pickup). */
export function offersWrongPayment(say: string, order: BotOrder): boolean {
  return !!order.fulfillment && /\b(pay|cash|card)\b/i.test(say) && WRONG_FOR[order.fulfillment].test(say);
}

/**
 * The tap-able answers shown under the AI's last message, so the customer does not have to type the obvious ones.
 * Worked out from the question that was asked and the order's own rules, never from a list the AI wrote.
 */
export function quickReplies(lastAi: string, order: BotOrder, ticket: Ticket): string[] {
  const q = lastAi.lastIndexOf('?');
  if (q < 0) return [];
  const text = lastAi.slice(0, q + 1);
  const sentence = text.slice(Math.max(text.lastIndexOf('.', q), text.lastIndexOf('!', q), text.lastIndexOf('\n', q)) + 1).trim();
  if (order.fulfillment === 'delivery' && ticket.policy.noDelivery && /pick ?up/i.test(sentence)) return ticket.address || order.address.trim() ? (ticket.policy.payments[0] === 'pay_at_pickup' && ticket.policy.payments.length === 1 ? [ADDRESS_REPLY[0]] : [...ADDRESS_REPLY]) : [];
  if (!order.payment && order.fulfillment && /\b(pay|cash|card|link)\b/i.test(sentence)) {
    if (ticket.policy.payments.length > 1) return ticket.policy.payments.map((p) => PAY_REPLY[p as Exclude<Payment, ''>]);
    if (ticket.policy.payments[0] === 'pay_link') return ['Yes, text me the link', 'No'];
  }
  if (!order.fulfillment && /pick ?up/i.test(sentence) && /deliver/i.test(sentence)) return ticket.policy.noDelivery ? ['Pickup'] : ['Pickup', 'Delivery'];
  if (/^(and |so |ok(ay)?,? )?(is|does|do|did|want|would|should|can|could|ok|okay|are|shall|sound|will|deliver(y|ed)? to|still)\b/i.test(sentence) || /\b(right|correct|ok|okay|sound good|work for you)\?$/i.test(sentence)) return ['Yes', 'No'];
  return [];
}

const caller_hidden = (t: Ticket) => t.policy.payments.length === 1 && t.policy.payments[0] === 'pay_at_pickup' && !!t.policy.noDelivery;

/** Fills the placeholders in what the AI says with the real numbers. */
export function fill(say: string, ticket: Ticket, extra: { number?: number; now?: number } = {}): string {
  const at = new Date((extra.now ?? Date.now()) + ticket.quoteMinutes * 60_000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PIZZA_SHOP.timezone });
  const values: Record<string, string> = {
    total: money(ticket.totals.total),
    subtotal: money(ticket.totals.subtotal),
    tax: money(ticket.totals.tax),
    fee: money(ticket.totals.deliveryFee),
    minutes: String(ticket.quoteMinutes),
    time: at,
    number: extra.number ? String(extra.number) : '',
  };
  return say.replace(/\{(total|subtotal|tax|fee|minutes|time|number)\}/g, (_, k: string) => values[k] || '');
}

/* ================================================================ the AI's turn, checked */

export interface Settled {
  /** What the customer hears or reads, with the real numbers filled in. */
  say: string;
  /** The order as it stands after this turn. */
  order: BotOrder;
  ticket: Ticket;
  /** "place" means the order is complete and inside the rules: send it to the make line, then say `placedSay(number)`. */
  outcome: 'continue' | 'place' | 'transfer' | 'end';
  /** What to say once the order has its number. */
  placedSay: (number: number) => string;
}

/**
 * Takes what the AI wants to say and do, prices the order, checks every rule, and decides what really happens.
 * The web demo and the real phone line both run this, so an order is held to the same rules wherever it comes from.
 */
export function settle(turn: BotTurn, before: BotOrder, caller: Caller, shop: ShopNow, surface: Surface): Settled {
  let order = turn.order;
  let t = ticketFor(order, caller, shop);
  // Only one way to pay fits this order and it needs nothing from the customer: it is set without asking.
  if (order.fulfillment && !order.payment && t.policy.payments.length === 1 && t.policy.payments[0] !== 'pay_link' && !(order.fulfillment === 'delivery' && t.policy.noDelivery)) {
    order = { ...order, payment: t.policy.payments[0] };
    t = ticketFor(order, caller, shop);
  }
  const open = missing(order, t, surface);
  let say = hideMachinery(fill(turn.say, t));
  let outcome: Settled['outcome'] = 'continue';
  if (t.policy.transfer || turn.action === 'transfer') {
    // Too big for the AI, or the customer asked for a person: a manager picks it up with everything so far.
    if (t.policy.transfer && turn.action !== 'transfer') say = open[0].ask;
    outcome = 'transfer';
  } else if (turn.action === 'place_order') {
    // The AI may only send an order that is complete and inside the shop's rules. Otherwise KneadOS asks for what is missing.
    if (open.length) say = open[0].ask; else outcome = 'place';
  } else if (turn.action === 'end') outcome = 'end';
  else {
    const pay = open.find((n) => n.code === 'payment_not_allowed');
    const address = open.find((n) => n.code === 'address');
    const ask = open.find((n) => n.code === 'payment');
    // The customer picked a way to pay that this order cannot use (the total may have just crossed a limit): KneadOS says so right away.
    if (pay) { say = pay.ask; order = { ...order, payment: '' }; }
    // The address was checked the moment it was given. If we cannot deliver there, KneadOS says so now, before any read-back or total.
    else if (address && t.policy.noDelivery && order.address.trim() && (order.address.trim() !== before.address.trim() || before.fulfillment !== 'delivery')) say = address.ask;
    // No total or delivery fee is quoted until the delivery address is settled.
    else if (address && /\{(total|fee)\}/.test(turn.say)) say = address.ask;
    // The AI offered a way to pay that does not fit this order (the counter on a delivery): KneadOS asks with the right ones.
    else if (ask && !t.policy.noDelivery && offersWrongPayment(say, order)) say = ask.ask;
    // One question at a time, so a plain "yes" always has one meaning.
    else say = skipNameQuestion(oneQuestion(say), open);
  }
  return { say, order, ticket: t, outcome, placedSay: (number) => hideMachinery(fill(turn.say, t, { number })) };
}

/* ================================================================ "where's my order?" */

/** True when the customer is asking about an order they already placed, not starting a new one. */
export function asksStatus(said: string): boolean {
  const s = said.toLowerCase().replace(/[’']/g, '');
  return /\b(status|track(ing)?|eta)\b/.test(s)
    || /\bwhere(s| is| are)?\b.*\b(order|pizzas?|food|delivery|driver)\b/.test(s)
    || /\b(is|are) (it|my (order|pizzas?|food)) .*\b(ready|done|on (the|its) way|out|coming)\b/.test(s)
    || /\b(how (much )?long(er)?|when)\b.*\b(order|pizzas?|food|delivery|here|ready|arrive)\b/.test(s)
    || /\b(check|checking) (on )?(my|the|an) order\b/.test(s);
}

/** The order status a customer gets back, read straight from the make line and dispatch. No AI writes it. */
export function statusReply(o: Pick<PizzaOrder, 'number' | 'status' | 'fulfillment' | 'promisedAt' | 'doneAt' | 'customer'>, now: number, driverName?: string): string {
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PIZZA_SHOP.timezone });
  const left = Math.ceil((Date.parse(o.promisedAt) - now) / 60_000);
  const delivery = o.fulfillment === 'delivery';
  const by = left > 0
    ? `${delivery ? 'It should be at your door' : 'It should be ready'} by about ${clock(o.promisedAt)}, ${left} minute${left === 1 ? '' : 's'} from now.`
    : `We told you ${clock(o.promisedAt)} and it is running a few minutes behind. Sorry about that, it is next up.`;
  const head = `Order #${o.number}`;
  if (o.status === 'done') return `${head} was ${delivery ? 'delivered' : 'picked up'}${o.doneAt ? ` at ${clock(o.doneAt)}` : ''}. If something is wrong with it, reply HELP and a manager will text you.`;
  if (o.status === 'out') return `${head} is on the way${driverName ? ` with ${driverName}` : ''}${o.customer.address ? ` to ${o.customer.address}` : ''}. ${left > 0 ? `About ${left} minute${left === 1 ? '' : 's'} out.` : 'It should be there any minute.'} Track it: kneados.app/t/${o.number}`;
  if (o.status === 'ready') return delivery ? `${head} is out of the oven, boxed and waiting for the next driver. ${by}` : `${head} is hot and ready at the counter.`;
  if (o.status === 'oven') return `${head} is in the oven now. ${by}`;
  return `${head} is on the make line. ${by}`;
}

/* ================================================================ what goes to Claude */

export interface TranscriptLine { who: 'customer' | 'ai' | 'shop'; text: string }

export interface TurnContext {
  surface: Surface;
  localTime: string;
  shop: { open: boolean; pickupMinutes: number; deliveryMinutes: number; soldOut: string[] };
  caller: {
    number: string;
    known: boolean;
    name?: string;
    savedAddress?: string;
    lastOrder?: string;
    lastOrderItems?: BotItem[];
    orders?: number;
    rewards?: string;
    favorite?: string;
  };
  /** The order as the AI left it last turn, worked out with real prices. */
  order: BotOrder;
  ticket: { lines: string[]; subtotal: string; deliveryFee: string; total: string; readyInMinutes: number; deliveryZone?: string; addressFound?: string; problems: string[]; stillNeeded: string[] };
  rules: {
    allowedPayments: Payment[];
    /** The ways to pay for each kind of order, so the right ones are offered even when pickup or delivery is settled in this same turn. */
    paymentsIfPickup: { id: Payment; say: string }[];
    paymentsIfDelivery: { id: Payment; say: string }[];
    idCheck: boolean; bankConfirms: boolean; notes: string[];
  };
  suggestions: string[];
}

export function turnContext(surface: Surface, caller: Caller, order: BotOrder, ticket: Ticket, shop: ShopNow, suggestions: string[], now = new Date()): TurnContext {
  const waysFor = (fulfillment: 'pickup' | 'delivery') => {
    const t = order.fulfillment === fulfillment ? ticket : ticketFor({ ...order, fulfillment, address: order.address || caller.address || '' }, caller, shop);
    return fulfillment === 'delivery' && t.policy.noDelivery && !caller.phone ? [] : t.policy.payments.map((id) => ({ id, say: payWords(id) }));
  };
  return {
    surface,
    localTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PIZZA_SHOP.timezone }),
    shop: { open: shop.open, pickupMinutes: shop.quote(1), deliveryMinutes: shop.quote(1, 'B'), soldOut: shop.out.map((id) => TOPPING_BY_ID[id]?.name ?? SIDE_BY_ID[id]?.name ?? id) },
    caller: {
      number: caller.phone ? formatPhone(caller.phone) : 'hidden',
      known: caller.known,
      ...(caller.name ? { name: caller.name } : {}),
      ...(caller.address ? { savedAddress: caller.address } : {}),
      ...(caller.lastLines?.length ? { lastOrder: caller.lastLines.map(lineText).join('; ') + (caller.lastFulfillment ? `, ${caller.lastFulfillment}` : ''), lastOrderItems: linesToItems(caller.lastLines) } : {}),
      ...(caller.orders ? { orders: caller.orders } : {}),
      ...(caller.punches !== undefined ? { rewards: `${caller.punches}/10 punches${caller.freePizza ? `, ${caller.freePizza} free pizza waiting (used at the counter)` : ''}` } : {}),
      ...(caller.favorite ? { favorite: SPECIALTY_BY_ID[caller.favorite]?.name ?? caller.favorite } : {}),
    },
    order,
    ticket: {
      lines: ticket.lines.map(lineText),
      subtotal: money(ticket.totals.subtotal),
      deliveryFee: money(ticket.totals.deliveryFee),
      total: money(ticket.totals.total),
      readyInMinutes: ticket.quoteMinutes,
      ...(ticket.zone ? { deliveryZone: ticket.zone } : {}),
      ...(ticket.address ? { addressFound: ticket.address.line } : {}),
      problems: ticket.problems,
      stillNeeded: missing(order, ticket, surface).map((n) => n.note),
    },
    rules: { allowedPayments: ticket.policy.payments, paymentsIfPickup: waysFor('pickup'), paymentsIfDelivery: waysFor('delivery'), idCheck: ticket.policy.idCheck, bankConfirms: ticket.policy.bankConfirm, notes: ticket.policy.reasons },
    suggestions,
  };
}

/** The first thing the AI says. Written here, not by Claude, so the phone is answered the moment it rings. */
export function greeting(caller: Caller, surface: Surface): string {
  // The shop's name ends in a period ("Co."), so a sentence that ends with it needs no second one.
  // Out loud the shop is "Shoreline Slice": nobody says the "Co." on the phone, and a voice reads it badly.
  const spoken = PIZZA_SHOP.name.replace(/,? Co\.?$/, '');
  const hey = `Hey, thanks for calling ${spoken}!`;
  const shopIs = `It's ${PIZZA_SHOP.name}${PIZZA_SHOP.name.endsWith('.') ? '' : '.'}`;
  const first = caller.name?.split(' ')[0];
  const usual = caller.lastLines?.length ? caller.lastLines.map(lineText).join(' and ').replace(/ \([^)]*\)/g, '') : '';
  if (surface === 'text') {
    if (caller.known && first && usual) return `Hi ${first}! ${shopIs} Want your usual, ${usual}? Reply YES, or tell me what you'd like.`;
    return `Hi! ${shopIs} What can I get started for you? You can text your order like you'd say it, e.g. "large pepperoni, half mushroom, pickup".`;
  }
  if (!caller.phone) return `${hey} I'm the shop's AI assistant. What can I get started for you?`;
  if (caller.known && first && usual) return `Hey ${first}, thanks for calling ${spoken}! Want your usual, ${usual}${caller.lastFulfillment === 'delivery' && caller.address ? `, delivered to ${caller.address}` : ''}?`;
  return `${hey} I'm the shop's AI assistant. Is this for pickup or delivery?`;
}

/** A blank pizza item, for code that builds orders by hand (the sample calls). */
export const item = (p: Partial<BotItem> & Pick<BotItem, 'kind'>): BotItem => ({ specialty: '', size: '', crust: '', sauce: '', cheese: '', add: [], remove: [], notes: [], side: '', qty: 1, ...p });

/* ================================================================ checking what Claude sent */

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);

/** Reads Claude's JSON reply. Anything outside the menu is dropped rather than trusted. */
export function parseTurn(text: string): BotTurn | null {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const d = data as { say?: unknown; order?: Record<string, unknown>; action?: unknown };
  if (!d || typeof d.say !== 'string' || !d.say.trim() || !d.order || typeof d.order !== 'object') return null;
  const o = d.order;
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 30).map((raw): BotItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const toppingIds = TOPPINGS.map((t) => t.id);
    return {
      kind: pick(r.kind, ['pizza', 'side'] as const, 'pizza'),
      specialty: pick(r.specialty, [...SPECIALTIES.map((s) => s.id), 'byo', ''], ''),
      size: pick(r.size, ['S', 'M', 'L', ''] as const, ''),
      crust: pick(r.crust, [...CRUSTS.map((c) => c.id), ''] as const, ''),
      sauce: pick(r.sauce, [...SAUCES.map((s) => s.id), ''] as const, ''),
      cheese: pick(r.cheese, [...CHEESES.map((c) => c.id), ''] as const, ''),
      add: (Array.isArray(r.add) ? r.add : []).filter((a): a is BotTopping => !!a && typeof a === 'object' && toppingIds.includes((a as BotTopping).topping))
        .map((a) => ({ topping: a.topping, side: pick(a.side, ['whole', 'left', 'right'] as const, 'whole'), extra: a.extra === true })),
      remove: (Array.isArray(r.remove) ? r.remove : []).filter((x): x is string => typeof x === 'string' && toppingIds.includes(x)),
      notes: (Array.isArray(r.notes) ? r.notes : []).filter((x): x is string => typeof x === 'string' && NOTES.includes(x)),
      side: pick(r.side, [...SIDES.map((s) => s.id), ''], ''),
      qty: clampQty(Number(r.qty)),
    };
  }).filter((x): x is BotItem => !!x);
  return {
    say: d.say.trim().slice(0, 900),
    order: {
      items,
      fulfillment: pick(o.fulfillment, ['pickup', 'delivery', ''] as const, ''),
      name: typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '',
      address: typeof o.address === 'string' ? o.address.trim().slice(0, 120) : '',
      payment: pick(o.payment, ['pay_at_pickup', 'pay_link', 'cash_at_door', ''] as const, ''),
      note: typeof o.note === 'string' ? o.note.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
    },
    action: pick(d.action, ['continue', 'place_order', 'transfer', 'end'] as const, 'continue'),
  };
}

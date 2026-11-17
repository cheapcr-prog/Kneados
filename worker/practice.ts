/**
 * Practice calls: scripted callers that ring the phone assistant the way a real customer would, so every update
 * is checked against the things real calls got wrong before a customer hears it.
 *
 * A practice call runs the same `VoiceSession` a real call does (same model, same rules, same pricing). Only the
 * phone itself is left out: the caller's lines are typed instead of spoken, and nothing reaches the make line.
 * Each script says what the caller says and what must be true at the end. The checks are code, not opinions.
 */
import type { Address } from '../src/pizza/data';
import { SPECIALTY_BY_ID } from '../src/pizza/data';
import type { BotItem, BotOrder, BotTurn } from '../src/pizza/orderbot';
import { VoiceSession, callerFrom, type SavedCustomer } from './voice';

export interface PracticeResult {
  outcome: 'placed' | 'transfer' | 'end' | 'open';
  /** The order that reached the make line, or the order as it stood when the call stopped. */
  order: BotOrder;
  /** Everything the assistant said after the greeting. */
  said: string[];
  /** Everything the caller said. */
  heard: string[];
  /** How long each answer took, in milliseconds. */
  ms: number[];
  /** The whole call, in the order it happened. */
  conversation: { who: 'caller' | 'assistant'; text: string }[];
}

export interface PracticeCall {
  id: string;
  title: string;
  /** A caller the shop already knows. Left out, it is a first-time caller. */
  saved?: SavedCustomer;
  /** What the caller says, in order. */
  lines: string[];
  /** What is wrong with how the call went. Empty means it passed. */
  check: (r: PracticeResult) => string[];
}

/* ---------------------------------------------------------------- reading an order */

const pizzas = (o: BotOrder) => o.items.filter((i) => i.kind === 'pizza');
const sideQty = (o: BotOrder, id: string) => o.items.filter((i) => i.kind === 'side' && i.side === id).reduce((n, i) => n + i.qty, 0);
/** Every topping that ends up on a pizza: the specialty's own, plus what was added, minus what was taken off. */
export function toppingsOn(p: BotItem): string[] {
  const own = SPECIALTY_BY_ID[p.specialty]?.toppings ?? [];
  return [...new Set([...own, ...p.add.map((t) => t.topping)])].filter((t) => !p.remove.includes(t));
}
const withToppings = (o: BotOrder, ...wanted: string[]) => pizzas(o).some((p) => wanted.every((t) => toppingsOn(p).includes(t)));
const anySaid = (r: PracticeResult, pattern: RegExp) => r.said.some((s) => pattern.test(s));

const must = (ok: boolean, problem: string) => (ok ? [] : [problem]);

/** What every call must get right, whatever was ordered. */
export function houseRules(r: PracticeResult): string[] {
  return [
    ...r.said.filter((s) => (s.match(/\?/g) ?? []).length > 1).map((s) => `Asked two questions at once: "${s.slice(0, 80)}"`),
    ...r.said.filter((s) => s.split(/\s+/).length > 70).map((s) => `Talked too long (${s.split(/\s+/).length} words): "${s.slice(0, 60)}..."`),
    ...r.said.filter((s) => /\b(KneadOS|the system|as an AI language|json)\b/i.test(s)).map((s) => `Talked about its own workings: "${s.slice(0, 80)}"`),
    ...r.said.filter((s) => /\{[a-z]+\}/.test(s)).map((s) => `Left a blank unfilled: "${s.slice(0, 80)}"`),
  ];
}

const elias: SavedCustomer = {
  name: 'Elias Solares', fulfillment: 'pickup', orders: 3,
  items: [{ kind: 'pizza', specialty: 'pepperoni', size: 'L', crust: '', sauce: '', cheese: '', add: [], remove: [], notes: [], side: '', qty: 1 }],
};

/** The scripts. Each one is a weak spot a real call found, or a rule the shop cannot afford to get wrong. */
export const PRACTICE_CALLS: PracticeCall[] = [
  {
    id: 'simple-pickup', title: 'A regular orders one pizza for pickup', saved: elias,
    lines: ['No. One large pepperoni for pickup.', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(pizzas(r.order).length === 1 && pizzas(r.order)[0]?.specialty === 'pepperoni' && pizzas(r.order)[0]?.size === 'L' && pizzas(r.order)[0]?.qty === 1, 'The order is not exactly one large pepperoni.'),
      ...must(r.order.items.length === 1, 'Something extra was added to the order.'),
      ...must(r.order.fulfillment === 'pickup', 'It is not marked pickup.'),
      ...must(!anySaid(r, /\b(your|what|a) name\b/i), 'It asked a known caller for their name.'),
      ...must(anySaid(r, /anything else/i), 'It never asked "Anything else?".'),
    ],
  },
  {
    id: 'custom-pizzas', title: 'Two custom pizzas, wings and a salad, said fast',
    lines: [
      'Two medium thin crust pizzas for pickup. One with sausage and mushrooms, and one with pineapple, jalapeños and extra cheese.',
      'Add an order of barbecue wings and a Caesar salad.',
      "That's everything.",
    ],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(pizzas(r.order).reduce((n, p) => n + p.qty, 0) === 2, 'There are not exactly two pizzas.'),
      ...must(pizzas(r.order).every((p) => p.size === 'M'), 'Not every pizza is a medium.'),
      ...must(pizzas(r.order).every((p) => p.crust === 'thin'), 'Not every pizza is thin crust.'),
      ...must(withToppings(r.order, 'sausage', 'mushroom'), 'No pizza has both sausage and mushrooms.'),
      ...must(withToppings(r.order, 'pineapple', 'jalapeno'), 'No pizza has both pineapple and jalapeños.'),
      ...must(pizzas(r.order).some((p) => p.cheese === 'extra' && toppingsOn(p).includes('pineapple')), 'The pineapple pizza does not have extra cheese.'),
      ...must(sideQty(r.order, 'wings-bbq') === 1, 'There is not exactly one order of barbecue wings.'),
      ...must(sideQty(r.order, 'caesar') === 1, 'There is not exactly one Caesar salad.'),
    ],
  },
  {
    id: 'misheard-street', title: 'Delivery to a street the phone hears wrong',
    lines: ['A large Supreme for delivery.', '1746 Eximino Avenue.', 'Cash.', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(r.order.fulfillment === 'delivery', 'It is not marked delivery.'),
      ...must(/ximeno/i.test(r.order.address) && !/eximino/i.test(r.order.address), `The address is "${r.order.address}", not Ximeno.`),
      ...must(anySaid(r, /Ximeno/), 'It never said the corrected street back to the caller.'),
      ...must(r.order.payment === 'cash_at_door', `Payment is "${r.order.payment}", not cash at the door.`),
      ...must(pizzas(r.order)[0]?.specialty === 'supreme' && pizzas(r.order)[0]?.size === 'L', 'The pizza is not a large Supreme.'),
    ],
  },
  {
    id: 'changes-mind', title: 'The caller changes the order halfway through',
    lines: ['A large barbecue chicken pizza and a two liter cola, for pickup.', 'Actually make the pizza a medium, and take off the cola.', 'Add garlic bread.', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(pizzas(r.order).length === 1 && pizzas(r.order)[0]?.specialty === 'bbq-chicken', 'The pizza is not one barbecue chicken.'),
      ...must(pizzas(r.order)[0]?.size === 'M', 'The pizza was not changed to a medium.'),
      ...must(sideQty(r.order, 'soda-2l') === 0, 'The cola is still on the order.'),
      ...must(sideQty(r.order, 'garlic-knots') === 1, 'There is not exactly one garlic bread.'),
    ],
  },
  {
    id: 'must-refuse', title: 'Things it has to say no to',
    lines: ['A large pizza with anchovies and pineapple, for pickup.', 'Okay, just the pineapple then.', 'Can I give you my card number now?', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(anySaid(r, /anchov/i), 'It never told the caller there are no anchovies.'),
      ...must(withToppings(r.order, 'pineapple'), 'The pizza has no pineapple.'),
      ...must(r.order.payment === 'pay_at_pickup', `Payment is "${r.order.payment}", not pay at the counter.`),
      ...must(!anySaid(r, /(go ahead|what('?s| is) (the|your) card number|read (me )?(the|your) card)/i), 'It offered to take a card number over the phone.'),
    ],
  },
  {
    id: 'twenty-wings', title: 'Wings asked for by the piece',
    lines: ['Twenty buffalo wings and a large cheese pizza, pickup.', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(sideQty(r.order, 'wings-buffalo') === 2, `There are ${sideQty(r.order, 'wings-buffalo')} orders of buffalo wings, not two orders of ten.`),
      ...must(pizzas(r.order).length === 1 && pizzas(r.order)[0]?.specialty === 'cheese' && pizzas(r.order)[0]?.size === 'L', 'The pizza is not one large cheese.'),
    ],
  },
  {
    id: 'big-order', title: 'A party order goes to a manager',
    lines: ['I need fifteen large pepperoni pizzas for a party, for pickup.'],
    check: (r) => must(r.outcome === 'transfer', `A 15 pizza order was not handed to a manager (call ended as "${r.outcome}").`),
  },
  {
    id: 'asks-deals', title: 'Asking about deals does not end the call', saved: elias,
    lines: ['No. What deals do you have right now?', 'Okay, a large pepperoni for pickup then.', "That's it."],
    check: (r) => [
      ...must(r.outcome === 'placed', `The order was not placed (call ended as "${r.outcome}").`),
      ...must(pizzas(r.order).length === 1 && pizzas(r.order)[0]?.specialty === 'pepperoni' && pizzas(r.order)[0]?.size === 'L', 'The order is not one large pepperoni.'),
      ...must(!anySaid(r, /\b(\d+ ?%|percent off|half off|buy one|two for|free (pizza|wings|soda|garlic))\b/i), 'It made up a deal.'),
    ],
  },
  {
    id: 'just-questions', title: 'Questions that are not an order',
    lines: ['What time do you close tonight?', 'Do you have gluten-free crust?', 'Okay thanks, that is all I needed. Bye.'],
    check: (r) => [
      ...must(r.outcome !== 'placed', 'It placed an order nobody asked for.'),
      ...must(r.order.items.length === 0, 'It put something on the order.'),
      ...must(anySaid(r, /\b(10|11|ten|eleven)\b/i), 'It never said when the shop closes.'),
      ...must(anySaid(r, /gluten/i), 'It never answered about gluten-free crust.'),
    ],
  },
];

/* ---------------------------------------------------------------- running one */

/** What a caller answers when the script has run out and the assistant asks something ordinary. */
export function ordinaryAnswer(question: string): string {
  if (/is that (right|correct)|shall i (place|put)|sound (right|good)/i.test(question)) return 'Yes.';
  if (/\b(name)\b/i.test(question)) return 'Elias.';
  if (/pickup or delivery/i.test(question)) return 'Pickup.';
  if (/anything else|is that everything|anything to drink|add (a|an|some)\b.*\?/i.test(question)) return "No, that's it.";
  if (/\b(pay|cash|card)\b.*\?/i.test(question)) return 'I will pay when I get it.';
  return 'Yes.';
}

/** The most extra answers a practice caller gives after its script, so a call that goes in circles ends. */
export const PRACTICE_EXTRA_TURNS = 6;

export async function runPractice(
  script: PracticeCall,
  model: (user: string) => Promise<BotTurn | null>,
  lookUp: (said: string) => Promise<Address | null | undefined>,
  now: () => number = Date.now,
): Promise<PracticeResult> {
  const said: string[] = [];
  const heard: string[] = [];
  const ms: number[] = [];
  const conversation: PracticeResult['conversation'] = [];
  let outcome: PracticeResult['outcome'] = 'open';
  let placed: BotOrder | null = null;
  const session = new VoiceSession(callerFrom('5625550142', script.saved ?? null, now()), {
    model: async (user) => { const started = Date.now(); try { return await model(user); } finally { ms.push(Date.now() - started); } },
    lookUp,
    line: { place: async (order) => { placed = order.order; return 7999; } },
    say: (text) => { said.push(text); conversation.push({ who: 'assistant', text }); },
    end: (_afterMs, reason) => { outcome = reason; },
    fillerAfterMs: 3_600_000,
    now,
  });
  const lines = [...script.lines];
  for (let extra = 0; !session.over && extra < PRACTICE_EXTRA_TURNS;) {
    const next = lines.shift() ?? (extra++, ordinaryAnswer(said[said.length - 1] ?? ''));
    heard.push(next);
    conversation.push({ who: 'caller', text: next });
    await session.heard(next);
  }
  return { outcome, order: placed ?? session.order, said, heard, ms, conversation };
}

export interface PracticeReport {
  id: string;
  title: string;
  passed: boolean;
  problems: string[];
  /** The slowest and the typical answer, in milliseconds. */
  slowestMs: number;
  typicalMs: number;
  outcome: PracticeResult['outcome'];
  conversation: { who: 'caller' | 'assistant'; text: string }[];
}

export function report(script: PracticeCall, r: PracticeResult): PracticeReport {
  const problems = [...script.check(r), ...houseRules(r)];
  const sorted = [...r.ms].sort((a, b) => a - b);
  return { id: script.id, title: script.title, passed: problems.length === 0, problems, slowestMs: sorted[sorted.length - 1] ?? 0, typicalMs: sorted[Math.floor(sorted.length / 2)] ?? 0, outcome: r.outcome, conversation: r.conversation };
}

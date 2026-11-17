/**
 * Direct-mail postcards for pizza mode: who to mail, what it costs, the card itself, the send to the
 * mailing service, and which orders each card brought in.
 *
 * Everything here is example data for the demo shop. The mailing list and carrier routes are generated;
 * a real shop's list comes from its own orders. Prices are list prices noted beside each one.
 */
import { addDays } from '../lib/dates';
import { ADDRESSES, PIZZA_SHOP, SIDE_BY_ID, SPECIALTY_BY_ID } from './data';
import { configFor, lineCents, pizzaFoodCost, pizzaPrice, rng, type Line } from './logic';

/* ================================================================ mailing service and prices */

export type CardSize = '4x6' | '6x9' | '6x11';
export type MailClass = 'first' | 'standard';
export type Audience = 'lapsed' | 'regulars' | 'neighbors';

/**
 * Lob's Startup plan list prices per postcard, print and postage included, effective 2026-11-01
 * (help.lob.com, "Pricing details"). Lob offers 4x6 only as First Class. The plan's monthly fee is extra.
 */
export const LOB_CENTS: Record<CardSize, Partial<Record<MailClass, number>>> = {
  '4x6': { first: 64.9 },
  '6x9': { first: 71.1, standard: 67.3 },
  '6x11': { first: 95.5, standard: 72.3 },
};

/** USPS Every Door Direct Mail retail postage per piece since 2026-07-12. 200 piece minimum, 5,000 per ZIP per day. */
export const EDDM_POSTAGE_CENTS = 26;
/** Example print price for a 6.25 x 9 inch EDDM card at about 1,000 pieces. A real shop sets its printer's quote. */
export const EDDM_PRINT_CENTS = 14;
export const EDDM_MIN_PIECES = 200;

export const PROVIDERS = [
  { id: 'lob', name: 'Lob', note: 'Prints and mails each card with its own name, address and code. Tracks every card through USPS.' },
  { id: 'postgrid', name: 'PostGrid', note: 'Same kind of API. Swap it in with the shop\'s own account and rate card.' },
  { id: 'stannp', name: 'Stannp', note: 'Same kind of API. Swap it in with the shop\'s own account and rate card.' },
] as const;

export const SIZE_LABEL: Record<CardSize, string> = { '4x6': '4 × 6 in', '6x9': '6 × 9 in', '6x11': '6 × 11 in' };

/** What one card costs, in hundredths of a cent kept as a decimal number of cents. */
export function centsPerCard(audience: Audience, size: CardSize, mailClass: MailClass): number {
  if (audience === 'neighbors') return EDDM_POSTAGE_CENTS + EDDM_PRINT_CENTS;
  const row = LOB_CENTS[size];
  return row[mailClass] ?? row.first ?? row.standard!;
}

/** Days from send to the mailbox, as a range. */
export function deliveryDays(audience: Audience, mailClass: MailClass): [number, number] {
  if (audience === 'neighbors') return [3, 5];
  return mailClass === 'first' ? [4, 6] : [7, 11];
}

/* ================================================================ the mailing list */

export interface MailCustomer {
  id: string;
  name: string;
  phone: string;
  line1: string;
  zip: string;
  routeId: string;
  /** Miles east and north of the shop. */
  x: number;
  y: number;
  orders: number;
  spentCents: number;
  lastOrder: string;
  favorite: string;
}

/** ZIP for each example street. */
const STREET_ZIP: Record<string, string> = {
  'Termino Ave': '90803', 'E 4th St': '90814', 'E Broadway': '90803', 'E 2nd St': '90803', 'E Ocean Blvd': '90803', 'Redondo Ave': '90804',
  'Junipero Ave': '90814', 'E Anaheim St': '90804', 'Atlantic Ave': '90807', 'E Pacific Coast Hwy': '90815', 'Livingston Dr': '90803',
  'Bellflower Blvd': '90815', 'Pine Ave': '90802', 'E Spring St': '90815', 'Studebaker Rd': '90815', 'Cherry Ave': '90814',
};

export interface CarrierRoute { id: string; zip: string; area: string; homes: number; businesses: number; x: number; y: number }

/** USPS carrier routes around the shop. Route ids and counts are examples; a live shop pulls them from the USPS EDDM tool. */
export const ROUTES: CarrierRoute[] = [
  { id: '90803-C004', zip: '90803', area: 'Belmont Shore, south of 2nd St', homes: 612, businesses: 41, x: 1.3, y: -1.0 },
  { id: '90803-C011', zip: '90803', area: 'Belmont Heights', homes: 548, businesses: 12, x: 0.4, y: 0.2 },
  { id: '90803-C017', zip: '90803', area: 'Bluff Park', homes: 471, businesses: 8, x: -0.5, y: -0.9 },
  { id: '90803-C023', zip: '90803', area: 'Naples and the Peninsula', homes: 689, businesses: 22, x: 1.8, y: -0.6 },
  { id: '90814-C002', zip: '90814', area: 'Alamitos Beach', homes: 734, businesses: 37, x: -1.0, y: -0.4 },
  { id: '90814-C009', zip: '90814', area: 'Rose Park', homes: 523, businesses: 9, x: -0.7, y: 0.4 },
  { id: '90804-C006', zip: '90804', area: 'Zaferia', homes: 658, businesses: 30, x: 0.6, y: 1.5 },
  { id: '90804-C014', zip: '90804', area: 'Carroll Park', homes: 402, businesses: 5, x: 0.9, y: 1.1 },
  { id: '90815-C010', zip: '90815', area: 'Los Altos', homes: 717, businesses: 14, x: 2.6, y: 2.0 },
  { id: '90815-C021', zip: '90815', area: 'Park Estates', homes: 389, businesses: 3, x: 2.9, y: 0.9 },
  { id: '90802-C001', zip: '90802', area: 'Downtown, East Village', homes: 865, businesses: 112, x: -3.0, y: 0.2 },
  { id: '90807-C015', zip: '90807', area: 'Bixby Knolls', homes: 596, businesses: 18, x: -2.2, y: 2.7 },
];

const routeMiles = (r: { x: number; y: number }) => Math.round(Math.hypot(r.x, r.y) * 10) / 10;
export const ROUTE_MILES = Object.fromEntries(ROUTES.map((r) => [r.id, routeMiles(r)])) as Record<string, number>;

const nearestRoute = (x: number, y: number) => ROUTES.reduce((best, r) => (Math.hypot(r.x - x, r.y - y) < Math.hypot(best.x - x, best.y - y) ? r : best));

const FIRST = ['Maya', 'Jordan', 'Chris', 'Priya', 'Leo', 'Alex', 'Sam', 'Taylor', 'Nina', 'Omar', 'Grace', 'Diego', 'Riley', 'Hana', 'Marcus', 'Ivy', 'Ben', 'Zoe', 'Andre', 'Lucy', 'Kai', 'Elena', 'Noah', 'Sofia', 'Isaac', 'Mia', 'Jamal', 'Rosa', 'Theo', 'Ava'];
const LAST = ['Reyes', 'Tran', 'Morales', 'Kim', 'Santos', 'Lopez', 'Patel', 'Garcia', 'Brooks', 'Wong', 'Nguyen', 'Hughes', 'Rivera', 'Chen', 'Diaz', 'Foster'];
const FAVORITES = ['pepperoni', 'pepperoni', 'supreme', 'cheese', 'bbq-chicken', 'double-pep', 'margherita', 'sausage-mush', 'veggie', 'white'];

/** Everyone who has ordered delivery in the last 18 months, with the address it went to. Generated for the demo. */
export function mailingList(today: string): MailCustomer[] {
  const r = rng(4242);
  return Array.from({ length: 640 }, (_, i) => {
    const a = ADDRESSES[Math.floor(r() * ADDRESSES.length)];
    const street = a.line.replace(/^\d+\s+/, '');
    const house = 100 + Math.floor(r() * 6400);
    const x = a.x + (r() - 0.5) * 0.8;
    const y = a.y + (r() - 0.5) * 0.8;
    // A mix of regulars, people who come now and then, and people who stopped.
    const kind = r();
    const orders = kind < 0.12 ? 10 + Math.floor(r() * 30) : kind < 0.55 ? 2 + Math.floor(r() * 8) : 1;
    const ago = kind < 0.12 ? Math.floor(r() * 21) : kind < 0.55 ? Math.floor(r() * 140) : Math.floor(r() * 520);
    return {
      id: `c${i}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / 30)) % LAST.length]}`, phone: `562555${String(3000 + i).slice(-4)}`,
      line1: `${house} ${street}`, zip: STREET_ZIP[street] ?? '90803', routeId: nearestRoute(x, y).id, x, y,
      orders, spentCents: orders * (2600 + Math.floor(r() * 1800)), lastOrder: addDays(today, -ago), favorite: FAVORITES[Math.floor(r() * FAVORITES.length)],
    };
  });
}

const daysSince = (date: string, today: string) => Math.round((new Date(today).getTime() - new Date(date).getTime()) / 86_400_000);

export const AUDIENCES: { id: Audience; title: string; rule: string; named: boolean }[] = [
  { id: 'lapsed', title: 'Customers who stopped ordering', rule: 'Ordered at least twice, nothing in the last 45 days to a year. Each card has their name and a one-time code.', named: true },
  { id: 'regulars', title: 'Best regulars: bring a friend', rule: '10 or more orders and in this month. A thank-you card with a code to hand to a friend who has never ordered.', named: true },
  { id: 'neighbors', title: 'Every door near the shop', rule: 'USPS Every Door Direct Mail: every home on the carrier routes you pick, no list needed. One code per route.', named: false },
];

/** Who a named audience mails. People mailed in the last 30 days are left out so nobody gets two cards in a month. */
export function namedAudience(audience: Exclude<Audience, 'neighbors'>, list: MailCustomer[], today: string, mailedRecently: Set<string> = new Set()): MailCustomer[] {
  return list.filter((c) => {
    if (mailedRecently.has(c.id)) return false;
    const ago = daysSince(c.lastOrder, today);
    return audience === 'lapsed' ? c.orders >= 2 && ago >= 45 && ago <= 365 : c.orders >= 10 && ago <= 30;
  });
}

export interface RouteScore { route: CarrierRoute; miles: number; customers: number; share: number; inZone: boolean; why: string }

/**
 * Ranks carrier routes for an every-door mailing: inside the delivery area, lots of homes, and few of them
 * ordering yet (room to grow). Routes where many homes already order are better reached by the named list.
 */
export function scoreRoutes(list: MailCustomer[]): RouteScore[] {
  return ROUTES.map((route) => {
    const customers = list.filter((c) => c.routeId === route.id).length;
    const share = customers / route.homes;
    const miles = ROUTE_MILES[route.id];
    const inZone = miles <= 3;
    const why = !inZone ? `${miles} mi out, past the 3 mi area with the fastest delivery` : share > 0.12 ? `${Math.round(share * 100)}% of homes already order, so the named list reaches them for less` : `${route.homes} homes, only ${Math.round(share * 100)}% order from you yet`;
    return { route, miles, customers, share, inZone, why };
  }).sort((a, b) => Number(b.inZone) - Number(a.inZone) || a.share - b.share || a.miles - b.miles);
}

/** The routes KneadOS picks for a radius: in the radius, not already well covered, up to about the piece budget. */
export function pickRoutes(scores: RouteScore[], radiusMiles: number, maxPieces = 2500): string[] {
  const out: string[] = [];
  let pieces = 0;
  for (const s of scores) {
    if (s.miles > radiusMiles || s.share > 0.12) continue;
    if (pieces + s.route.homes > maxPieces) continue;
    out.push(s.route.id);
    pieces += s.route.homes;
  }
  return out;
}

/* ================================================================ offers */

export interface Offer {
  id: string;
  label: string;
  short: string;
  /** Taken off the order at checkout. */
  discountCents: (subtotal: number) => number;
  /** Food given away on top of the order (a free side, or a free large on the regular's card). */
  extraFoodCents: number;
  /** What the offer costs the shop on one order, for planning: the discount or the food given away. */
  costCents: number;
  minSubtotal?: number;
}

const knotsCost = SIDE_BY_ID['garlic-knots'].costCents;
const mediumCheeseCost = Math.round(pizzaFoodCost(configFor('cheese', 'M')));
const largeCheeseCost = Math.round(pizzaFoodCost(configFor('cheese', 'L')));

export const OFFERS: Offer[] = [
  // The free item is added to the order at no charge, so it is not a discount; its food cost is what it costs the shop.
  { id: 'knots', label: 'Free garlic bread with any pizza', short: 'FREE GARLIC BREAD', discountCents: () => 0, extraFoodCents: knotsCost, costCents: knotsCost },
  { id: 'five', label: '$5 off any order of $25 or more', short: '$5 OFF', discountCents: (s) => (s >= 2500 ? 500 : 0), extraFoodCents: 0, costCents: 500, minSubtotal: 2500 },
  { id: 'medium', label: 'Free medium cheese pizza with any large', short: 'FREE MEDIUM PIZZA', discountCents: () => 0, extraFoodCents: mediumCheeseCost, costCents: mediumCheeseCost },
  { id: 'friend', label: '$8 off a first order, and a free large for the regular who shared it', short: '$8 OFF YOUR FIRST ORDER', discountCents: (s) => (s >= 2000 ? 800 : 0), extraFoodCents: largeCheeseCost, costCents: 800 + largeCheeseCost, minSubtotal: 2000 },
];
export const OFFER_BY_ID = Object.fromEntries(OFFERS.map((o) => [o.id, o])) as Record<string, Offer>;

/** The offer KneadOS suggests for an audience, and why. Costs are food cost, not menu price. */
export function suggestOffer(audience: Audience): { offerId: string; why: string } {
  if (audience === 'lapsed') return { offerId: 'knots', why: `They already know the pizza. Free garlic bread costs about ${dollars(knotsCost)} in food and gives them a reason to order this week.` };
  if (audience === 'regulars') return { offerId: 'friend', why: 'Regulars are your best salespeople. The friend gets $8 off a first order; the regular gets a free large added to their rewards when the friend orders.' };
  return { offerId: 'five', why: 'Strangers need a bigger nudge than past customers. $5 off a $25 order still leaves most of the ticket after food cost.' };
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** What a postcard offer does to an order: free items added at $0, or money off. */
export function applyOffer(offerId: string, lines: Line[]): { free: Line[]; discountCents: number; problem?: string } {
  const offer = OFFER_BY_ID[offerId];
  const subtotal = lines.reduce((a, l) => a + lineCents(l), 0);
  const hasPizza = lines.some((l) => l.kind === 'pizza');
  if (offer.id === 'knots') return hasPizza ? { free: [{ kind: 'side', sideId: 'garlic-knots', qty: 1, unitCents: 0 }], discountCents: 0 } : { free: [], discountCents: 0, problem: 'Add a pizza to get the free garlic bread.' };
  if (offer.id === 'medium') {
    if (!lines.some((l) => l.kind === 'pizza' && l.config.size === 'L')) return { free: [], discountCents: 0, problem: 'Add a large pizza to get the free medium.' };
    const config = configFor('cheese', 'M');
    return { free: [{ kind: 'pizza', config, specialtyId: 'cheese', qty: 1, unitCents: 0 }], discountCents: 0 };
  }
  const off = offer.discountCents(subtotal);
  return off ? { free: [], discountCents: off } : { free: [], discountCents: 0, problem: `Spend ${dollars(offer.minSubtotal ?? 0)} or more to use this code.` };
}

/** Menu price of the free item, for showing what the customer saved. */
export const freeValue = (lines: Line[]) => lines.reduce((a, l) => a + (l.kind === 'pizza' ? pizzaPrice(l.config, l.specialtyId).cents : SIDE_BY_ID[l.sideId].cents) * l.qty, 0);

/* ================================================================ expected results */

/** Planning response rates before the shop has its own. Replaced by the shop's results once a campaign has run 21 days. */
export const PLAN_RESPONSE: Record<Audience, number> = { lapsed: 0.05, regulars: 0.06, neighbors: 0.01 };

export interface Estimate { pieces: number; costCents: number; perCard: number; expected: number; responseRate: number; responseFrom: string; profitPerOrder: number; breakEven: number; netCents: number }

export function estimate(o: { audience: Audience; pieces: number; size: CardSize; mailClass: MailClass; offerId: string; avgTicketCents: number; foodShare: number; history?: MailCampaign[] }): Estimate {
  const perCard = centsPerCard(o.audience, o.size, o.mailClass);
  const costCents = Math.round(perCard * o.pieces);
  const past = (o.history ?? []).filter((c) => c.audience === o.audience && c.pieces > 0 && c.redemptions.length > 0);
  const own = past.length ? past.reduce((a, c) => a + c.redemptions.length, 0) / past.reduce((a, c) => a + c.pieces, 0) : undefined;
  const responseRate = own ?? PLAN_RESPONSE[o.audience];
  const offer = OFFER_BY_ID[o.offerId];
  const profitPerOrder = Math.round(o.avgTicketCents * (1 - o.foodShare) - offer.costCents);
  const expected = Math.round(o.pieces * responseRate);
  return {
    pieces: o.pieces, costCents, perCard, expected, responseRate,
    responseFrom: own !== undefined ? `your last ${past.length > 1 ? `${past.length} mailings` : 'mailing'} to this group` : 'a planning rate until you have your own results',
    profitPerOrder, breakEven: profitPerOrder > 0 ? Math.ceil(costCents / profitPerOrder) : Infinity, netCents: expected * profitPerOrder - costCents,
  };
}

/* ================================================================ campaigns, codes and tracking */

export interface Redemption { code: string; orderNumber: number; date: string; name: string; subtotalCents: number; discountCents: number; channel: string; newCustomer: boolean; orderedAgain?: boolean; live?: boolean }

export interface MailCampaign {
  id: string;
  name: string;
  audience: Audience;
  provider: string;
  size: CardSize;
  mailClass: MailClass;
  offerId: string;
  headline: string;
  body: string;
  photo: string;
  sentOn: string;
  expires: string;
  pieces: number;
  perCard: number;
  totalCents: number;
  /** Customer ids for a named mailing. */
  recipients: string[];
  routes: string[];
  /** One code per customer, or one per route for every-door mail. */
  codes: Record<string, string>;
  redemptions: Redemption[];
  byClaude?: boolean;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A short code that is easy to read off a card and say on the phone. */
export function mailCode(seed: string, prefix = 'SS'): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let out = '';
  for (let i = 0; i < 5; i++) { out += CODE_CHARS[h % CODE_CHARS.length]; h = Math.floor(h / CODE_CHARS.length) || (h ^ 0x9e3779b9) >>> 0; }
  return `${prefix}-${out}`;
}

export const qrLink = (code: string) => `https://kneados.app/pizza/demo/shop?mail=${code}`;

/** Finds the campaign and the person or route a code belongs to. Codes are case and dash insensitive. */
export function findCode(code: string, campaigns: MailCampaign[], today: string): { campaign: MailCampaign; key: string; used: boolean; expired: boolean } | undefined {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 5) return undefined;
  for (const campaign of campaigns) {
    for (const [key, c] of Object.entries(campaign.codes)) {
      if (c.replace(/-/g, '') !== clean) continue;
      // Named codes are one use; a route code is shared by every home on the route.
      const used = campaign.audience !== 'neighbors' && campaign.redemptions.some((r) => r.code === c);
      return { campaign, key, used, expired: today > campaign.expires };
    }
  }
  return undefined;
}

export interface TrackStep { label: string; date: string; done: boolean }

/** Where a mailing is: proof, print, USPS, mailboxes. Dates come from the send date and the mail class. */
export function tracking(c: Pick<MailCampaign, 'sentOn' | 'audience' | 'mailClass'>, today: string): { steps: TrackStep[]; deliveredShare: number; status: string } {
  const [lo, hi] = deliveryDays(c.audience, c.mailClass);
  const steps: TrackStep[] = [
    { label: 'Proof approved, sent to the printer', date: c.sentOn, done: true },
    { label: 'Printed', date: addDays(c.sentOn, 1), done: false },
    { label: c.audience === 'neighbors' ? 'Dropped at the post office' : 'Handed to USPS', date: addDays(c.sentOn, 2), done: false },
    { label: 'First cards in mailboxes', date: addDays(c.sentOn, lo), done: false },
    { label: 'All cards delivered', date: addDays(c.sentOn, hi), done: false },
  ];
  for (const s of steps) s.done = today >= s.date;
  const day = daysSince(c.sentOn, today);
  const deliveredShare = day < lo ? 0 : day >= hi ? (c.audience === 'neighbors' ? 1 : 0.985) : ((day - lo + 1) / (hi - lo + 1)) * 0.985;
  const next = steps.find((s) => !s.done);
  return { steps, deliveredShare, status: next ? next.label.replace(/^First cards in mailboxes$/, 'In the mail') : 'Delivered' };
}

export interface Results { redeemed: number; rate: number; salesCents: number; discountCents: number; profitCents: number; roi: number; newCustomers: number; orderedAgain: number; costPerNewCents: number }

export function results(c: MailCampaign, foodShare: number): Results {
  const salesCents = c.redemptions.reduce((a, r) => a + r.subtotalCents, 0);
  const discountCents = c.redemptions.reduce((a, r) => a + r.discountCents, 0);
  const offer = OFFER_BY_ID[c.offerId];
  // Sales are after the discount. Profit is those sales less their food cost, less food given away free, less the mailing.
  const profitCents = Math.round(salesCents * (1 - foodShare)) - c.redemptions.length * offer.extraFoodCents - c.totalCents;
  const newCustomers = c.redemptions.filter((r) => r.newCustomer).length;
  return {
    redeemed: c.redemptions.length, rate: c.pieces ? c.redemptions.length / c.pieces : 0, salesCents, discountCents, profitCents,
    roi: c.totalCents ? profitCents / c.totalCents : 0, newCustomers, orderedAgain: c.redemptions.filter((r) => r.orderedAgain).length,
    costPerNewCents: newCustomers ? Math.round(c.totalCents / newCustomers) : 0,
  };
}

/** Wording KneadOS writes from the shop's own data before Claude rewrites it. {name} is filled per card. */
export function defaultCopy(audience: Audience, offerId: string, favorite: string): { headline: string; body: string } {
  const fav = SPECIALTY_BY_ID[favorite]?.name ?? 'pizza';
  const offer = OFFER_BY_ID[offerId].label.toLowerCase();
  if (audience === 'lapsed') return { headline: 'Your usual is still hot.', body: `Hi {name}, it has been a while since your last ${fav}. Come back this week for ${offer}. Same hand-stretched dough, deck-baked, at your door in about 30 minutes.` };
  if (audience === 'regulars') return { headline: 'Pass this one to a friend.', body: `{name}, thanks for being one of our regulars. Give this card to a friend who has never tried us: ${offer}.` };
  return { headline: 'Hot pizza, right around the corner.', body: `Hi neighbor. ${PIZZA_SHOP.name} is a few minutes away: dough made fresh every day, deck-baked, delivered hot. Try us this week with ${offer}.` };
}

/** The card's photo: the pizza most of the audience orders. */
export function photoFor(favorites: string[]): string {
  const count: Record<string, number> = {};
  for (const f of favorites) count[f] = (count[f] ?? 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'pepperoni';
  return SPECIALTY_BY_ID[top]?.photo ?? '/pizza/pepperoni.webp';
}

/** The body of one request to Lob's postcard API, so the owner can see exactly what is sent. */
export function lobRequest(c: Pick<MailCampaign, 'name' | 'size' | 'mailClass' | 'sentOn'>, to: { name: string; line1: string; zip: string }, code: string) {
  return {
    description: c.name,
    to: { name: to.name, address_line1: to.line1, address_city: 'Long Beach', address_state: 'CA', address_zip: to.zip },
    from: { name: PIZZA_SHOP.name, address_line1: '456 Demo Avenue', address_city: 'Long Beach', address_state: 'CA', address_zip: '90803' },
    front: 'tmpl_shoreline_front',
    back: 'tmpl_shoreline_back',
    merge_variables: { name: to.name.split(' ')[0], code, qr_url: qrLink(code) },
    size: c.size,
    mail_type: c.mailClass === 'first' ? 'usps_first_class' : 'usps_standard',
    use_type: 'marketing',
    send_date: c.sentOn,
  };
}

/* ================================================================ seeded history */

/** Two mailings from the past month or two, with the orders their codes brought in. */
export function seedCampaigns(today: string, list: MailCustomer[], avgTicketCents: number): MailCampaign[] {
  const r = rng(777);
  const make = (o: Omit<MailCampaign, 'perCard' | 'totalCents' | 'redemptions' | 'codes' | 'expires'> & { rate: number; newShare: number; againShare: number }): MailCampaign => {
    const perCard = centsPerCard(o.audience, o.size, o.mailClass);
    const codes: Record<string, string> = {};
    if (o.audience === 'neighbors') for (const id of o.routes) codes[id] = mailCode(`${o.id}:${id}`, 'MAIL');
    else for (const id of o.recipients) codes[id] = mailCode(`${o.id}:${id}`);
    const n = Math.round(o.pieces * o.rate);
    const keys = Object.keys(codes);
    const offer = OFFER_BY_ID[o.offerId];
    const redemptions: Redemption[] = Array.from({ length: n }, (_, i) => {
      const key = o.audience === 'neighbors' ? keys[i % keys.length] : keys[Math.floor(r() * keys.length)];
      const who = list.find((c) => c.id === key);
      const subtotal = Math.round(avgTicketCents * (0.8 + r() * 0.7));
      const [lo] = deliveryDays(o.audience, o.mailClass);
      return {
        code: codes[key], orderNumber: 1400 + Math.floor(r() * 650), date: addDays(o.sentOn, lo + Math.floor(r() * 16)),
        name: who?.name ?? `${FIRST[(i * 11) % FIRST.length]} ${LAST[(i * 5) % LAST.length][0]}.`, subtotalCents: subtotal, discountCents: offer.discountCents(subtotal),
        channel: r() < 0.55 ? 'Website (QR code)' : r() < 0.8 ? 'Phone' : 'Counter', newCustomer: o.audience !== 'lapsed' && r() < o.newShare, orderedAgain: r() < o.againShare,
      };
    }).filter((x) => x.date < today).sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set<string>();
    const unique = o.audience === 'neighbors' ? redemptions : redemptions.filter((x) => (used.has(x.code) ? false : (used.add(x.code), true)));
    unique.forEach((x, i) => { x.orderNumber = 1400 + i * 23 + (o.audience === 'neighbors' ? 7 : 0); });
    const { rate: _rate, newShare: _n, againShare: _a, ...rest } = o;
    return { ...rest, perCard, totalCents: Math.round(perCard * o.pieces), codes, redemptions: unique, expires: addDays(o.sentOn, 30) };
  };
  const lapsedSent = addDays(today, -41);
  const lapsed = namedAudience('lapsed', list, lapsedSent).slice(0, 96);
  const routes = ['90803-C011', '90804-C014', '90814-C009'];
  return [
    make({ id: 'mail-1', name: 'Come back for a slice', audience: 'lapsed', provider: 'Lob', size: '4x6', mailClass: 'first', offerId: 'knots', ...defaultCopy('lapsed', 'knots', 'pepperoni'), photo: photoFor(lapsed.map((c) => c.favorite)), sentOn: lapsedSent, pieces: lapsed.length, recipients: lapsed.map((c) => c.id), routes: [], rate: 0.073, newShare: 0, againShare: 0.45 }),
    make({ id: 'mail-2', name: 'New neighbors: Belmont Heights, Carroll Park, Rose Park', audience: 'neighbors', provider: 'USPS EDDM', size: '6x9', mailClass: 'standard', offerId: 'five', ...defaultCopy('neighbors', 'five', 'pepperoni'), photo: '/pizza/supreme.webp', sentOn: addDays(today, -26), pieces: routes.reduce((a, id) => a + ROUTES.find((x) => x.id === id)!.homes, 0), recipients: [], routes, rate: 0.0125, newShare: 0.82, againShare: 0.38 }),
  ];
}

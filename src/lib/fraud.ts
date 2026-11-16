/**
 * Stolen card defenses for online orders.
 *
 * Food is a favorite target for stolen cards: it is cheap, gone in minutes, and the real card owner's
 * chargeback lands weeks later on the shop. These rules catch the usual pattern before the food leaves:
 * a new phone, a big order, a billing ZIP nowhere near the delivery, several cards tried in a row.
 * Every rule is a plain setting the owner can change.
 */

export interface FraudSettings {
  /** Online orders at or above this total need photo ID at pickup that matches the name on the card. 0 turns it off. */
  idCheckOverCents: number;
  /** A phone that has never ordered pays at the counter instead of online. */
  firstTimePayInPerson: boolean;
  /** Declined card tries allowed per phone or device in one hour. */
  cardTriesPerHour: number;
  /** Flags a first order from a new phone at or above this total. */
  bigFirstOrderCents: number;
  /** Flags a delivery whose billing ZIP is outside the delivery area. */
  deliveryZipCheck: boolean;
  /** Stripe: decline when the billing ZIP or the security code does not match the bank's records. */
  zipCheck: boolean;
  cvcCheck: boolean;
  /** Stripe Radar plan. Lite is free with Stripe; Standard adds custom rules like the card try limit. */
  radar: 'lite' | 'standard';
  /** Stripe asks the bank to confirm (3D Secure, the "approve in your bank app" step) at or above this total. 0 turns it off. */
  threeDSOverCents: number;
}

export const DEFAULT_FRAUD: FraudSettings = {
  idCheckOverCents: 5000,
  firstTimePayInPerson: false,
  cardTriesPerHour: 3,
  bigFirstOrderCents: 7500,
  deliveryZipCheck: true,
  zipCheck: true,
  cvcCheck: true,
  radar: 'standard',
  threeDSOverCents: 10000,
};

/** One card payment try on the website. */
export interface CardTry {
  at: number;
  phone: string;
  /** A random id kept in this browser, so switching phone numbers does not reset the count. */
  device: string;
  ok: boolean;
}

const HOUR = 60 * 60 * 1000;

/** Declined tries in the last hour from this phone or this device. */
export function failedTries(tries: readonly CardTry[], phone: string, device: string, now = Date.now()): number {
  return tries.filter((t) => !t.ok && now - t.at < HOUR && (t.phone === phone || t.device === device)).length;
}

/** Card tries left this hour. At 0 the website stops taking cards from this phone and device. */
export function triesLeft(tries: readonly CardTry[], phone: string, device: string, s: FraudSettings, now = Date.now()): number {
  return Math.max(0, s.cardTriesPerHour - failedTries(tries, phone, device, now));
}

/** Keeps one day of tries, so the list never grows without end. */
export const pruneTries = (tries: readonly CardTry[], now = Date.now()) => tries.filter((t) => now - t.at < 24 * HOUR);

/** The ZIP code areas a shop delivers in, by their first three digits (908 is Long Beach). */
export const zipArea = (zip: string) => zip.replace(/\D/g, '').slice(0, 3);

/** True when the billing ZIP is a full ZIP outside every one of these areas. */
export function zipFar(billingZip: string, areas: readonly string[]): boolean {
  const digits = billingZip.replace(/\D/g, '');
  return digits.length === 5 && !areas.includes(zipArea(digits));
}

export type RiskCode = 'id-check' | 'new-phone-big' | 'zip-far' | 'card-tries' | 'name-differs' | 'first-time';

export interface RiskFlag {
  code: RiskCode;
  /** What the staff screen says. */
  label: string;
}

export interface RiskInput {
  totalCents: number;
  fulfillment: 'pickup' | 'delivery';
  /** True when this phone has never ordered before. */
  firstTime: boolean;
  /** The name for the order and the name on the card. */
  orderName: string;
  cardName?: string;
  billingZip?: string;
  /** ZIP areas the shop delivers in. */
  deliveryAreas?: readonly string[];
  /** Declined tries before this one. */
  failedTries: number;
}

export interface RiskResult {
  flags: RiskFlag[];
  /** Staff check photo ID against the name on the card before handing it over. */
  idCheck: boolean;
  /** The customer pays at the counter instead of online. */
  payInPerson: boolean;
  /** The bank is asked to confirm the payment. */
  threeDS: boolean;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);

/** True when the two names share no word, so "Sam Lee" and "Samantha Lee" pass but "Sam Lee" and "Jo Diaz" do not. */
export function namesDiffer(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x.length || !y.length) return false;
  return !x.some((w) => y.some((v) => v === w || (w.length >= 3 && v.startsWith(w)) || (v.length >= 3 && w.startsWith(v))));
}

/** Looks at one online order and says what the shop should do about it. */
export function orderRisk(o: RiskInput, s: FraudSettings): RiskResult {
  const flags: RiskFlag[] = [];
  const payInPerson = s.firstTimePayInPerson && o.firstTime;
  if (payInPerson) flags.push({ code: 'first-time', label: 'First order from this phone: pays at the counter' });
  const big = s.idCheckOverCents > 0 && o.totalCents >= s.idCheckOverCents;
  if (o.firstTime && s.bigFirstOrderCents > 0 && o.totalCents >= s.bigFirstOrderCents) flags.push({ code: 'new-phone-big', label: 'New phone number with a big order' });
  if (o.fulfillment === 'delivery' && s.deliveryZipCheck && o.billingZip && o.deliveryAreas && zipFar(o.billingZip, o.deliveryAreas)) {
    flags.push({ code: 'zip-far', label: `Card billing ZIP ${o.billingZip} is far from the delivery address` });
  }
  if (o.failedTries > 0) flags.push({ code: 'card-tries', label: `${o.failedTries} declined card${o.failedTries === 1 ? '' : 's'} before this one` });
  if (o.cardName && namesDiffer(o.orderName, o.cardName)) flags.push({ code: 'name-differs', label: `Order name differs from the card (${o.cardName})` });
  // A pickup at or over the limit, or any order with a warning sign, gets an ID check. A paid-at-counter order does not need one.
  const idCheck = !payInPerson && (big || flags.some((f) => f.code !== 'first-time'));
  if (idCheck && big) flags.unshift({ code: 'id-check', label: 'Big online order: check photo ID' });
  const threeDS = !payInPerson && ((s.threeDSOverCents > 0 && o.totalCents >= s.threeDSOverCents) || flags.some((f) => f.code === 'zip-far' || f.code === 'card-tries'));
  return { flags, idCheck, payInPerson, threeDS };
}

/** A demo card that the pretend bank turns down, so the try limit can be shown. */
export const DECLINED_DEMO_CARD = '4000 0000 0000 0002';
export const GOOD_DEMO_CARD = '4242 4242 4242 4242';

/** Whether the demo bank accepts this card number. */
export const demoCardOk = (number: string) => number.replace(/\D/g, '') !== DECLINED_DEMO_CARD.replace(/\s/g, '');

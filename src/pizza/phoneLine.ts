/**
 * The real phone line, seen from the browser. A shop that has connected a phone number types it in once;
 * this browser then asks KneadOS every few seconds for orders taken on that line and puts them on the make line.
 * Knowing the shop's number is what lets a browser see its phone orders. Callers' own numbers are never sent here.
 */
import { DEFAULT_FRAUD } from '../lib/fraud';
import type { Address } from './data';
import { cleanDeals, type Deal } from './deals';
import { MINUTE, type PizzaOrder } from './logic';
import { rememberAddress, ticketFor, type BotOrder, type TranscriptLine } from './orderbot';

const LINE_KEY = 'kneados-pizza-phone-line';
const SEEN_KEY = 'kneados-pizza-phone-seen';
export const PHONE_POLL_MS = 4000;

/** A phone order as the server hands it over. */
export interface PhoneOrder {
  id: string;
  number: number;
  at: string;
  minutes: number;
  last4: string;
  order: BotOrder;
  address?: Address;
  /** Deals that were running when the order was placed. */
  deals?: Deal[];
  transcript: TranscriptLine[];
}
export interface PhoneFeed { lastCallAt: string | null; orders: PhoneOrder[] }

const digits = (s: string) => { const d = s.replace(/\D/g, ''); return d.length === 11 && d.startsWith('1') ? d.slice(1) : d; };
export const validLine = (s: string) => /^[2-9]\d{9}$/.test(digits(s));

export function savedLine(): string {
  try { const v = localStorage.getItem(LINE_KEY) ?? ''; return validLine(v) ? v : ''; } catch { return ''; }
}
export function saveLine(number: string) {
  try { if (validLine(number)) localStorage.setItem(LINE_KEY, digits(number)); else localStorage.removeItem(LINE_KEY); } catch { /* storage blocked */ }
}
export function seenOrders(): string[] {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
export function markSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenOrders(), ...ids].slice(-200))); } catch { /* storage blocked */ }
}

export async function fetchFeed(line: string): Promise<PhoneFeed | null> {
  try {
    const res = await fetch(`/api/phone-orders?line=${encodeURIComponent(line)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PhoneFeed;
    return Array.isArray(data.orders) ? data : null;
  } catch { return null; }
}

/** A phone order as a make line ticket, priced by the same code as every other order. */
export function ticketFromPhone(p: PhoneOrder): Omit<PizzaOrder, 'id' | 'number'> {
  const o = p.order;
  if (o.fulfillment === 'delivery' && p.address) rememberAddress(o.address, p.address);
  const t = ticketFor(o, { phone: '', known: false }, { quote: () => p.minutes, out: [], open: true, fraud: DEFAULT_FRAUD, payLinks: false, deals: cleanDeals(p.deals) });
  const at = Date.parse(p.at) || Date.now();
  const delivery = o.fulfillment === 'delivery' && !!t.address && !!t.zone;
  return {
    channel: 'phone', fulfillment: delivery ? 'delivery' : 'pickup', createdAt: new Date(at).toISOString(), promisedAt: new Date(at + p.minutes * MINUTE).toISOString(),
    customer: { name: o.name.trim() || 'Phone order', phone: '', ...(delivery ? { address: t.address!.line, x: t.address!.x, y: t.address!.y, zone: t.zone } : {}) },
    lines: t.lines, ...t.totals, payment: o.payment === 'cash_at_door' ? 'cash' : 'card', status: 'new',
    note: [o.note.trim(), ...t.deals.map((d) => `Deal: ${d.title}`), o.payment === 'cash_at_door' ? 'Cash at the door' : 'Pays at the counter', p.last4 ? `Real call from a number ending ${p.last4}` : 'Real call, number hidden'].filter(Boolean).join(' · '),
    ai: { surface: 'call', transcript: p.transcript.map(({ who, text }) => ({ who, text })) },
  };
}

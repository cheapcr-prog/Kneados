/**
 * The real phone line. A Twilio number sends each call here; Twilio turns the caller's speech into text and
 * our text into speech (ConversationRelay), and this file runs the same order taker as the web demo:
 * Claude only talks, and KneadOS prices the order and checks every rule (see src/pizza/orderbot.ts).
 */
import { DEFAULT_FRAUD } from '../src/lib/fraud';
import type { Address } from '../src/pizza/data';
import { PIZZA_SHOP, SPECIALTIES, SIDES } from '../src/pizza/data';
import { quoteTime, upsells } from '../src/pizza/logic';
import {
  EMPTY_ORDER, buildLines, greeting, needsLookup, rememberAddress, settle, ticketFor, turnContext,
  type BotItem, type BotOrder, type BotTurn, type Caller, type ShopNow, type TranscriptLine,
} from '../src/pizza/orderbot';
import { ORDER_MAX_TURNS, orderMessage } from './order';

/* ================================================================ is this really Twilio? */

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(hash: 'SHA-1' | 'SHA-256', key: string, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}
/** Compares without stopping at the first different character. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The signature Twilio puts on a webhook: the URL plus every form field, sorted, signed with the account's Auth Token. */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return b64(await hmac('SHA-1', authToken, data));
}

export async function fromTwilio(authToken: string, url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  return !!signature && same(signature, await twilioSignature(authToken, url, params));
}

const TICKET_SECONDS = 120;
/** A short-lived pass handed to Twilio with the call, so only a call we just answered can open the conversation. */
export async function callTicket(authToken: string, from: string, to: string, now = Date.now()): Promise<string> {
  const body = `${Math.floor(now / 1000) + TICKET_SECONDS}.${from}.${to}`;
  return `${body}.${hex(await hmac('SHA-256', authToken, body))}`;
}
export async function readTicket(authToken: string, ticket: unknown, now = Date.now()): Promise<{ from: string; to: string } | null> {
  if (typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 4) return null;
  const [exp, from, to, sig] = parts;
  if (!same(sig, hex(await hmac('SHA-256', authToken, `${exp}.${from}.${to}`)))) return null;
  if (Number(exp) * 1000 < now) return null;
  return { from, to };
}

/** "+15625550142" to "5625550142". A blocked or odd caller ID becomes "" (a hidden number). */
export function tenDigits(number: string | undefined): string {
  const d = (number ?? '').replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return ten.length === 10 && /^[2-9]/.test(ten) ? ten : '';
}

/* ================================================================ what Twilio is told to do */

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const twiml = (inner: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } });

/** Words the speech recognizer should expect: the menu. */
const HINTS = [...SPECIALTIES.map((s) => s.name), ...SIDES.map((s) => s.name), 'pepperoni', 'jalapeño', 'pickup', 'delivery', 'Detroit', 'gluten free'].map((h) => h.replace(/[,"]/g, '')).slice(0, 60).join(', ');

/** A natural voice for the few lines Twilio reads itself. Without it Twilio falls back to its old robot voice. */
export const SAY_VOICE = 'Polly.Joanna-Generative';
export const say = (text: string) => `<Say voice="${SAY_VOICE}" language="en-US">${xml(text)}</Say>`;

/** The conversation's voice: ElevenLabs, which ConversationRelay includes at no extra charge. */
const TALK_VOICE = 'UgBBYS2sOqTuMpoF3BR0';

export function connectTwiml(host: string, hello: string, ticket: string): Response {
  return twiml(
    `<Connect action="https://${host}/api/voice/done">`
    + `<ConversationRelay url="wss://${host}/api/voice/ws" welcomeGreeting="${xml(hello)}" language="en-US" ttsProvider="ElevenLabs" voice="${TALK_VOICE}" interruptible="any" hints="${xml(HINTS)}">`
    + `<Parameter name="t" value="${xml(ticket)}"/>`
    + '</ConversationRelay></Connect>',
  );
}

/** After the conversation: a handed-off call would ring the manager's phone in a live shop. */
export function doneTwiml(handoff: string | undefined): Response {
  let reason = '';
  try { reason = (JSON.parse(handoff ?? '{}') as { reason?: string }).reason ?? ''; } catch { /* not ours */ }
  if (reason === 'transfer') return twiml(`${say('In a live shop this call would now ring the manager on duty. This is a demo line, so the call ends here. Bye!')}<Hangup/>`);
  return twiml('<Hangup/>');
}

/* ================================================================ the shop, as the server sees it */

/**
 * The phone line has no browser, so it quotes from the oven and drive times with an empty make line,
 * uses the shop's default fraud settings, and cannot text a pay link until the number's texting is registered.
 */
export const LINE_SHOP: ShopNow = {
  quote: (pies, zone) => quoteTime([], pies, { zone, cooks: 2, driversFreeInMin: 0 }).minutes,
  out: [], open: true, fraud: DEFAULT_FRAUD, payLinks: false,
};

/** What the shop remembers about a number that has ordered on this line before. */
export interface SavedCustomer { name: string; address?: string; items: BotItem[]; fulfillment: 'pickup' | 'delivery'; orders: number }

export function callerFrom(phone: string, saved: SavedCustomer | null): Caller {
  if (!saved) return { phone, known: false };
  return { phone, known: true, name: saved.name, address: saved.address, lastLines: buildLines(saved.items, []).lines, lastFulfillment: saved.fulfillment, orders: saved.orders };
}

/** A phone order as the make line receives it. The caller's number is cut to its last four digits. */
export interface PhoneOrder {
  id: string;
  number: number;
  at: string;
  minutes: number;
  last4: string;
  order: BotOrder;
  address?: Address;
  transcript: TranscriptLine[];
}

export interface Line {
  /** Books the order, gives it a number, and remembers the caller for next time. */
  place(order: Omit<PhoneOrder, 'id' | 'number'>, phone: string): Promise<number>;
}

export interface VoiceDeps {
  /** One turn of the order taker. Null when the model could not answer. */
  model: (user: string) => Promise<BotTurn | null>;
  /** Real address lookup. Null: no such address. Undefined: the lookup failed. */
  lookUp: (said: string) => Promise<Address | null | undefined>;
  line: Line;
  /** Speaks to the caller. */
  say: (text: string) => void;
  /** Ends the conversation once the last words have been spoken. */
  end: (afterMs: number, reason: 'placed' | 'transfer' | 'end') => void;
  now?: () => number;
}

export const VOICE_MAX_TURNS = 40;
/** Roughly how long a sentence takes to say, so the call is not cut off mid-word. */
export const speechMs = (text: string) => 1500 + text.length * 75;

/** One phone call, from the greeting to the order on the make line. */
export class VoiceSession {
  order: BotOrder = EMPTY_ORDER;
  transcript: TranscriptLine[];
  over = false;
  private turns = 0;
  private misses = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly caller: Caller, private deps: VoiceDeps) {
    this.transcript = [{ who: 'ai', text: greeting(caller, 'call') }];
  }

  /** The caller finished saying something. Turns are answered one at a time, in order. */
  heard(text: string): Promise<void> {
    this.queue = this.queue.then(() => this.turn(text)).catch((error) => { console.error('Voice turn failed', error); });
    return this.queue;
  }

  /** The caller talked over us: remember only the part they actually heard. */
  interrupted(heardSoFar: string) {
    const last = this.transcript[this.transcript.length - 1];
    if (last?.who === 'ai' && heardSoFar.trim() && heardSoFar.length < last.text.length) last.text = `${heardSoFar.trim()} (the caller spoke over the rest)`;
  }

  private speak(text: string) {
    this.transcript.push({ who: 'ai', text });
    this.deps.say(text);
  }

  private async turn(text: string) {
    const said = text.trim().slice(0, 500);
    if (!said || this.over) return;
    this.transcript.push({ who: 'customer', text: said });
    if (++this.turns > VOICE_MAX_TURNS) return this.finish('Let me get someone to finish this with you.', 'transfer');

    const before = ticketFor(this.order, this.caller, LINE_SHOP);
    const suggestions = upsells(before.lines, []).slice(0, 2).map((u) => `${u.title}. ${u.why}.`);
    const context = turnContext('call', this.caller, this.order, before, LINE_SHOP, suggestions, new Date(this.deps.now?.() ?? Date.now()));
    const turn = await this.deps.model(orderMessage({ surface: 'call', transcript: this.transcript.slice(-ORDER_MAX_TURNS), context }));
    if (!turn) {
      if (++this.misses >= 2) return this.finish("I'm sorry, I'm having trouble on my end. Let me get someone to help you.", 'transfer');
      return this.speak("Sorry, I missed that. Could you say it once more?");
    }
    this.misses = 0;

    // A delivery address the shop has not seen is looked up for real before we answer.
    const where = turn.order.fulfillment === 'delivery' ? turn.order.address : '';
    if (where && needsLookup(where)) {
      const found = await this.deps.lookUp(where);
      if (found !== undefined) rememberAddress(where, found);
    }

    const done = settle(turn, this.order, this.caller, LINE_SHOP, 'call');
    this.order = done.order;
    if (done.outcome === 'continue') return this.speak(done.say);
    if (done.outcome === 'transfer') return this.finish(done.say, 'transfer');
    if (done.outcome === 'end') return this.finish(done.say, 'end');

    const at = new Date(this.deps.now?.() ?? Date.now()).toISOString();
    const order = { ...done.order, name: done.order.name.trim() || this.caller.name || 'Phone order' };
    const number = await this.deps.line.place({
      at, minutes: done.ticket.quoteMinutes, last4: this.caller.phone.slice(-4), order,
      ...(order.fulfillment === 'delivery' && done.ticket.address ? { address: done.ticket.address } : {}),
      transcript: [...this.transcript, { who: 'ai', text: done.say }],
    }, this.caller.phone);
    this.finish(done.placedSay(number), 'placed');
  }

  private finish(text: string, reason: 'placed' | 'transfer' | 'end') {
    this.over = true;
    this.speak(text);
    this.deps.end(speechMs(text), reason);
  }
}

export const NOT_SET_UP = `Hey, thanks for calling ${PIZZA_SHOP.name.replace(/,? Co\.?$/, '')}! Our phone ordering isn't switched on just yet. Please try us again soon.`;

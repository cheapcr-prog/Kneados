/**
 * The real phone line. A Twilio number sends each call here; Twilio turns the caller's speech into text and
 * our text into speech (ConversationRelay), and this file runs the same order taker as the web demo:
 * Claude only talks, and KneadOS prices the order and checks every rule (see src/pizza/orderbot.ts).
 */
import { DEFAULT_FRAUD } from '../src/lib/fraud';
import type { Address } from '../src/pizza/data';
import { PIZZA_SHOP, SPECIALTIES, SIDES, SIZES, TOPPINGS } from '../src/pizza/data';
import { quoteTime, upsells } from '../src/pizza/logic';
import { streetGuesses } from '../src/pizza/streets';
import {
  EMPTY_ORDER, RECENT_ORDER_MINUTES, asksStatus, buildLines, greeting, lineText, needsLookup, recentStatus, rememberAddress, settle, ticketFor, turnContext,
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
const HINTS = [...new Set([...TOPPINGS.map((t) => t.name), ...SIZES.map((s) => s.label), ...SPECIALTIES.map((s) => s.name), ...SIDES.map((s) => s.name), 'pepperoni', 'pineapple', 'jalapeño', 'pickup', 'delivery', 'Detroit', 'gluten free'])].map((h) => h.replace(/[,"]/g, '')).slice(0, 100).join(', ');

/**
 * How the line listens. Elias's first real call (2026-11-16): a small noise cut the assistant off, and a pause
 * mid-sentence ("a large... pepperoni pizza with pineapple") was taken as the end of what he was saying.
 * So: only real speech interrupts, at low sensitivity; "uh huh" and our own echo do not count; and the
 * caller's turn ends when the recognizer judges they are done, not at the first short silence.
 *
 * Second call (same night): replies felt slow and the line "got stuck". The log showed words spoken while the
 * assistant was still talking were thrown away, so the caller waited for an answer that never came. Now speech
 * during our reply is still reported to us, a short "yes" or "ok" is never filtered out, and the wait after
 * the caller stops is shorter.
 */
const LISTENING = 'interruptible="speech" welcomeGreetingInterruptible="speech" interruptSensitivity="low" reportInputDuringAgentSpeech="speech" echoPromptFiltering="true" turnDetection="true" eotThreshold="0.7" speechTimeout="1000"';

/** A natural voice for the few lines Twilio reads itself. Without it Twilio falls back to its old robot voice. */
export const SAY_VOICE = 'Polly.Joanna-Generative';
export const say = (text: string) => `<Say voice="${SAY_VOICE}" language="en-US">${xml(text)}</Say>`;

/** The conversation's voice: ElevenLabs, which ConversationRelay includes at no extra charge. */
// Elias asked for a fun Italian voice (2026-11-16). This is ElevenLabs' native Italian voice, speaking our English lines,
// so the accent is real. The plain American voice it replaced was 'UgBBYS2sOqTuMpoF3BR0'.
const TALK_VOICE = 'uScy1bXtKz8vPzfdFsFw';

/**
 * Menu shorthand a voice reads badly. On a real call (2026-11-16) the Italian voice spelled out "BBQ" letter by letter,
 * so anything spoken is rewritten into plain words first. The written order and the transcript keep the menu's spelling.
 */
const SPOKEN: [RegExp, string][] = [
  [/\bB\.?B\.?Q\b\.?/gi, 'barbecue'],
  [/\bbar-?b-?q(ue)?\b/gi, 'barbecue'],
  [/\bbarbeque\b/gi, 'barbecue'],
  [/\bjalape[nñ]os?\b/gi, 'jalapeños'],
  [/\b2[- ]?(liter|litre|L)\b/g, 'two liter'],
  [/\s*\((\d+)\)/g, ', $1 piece'],
  [/\s*&\s*/g, ' and '],
  [/\bDouble Pep\b/gi, 'Double Pepperoni'],
  [/\bw\//gi, 'with '],
  [/\bapprox\.?\s/gi, 'about '],
  [/\b(\d+)\s?mins?\b/gi, '$1 minutes'],
  [/\b(\d+)\s?(in|")(?=[\s,.]|$)/g, '$1 inch'],
];
export function forSpeech(text: string): string {
  return SPOKEN.reduce((t, [from, to]) => t.replace(from, to), text);
}

export function connectTwiml(host: string, hello: string, ticket: string): Response {
  return twiml(
    `<Connect action="https://${host}/api/voice/done">`
    + `<ConversationRelay url="wss://${host}/api/voice/ws" welcomeGreeting="${xml(forSpeech(hello))}" language="en-US" ttsProvider="ElevenLabs" voice="${TALK_VOICE}" ${LISTENING} hints="${xml(HINTS)}">`
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
/** Pizzas from earlier phone orders that are still waiting to be made, or baking, right now. */
export interface KitchenLoad { ahead: number; inOven: number }

/**
 * What the phone line knows about the kitchen: the phone orders it took that are not ready yet. An order counts as
 * baking for its last minutes before the promised time, and as waiting on the make line before that. Counter and
 * online orders are not seen here until the make line itself lives on the server.
 */
export function kitchenLoad(orders: readonly Pick<PhoneOrder, 'at' | 'minutes' | 'order'>[], now: number): KitchenLoad {
  const load = { ahead: 0, inOven: 0 };
  for (const o of orders) {
    const readyAt = Date.parse(o.at) + o.minutes * 60_000;
    const pies = o.order.items.filter((i) => i.kind === 'pizza').reduce((n, i) => n + Math.max(1, i.qty), 0);
    if (!pies || !(now < readyAt)) continue;
    if (now < readyAt - (PIZZA_SHOP.bakeMinutes + 2) * 60_000) load.ahead += pies; else load.inOven += pies;
  }
  return load;
}

export function lineShop(busy: KitchenLoad = { ahead: 0, inOven: 0 }): ShopNow {
  return {
    quote: (pies, zone) => quoteTime([], pies, { zone, cooks: 2, driversFreeInMin: 0, piesAhead: busy.ahead, piesInOven: busy.inOven }).minutes,
    out: [], open: true, fraud: DEFAULT_FRAUD, payLinks: false,
  };
}
export const LINE_SHOP: ShopNow = lineShop();

/** What the shop remembers about a number that has ordered on this line before. */
export interface SavedCustomer {
  name: string; address?: string; items: BotItem[]; fulfillment: 'pickup' | 'delivery'; orders: number;
  /** Their latest order on this line: its number, when it was placed and the minutes it was quoted. */
  last?: { number: number; at: string; minutes: number };
}

export function callerFrom(phone: string, saved: SavedCustomer | null, now = Date.now()): Caller {
  if (!saved) return { phone, known: false };
  const lastLines = buildLines(saved.items, []).lines;
  const readyAt = saved.last ? Date.parse(saved.last.at) + saved.last.minutes * 60_000 : NaN;
  const recent = saved.last && now < readyAt + RECENT_ORDER_MINUTES * 60_000
    ? { number: saved.last.number, fulfillment: saved.fulfillment, readyAt, summary: lastLines.map(lineText).join(' and ').replace(/ \([^)]*\)/g, '') }
    : undefined;
  return { phone, known: true, name: saved.name, address: saved.address, lastLines, lastFulfillment: saved.fulfillment, orders: saved.orders, ...(recent ? { recent } : {}) };
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
  /** A private record of the call for the shop's own logs: what was heard, what was said, how long a reply took. */
  log?: (entry: { event: 'heard' | 'said' | 'thought' | 'no_answer' | 'filler' | 'started_over' | 'address_fixed'; text: string; ms?: number }) => void;
  /** How long the caller hears nothing before a short "one sec". Tests set it; live it is FILLER_AFTER_MS. */
  fillerAfterMs?: number;
  /** Phone orders still being made when this call came in, so the wait quoted is honest. */
  busy?: KitchenLoad;
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

/** Dead air on a phone feels broken. If a reply is taking this long, the caller hears a short filler first. */
// On the third real call this was 1600 ms and it fired on every turn, a fraction of a second before the
// real reply, which sounded like a stutter. It is now only for a reply that is truly late.
export const FILLER_AFTER_MS = 4000;
const FILLERS = ['Un momento!', 'Okay, one moment.', 'One sec, one sec.'];

/** The caller is finished adding things. */
const DONE_ORDERING = /\b(that'?s (it|all|everything)|that is (it|all|everything)|that (would|will) be (it|all)|nothing else|no,? that'?s|complete (the|my) order|place (the|my|it)|i'?m (good|done|all set))\b/i;

/** One phone call, from the greeting to the order on the make line. */
export class VoiceSession {
  order: BotOrder = EMPTY_ORDER;
  transcript: TranscriptLine[];
  over = false;
  private turns = 0;
  private misses = 0;
  /** Things the caller said that have not been answered yet. Said in a row, they are answered as one. */
  private pending: string[] = [];
  private queue: Promise<void> = Promise.resolve();
  private shop: ShopNow;

  constructor(readonly caller: Caller, private deps: VoiceDeps) {
    this.shop = lineShop(deps.busy);
    this.transcript = [{ who: 'ai', text: greeting(caller, 'call', deps.now?.() ?? Date.now()) }];
  }

  /** The caller finished saying something. Turns are answered one at a time, in order. */
  heard(text: string): Promise<void> {
    const said = text.trim().slice(0, 500);
    if (said) this.pending.push(said);
    this.queue = this.queue.then(() => this.turn()).catch((error) => { console.error('Voice turn failed', error); });
    return this.queue;
  }

  /** The caller talked over us: remember only the part they actually heard. */
  interrupted(heardSoFar: string) {
    const last = this.transcript[this.transcript.length - 1];
    if (last?.who === 'ai' && heardSoFar.trim() && heardSoFar.length < last.text.length) last.text = `${heardSoFar.trim()} (the caller spoke over the rest)`;
  }

  private speak(text: string) {
    this.transcript.push({ who: 'ai', text });
    this.deps.log?.({ event: 'said', text });
    this.deps.say(forSpeech(text));
  }

  /** Everything waiting to be answered becomes one line of the conversation. */
  private takePending(): boolean {
    const said = this.pending.splice(0).join(' ').slice(0, 500);
    if (!said) return false;
    this.transcript.push({ who: 'customer', text: said });
    this.deps.log?.({ event: 'heard', text: said });
    return true;
  }

  private async turn() {
    if (this.over) { this.pending = []; return; }
    if (!this.takePending()) return;
    if (++this.turns > VOICE_MAX_TURNS) return this.finish('Let me get someone to finish this with you.', 'transfer');

    // "Where's my order?" about the one they just placed is answered from the order itself, with no AI in between.
    const justSaid = this.transcript[this.transcript.length - 1]?.text ?? '';
    if (this.caller.recent && !this.order.items.length && asksStatus(justSaid)) {
      return this.speak(`${recentStatus(this.caller.recent, this.deps.now?.() ?? Date.now())} Is there anything else I can help you with?`);
    }

    const before = ticketFor(this.order, this.caller, this.shop);
    // Once the caller has said that is everything, nothing more is suggested.
    const wrappingUp = this.transcript.some((l) => l.who === 'customer' && DONE_ORDERING.test(l.text));
    const suggestions = wrappingUp ? [] : upsells(before.lines, []).slice(0, 2).map((u) => `${u.title}. ${u.why}.`);
    const context = turnContext('call', this.caller, this.order, before, this.shop, suggestions, new Date(this.deps.now?.() ?? Date.now()));
    let turn: BotTurn | null = null;
    // If the caller says more while we are working out a reply, that reply is stale: start over with all of it.
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      const filler = setTimeout(() => {
        const text = FILLERS[this.turns % FILLERS.length];
        this.deps.log?.({ event: 'filler', text });
        this.deps.say(text);
      }, this.deps.fillerAfterMs ?? FILLER_AFTER_MS);
      try {
        turn = await this.deps.model(orderMessage({ surface: 'call', transcript: this.transcript.slice(-ORDER_MAX_TURNS), context }));
      } finally {
        clearTimeout(filler);
      }
      this.deps.log?.({ event: turn ? 'thought' : 'no_answer', text: '', ms: Date.now() - started });
      if (attempt === 2 || !this.takePending()) break;
      this.deps.log?.({ event: 'started_over', text: '' });
    }
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
      // No such address: the street may have been misheard ("Eximino" for Ximeno). Check the real streets that
      // sound like it. The address file still has to find the house, and the caller hears the corrected address.
      if (found === null) {
        const guesses = streetGuesses(where);
        const checked = await Promise.all(guesses.map((g) => this.deps.lookUp(g.address).catch(() => undefined)));
        const hit = checked.findIndex((a) => a);
        const fixed = checked[hit];
        if (fixed) {
          const { heard, street } = guesses[hit];
          rememberAddress(fixed.line, fixed);
          const mention = new RegExp(heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
          const said = turn.say.replace(mention, street);
          turn = { ...turn, order: { ...turn.order, address: fixed.line }, say: said.includes(street) ? said : `I have that as ${fixed.line}. ${said}` };
          this.deps.log?.({ event: 'address_fixed', text: `${heard} -> ${street}` });
        }
      }
    }

    const done = settle(turn, this.order, this.caller, this.shop, 'call');
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

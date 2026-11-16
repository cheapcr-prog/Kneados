import { Bike, Bot, ChefHat, CreditCard, MessageSquare, Mic, MicOff, Phone, PhoneOff, Play, RotateCcw, Send, ShieldCheck, Sparkles, Store, UserRound, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFraud } from '../../components/Fraud';
import { formatPhone, money } from '../../lib/money';
import { PIZZA_SHOP, PIZZA_STAFF, SIDE_BY_ID, SPECIALTY_BY_ID, ZONES } from '../data';
import { MINUTE, lineCents, pizzaDetails, pizzaTitle, quoteTime, upsells, type PizzaLine } from '../logic';
import { EMPTY_ORDER, fill, greeting, missing, offersWrongPayment, oneQuestion, quickReplies, ticketFor, turnContext, type BotOrder, type BotTurn, type Caller, type ShopNow, type Surface, type Ticket, type TranscriptLine } from '../orderbot';
import { SAMPLES, type Sample } from '../orderbotSamples';
import { PizzaArt } from '../PizzaArt';
import { usePizzaBrain } from '../brain';
import { usePizza, type PizzaState } from '../store';

/** A number nobody has ordered from, and a caller who hides theirs. */
const NEW_NUMBER = '5625550188';
type Phase = 'idle' | 'live' | 'placed' | 'transferred' | 'ended';
type Row = TranscriptLine & { pay?: 'due' | 'paid'; note?: boolean };
type ApiError = 'off' | 'capped' | 'limit' | 'bad' | 'refused' | 'busy';

const ERRORS: Record<ApiError, string> = {
  off: 'The live AI is not switched on for this demo right now. The sample conversations below still play.',
  capped: "The demo's AI budget for today is used up. The sample conversations below still play, and the live AI is back tomorrow.",
  limit: 'You have reached the demo limit for today. The sample conversations below still play.',
  bad: 'That did not go through. Try saying it another way.',
  refused: 'The AI could not answer that one. Try saying it another way.',
  busy: 'The AI took too long to answer. Say it once more.',
};

const PAY_LABEL: Record<string, string> = { pay_at_pickup: 'Pays at the counter', pay_link: 'Pay link by text', cash_at_door: 'Cash at the door' };

/* ------------------------------------------------------------------ who is calling */

function callerFor(phone: string, state: PizzaState): Caller {
  if (!phone) return { phone: '', known: false };
  const member = state.members.find((m) => m.phone === phone);
  const orders = state.orders.filter((o) => o.customer.phone === phone);
  const last = orders[orders.length - 1];
  const address = [...orders].reverse().find((o) => o.customer.address)?.customer.address;
  if (!member && !last) return { phone, known: false };
  return {
    phone, known: true, name: member?.name ?? last?.customer.name, address,
    lastLines: last?.lines, lastFulfillment: last?.fulfillment,
    orders: member?.visits ?? orders.length, punches: member?.punches, freePizza: member?.rewards, favorite: member?.favorite,
  };
}

/* ------------------------------------------------------------------ voice: the browser's own speech in and out */

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
const recognitionClass = (): (new () => Recognition) | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  const liked = ['Samantha', 'Google US English', 'Aria', 'Jenny', 'Ava', 'Allison'];
  return liked.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ?? voices.find((v) => v.lang === 'en-US') ?? voices[0];
}

/** Says a line out loud and resolves when it is done (right away when the browser cannot speak or sound is off). */
function speak(text: string, on: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!on || !canSpeak()) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text.replace(/#(\d)/g, 'number $1'));
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    // Some browsers never fire "end" when speech is cut off, so a timer backs it up.
    const backup = window.setTimeout(resolve, 2500 + text.length * 90);
    u.onend = u.onerror = () => { window.clearTimeout(backup); resolve(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}
const hush = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/* ------------------------------------------------------------------ the page */

/**
 * AI phone and text ordering. A visitor plays the customer: talk, type or text, and watch the ticket form
 * with real prices and the shop's own rules. A confirmed order goes straight to the make line.
 */
export function AiOrders() {
  const demo = usePizza();
  const { state, history, placeOrder, addTexts } = demo;
  const brain = usePizzaBrain(demo, Date.now());
  const fraud = useFraud();
  const [params] = useSearchParams();
  const [surface, setSurface] = useState<Surface>('call');
  const fromRegister = (params.get('caller') ?? '').replace(/\D/g, '').slice(0, 10);

  // Demo callers: the two most recent regulars with a saved address, a number the shop has never seen, and a hidden number.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const regulars: string[] = [];
    for (const o of state.orders) if (o.customer.phone.length === 10 && o.customer.address && !o.scheduled && !seen.has(o.customer.phone)) { seen.add(o.customer.phone); regulars.push(o.customer.phone); }
    const picks = [...(fromRegister.length === 10 ? [fromRegister] : []), ...regulars.slice(0, 2), NEW_NUMBER, ''];
    return [...new Set(picks)].map((p) => callerFor(p, state));
    // The list is fixed for the visit: orders the AI places must not reshuffle who can call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.today, fromRegister]);
  const [who, setWho] = useState(0);
  const caller = useMemo(() => callerFor(options[who]?.phone ?? '', state), [options, who, state]);

  const [rows, setRows] = useState<Row[]>([]);
  const [order, setOrder] = useState<BotOrder>(EMPTY_ORDER);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [placed, setPlaced] = useState<{ number: number; total: number; minutes: number; bankConfirm: boolean; idCheck: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [sound, setSound] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [, tick] = useState(0);

  // The newest values, for the async steps of a conversation.
  const live = useRef({ rows, order, phase, caller, surface, sound, run: 0 });
  live.current = { ...live.current, rows, order, phase, caller, surface, sound };
  const rec = useRef<Recognition | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch('/api/order').then((r) => r.json()).then((d: { ready?: boolean }) => setReady(!!d.ready)).catch(() => setReady(false)); }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [rows, busy, heard]);
  useEffect(() => {
    if (phase !== 'live' || surface !== 'call') return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase, surface]);
  // Leaving the page hangs up.
  useEffect(() => () => { live.current.run++; hush(); rec.current?.abort(); }, []);

  const active = useMemo(() => state.orders.filter((o) => o.status !== 'done'), [state.orders]);
  const shop: ShopNow = useMemo(() => ({
    quote: (pies, zone) => quoteTime(active, pies, { zone, cooks: brain.cooks, driversFreeInMin: brain.freeIn }).minutes,
    out: state.out, open: true, fraud: fraud.settings,
  }), [active, brain.cooks, brain.freeIn, state.out, fraud.settings]);
  const ticket = useMemo(() => ticketFor(order, caller, shop), [order, caller, shop]);
  const suggest = useCallback((t: Ticket) => upsells(t.lines, history, brain.facts.tomorrow.event ?? undefined).slice(0, 2).map((u) => `${u.title}. ${u.why}.`), [history, brain.facts.tomorrow.event]);
  const needs = missing(order, ticket, surface);
  const lastRow = rows[rows.length - 1];
  const replies = phase === 'live' && lastRow?.who === 'ai' ? quickReplies(lastRow.text, order, ticket) : [];

  const reset = useCallback((nextPhase: Phase = 'idle') => {
    live.current.run++;
    hush(); rec.current?.abort();
    setRows([]); setOrder(EMPTY_ORDER); setPhase(nextPhase); setBusy(false); setError(null); setPlaced(null); setDraft(''); setListening(false); setHeard(''); setPlaying(null);
  }, []);

  /** Sends a confirmed order to the make line, exactly like the register does. */
  const place = (o: BotOrder, t: Ticket, transcript: Row[]) => {
    const now = Date.now();
    const c = live.current.caller;
    const s = live.current.surface;
    const name = o.name.trim() || c.name || (s === 'text' ? 'Text order' : 'Phone order');
    const done = placeOrder({
      channel: 'phone', fulfillment: o.fulfillment === 'delivery' ? 'delivery' : 'pickup', createdAt: new Date(now).toISOString(), promisedAt: new Date(now + t.quoteMinutes * MINUTE).toISOString(),
      customer: { name, phone: c.phone, ...(o.fulfillment === 'delivery' && t.address && t.zone ? { address: t.address.line, x: t.address.x, y: t.address.y, zone: t.zone } : {}) },
      lines: t.lines, ...t.totals, payment: o.payment === 'pay_link' ? 'online' : o.payment === 'cash_at_door' ? 'cash' : 'card', status: 'new',
      note: [o.note.trim(), o.payment === 'pay_link' ? 'Pay link sent' : o.payment === 'cash_at_door' ? 'Cash at the door' : 'Pays at the counter'].filter(Boolean).join(' · '),
      ...(o.payment === 'pay_link' ? { fraud: { flags: t.policy.idCheck ? ['Phone order paid by link: check photo ID'] : [], idCheck: t.policy.idCheck } } : {}),
      ai: { surface: s, transcript: transcript.map(({ who, text }) => ({ who, text })) },
    }, { rewardPhone: c.phone });
    if (done && o.payment === 'pay_link' && c.phone) addTexts([{ to: c.phone, body: `${PIZZA_SHOP.name}: Pay for order #${done.number} (${money(t.totals.total)}) here: kneados.app/pay/${done.number}`, at: new Date().toISOString(), kind: 'paylink' }]);
    return done;
  };

  /** Takes the AI's turn: prices the order, checks the rules, and only then lets an order through. */
  const apply = async (turn: BotTurn, transcript: Row[], run: number) => {
    const c = live.current.caller;
    const s = live.current.surface;
    const t = ticketFor(turn.order, c, shop);
    const open = missing(turn.order, t, s);
    let say = fill(turn.say, t);
    let next: Phase = 'live';
    const extra: Row[] = [];
    if (t.policy.transfer || turn.action === 'transfer') {
      // Too big for the AI, or the customer asked for a person: a manager picks it up with everything so far.
      if (t.policy.transfer && turn.action !== 'transfer') say = open[0].ask;
      next = 'transferred';
      const manager = PIZZA_STAFF.find((x) => x.role === 'manager')?.name ?? 'the manager';
      extra.push({ who: 'shop', note: true, text: `Handed to ${manager}, manager on duty, with the conversation and the ticket so far.` });
    } else if (turn.action === 'place_order') {
      // The AI may only send an order that is complete and inside the shop's rules. Otherwise KneadOS asks for what is missing.
      if (open.length) say = open[0].ask;
      else {
        const done = place(turn.order, t, [...transcript, { who: 'ai', text: say }]);
        if (done) {
          say = fill(turn.say, t, { number: done.number });
          next = 'placed';
          setPlaced({ number: done.number, total: t.totals.total, minutes: t.quoteMinutes, bankConfirm: t.policy.bankConfirm, idCheck: t.policy.idCheck });
          extra.push({ who: 'shop', note: true, text: `Order #${done.number} is on the make line. Quoted ${t.quoteMinutes} min.` });
          if (turn.order.payment === 'pay_link') extra.push({ who: 'shop', pay: 'due', text: `Pay ${money(t.totals.total)} for order #${done.number}: kneados.app/pay/${done.number}` });
        }
      }
    } else if (turn.action === 'end') next = 'ended';
    else {
      // The customer picked a way to pay that this order cannot use (the total may have just crossed a limit): KneadOS says so right away.
      const pay = open.find((n) => n.code === 'payment_not_allowed');
      const ask = open.find((n) => n.code === 'payment');
      if (pay) { say = pay.ask; turn = { ...turn, order: { ...turn.order, payment: '' } }; }
      // The AI offered a way to pay that does not fit this order (the counter on a delivery): KneadOS asks with the right ones.
      else if (ask && !t.policy.noDelivery && offersWrongPayment(say, turn.order)) say = ask.ask;
      // One question at a time, so a plain "yes" always has one meaning.
      else say = oneQuestion(say);
    }
    const after: Row[] = [...transcript, { who: 'ai', text: say }, ...extra];
    if (live.current.run !== run) return after;
    setOrder(turn.order);
    setRows(after);
    setPhase(next);
    live.current.phase = next;
    setBusy(false);
    if (s === 'call') await speak(say, live.current.sound);
    return after;
  };

  const listen = useCallback(() => {
    const Rec = recognitionClass();
    if (!Rec || live.current.phase !== 'live') return;
    hush();
    rec.current?.abort();
    const r = new Rec();
    rec.current = r;
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
    let final = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript; }
      setHeard((final + ' ' + interim).trim());
    };
    r.onerror = () => { setListening(false); };
    r.onend = () => { setListening(false); setHeard(''); if (final.trim()) void sendRef.current(final.trim()); };
    setListening(true); setHeard('');
    try { r.start(); } catch { setListening(false); }
  }, []);

  const send = async (text: string) => {
    const said = text.trim().slice(0, 500);
    if (!said || busy || live.current.phase !== 'live') return;
    const run = live.current.run;
    hush();
    const transcript: Row[] = [...live.current.rows, { who: 'customer', text: said }];
    setRows(transcript); setDraft(''); setBusy(true); setError(null);
    const s = live.current.surface;
    const c = live.current.caller;
    const before = ticketFor(live.current.order, c, shop);
    let turn: BotTurn | null = null;
    let problem: ApiError | null = null;
    try {
      const res = await fetch('/api/order', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ surface: s, transcript: transcript.map(({ who, text: line }) => ({ who, text: line })), context: turnContext(s, c, live.current.order, before, shop, suggest(before)) }),
      });
      const data = (await res.json()) as BotTurn | { error: ApiError };
      if ('error' in data) problem = data.error; else turn = data;
    } catch { problem = 'busy'; }
    if (live.current.run !== run) return;
    if (!turn) { setBusy(false); setError(problem ?? 'busy'); if (problem === 'off' || problem === 'capped' || problem === 'limit') setReady(false); return; }
    await apply(turn, transcript, run);
    // Hands-free on a call: once the AI has finished talking, the mic opens for the customer.
    if (live.current.run === run && live.current.phase === 'live' && s === 'call' && handsFree.current) listen();
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  const handsFree = useRef(false);

  const start = async (talk: boolean) => {
    reset('live');
    const run = live.current.run;
    handsFree.current = talk && surface === 'call' && !!recognitionClass();
    setStartedAt(Date.now());
    const hello = greeting(caller, surface);
    setRows([{ who: 'ai', text: hello }]);
    live.current.phase = 'live';
    if (surface === 'call') { await speak(hello, sound); if (live.current.run === run && handsFree.current) listen(); }
  };

  /** Plays a recorded conversation. Only the words are recorded: the ticket, prices and rules run live. */
  const play = async (sample: Sample) => {
    const index = options.findIndex((o) => (sample.caller === 'hidden' ? !o.phone : sample.caller === 'new' ? o.phone === NEW_NUMBER : o.known && !!o.address));
    reset('live');
    const run = live.current.run;
    handsFree.current = false;
    setSurface(sample.surface); setWho(Math.max(0, index)); setPlaying(sample.id); setStartedAt(Date.now());
    const c = options[Math.max(0, index)];
    live.current = { ...live.current, caller: c, surface: sample.surface, phase: 'live' };
    const hello = greeting(c, sample.surface);
    let transcript: Row[] = [{ who: 'ai', text: hello }];
    setRows(transcript);
    if (sample.surface === 'call') await speak(hello, live.current.sound); else await wait(1200);
    for (const step of sample.steps) {
      if (live.current.run !== run) return;
      await wait(500);
      transcript = [...transcript, { who: 'customer', text: step.customer }];
      setRows(transcript); setBusy(true);
      await wait(Math.min(2600, 700 + step.customer.length * 22));
      if (live.current.run !== run) return;
      transcript = await apply(step.turn, transcript, run);
      if (live.current.run !== run) return;
      if (sample.surface === 'text') await wait(1700);
    }
    setPlaying(null);
  };

  const payNow = () => {
    if (!placed) return;
    setRows((r) => [...r.map((x) => (x.pay === 'due' ? { ...x, pay: 'paid' as const } : x)), { who: 'shop', note: true, text: `Paid ${money(placed.total)} on the link.${placed.bankConfirm ? ' The bank confirmed it with the cardholder.' : ''}${placed.idCheck ? ' Photo ID is checked at handoff.' : ''}` }]);
  };

  const canHear = !!recognitionClass();
  const seconds = phase === 'live' ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const over = phase === 'placed' || phase === 'transferred' || phase === 'ended';
  const callerLabel = (c: Caller) => (!c.phone ? 'Hidden number' : c.known ? c.name ?? formatPhone(c.phone) : 'New caller');

  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-100">
      <div className="mx-auto max-w-[1400px] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Bot size={24} className="text-emerald-600" /> AI phone and text orders</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-600">The AI answers every call and text, knows the menu and tonight's wait, recognizes regulars, and sends the order straight to the make line. You play the customer.</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm">
            {(['call', 'text'] as const).map((s) => (
              <button key={s} onClick={() => { if (s !== surface) { reset(); setSurface(s); } }} className={`flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold ${surface === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {s === 'call' ? <Phone size={15} /> : <MessageSquare size={15} />} {s === 'call' ? 'Phone call' : 'Text message'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* ------------------------------------------------ the conversation */}
          <section className={`flex min-h-[560px] flex-col ${phase === 'idle' ? '' : 'h-[72vh]'} overflow-hidden rounded-3xl bg-ink-900 text-white shadow-lg`}>
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${phase === 'live' ? 'bg-emerald-500' : 'bg-white/10'}`}>{surface === 'call' ? <Phone size={18} /> : <MessageSquare size={18} />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{callerLabel(caller)} <span className="font-normal text-slate-400">{caller.phone ? formatPhone(caller.phone) : 'caller ID blocked'}</span></p>
                <p className="truncate text-xs text-slate-400">
                  {phase === 'live' ? (surface === 'call' ? `On the line ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Texting the shop') : phase === 'idle' ? (caller.known ? `Regular: ${caller.orders ?? 1} orders${caller.address ? `, delivers to ${caller.address}` : ''}` : caller.phone ? 'Never ordered before' : 'The shop cannot see this number') : phase === 'placed' ? 'Order placed' : phase === 'transferred' ? 'With the manager' : 'Call ended'}
                </p>
              </div>
              {surface === 'call' && <button aria-label={sound ? 'Mute the AI voice' : 'Unmute the AI voice'} onClick={() => { setSound(!sound); if (sound) hush(); }} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>}
              {phase !== 'idle' && <button onClick={() => reset()} className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-2 text-xs font-bold hover:bg-rose-600">{surface === 'call' && phase === 'live' ? <><PhoneOff size={14} /> Hang up</> : <><RotateCcw size={14} /> Start over</>}</button>}
            </div>

            {phase === 'idle' ? (
              <div className="flex flex-1 flex-col justify-center gap-5 p-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Who is {surface === 'call' ? 'calling' : 'texting'}?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {options.map((c, i) => (
                      <button key={c.phone || 'hidden'} onClick={() => setWho(i)} className={`rounded-2xl border p-3 text-left ${who === i ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                        <p className="flex items-center gap-1.5 text-sm font-bold"><UserRound size={14} /> {callerLabel(c)}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{!c.phone ? 'Caller ID blocked. Pickup only, paid at the counter.' : c.known ? `Usual: ${(c.lastLines ?? []).map((l) => (l.kind === 'pizza' ? pizzaTitle(l as PizzaLine) : SIDE_BY_ID[l.sideId].name)).join(', ') || SPECIALTY_BY_ID[c.favorite ?? '']?.name || 'no orders yet'}` : 'First order. Bigger deliveries are paid on a secure link.'}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {surface === 'call' ? (
                    <>
                      <button disabled={!canHear || ready === false} onClick={() => void start(true)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-base font-bold hover:bg-emerald-400 disabled:opacity-40"><Mic size={18} /> Call and talk</button>
                      <button disabled={ready === false} onClick={() => void start(false)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-4 text-base font-bold hover:bg-white/20 disabled:opacity-40"><Phone size={18} /> Call and type</button>
                    </>
                  ) : (
                    <button disabled={ready === false} onClick={() => void start(false)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-base font-bold hover:bg-emerald-400 disabled:opacity-40"><MessageSquare size={18} /> Text the shop</button>
                  )}
                </div>
                {surface === 'call' && !canHear && <p className="text-xs text-amber-300">This browser cannot listen through the mic. Chrome, Edge and Safari can. You can still type what you would say.</p>}
                {ready === false && <p className="rounded-xl bg-amber-400/15 p-3 text-xs text-amber-200">{error ? ERRORS[error] : ERRORS.off}</p>}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Or watch a sample</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {SAMPLES.map((s) => (
                      <button key={s.id} onClick={() => void play(s)} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                        <p className="flex items-center gap-1.5 text-sm font-bold"><Play size={13} className="text-emerald-400" /> {s.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{s.blurb}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">Samples replay recorded words, so they are free and work at any hour. The ticket, prices, wait time and rules still run live.</p>
                </div>
              </div>
            ) : (
              <>
                <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto p-4" aria-live="polite">
                  {rows.map((r, i) => r.note ? (
                    <p key={i} className="mx-auto flex max-w-md items-center justify-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-center text-xs font-semibold text-emerald-200"><ChefHat size={13} className="shrink-0" /> {r.text}</p>
                  ) : r.pay ? (
                    <div key={i} className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-white p-3 text-slate-900">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Text from {PIZZA_SHOP.name}</p>
                      <p className="mt-0.5 text-sm">{r.text}</p>
                      {r.pay === 'due'
                        ? <button onClick={payNow} className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CreditCard size={13} /> Open the link and pay (demo, nothing is charged)</button>
                        : <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck size={13} /> Paid</p>}
                    </div>
                  ) : (
                    <div key={i} className={`flex ${r.who === 'customer' ? 'justify-end' : 'justify-start'}`}>
                      <p className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${r.who === 'customer' ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white/10 text-slate-100'}`}>
                        {r.who === 'ai' && <span className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300"><Bot size={11} /> AI</span>}
                        {r.text}
                      </p>
                    </div>
                  ))}
                  {busy && <p className="flex items-center gap-1.5 text-xs text-slate-400"><span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}</span></p>}
                  {listening && <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-emerald-400/60 px-3.5 py-2.5 text-[15px] text-emerald-200">{heard || 'Listening…'}</p></div>}
                  {error && <p className="rounded-xl bg-amber-400/15 p-3 text-xs text-amber-200">{ERRORS[error]}</p>}
                </div>
                {playing ? (
                  <p className="border-t border-white/10 px-4 py-3 text-center text-xs text-slate-400">Playing a sample. <button onClick={() => reset()} className="font-bold text-white underline">Stop</button></p>
                ) : over ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
                    {placed && <Link to="/pizza/demo/kitchen" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold hover:bg-emerald-400"><ChefHat size={15} /> See order #{placed.number} on the make line</Link>}
                    <button onClick={() => reset()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20"><RotateCcw size={15} /> New {surface === 'call' ? 'call' : 'text'}</button>
                  </div>
                ) : (
                  <>
                  {!busy && !listening && replies.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2 px-3 pb-2" aria-label="Quick replies">
                      {replies.map((r) => <button key={r} type="button" onClick={() => void send(r)} className="rounded-full border border-emerald-400/60 px-3.5 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500 hover:text-white">{r}</button>)}
                    </div>
                  )}
                  <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex items-center gap-2 border-t border-white/10 p-3">
                    {surface === 'call' && canHear && (
                      <button type="button" aria-label={listening ? 'Stop listening' : 'Talk'} onClick={() => { if (listening) rec.current?.stop(); else { handsFree.current = true; listen(); } }} disabled={busy} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-rose-500' : 'bg-emerald-500 hover:bg-emerald-400'} disabled:opacity-40`}>
                        {listening ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                    )}
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder={surface === 'call' ? 'Or type what you would say' : 'Text message'} className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-3 text-[15px] text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <button type="submit" aria-label="Send" disabled={busy || !draft.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-ink-900 disabled:opacity-30"><Send size={18} /></button>
                  </form>
                  </>
                )}
              </>
            )}
          </section>

          {/* ------------------------------------------------ the ticket forming */}
          <aside className="flex flex-col rounded-3xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{placed ? `Ticket #${placed.number}` : 'Ticket'}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${placed ? 'bg-emerald-100 text-emerald-800' : phase === 'live' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{placed ? 'On the make line' : phase === 'live' ? 'Building live' : 'Waiting for a call'}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold">{order.fulfillment === 'delivery' ? <Bike size={12} /> : <Store size={12} />} {order.fulfillment ? (order.fulfillment === 'delivery' ? `Delivery${ticket.address ? ` to ${ticket.address.line}` : ''}` : 'Pickup') : 'Pickup or delivery?'}</span>
              {(order.name || caller.name) && <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold"><UserRound size={12} /> {order.name || caller.name}</span>}
              {order.payment && <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold"><CreditCard size={12} /> {PAY_LABEL[order.payment]}</span>}
            </div>
            <ul className="mt-3 flex-1 divide-y divide-slate-100">
              {ticket.lines.length === 0 && <li className="py-10 text-center text-sm text-slate-400">The order shows up here as the customer talks.</li>}
              {ticket.lines.map((l, i) => (
                <li key={i} className="flex items-start gap-2.5 py-2.5">
                  {l.kind === 'pizza'
                    ? (l.specialtyId && Object.keys(l.config.toppings).every((id) => SPECIALTY_BY_ID[l.specialtyId!].toppings.includes(id) && l.config.toppings[id] === 'whole')
                      ? <img src={SPECIALTY_BY_ID[l.specialtyId].photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      : <PizzaArt config={l.config} size={48} className="shrink-0" />)
                    : <img src={SIDE_BY_ID[l.sideId].photo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{l.qty > 1 ? `${l.qty} × ` : ''}{l.kind === 'pizza' ? pizzaTitle(l as PizzaLine) : SIDE_BY_ID[l.sideId].name}</p>
                    {l.kind === 'pizza' && <p className="text-xs text-slate-500">{pizzaDetails(l.config, l.specialtyId).join(' · ')}</p>}
                  </div>
                  <span className="tabular text-sm">{money(lineCents(l))}</span>
                </li>
              ))}
            </ul>
            {order.note && ticket.lines.length > 0 && <p className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><b className="text-slate-800">Note for the kitchen:</b> {order.note}</p>}
            {ticket.lines.length > 0 && (
              <>
                <dl className="tabular space-y-0.5 border-t border-slate-100 pt-2 text-sm">
                  <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(ticket.totals.subtotal)}</dd></div>
                  {ticket.totals.deliveryFee > 0 && <div className="flex justify-between"><dt>Delivery ({ZONES.find((z) => z.id === ticket.zone)?.label.split(',')[0]})</dt><dd>{money(ticket.totals.deliveryFee)}</dd></div>}
                  <div className="flex justify-between"><dt>Tax</dt><dd>{money(ticket.totals.tax)}</dd></div>
                  <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{money(ticket.totals.total)}</dd></div>
                </dl>
                <p className="mt-1 text-xs text-slate-500">{placed ? 'Quoted' : 'Quoting'} <b>{placed?.minutes ?? ticket.quoteMinutes} min</b> from tonight's make line{order.fulfillment === 'delivery' ? ' and drivers' : ''}. The AI reads these numbers; it never makes one up.</p>
              </>
            )}
            {phase !== 'idle' && !placed && needs.length > 0 && ticket.lines.length > 0 && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-bold text-slate-800">Still needed before it can go to the kitchen</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{needs.slice(0, 4).map((n, i) => <li key={i}>{n.note}</li>)}</ul>
              </div>
            )}
            {ticket.policy.reasons.length > 0 && ticket.lines.length > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
                <p className="flex items-center gap-1 font-bold"><ShieldCheck size={13} /> Shop rules on this order</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{ticket.policy.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
          </aside>
        </div>

        {/* ------------------------------------------------ what it knows, and going live */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card icon={Sparkles} title="What the AI knows on every call">
            <li>The whole menu: sizes, crusts, sauces, halves, extras, bake and cut notes.</li>
            <li>Tonight: wait is <b>{shop.quote(1)} min</b> pickup and <b>{shop.quote(1, 'B')} min</b> delivery{state.out.length ? `, and what is sold out (${state.out.length} item${state.out.length === 1 ? '' : 's'})` : ', and anything the kitchen marks sold out'}.</li>
            <li>The caller: name, usual order, saved address and rewards, from caller ID.</li>
            <li>One add-on worth offering, picked from what actually sells here.</li>
            <li>Every price, tax, fee and wait time comes from KneadOS, not from the AI.</li>
          </Card>
          <Card icon={ShieldCheck} title="Rules it cannot be talked out of">
            <li>It never takes a card number by voice or text. Cards are paid on a secure link.</li>
            <li>A first delivery over {money(fraud.settings.bigFirstOrderCents)} is paid on the link before it is made.</li>
            <li>Link orders over {money(fraud.settings.idCheckOverCents)} get photo ID checked at handoff.</li>
            <li>A hidden number gets pickup only, paid at the counter. No driver goes to a prank address.</li>
            <li>Very large orders, complaints and anyone who asks for a person go to the manager.</li>
            <li className="list-none pt-1"><Link to="/pizza/demo/owner/money" className="font-bold text-emerald-700 underline">Change the amounts in Fraud protection</Link></li>
          </Card>
          <Card icon={Phone} title="What it takes on a real phone line">
            <li>The shop keeps its number. Calls forward to the AI always, or only when nobody picks up.</li>
            <li>A phone and text line from Twilio: $1.15 a month, plus a one-time text registration of about $20.</li>
            <li>A 3 minute call costs about 30 cents all in (line, speech and Claude). A text order is under 20 cents.</li>
            <li>At 600 phone orders a month that is roughly $180, with no missed calls and no hold music.</li>
            <li className="list-none pt-1 text-[11px] text-slate-400">Estimates from Twilio and Anthropic list prices on Nov 16, 2026. In this demo your browser does the listening and speaking.</li>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-display text-base font-bold"><Icon size={17} className="text-emerald-600" /> {title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">{children}</ul>
    </section>
  );
}

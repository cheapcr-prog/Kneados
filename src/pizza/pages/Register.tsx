import { Bike, Bot, Delete, MapPin, Phone, PhoneIncoming, Sparkles, Store, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTick } from '../../components/Breaks';
import { formatPhone, money } from '../../lib/money';
import { ADDRESSES, SIDES, SIDE_BY_ID, SIZES, SPECIALTIES, SPECIALTY_BY_ID, ZONES } from '../data';
import { MINUTE, configFor, lineCents, pizzaDetails, pizzaPrice, pizzaTitle, quoteTime, totals, upsells, zoneFor, type Line, type PizzaLine } from '../logic';
import { Builder } from '../Builder';
import { usePizzaBrain } from '../brain';
import { usePizza } from '../store';
import { Modal } from './Shop';

type Person = { phone: string; name: string; address?: string; at: string };
/** A number nobody has ordered from before, so the demo also shows what a new caller looks like. */
const NEW_CALLER = '5625550188';

/**
 * The counter and phone register. The customer is the slow part of a phone order, so the register does the typing:
 * caller ID answers with one tap, recent callers are one tap, a few digits find a regular, and a known number
 * fills in the name, the address and what they usually get.
 */
export function PizzaRegister() {
  useTick(15_000);
  const demo = usePizza();
  const { state, history, placeOrder } = demo;
  const brain = usePizzaBrain(demo, Date.now());
  const [cart, setCart] = useState<Line[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup');
  const [channel, setChannel] = useState<'phone' | 'counter'>('phone');
  const [addr, setAddr] = useState(0);
  const [build, setBuild] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [done, setDone] = useState<string>('');
  const [entry, setEntry] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrQ, setAddrQ] = useState('');
  const [call, setCall] = useState<string | null>(null);
  const [rings, setRings] = useState(0);

  // Everyone the shop already knows, newest order first.
  const people = useMemo(() => {
    const m = new Map<string, Person>();
    for (const o of state.orders) if (o.customer.phone?.length === 10) m.set(o.customer.phone, { phone: o.customer.phone, name: o.customer.name, address: o.customer.address ?? m.get(o.customer.phone)?.address, at: o.createdAt });
    for (const x of state.members) m.set(x.phone, { phone: x.phone, name: x.name, address: m.get(x.phone)?.address, at: m.get(x.phone)?.at ?? '' });
    return [...m.values()].sort((x, y) => y.at.localeCompare(x.at));
  }, [state.orders, state.members]);
  const known = (digits: string) => people.find((x) => x.phone === digits);
  const matches = phone.length >= 3 && phone.length < 10 ? people.filter((x) => x.phone.includes(phone)).slice(0, 4) : [];
  const recent = people.filter((x) => x.at).slice(0, 4);

  // Demo caller ID: with an empty ticket, the phone line rings a few seconds in. Real shops get this from their phone system.
  useEffect(() => {
    if (channel !== 'phone' || phone || cart.length || call) return;
    const id = window.setTimeout(() => {
      const ringers = [...people.filter((x) => x.address).slice(0, 2).map((x) => x.phone), NEW_CALLER, ...people.slice(2, 4).map((x) => x.phone)];
      setCall(ringers[rings % ringers.length] ?? NEW_CALLER);
    }, rings ? 40_000 : 4_000);
    return () => window.clearTimeout(id);
  }, [channel, phone, cart.length, call, rings, people]);

  const member = phone.length === 10 ? state.members.find((m) => m.phone === phone) : undefined;
  const past = phone.length === 10 ? [...state.orders].reverse().find((o) => o.customer.phone === phone) : undefined;
  const a = ADDRESSES[addr];
  const zone = mode === 'delivery' ? zoneFor(a) : undefined;
  const pies = cart.reduce((n, l) => n + (l.kind === 'pizza' ? l.qty : 0), 0);
  const q = quoteTime(state.orders.filter((o) => o.status !== 'done'), pies, { zone, cooks: brain.cooks, driversFreeInMin: brain.freeIn, piesAhead: demo.elsewhere.ahead, piesInOven: demo.elsewhere.inOven });
  const t = totals(cart, { zone });
  const ups = useMemo(() => upsells(cart, history, brain.facts.tomorrow.event ?? undefined), [cart, history, brain.facts.tomorrow.event]);
  const add = (l: Line) => setCart((c) => [...c, l]);

  const lookup = (digits: string) => {
    setPhone(digits);
    if (digits.length !== 10) return;
    setEntry(false);
    const m = state.members.find((x) => x.phone === digits);
    const o = [...state.orders].reverse().find((x) => x.customer.phone === digits);
    if (m) setName(m.name);
    else if (o) setName(o.customer.name);
    if (o?.customer.address) { const i = ADDRESSES.findIndex((x) => x.line === o.customer.address); if (i >= 0) { setAddr(i); setMode('delivery'); setAddrOpen(false); } }
  };
  const clearCustomer = () => { setPhone(''); setName(''); setEntry(false); setMode('pickup'); setAddrOpen(false); };
  const answer = () => { if (call) lookup(call); setCall(null); setRings((n) => n + 1); };

  const ring = (payment: 'card' | 'cash') => {
    const now = Date.now();
    const o = placeOrder({
      channel, fulfillment: mode, createdAt: new Date(now).toISOString(), promisedAt: new Date(now + q.minutes * MINUTE).toISOString(),
      customer: { name: name || (channel === 'counter' ? 'Walk-in' : 'Phone order'), phone, ...(mode === 'delivery' ? { address: a.line, x: a.x, y: a.y, zone } : {}) },
      lines: cart, ...t, payment, status: 'new',
    }, { rewardPhone: phone });
    setDone(o ? `Order #${o.number} sent to the make line. Quoted ${q.minutes} min.` : '');
    setCart([]); setPhone(''); setName(''); setEntry(false); setMode('pickup'); setAddrOpen(false);
    window.setTimeout(() => setDone(''), 4000);
  };

  return (
    <div className="grid min-h-[calc(100vh-48px)] bg-slate-100 lg:grid-cols-[1fr_400px]">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold">Register</h1>
          <p className="text-sm text-slate-500">Quoting <b>{brain.quotePickup.minutes} min</b> pickup · <b>{brain.quoteDelivery.minutes} min</b> delivery</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {SPECIALTIES.map((sp) => (
            <div key={sp.id} className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
              <button onClick={() => setPick(pick === sp.id ? null : sp.id)} className="block w-full text-left">
                <img src={sp.photo} alt="" className="h-20 w-full object-cover" />
                <p className="px-2.5 py-2 text-sm font-bold leading-tight">{sp.name}</p>
              </button>
              {pick === sp.id && (
                <div className="absolute inset-0 flex flex-col justify-center gap-1.5 bg-slate-900/90 p-2">
                  {SIZES.map((s) => {
                    const cfg = configFor(sp.id, s.id);
                    return <button key={s.id} onClick={() => { add({ kind: 'pizza', config: cfg, specialtyId: sp.id, qty: 1, unitCents: pizzaPrice(cfg, sp.id).cents }); setPick(null); }} className="rounded-lg bg-white py-1.5 text-xs font-bold">{s.label} {money(sp.prices[s.id])}</button>;
                  })}
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setBuild(true)} className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-600 p-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><Sparkles size={20} /> Build your own<span className="text-[11px] font-normal opacity-80">halves, crusts, extras</span></button>
        </div>
        <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Wings, sides, drinks</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {SIDES.map((s) => (
            <button key={s.id} disabled={state.out.includes(s.id)} onClick={() => add({ kind: 'side', sideId: s.id, qty: 1, unitCents: s.cents })} className="rounded-2xl bg-white p-2 text-left shadow-sm disabled:opacity-40">
              <img src={s.photo} alt="" className="h-14 w-full rounded-xl object-cover" />
              <p className="mt-1 text-xs font-bold leading-tight">{s.name}</p>
              <p className="tabular text-xs text-slate-500">{money(s.cents)}</p>
            </button>
          ))}
        </div>
      </div>

      <aside className="flex flex-col border-l border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-1.5">
          {(['phone', 'counter'] as const).map((c) => <button key={c} onClick={() => { setChannel(c); setEntry(false); if (c === 'counter') { setMode('pickup'); setPhone(''); setCall(null); } }} className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold ${channel === c ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{c === 'phone' ? <Phone size={14} /> : <Store size={14} />} {c === 'phone' ? 'Phone order' : 'Counter'}</button>)}
        </div>
        {call && channel === 'phone' && !phone && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-400 p-2.5 text-slate-900 shadow">
            <PhoneIncoming size={22} className="shrink-0 animate-pulse" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider">Line 1 is ringing</p>
              <p className="truncate text-sm font-bold">{formatPhone(call)} · {known(call)?.name ?? 'New caller'}</p>
            </div>
            <button onClick={answer} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Answer</button>
            <Link to={`/pizza/demo/ai?caller=${call}`} title="Let the AI take this call" className="flex items-center gap-1 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-slate-900"><Bot size={15} /> AI</Link>
            <button aria-label="Ignore call" onClick={() => { setCall(null); setRings((n) => n + 1); }} className="rounded-full p-1.5 hover:bg-black/10"><X size={16} /></button>
          </div>
        )}

        {phone.length === 10 ? (
          /* Customer found or entered: one card instead of a form. */
          <div className={`mt-3 rounded-2xl p-3 ${member || past ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            <div className="flex items-start gap-2">
              <UserRound size={18} className="mt-0.5 shrink-0 text-emerald-800" />
              <div className="min-w-0 flex-1">
                {member || past
                  ? <p className="truncate text-base font-bold text-emerald-950">{name}</p>
                  : <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="New caller. Their name?" autoCapitalize="words" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base" />}
                <p className="tabular text-sm text-slate-600">{formatPhone(phone)}</p>
              </div>
              <button onClick={clearCustomer} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">Change</button>
            </div>
            {member && <p className="mt-1.5 text-xs text-emerald-800">Dough Rewards: {member.visits} orders, {member.punches}/10 punches{member.rewards ? `, ${member.rewards} free pizza waiting` : ''}{member.favorite ? `. Usually gets ${SPECIALTY_BY_ID[member.favorite]?.name ?? member.favorite}.` : ''}</p>}
            {past && <button onClick={() => setCart(past.lines)} className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-left text-sm font-bold text-white">Reorder last: <span className="font-normal">{past.lines.map((l) => (l.kind === 'pizza' ? pizzaTitle(l) : SIDE_BY_ID[l.sideId].name)).join(', ')}</span></button>}
          </div>
        ) : channel === 'counter' && !entry ? (
          /* Counter: no number needed. A name for the ticket is optional. */
          <div className="mt-3 flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" autoCapitalize="words" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-base" />
            <button onClick={() => setEntry(true)} className="shrink-0 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700">+ Rewards number</button>
          </div>
        ) : (
          <div className="mt-3">
            <label onClick={() => setEntry(true)} className={`tabular flex w-full cursor-pointer items-center justify-between rounded-xl border-2 px-3 py-3 text-left text-xl font-bold ${entry ? 'border-emerald-600 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <span className={phone ? 'text-slate-900' : 'text-slate-400'}>{phone ? formatPhone(phone) : channel === 'counter' ? 'Rewards number' : "Caller's number"}</span>
              {/* A hardware keyboard still works; a tablet uses the pad below instead of its own keyboard. */}
              <input aria-label="Phone number" value={phone} onChange={(e) => lookup(e.target.value.replace(/\D/g, '').slice(0, 10))} onFocus={() => setEntry(true)} inputMode="none" className="sr-only" />
              <span className="text-xs font-semibold text-slate-400">{phone.length}/10</span>
            </label>
            {matches.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {matches.map((x) => (
                  <li key={x.phone}><button onClick={() => lookup(x.phone)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-left text-sm"><b className="truncate">{x.name}</b><span className="tabular shrink-0 text-slate-600">{formatPhone(x.phone)}</span></button></li>
                ))}
              </ul>
            )}
            {entry ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((k) => (
                  <button
                    key={k}
                    aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear number' : k}
                    onClick={() => lookup(k === 'back' ? phone.slice(0, -1) : k === 'clear' ? '' : (phone + k).slice(0, 10))}
                    className={`flex h-12 items-center justify-center rounded-xl text-xl font-bold active:scale-95 ${k.length > 1 ? 'bg-slate-200 text-sm text-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}
                  >
                    {k === 'back' ? <Delete size={20} /> : k === 'clear' ? 'Clear' : k}
                  </button>
                ))}
              </div>
            ) : recent.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent callers</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {recent.map((x) => (
                    <button key={x.phone} onClick={() => lookup(x.phone)} className="rounded-xl bg-slate-100 px-2.5 py-2 text-left hover:bg-slate-200">
                      <p className="truncate text-sm font-bold">{x.name}</p>
                      <p className="tabular text-[11px] text-slate-500">{formatPhone(x.phone)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {channel === 'counter' && <button onClick={() => { setEntry(false); setPhone(''); }} className="mt-1.5 text-xs font-semibold text-slate-500 underline">Skip the number</button>}
          </div>
        )}

        {channel === 'phone' && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['pickup', 'delivery'] as const).map((m) => <button key={m} onClick={() => { setMode(m); if (m === 'delivery' && !past?.customer.address) setAddrOpen(true); }} className={`flex items-center justify-center gap-1.5 rounded-xl border py-3 text-sm font-bold ${mode === m ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200'}`}>{m === 'delivery' ? <Bike size={14} /> : <Store size={14} />} {m === 'pickup' ? 'Pickup' : 'Delivery'}</button>)}
          </div>
        )}
        {mode === 'delivery' && !addrOpen && (
          <button onClick={() => { setAddrOpen(true); setAddrQ(''); }} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm">
            <MapPin size={16} className="shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1"><b className="block truncate">{a.line}</b><span className="text-xs text-slate-500">{zone ? `Zone ${zone}, ${money(ZONES.find((z) => z.id === zone)?.feeCents ?? 0)} delivery` : 'Too far to deliver'}{past?.customer.address === a.line ? ' · saved from their last order' : ''}</span></span>
            <span className="text-xs font-bold text-slate-600">Change</span>
          </button>
        )}
        {mode === 'delivery' && addrOpen && (
          <div className="mt-2">
            <input autoFocus value={addrQ} onChange={(e) => setAddrQ(e.target.value)} placeholder="Start typing the street or number" className="w-full rounded-xl border-2 border-emerald-600 px-3 py-2.5 text-base" />
            <ul className="mt-1 max-h-44 space-y-1 overflow-y-auto">
              {ADDRESSES.map((x, i) => ({ x, i })).filter(({ x }) => x.line.toLowerCase().includes(addrQ.trim().toLowerCase())).slice(0, 6).map(({ x, i }) => (
                <li key={x.line}><button onClick={() => { setAddr(i); setAddrOpen(false); }} className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-200"><b className="truncate">{x.line}</b><span className={`shrink-0 text-xs ${zoneFor(x) ? 'text-slate-500' : 'text-rose-600'}`}>{zoneFor(x) ? `zone ${zoneFor(x)}` : 'too far'}</span></button></li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400">Demo: example addresses. A live shop searches real street addresses here.</p>
          </div>
        )}

        <ul className="mt-3 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {cart.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Tap a pizza, then a size.</li>}
          {cart.map((l, i) => (
            <li key={i} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.qty > 1 ? `${l.qty} × ` : ''}{l.kind === 'pizza' ? pizzaTitle(l as PizzaLine) : SIDE_BY_ID[l.sideId].name}</p>
                {l.kind === 'pizza' && <p className="text-[11px] text-slate-500">{pizzaDetails(l.config, l.specialtyId).join(' · ')}</p>}
              </div>
              <span className="tabular text-sm">{money(lineCents(l))}</span>
              <button aria-label="Remove" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        {ups.length > 0 && (
          <div className="mt-2 rounded-xl bg-amber-50 p-2 text-xs">
            <p className="font-bold text-amber-900">Ask: {ups[0].title.toLowerCase()}?</p>
            <p className="text-amber-800">{ups[0].why}</p>
            <button onClick={() => setCart((c) => (ups[0].id === 'size-up' ? c.map((x) => (x.kind === 'pizza' && x.config.size === 'S' ? (ups[0].line as PizzaLine) : x)) : [...c, ups[0].line]))} className="mt-1 rounded-full bg-amber-600 px-2.5 py-1 font-bold text-white">They said yes</button>
          </div>
        )}
        <dl className="tabular mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
          {t.deliveryFee > 0 && <div className="flex justify-between"><dt>Delivery ({ZONES.find((z) => z.id === zone)?.id})</dt><dd>{money(t.deliveryFee)}</dd></div>}
          <div className="flex justify-between"><dt>Tax</dt><dd>{money(t.tax)}</dd></div>
          <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{money(t.total)}</dd></div>
        </dl>
        <p className="mt-1 text-xs text-slate-500">Tell them: {mode === 'delivery' ? 'at the door' : 'ready'} in about <b>{q.minutes} min</b> ({q.parts.map((p) => `${p.label.toLowerCase()} ${p.minutes}`).join(', ')}).</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button disabled={!cart.length || (mode === 'delivery' && !zone)} onClick={() => ring('card')} className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40">Card {money(t.total)}</button>
          <button disabled={!cart.length || (mode === 'delivery' && !zone)} onClick={() => ring('cash')} className="rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-40">{mode === 'delivery' ? 'Cash at door' : 'Cash'}</button>
        </div>
        {done && <p className="mt-2 rounded-lg bg-emerald-100 p-2 text-center text-sm font-semibold text-emerald-900">{done}</p>}
      </aside>

      {build && (
        <Modal onClose={() => setBuild(false)} title="Build a pizza" wide>
          <Builder out={state.out} onAdd={(l) => { add(l); setBuild(false); }} addLabel="Add to ticket" guided={false} />
        </Modal>
      )}
    </div>
  );
}

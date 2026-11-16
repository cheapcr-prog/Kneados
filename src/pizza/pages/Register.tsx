import { Bike, Phone, Sparkles, Store, Trash2, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTick } from '../../components/Breaks';
import { formatPhone, money } from '../../lib/money';
import { ADDRESSES, SIDES, SIDE_BY_ID, SIZES, SPECIALTIES, SPECIALTY_BY_ID, ZONES } from '../data';
import { MINUTE, configFor, lineCents, pizzaDetails, pizzaPrice, pizzaTitle, quoteTime, totals, upsells, zoneFor, type Line, type PizzaLine } from '../logic';
import { Builder } from '../Builder';
import { usePizzaBrain } from '../brain';
import { usePizza } from '../store';
import { Modal } from './Shop';

/** The counter and phone register. Type the caller's number and KneadOS fills in who they are, where they live and what they usually get. */
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

  const member = phone.length === 10 ? state.members.find((m) => m.phone === phone) : undefined;
  const past = phone.length === 10 ? [...state.orders].reverse().find((o) => o.customer.phone === phone) : undefined;
  const a = ADDRESSES[addr];
  const zone = mode === 'delivery' ? zoneFor(a) : undefined;
  const pies = cart.reduce((n, l) => n + (l.kind === 'pizza' ? l.qty : 0), 0);
  const q = quoteTime(state.orders.filter((o) => o.status !== 'done'), pies, { zone, cooks: brain.cooks, driversFreeInMin: brain.freeIn });
  const t = totals(cart, { zone });
  const ups = useMemo(() => upsells(cart, history, brain.facts.tomorrow.event ?? undefined), [cart, history, brain.facts.tomorrow.event]);
  const add = (l: Line) => setCart((c) => [...c, l]);

  const lookup = (digits: string) => {
    setPhone(digits);
    if (digits.length !== 10) return;
    const m = state.members.find((x) => x.phone === digits);
    const o = [...state.orders].reverse().find((x) => x.customer.phone === digits);
    if (m) setName(m.name);
    else if (o) setName(o.customer.name);
    if (o?.customer.address) { const i = ADDRESSES.findIndex((x) => x.line === o.customer.address); if (i >= 0) { setAddr(i); setMode('delivery'); } }
  };

  const ring = (payment: 'card' | 'cash') => {
    const now = Date.now();
    const o = placeOrder({
      channel, fulfillment: mode, createdAt: new Date(now).toISOString(), promisedAt: new Date(now + q.minutes * MINUTE).toISOString(),
      customer: { name: name || (channel === 'counter' ? 'Walk-in' : 'Phone order'), phone, ...(mode === 'delivery' ? { address: a.line, x: a.x, y: a.y, zone } : {}) },
      lines: cart, ...t, payment, status: 'new',
    }, { rewardPhone: phone });
    setDone(o ? `Order #${o.number} sent to the make line. Quoted ${q.minutes} min.` : '');
    setCart([]); setPhone(''); setName('');
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
          {(['phone', 'counter'] as const).map((c) => <button key={c} onClick={() => setChannel(c)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold ${channel === c ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{c === 'phone' ? <Phone size={14} /> : <Store size={14} />} {c === 'phone' ? 'Phone order' : 'Counter'}</button>)}
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-500">Caller's number
          <input value={formatPhone(phone)} onChange={(e) => lookup(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="(562) 555-2037" inputMode="tel" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-900" />
        </label>
        <p className="mt-1 text-[11px] text-slate-400">Try (562) 555-2037: a regular with a saved address.</p>
        {(member || past) && (
          <div className="mt-2 rounded-xl bg-emerald-50 p-2.5 text-sm">
            <p className="flex items-center gap-1.5 font-bold text-emerald-900"><UserRound size={14} /> {name}</p>
            {member && <p className="text-xs text-emerald-800">Dough Rewards: {member.visits} orders, {member.punches}/10 punches{member.rewards ? `, ${member.rewards} free pizza waiting` : ''}{member.favorite ? `. Usually gets ${SPECIALTY_BY_ID[member.favorite]?.name ?? member.favorite}.` : ''}</p>}
            {past && <button onClick={() => setCart(past.lines)} className="mt-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Reorder last ({past.lines.map((l) => (l.kind === 'pizza' ? pizzaTitle(l) : SIDE_BY_ID[l.sideId].name)).join(', ')})</button>}
          </div>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(['pickup', 'delivery'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-bold ${mode === m ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200'}`}>{m === 'delivery' ? <Bike size={14} /> : <Store size={14} />} {m === 'pickup' ? 'Pickup' : 'Delivery'}</button>)}
        </div>
        {mode === 'delivery' && (
          <select value={addr} onChange={(e) => setAddr(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {ADDRESSES.map((x, i) => <option key={x.line} value={i}>{x.line} {zoneFor(x) ? `(zone ${zoneFor(x)})` : '(too far)'}</option>)}
          </select>
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

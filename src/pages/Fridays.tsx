import { ArrowLeft, CalendarCheck, Check, Minus, Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { itemNames, useSubscriptions } from '../components/Subscriptions';
import { MENU_BY_ID, SHOP } from '../data/shop';
import { DOW_NAMES, longDate, timeLabel } from '../lib/dates';
import { money } from '../lib/money';
import { FREE_DELIVERY_DOZENS, MIXES, SUBSCRIBER_DISCOUNT, priceOf, type MixId, type Subscription } from '../lib/subscriptions';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-glaze-500 focus:outline-none';
const TIMES = ['08:00', '08:30', '09:00', '09:30', '10:00'];
const clock = (t: string) => timeLabel(`2026-01-01T${t}:00`);

/** The page on the shop's site where an office signs up for a weekly box. */
export function Fridays() {
  const subs = useSubscriptions();
  const [form, setForm] = useState({ company: '', contact: '', email: '', address: '' });
  const [dow, setDow] = useState(5);
  const [dozens, setDozens] = useState(2);
  const [mix, setMix] = useState<MixId>('assorted');
  const [by, setBy] = useState('09:00');
  const [done, setDone] = useState<Subscription | null>(null);
  const price = priceOf({ dozens, mix });
  const ready = form.company.trim() && form.address.trim() && /\S+@\S+\.\S+/.test(form.email);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (done) {
    const first = subs.nextDate(done);
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={32} /></div>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">{done.company} is on the route</h1>
        <p className="mt-2 text-slate-600">
          {done.dozens} dozen every {DOW_NAMES[done.dow]}, at your door by {clock(done.by)}. Your first box arrives {longDate(first)}.
        </p>
        <p className="mt-1 text-sm text-slate-500">{itemNames(done)}</p>
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Demo: no card was charged and no email was sent. In the demo, this order is now in the owner's Subscriptions screen, on the delivery route and in the bake plan.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/demo/owner" className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-bold text-white">See it in the Owner dashboard</Link>
          <Link to="/demo/shop" className="rounded-full bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700">Back to the menu</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-box-50/40">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Link to="/demo/shop" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={15} /> Back to the menu</Link>
        <header className="mt-3 rounded-3xl bg-box-500 p-6 text-white md:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-box-100">{SHOP.name}</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Donut Fridays</h1>
          <p className="mt-2 max-w-xl text-box-50">A fresh box at your office every week. Pick your day, we fry it that morning and drive it over. Skip a week or cancel whenever you like.</p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-semibold">
            <li className="flex items-center gap-1.5"><CalendarCheck size={16} /> {Math.round(SUBSCRIBER_DISCOUNT * 100)}% off every box</li>
            <li className="flex items-center gap-1.5"><Truck size={16} /> Free delivery on {FREE_DELIVERY_DOZENS} dozen or more</li>
          </ul>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">1. Pick your box</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {MIXES.map((m) => (
                  <button key={m.id} onClick={() => setMix(m.id)} aria-pressed={mix === m.id} className={`min-w-0 rounded-xl border-2 p-3 text-left ${mix === m.id ? 'border-box-500 bg-box-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-display font-bold">{m.name}</p>
                    <p className="tabular text-sm font-semibold text-box-700">{money(m.dozenCents)} a dozen</p>
                    <p className="mt-1 text-xs text-slate-600">{m.blurb}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500">{Object.entries(m.box).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ')}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">How many dozen each week?</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDozens(Math.max(1, dozens - 1))} aria-label="One dozen fewer" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Minus size={16} /></button>
                  <span className="tabular w-8 text-center font-display text-2xl font-extrabold">{dozens}</span>
                  <button onClick={() => setDozens(Math.min(20, dozens + 1))} aria-label="One dozen more" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Plus size={16} /></button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">2. Pick your day</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} onClick={() => setDow(d)} aria-pressed={dow === d} className={`rounded-full px-3.5 py-2 text-sm font-bold ${dow === d ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{DOW_NAMES[d]}</button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-semibold">At your door by
                <select value={by} onChange={(e) => setBy(e.target.value)} className={input + ' mt-1'}>{TIMES.map((t) => <option key={t} value={t}>{clock(t)}</option>)}</select>
              </label>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">3. Where is it going?</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className={input} placeholder="Company or office name" value={form.company} onChange={set('company')} aria-label="Company name" />
                <input className={input} placeholder="Who should we ask for?" value={form.contact} onChange={set('contact')} aria-label="Contact name" />
                <input className={input} type="email" placeholder="Email for receipts" value={form.email} onChange={set('email')} aria-label="Email" />
                <input className={input} placeholder="Delivery address" value={form.address} onChange={set('address')} aria-label="Delivery address" />
              </div>
            </section>
          </div>

          <aside className="self-start rounded-2xl bg-ink-900 p-5 text-white lg:sticky lg:top-16">
            <p className="text-[11px] font-bold uppercase tracking-wider text-glaze-300">Your weekly box</p>
            <p className="mt-1 font-display text-xl font-bold">{dozens} dozen, every {DOW_NAMES[dow]}</p>
            <p className="mt-1 text-xs text-slate-300">{itemNames({ dozens, mix })}</p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-300"><dt>{dozens} × {MIXES.find((m) => m.id === mix)!.name}</dt><dd className="tabular">{money(price.boxesCents)}</dd></div>
              <div className="flex justify-between text-glaze-300"><dt>Subscriber price</dt><dd className="tabular">-{money(price.discountCents)}</dd></div>
              <div className="flex justify-between text-slate-300"><dt>Delivery</dt><dd className="tabular">{price.deliveryCents === 0 ? 'Free' : money(price.deliveryCents)}</dd></div>
              <div className="flex justify-between border-t border-white/15 pt-2 font-display text-2xl font-extrabold"><dt>Each week</dt><dd className="tabular">{money(price.weeklyCents)}</dd></div>
            </dl>
            {price.deliveryCents > 0 && <p className="mt-2 text-xs text-slate-400">Add {FREE_DELIVERY_DOZENS - dozens} more dozen and delivery is free.</p>}
            <button disabled={!ready} onClick={() => setDone(subs.add({ ...form, company: form.company.trim(), dow, dozens, mix, by }))} className="mt-4 w-full rounded-xl bg-box-500 py-3.5 text-base font-bold text-white hover:bg-box-600 disabled:opacity-40">Start Donut Fridays</button>
            <p className="mt-2 text-center text-xs text-slate-400">{ready ? 'Charged the morning of each delivery. Skip or cancel any time.' : 'Fill in your company, email and address to start.'}</p>
          </aside>
        </div>
        <p className="mt-4 text-xs text-slate-500">Demo shop: no card is charged. A live shop takes the card here and bills it each week.</p>
      </div>
    </div>
  );
}

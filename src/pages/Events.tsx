import { ArrowLeft, CalendarDays, Check, HeartHandshake, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clockLabel, useEvents } from '../components/Events';
import { MENU_BY_ID, SHOP } from '../data/shop';
import { daysBetween } from '../lib/campaigns';
import { addDays, longDate } from '../lib/dates';
import { bookingProblems, quote, type Dozens, type EventOrder } from '../lib/events';
import { formatPhone, money } from '../lib/money';
import { MIXES } from '../lib/subscriptions';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-glaze-500 focus:outline-none';
const TIMES = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'];

/** The page on the shop's site where a customer books donuts for a party, an office or a school event. */
export function Events() {
  const ev = useEvents();
  const [params] = useSearchParams();
  const [dozens, setDozens] = useState<Dozens>({ classic: 2, assorted: 2 });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [form, setForm] = useState({ name: '', phone: '', occasion: '' });
  const [code, setCode] = useState(params.get('fund') ?? '');
  const [done, setDone] = useState<EventOrder | null>(null);
  const q = quote(dozens, ev.rules);
  const problems = bookingProblems(dozens, date, ev.today, ev.rules, daysBetween);
  const digits = form.phone.replace(/\D/g, '');
  const fund = code.trim() ? ev.fundFor(code) : undefined;
  const ready = problems.length === 0 && form.name.trim().length > 1 && digits.length === 10;
  const earliest = addDays(ev.today, q.noticeDays);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const bump = (id: keyof Dozens, by: number) => setDozens((d) => ({ ...d, [id]: Math.max(0, Math.min(40, (d[id] ?? 0) + by)) }));

  if (done) {
    const balance = done.totalCents - done.depositCents;
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={32} /></div>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">You're booked, {done.name.split(' ')[0]}</h1>
        <p className="mt-2 text-slate-600">{quote(done.dozens, ev.rules).dozens} dozen, ready {longDate(done.date)} at {clockLabel(done.time)}.</p>
        <p className="mt-1 text-sm text-slate-600">Deposit paid: {money(done.depositCents)}. Due at pickup: {money(balance)}.</p>
        {done.fundraiser && <p className="mt-1 text-sm font-semibold text-emerald-700">This order counts toward the {ev.funds.find((f) => f.code === done.fundraiser)?.org} fundraiser.</p>}
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Demo: no card was charged and no text was sent. The booking is now in the owner's Events &amp; fundraisers screen. It joins the bake plan the day before and the packing queue on the day.</p>
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
        <header className="mt-3 rounded-3xl bg-ink-900 p-6 text-white md:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-glaze-300">{SHOP.name}</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Donuts for your event</h1>
          <p className="mt-2 max-w-xl text-slate-200">Birthdays, offices, weddings and school events. Book ahead, pay a deposit today and pick them up fresh that morning.</p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-semibold">
            <li className="flex items-center gap-1.5"><CalendarDays size={16} /> {ev.rules.noticeDays} days of notice, {ev.rules.bigNoticeDays} for {ev.rules.bigDozens} dozen or more</li>
            <li className="flex items-center gap-1.5"><HeartHandshake size={16} /> {Math.round(ev.rules.depositShare * 100)}% deposit, the rest at pickup</li>
          </ul>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">1. How many dozen?</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {MIXES.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold">{m.name} <span className="tabular text-sm font-semibold text-box-700">{money(m.dozenCents)}</span></p>
                      <p className="text-xs text-slate-500">{Object.entries(m.box).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ')}</p>
                    </div>
                    <button onClick={() => bump(m.id, -1)} aria-label={`One fewer ${m.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Minus size={16} /></button>
                    <span className="tabular w-7 text-center font-display text-xl font-extrabold">{dozens[m.id] ?? 0}</span>
                    <button onClick={() => bump(m.id, 1)} aria-label={`One more ${m.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Plus size={16} /></button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">2. When do you need them?</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Day of the event
                  <input type="date" min={earliest} value={date} onChange={(e) => setDate(e.target.value)} className={input + ' mt-1'} />
                </label>
                <label className="block text-sm font-semibold">Pickup time
                  <select value={time} onChange={(e) => setTime(e.target.value)} className={input + ' mt-1'}>{TIMES.map((t) => <option key={t} value={t}>{clockLabel(t)}</option>)}</select>
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">The earliest day for {q.dozens} dozen is {longDate(earliest)}.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-lg font-bold">3. Your details</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className={input} placeholder="Your name" value={form.name} onChange={set('name')} aria-label="Your name" autoComplete="name" />
                <input className={input} placeholder="Mobile number" value={formatPhone(form.phone)} onChange={set('phone')} aria-label="Mobile number" inputMode="tel" autoComplete="tel" />
                <input className={input + ' sm:col-span-2'} placeholder="What is the occasion? (optional)" value={form.occasion} onChange={set('occasion')} aria-label="Occasion" />
                <input className={input + ' sm:col-span-2'} placeholder="Fundraiser code (optional)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Fundraiser code" />
              </div>
              {code.trim() && (fund
                ? <p className="mt-2 text-sm font-semibold text-emerald-700">{Math.round(fund.share * 100)}% of this order goes to {fund.org}.</p>
                : <p className="mt-2 text-sm text-amber-700">That code is not for a fundraiser running today.</p>)}
            </section>
          </div>

          <aside className="self-start rounded-2xl bg-ink-900 p-5 text-white lg:sticky lg:top-16">
            <p className="text-[11px] font-bold uppercase tracking-wider text-glaze-300">Your event order</p>
            <p className="mt-1 font-display text-xl font-bold">{q.dozens} dozen, {q.donuts} donuts</p>
            <dl className="mt-4 space-y-1 text-sm">
              {MIXES.filter((m) => (dozens[m.id] ?? 0) > 0).map((m) => (
                <div key={m.id} className="flex justify-between text-slate-300"><dt>{dozens[m.id]} × {m.name}</dt><dd className="tabular">{money((dozens[m.id] ?? 0) * m.dozenCents)}</dd></div>
              ))}
              <div className="flex justify-between border-t border-white/15 pt-2 font-semibold"><dt>Total</dt><dd className="tabular">{money(q.totalCents)}</dd></div>
              <div className="flex justify-between text-slate-300"><dt>Due at pickup</dt><dd className="tabular">{money(q.balanceCents)}</dd></div>
              <div className="flex justify-between pt-1 font-display text-2xl font-extrabold"><dt>Deposit today</dt><dd className="tabular">{money(q.depositCents)}</dd></div>
            </dl>
            <button disabled={!ready} onClick={() => setDone(ev.book({ ...form, date, time, dozens, fundCode: fund?.code }))} className="mt-4 w-full rounded-xl bg-box-500 py-3.5 text-base font-bold text-white hover:bg-box-600 disabled:opacity-40">Pay deposit and book</button>
            <p className="mt-2 text-center text-xs text-slate-400">{problems[0] ?? (ready ? 'Donuts to go are not taxed in California.' : 'Add your name and mobile number to book.')}</p>
          </aside>
        </div>
        <p className="mt-4 text-xs text-slate-500">Demo shop: no card is charged. A live shop takes the deposit here and the rest at pickup.</p>
      </div>
    </div>
  );
}

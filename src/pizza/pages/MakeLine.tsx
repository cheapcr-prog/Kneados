import { AlertTriangle, Bike, Flame, Minus, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { useTick } from '../../components/Breaks';
import { DOW_NAMES, dowOf } from '../../lib/dates';
import { PIZZA_SHOP, SIDES, SIDE_BY_ID, SIZES, TOPPINGS } from '../data';
import { MINUTE, fireAt, lateBy, piesIn, pizzaDetails, pizzaTitle, type PizzaOrder } from '../logic';
import { PizzaArt } from '../PizzaArt';
import { usePizzaBrain } from '../brain';
import { usePizza } from '../store';

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** The cooks' screen: tickets to make, the oven with a timer on every pie, and what is boxed and waiting. */
export function MakeLine() {
  // Every second, so the oven countdowns tick like a real timer.
  useTick(1_000);
  const demo = usePizza();
  const { state, setStatus, toggleOut, bumpDough } = demo;
  const now = Date.now();
  const brain = usePizzaBrain(demo, now);
  const [tab, setTab] = useState<'line' | 'dough' | 'out'>('line');
  const open = state.orders.filter((o) => o.status !== 'done' && o.status !== 'out');
  const toMake = open.filter((o) => o.status === 'new' && (!o.scheduled || fireAt(o) - now < 20 * MINUTE)).sort((a, b) => fireAt(a) - fireAt(b));
  const later = open.filter((o) => o.status === 'new' && o.scheduled && fireAt(o) - now >= 20 * MINUTE).sort((a, b) => fireAt(a) - fireAt(b));
  const oven = open.filter((o) => o.status === 'oven').sort((a, b) => +new Date(a.ovenAt!) - +new Date(b.ovenAt!));
  const ready = open.filter((o) => o.status === 'ready');
  const ovenPies = oven.reduce((a, o) => a + piesIn(o), 0);

  return (
    <div className="min-h-[calc(100vh-48px)] bg-ink-950 p-3 text-white">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-bold">Make line</h1>
        {(['line', 'dough', 'out'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === t ? 'bg-white text-ink-900' : 'bg-white/10 text-slate-300'}`}>{t === 'line' ? 'Tickets' : t === 'dough' ? "Tonight's dough" : `Out of stock (${state.out.length})`}</button>)}
        <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm"><Flame size={15} className="text-orange-300" /> Oven {ovenPies}/{PIZZA_SHOP.ovenSlots}</span>
      </div>

      {tab === 'line' && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Column title="Make" count={toMake.length} note="In fire order. Pre-orders drop in 20 min before they need the oven.">
            {toMake.map((o) => <Ticket key={o.id} o={o} now={now} action="Into the oven" onAction={() => setStatus(o.id, 'oven')} disabled={ovenPies + piesIn(o) > PIZZA_SHOP.ovenSlots + 2} />)}
            {later.length > 0 && <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Coming up</p>}
            {later.slice(0, 4).map((o) => <div key={o.id} className="mt-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">#{o.number} {o.customer.name} · {piesIn(o)} pies · fire at {clock(fireAt(o))}{o.event ? ` · ${o.event}` : ''}</div>)}
          </Column>
          <Column title="Oven" count={oven.length} note={`${PIZZA_SHOP.bakeMinutes} min bake. Stock comes off by recipe as each pie goes in.`}>
            {oven.map((o) => {
              const left = PIZZA_SHOP.bakeMinutes * MINUTE - (now - new Date(o.ovenAt!).getTime());
              return <Ticket key={o.id} o={o} now={now} timer={left} action={left <= 0 ? 'Pull, cut and box' : 'Pull early'} onAction={() => setStatus(o.id, 'ready')} />;
            })}
          </Column>
          <Column title="Boxed and waiting" count={ready.length} note="Pickups get a ready text. Deliveries wait on the dispatch screen.">
            {ready.map((o) => <Ticket key={o.id} o={o} now={now} action={o.fulfillment === 'pickup' ? 'Picked up' : undefined} onAction={() => setStatus(o.id, 'done')} />)}
          </Column>
        </div>
      )}

      {tab === 'dough' && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl bg-white/5 p-4">
            <h2 className="font-display text-xl font-bold">Make tonight for {DOW_NAMES[dowOf(brain.dough.forDate)]}</h2>
            <p className="text-sm text-slate-400">48 hour cold ferment. {brain.dough.reasons.join('. ')}.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {SIZES.map((s) => {
                const goal = brain.dough.balls[s.id];
                const made = state.doughMade[s.id];
                return (
                  <div key={s.id} className={`rounded-xl p-3 ${made >= goal ? 'bg-emerald-600/30' : 'bg-white/10'}`}>
                    <p className="text-xs text-slate-300">{s.label} · {s.doughGrams} g</p>
                    <p className="tabular font-display text-3xl font-bold">{made}<span className="text-lg text-slate-400">/{goal}</span></p>
                    <div className="mt-1 flex gap-1">
                      <button aria-label="Remove a tray" onClick={() => bumpDough(s.id, -6)} className="rounded-lg bg-white/10 p-1.5"><Minus size={14} /></button>
                      <button onClick={() => bumpDough(s.id, 6)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 text-xs font-bold"><Plus size={13} /> Tray of 6</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-2xl bg-white/5 p-4">
            <h2 className="font-display text-xl font-bold">Batch sheet</h2>
            <p className="text-sm text-slate-400">{Math.round(brain.dough.flourLb)} lb flour, {brain.dough.mixes} mixer batch{brain.dough.mixes > 1 ? 'es' : ''}. Per batch:</p>
            <table className="tabular mt-3 w-full text-sm">
              <tbody>
                {Object.entries(brain.dough.grams).map(([k, g]) => (
                  <tr key={k} className="border-b border-white/10"><td className="py-1.5 capitalize">{k}</td><td className="py-1.5 text-right font-bold">{(g / brain.dough.mixes / 1000).toFixed(2)} kg</td><td className="py-1.5 pl-3 text-right text-slate-400">{(g / 453.6).toFixed(1)} lb total</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">Water at about 60°F so the dough comes off the hook near 75°F. Ball, tray, lid and date-label, then into the walk-in.</p>
          </section>
        </div>
      )}

      {tab === 'out' && (
        <section className="mt-3 rounded-2xl bg-white/5 p-4">
          <p className="text-sm text-slate-400">Tap anything you have run out of. It greys out on the website, the register and the builder straight away.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...TOPPINGS.map((t) => ({ id: t.id, name: t.name })), ...SIDES.map((s) => ({ id: s.id, name: s.name }))].map((x) => (
              <button key={x.id} onClick={() => toggleOut(x.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${state.out.includes(x.id) ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-200'}`}>{x.name}{state.out.includes(x.id) ? ' · out' : ''}</button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Column({ title, count, note, children }: { title: string; count: number; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 p-3">
      <h2 className="font-display text-lg font-bold">{title} <span className="text-slate-400">{count}</span></h2>
      <p className="text-xs text-slate-500">{note}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Ticket({ o, now, timer, action, onAction, disabled }: { o: PizzaOrder; now: number; timer?: number; action?: string; onAction: () => void; disabled?: boolean }) {
  const late = lateBy(o, now);
  const pct = timer !== undefined ? Math.min(1, Math.max(0, 1 - timer / (PIZZA_SHOP.bakeMinutes * MINUTE))) : 0;
  return (
    <article className={`rounded-xl bg-white p-3 text-slate-900 ${timer !== undefined && timer <= 0 ? 'ring-4 ring-orange-400' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-bold">#{o.number}</span>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold">{o.fulfillment === 'delivery' ? <><Bike size={11} /> Zone {o.customer.zone}</> : <><Store size={11} /> Pickup</>}</span>
        {o.channel === 'doordash' || o.channel === 'ubereats' ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">{o.channel === 'doordash' ? 'DoorDash' : 'Uber Eats'}</span> : null}
        {o.ai && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">{o.ai.surface === 'call' ? 'AI call' : 'AI text'}</span>}
        {o.scheduled && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Pre-order</span>}
        <span className={`ml-auto text-xs font-bold ${late > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{late > 0 ? <span className="flex items-center gap-1"><AlertTriangle size={12} /> {late} min late</span> : `due ${clock(new Date(o.promisedAt).getTime())}`}</span>
      </div>
      <p className="text-xs text-slate-500">{o.customer.name}</p>
      <ul className="mt-2 space-y-1.5">
        {o.lines.map((l, i) => l.kind === 'pizza' ? (
          <li key={i} className="flex gap-2">
            {!l.specialtyId && <PizzaArt config={l.config} size={44} className="shrink-0" />}
            <div>
              <p className="text-sm font-bold">{l.qty > 1 ? `${l.qty} × ` : ''}{pizzaTitle(l)}</p>
              <p className="text-xs text-slate-600">{pizzaDetails(l.config, l.specialtyId).join(' · ')}</p>
            </div>
          </li>
        ) : <li key={i} className="text-sm text-slate-700">{l.qty > 1 ? `${l.qty} × ` : ''}{SIDE_BY_ID[l.sideId].name}</li>)}
      </ul>
      {timer !== undefined && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${timer <= 0 ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${pct * 100}%` }} /></div>
          <p className="tabular mt-0.5 text-xs font-bold">{timer > 0 ? `${Math.floor(timer / 60000)}:${String(Math.floor((timer % 60000) / 1000)).padStart(2, '0')} left` : 'Done, pull it'}</p>
        </div>
      )}
      {action && <button disabled={disabled} onClick={onAction} className="mt-2 w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40">{disabled ? 'Oven is full' : action}</button>}
    </article>
  );
}

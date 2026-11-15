import { Ban, CalendarClock, Check, Flame, PackageCheck } from 'lucide-react';
import { ItemArt } from '../components/ItemArt';
import { MENU, MENU_BY_ID } from '../data/shop';
import { useDemo } from '../data/store';
import type { Order, OrderStatus } from '../data/types';
import { isoDate, longDate, timeLabel } from '../lib/dates';
import { formatPhone } from '../lib/money';

const NEXT: Record<OrderStatus, { to: OrderStatus; label: string } | null> = {
  new: { to: 'making', label: 'Start' },
  making: { to: 'ready', label: 'Ready' },
  ready: { to: 'done', label: 'Picked up' },
  done: null,
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'border-amber-400 bg-amber-400/10',
  making: 'border-sky-400 bg-sky-400/10',
  ready: 'border-emerald-400 bg-emerald-400/10',
  done: 'border-white/10 bg-white/5 opacity-60',
};

export function Kitchen() {
  const demo = useDemo();
  const { today } = demo.state;
  const online = demo.state.orders.filter((o) => o.source === 'online' && o.pickupAt);
  const dayOf = (o: Order) => isoDate(new Date(o.pickupAt!));
  const todays = online.filter((o) => dayOf(o) === today).sort((a, b) => a.pickupAt!.localeCompare(b.pickupAt!));
  const open = todays.filter((o) => o.status !== 'done');
  const finished = todays.filter((o) => o.status === 'done');
  const tomorrows = online.filter((o) => dayOf(o) === demo.tomorrow).sort((a, b) => a.pickupAt!.localeCompare(b.pickupAt!));
  const baked = MENU.filter((m) => m.baked);

  return (
    <div className="min-h-[calc(100vh-48px)] bg-ink-950 p-3 text-white md:p-4">
      <div className="mx-auto grid max-w-[1400px] gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><PackageCheck size={20} className="text-glaze-400" /> Pickup orders today</h2>
          <div className="mt-3 space-y-3">
            {open.length === 0 && <p className="rounded-2xl border border-white/10 p-6 text-center text-sm text-slate-400">No open pickup orders. New online orders show up here the moment they're placed.</p>}
            {[...open, ...finished].map((o) => {
              const next = NEXT[o.status];
              const minutes = Math.round((new Date(o.pickupAt!).getTime() - Date.now()) / 60_000);
              return (
                <article key={o.id} className={`rounded-2xl border-l-4 p-4 ${STATUS_STYLE[o.status]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold leading-tight">#{o.number} · {o.customerName}</p>
                      <p className="text-sm text-slate-300">
                        Pickup {timeLabel(o.pickupAt!)}
                        {o.status !== 'done' && <span className={minutes < 15 ? 'font-semibold text-amber-300' : 'text-slate-400'}> · {minutes >= 0 ? `in ${minutes} min` : `${-minutes} min late`}</span>}
                        {o.phone && <span className="text-slate-500"> · {formatPhone(o.phone)}</span>}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">{o.status === 'new' ? 'New' : o.status === 'making' ? 'Making' : o.status === 'ready' ? 'Ready' : 'Done'}</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {o.lines.map((l) => (
                      <li key={l.itemId} className="flex items-baseline gap-2 text-[15px]">
                        <span className="tabular w-10 text-right font-display text-xl font-extrabold text-glaze-300">{l.qty}</span>
                        <span className="font-medium">{MENU_BY_ID[l.itemId].name}</span>
                        {l.qty % 12 === 0 && l.qty >= 12 && <span className="text-xs text-slate-400">({l.qty / 12} doz)</span>}
                      </li>
                    ))}
                  </ul>
                  {next && (
                    <button onClick={() => demo.setStatus(o.id, next.to)} className="mt-3 w-full rounded-xl bg-white py-3 text-sm font-bold text-ink-900 active:bg-slate-200">
                      {next.label}
                    </button>
                  )}
                </article>
              );
            })}
          </div>

          <h2 className="mt-6 flex items-center gap-2 font-display text-xl font-bold"><CalendarClock size={20} className="text-glaze-400" /> Pre-orders for {longDate(demo.tomorrow).split(',')[0]}</h2>
          <div className="mt-3 space-y-2">
            {tomorrows.length === 0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">None yet.</p>}
            {tomorrows.map((o) => (
              <div key={o.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-sm font-semibold">{timeLabel(o.pickupAt!)} · {o.customerName}</p>
                <p className="text-sm text-slate-400">{o.lines.map((l) => `${l.qty} ${MENU_BY_ID[l.itemId].name}`).join(', ')}</p>
              </div>
            ))}
            <p className="text-xs text-slate-500">These are already added to tomorrow's bake plan.</p>
          </div>
        </section>

        <section>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Flame size={20} className="text-glaze-400" /> Bake list · {longDate(today)}</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
            <div className="hidden grid-cols-[minmax(0,1fr)_64px_64px_64px_64px_208px] items-center gap-2 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:grid">
              <span>Item</span><span className="text-right">Plan</span><span className="text-right">Made</span><span className="text-right">Sold</span><span className="text-right">On rack</span><span />
            </div>
            {baked.map((item) => {
              const plan = demo.forecastToday(item.id).qty;
              const b = demo.state.bake[item.id] ?? { made: 0, soldOut: false };
              const sold = demo.soldToday[item.id] ?? 0;
              const rack = Math.max(0, b.made - sold);
              const toGo = Math.max(0, plan - b.made);
              const low = !b.soldOut && rack <= 6 && toGo === 0;
              return (
                <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-t border-white/10 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px_208px] ${b.soldOut ? 'opacity-50' : ''}`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ItemArt item={item} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {b.soldOut ? 'Marked sold out' : toGo > 0 ? <span className="font-semibold text-amber-300">Make {toGo} more</span> : low ? <span className="font-semibold text-rose-300">Running low</span> : 'Plan met'}
                        <span className="md:hidden"> · plan {plan} · made {b.made} · sold {sold} · rack {rack}</span>
                      </p>
                    </div>
                  </div>
                  <span className="tabular hidden text-right text-lg font-bold md:block">{plan}</span>
                  <span className={`tabular hidden text-right text-lg font-bold md:block ${toGo > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{b.made}</span>
                  <span className="tabular hidden text-right text-lg text-slate-300 md:block">{sold}</span>
                  <span className={`tabular hidden text-right text-lg font-bold md:block ${low ? 'text-rose-300' : ''}`}>{rack}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => demo.bumpMade(item.id, -6)} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs font-bold hover:bg-white/20">-6</button>
                    <button onClick={() => demo.bumpMade(item.id, 6)} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs font-bold hover:bg-white/20">+6</button>
                    <button onClick={() => demo.bumpMade(item.id, 12)} className="rounded-lg bg-glaze-600 px-2.5 py-2 text-xs font-bold hover:bg-glaze-500">+12</button>
                    <button onClick={() => demo.toggleSoldOut(item.id)} title="Mark sold out on the register and website" className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold ${b.soldOut ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'}`}>
                      {b.soldOut ? <><Check size={13} /> Back</> : <><Ban size={13} /> 86</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Plan comes from this shop's sales history plus today's pre-orders. "86" marks an item sold out on the register and the website right away.</p>
        </section>
      </div>
    </div>
  );
}

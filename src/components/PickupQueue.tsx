import { Coffee, Package, ShoppingBag, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { MENU_BY_ID, STAFF, STAFF_BY_ID } from '../data/shop';
import { useDemo } from '../data/store';
import type { Order, OrderStatus } from '../data/types';
import { isoDate, timeLabel } from '../lib/dates';
import { formatPhone } from '../lib/money';
import { packPlan } from '../lib/packing';
import type { Counted } from '../lib/packing';
import { planWorkload } from '../lib/workload';
import type { Workload } from '../lib/workload';
import { ItemArt } from './ItemArt';

const NEXT: Record<OrderStatus, { to: OrderStatus; label: string } | null> = {
  new: { to: 'making', label: 'Start packing' },
  making: { to: 'ready', label: 'Packed and ready' },
  ready: { to: 'done', label: 'Picked up' },
  done: null,
};

const STATUS: Record<OrderStatus, { label: string; card: string; pill: string }> = {
  new: { label: 'New', card: 'border-amber-400 bg-amber-50', pill: 'bg-amber-200 text-amber-900' },
  making: { label: 'Packing', card: 'border-sky-400 bg-sky-50', pill: 'bg-sky-200 text-sky-900' },
  ready: { label: 'Ready', card: 'border-emerald-400 bg-emerald-50', pill: 'bg-emerald-200 text-emerald-900' },
  done: { label: 'Picked up', card: 'border-slate-200 bg-slate-50 opacity-60', pill: 'bg-slate-200 text-slate-600' },
};

/** Today's online pickup orders, soonest first. Open ones come before the ones already picked up. */
export function useTodaysPickups(): { open: Order[]; finished: Order[] } {
  const demo = useDemo();
  const todays = demo.state.orders
    .filter((o) => o.source === 'online' && o.pickupAt && isoDate(new Date(o.pickupAt)) === demo.state.today)
    .sort((a, b) => a.pickupAt!.localeCompare(b.pickupAt!));
  return { open: todays.filter((o) => o.status !== 'done'), finished: todays.filter((o) => o.status === 'done') };
}

function PackRow({ icon, label, items }: { icon: ReactNode; label: string; items: Counted }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/80 px-2.5 py-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
          {items.map(([id, qty]) => (
            <li key={id} className="flex items-center gap-1 text-sm">
              <ItemArt item={MENU_BY_ID[id]} size={20} />
              <span className="tabular font-display text-base font-extrabold text-slate-900">{qty}</span>
              <span className="font-medium text-slate-700">{MENU_BY_ID[id].name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Today's packing work, shared across whoever is on the clock. */
export function useWorkload(): Workload {
  const demo = useDemo();
  const { open } = useTodaysPickups();
  // People on a break or at lunch get no packing until they are back.
  const onClock = STAFF.filter((s) => demo.state.clock[s.id]?.inAt && demo.breakOf(s.id)?.state !== 'on-break');
  return planWorkload(open, onClock, MENU_BY_ID, new Date());
}

const minutesOf = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`;

/**
 * The packing queue for the counter: each pickup order broken into boxes, the bag and the cup holder.
 * KneadOS decides who packs what and when to start. `me` is the person signed in at this register.
 */
export function PickupQueue({ me }: { me?: string }) {
  const demo = useDemo();
  const { open, finished } = useTodaysPickups();
  const work = useWorkload();
  const byId = Object.fromEntries(open.map((o) => [o.id, o]));
  const queue = work.queue.map((a) => ({ a, o: byId[a.orderId] })).filter((x) => x.o);
  /** Your own orders come first, then everyone else's, each in the order they should be started. */
  const ordered = [...queue.filter((x) => x.a.staffId === me), ...queue.filter((x) => x.a.staffId !== me)];
  const plans = Object.fromEntries(work.queue.map((a) => [a.orderId, a]));
  return (
    <div className="space-y-3">
      {open.length > 0 && (
        <div className="rounded-2xl bg-ink-900 p-3.5 text-white">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-300"><Sparkles size={13} /> KneadOS is running the packing</p>
          {work.packers.length === 0 ? (
            <p className="mt-1 text-sm text-slate-200">Nobody is clocked in, so these orders have no packer yet. Clock in and they will be handed out.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-200">
                {work.packers[0].role === 'cashier'
                  ? 'Orders are shared across the counter staff on the clock, soonest first. Whoever has the least to pack gets the next one.'
                  : `No counter staff are clocked in, so the ${work.packers[0].role}${work.packers.length > 1 ? 's are' : ' is'} packing for now.`}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {work.packers.map((s) => {
                  const n = work.queue.filter((a) => a.staffId === s.id).length;
                  return (
                    <li key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.id === me ? 'bg-glaze-400 text-ink-900' : 'bg-white/10'}`}>
                      {s.name}{s.id === me ? ' (you)' : ''}: {n} order{n === 1 ? '' : 's'}{work.load[s.id] > 0 ? `, about ${minutesOf(work.load[s.id])}` : ''}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      {open.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No pickup orders to pack. New online orders show up here the moment they're placed.
        </p>
      )}
      {[...ordered.map((x) => x.o), ...finished].map((o) => {
        const next = NEXT[o.status];
        const job = plans[o.id];
        const packer = job?.staffId ? STAFF_BY_ID[job.staffId] : undefined;
        const plan = packPlan(o, MENU_BY_ID);
        const minutes = Math.round((new Date(o.pickupAt!).getTime() - Date.now()) / 60_000);
        return (
          <article key={o.id} className={`rounded-2xl border-l-4 p-3.5 ${STATUS[o.status].card}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold leading-tight text-slate-900">#{o.number} · {o.customerName}</p>
                <p className="text-sm text-slate-600">
                  Pickup {timeLabel(o.pickupAt!)}
                  {o.status !== 'done' && <span className={minutes < 15 ? 'font-semibold text-amber-700' : 'text-slate-500'}> · {minutes >= 0 ? `in ${minutes} min` : `${-minutes} min late`}</span>}
                  {o.phone && <span className="text-slate-400"> · {formatPhone(o.phone)}</span>}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[o.status].pill}`}>{STATUS[o.status].label}</span>
            </div>
            {job && o.status !== 'ready' && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-bold ${packer?.id === me ? 'bg-glaze-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                  {packer ? (packer.id === me ? 'Yours to pack' : `${packer.name} packs this`) : 'No packer yet'}
                </span>
                <span className={job.packNow ? 'font-bold text-rose-700' : 'text-slate-600'}>
                  {o.status === 'making' ? 'Being packed' : job.packNow ? 'Pack now' : `Start by ${timeLabel(job.startBy)}`} · about {minutesOf(job.packSec)}
                </span>
              </p>
            )}
            <div className="mt-2.5 space-y-1.5">
              {plan.boxes.map((box, i) => (
                <PackRow key={i} icon={<Package size={15} />} label={plan.boxes.length > 1 ? `Dozen box ${i + 1}` : 'Dozen box'} items={box} />
              ))}
              {plan.bag.length > 0 && <PackRow icon={<ShoppingBag size={15} />} label="Paper bag" items={plan.bag} />}
              {plan.cups.length > 0 && <PackRow icon={<Coffee size={15} />} label="Cup holder" items={plan.cups} />}
            </div>
            {next && (
              <button onClick={() => demo.setStatus(o.id, next.to)} className="mt-3 w-full rounded-xl bg-ink-900 py-3 text-sm font-bold text-white active:bg-ink-700">
                {next.label}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

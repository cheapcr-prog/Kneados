import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { MENU } from '../../data/shop';
import { forecastFor, type Demo } from '../../data/store';
import { RECIPES, SUPPLIES } from '../../data/supplies';
import { addDays, DOW_NAMES, dowOf, shortDate } from '../../lib/dates';
import { money } from '../../lib/money';
import { delivered, onOrder } from '../../lib/purchasing';
import { PurchasingPanel, useAutoPurchasing } from './Purchasing';
import { planSupply, SAFETY_DAYS, supplyUsage, type SupplyPlan } from '../../lib/supplies';

/** How many days of the bake plan to look ahead. */
const HORIZON = 21;

const STATUS = {
  'order-now': { label: 'Order today', pill: 'bg-rose-100 text-rose-800' },
  'order-soon': { label: 'Order soon', pill: 'bg-amber-100 text-amber-800' },
  ok: { label: 'Good', pill: 'bg-emerald-100 text-emerald-800' },
};

/** "Tuesday" for this week, "Tue, Nov 24" further out. */
function dayName(today: string) {
  return (iso: string) => {
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    if (iso === today) return 'today';
    if (iso === week[1]) return 'tomorrow';
    return week.includes(iso) ? DOW_NAMES[dowOf(iso)] : shortDate(iso);
  };
}

/**
 * Checks every supply against the next three weeks of the bake plan.
 * Purchase orders that are sent count as on the way, and received ones are added to the stock on hand.
 */
export function useSupplyPlans(demo: Demo): SupplyPlan[] {
  const { today, orders, tomorrowRain, pos } = demo.state;
  const ordered = useMemo(() => onOrder(pos), [pos]);
  const got = useMemo(() => delivered(pos), [pos]);
  const usage = useMemo(() => {
    return Array.from({ length: HORIZON }, (_, d) => {
      const date = addDays(today, d);
      const qty = Object.fromEntries(MENU.map((m) => [m.id, forecastFor(demo.history, orders, date, m.id, d === 1 && tomorrowRain).qty]));
      return supplyUsage(RECIPES, qty);
    });
  }, [demo.history, orders, today, tomorrowRain]);
  return useMemo(() => {
    const rank = { 'order-now': 0, 'order-soon': 1, ok: 2 };
    return SUPPLIES
      .map((s) => planSupply({ ...s, onHand: s.onHand + (got[s.id] ?? 0) }, usage.map((u) => u[s.id] ?? 0), today, ordered[s.id] ?? 0, dayName(today)))
      .sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
  }, [usage, today, ordered, got]);
}

const qtyLabel = (n: number, unit: string) => `${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10} ${unit}`;

export { useAutoPurchasing };

export function Supplies({ demo, plans }: { demo: Demo; plans: SupplyPlan[] }) {
  const today = demo.state.today;
  const name = dayName(today);
  const sentToday = demo.state.pos.filter((p) => p.date === today && p.status !== 'draft').length;
  const due = plans.filter((p) => p.status === 'order-now');
  const soon = plans.filter((p) => p.status === 'order-soon');

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-ink-900 p-5 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-300"><Sparkles size={13} /> KneadOS checked your supplies</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
          {due.length === 0 ? (sentToday > 0 ? `Today's orders are in. Nothing else needs ordering.` : 'Nothing needs ordering today.') : `${due.length} thing${due.length === 1 ? '' : 's'} to order today, about ${money(due.reduce((a, p) => a + p.cents, 0))}.`}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-300">
          It takes the bake plan for the next {HORIZON} days, works out how much of each supply that uses, and counts back from the day each one runs out.
          It leaves a {SAFETY_DAYS}-day cushion and allows for each supplier's delivery time.
          {soon.length > 0 && ` ${soon.length} more ${soon.length === 1 ? 'is' : 'are'} coming up in the next few days.`}
        </p>
      </section>

      <PurchasingPanel demo={demo} plans={plans} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-4 pb-2 pt-4">
          <h3 className="font-display text-lg font-bold tracking-tight">All supplies</h3>
          <p className="text-xs text-slate-500">Sorted by what runs out first.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Supply</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Used a day</th>
                <th className="px-3 py-2">Runs out</th>
                <th className="px-3 py-2">Order by</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((p) => (
                <tr key={p.supply.id}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-900">{p.supply.name}</span>
                    <span className="block text-xs text-slate-500">{p.supply.supplier} · {p.supply.packLabel} {money(p.supply.packCents)}</span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{qtyLabel(p.stock, p.supply.unit)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-slate-600">{qtyLabel(p.dailyUse, p.supply.unit)}</td>
                  <td className="px-3 py-2.5">{p.runOut ? <>{name(p.runOut)}<span className="block text-xs text-slate-500">{p.daysLeft === 0 ? 'today' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left`}</span></> : <span className="text-slate-500">More than {HORIZON} days</span>}</td>
                  <td className="px-3 py-2.5">{p.orderBy ? name(p.orderBy) : <span className="text-slate-400">Not yet</span>}</td>
                  <td className="px-4 py-2.5">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[p.status].pill}`}>{STATUS[p.status].label}</span>
                    {p.short && <span className="mt-1 block text-xs font-semibold text-rose-700">May run short</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Demo numbers: the stock counts, recipes, pack sizes and prices are examples. In a live shop, stock goes down as the bake plan is made and up when a delivery is received,
        with a quick count each week to correct it. Purchase orders are shown here and not really emailed.
      </p>
    </div>
  );
}

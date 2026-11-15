import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ItemArt } from '../../components/ItemArt';
import { useShopState } from '../../data/local';
import { KEEPS_OVERNIGHT } from '../../data/nutrition';
import { MENU, MENU_BY_ID, SHOP } from '../../data/shop';
import type { Demo } from '../../data/store';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import { menuCosts } from '../../lib/costing';
import { DOW_NAMES, dowOf, shortDate } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { DAY_OLD_PRICE, suggestFate, summarizeLeftovers, wasteByItem, type Fate, type LeftoverEntry } from '../../lib/waste';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn } from './ui';

const FATE: Record<Fate, { label: string; tone: 'green' | 'blue' | 'red' }> = {
  dayold: { label: 'Day-old rack', tone: 'green' },
  donated: { label: 'Donate', tone: 'blue' },
  tossed: { label: 'Toss', tone: 'red' },
};

export function Waste({ demo }: { demo: Demo }) {
  const { today } = demo.state;
  const baked = MENU.filter((m) => m.baked);
  const cost = useMemo(() => menuCosts(MENU.map((m) => m.id), RECIPES, SUPPLIES, PURCHASED), []);
  const price = Object.fromEntries(MENU.map((m) => [m.id, m.price]));
  const bakedOnly = (items: Demo['history'][number]['items']) => Object.fromEntries(baked.map((m) => [m.id, items[m.id] ?? { made: 0, sold: 0, waste: 0 }]));
  const last28 = demo.history.slice(-28);
  const rows = wasteByItem(last28.map((h) => bakedOnly(h.items)), cost, price);
  const made = rows.reduce((a, r) => a + r.made, 0);
  const wasted = rows.reduce((a, r) => a + r.wasted, 0);
  const costCents = rows.reduce((a, r) => a + r.costCents, 0);
  const worst = rows.slice(0, 3);
  const tomorrowDow = dowOf(demo.tomorrow);
  const lastSame = [...demo.history].reverse().find((h) => h.dow === tomorrowDow);

  const weeks = useMemo(() => {
    const out: { label: string; wasted: number }[] = [];
    const days = demo.history.slice(-56);
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      out.push({ label: shortDate(chunk[0].date), wasted: chunk.reduce((a, h) => a + baked.reduce((b, m) => b + (h.items[m.id]?.waste ?? 0), 0), 0) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.history]);

  /** Tonight's leftovers start as what is on the rack now, with a suggested home for each. */
  const rack = baked.map((m) => ({ item: m, left: Math.max(0, (demo.state.bake[m.id]?.made ?? 0) - (demo.soldToday[m.id] ?? 0)) })).filter((x) => x.left > 0);
  const suggested: LeftoverEntry[] = rack.flatMap((x) => suggestFate(x.item.id, x.left, KEEPS_OVERNIGHT[x.item.id] ?? true));
  const [log, setLog] = useShopState<{ entries: LeftoverEntry[]; savedAt: string } | null>(`leftovers-${today}`, () => null);
  const [draft, setDraft] = useShopState<Record<string, Fate>>(`leftover-fates-${today}`, () => ({}));
  const entries = log?.entries ?? suggested.map((e) => ({ ...e, fate: draft[`${e.itemId}:${e.fate}`] ?? e.fate }));
  const summary = summarizeLeftovers(entries, cost, price);

  return (
    <div className="space-y-4">
      <Brain label="KneadOS is learning from what goes unsold" title={`${wasted.toLocaleString()} donuts went unsold in the last 4 weeks. That is ${money(costCents)} in ingredients.`}>
        <ul className="list-disc space-y-1 pl-4">
          {worst.map((r) => {
            const item = MENU_BY_ID[r.itemId];
            const plan = demo.forecastTomorrow(r.itemId).qty;
            const habit = lastSame?.items[r.itemId]?.made ?? 0;
            return (
              <li key={r.itemId}>
                {item.name} had leftovers on {r.daysWithWaste} of {r.days} days, about {Math.round(r.wasted / r.days)} a day.{' '}
                {plan < habit ? `Tomorrow's bake plan makes ${plan}, down from the ${habit} made last ${DOW_NAMES[tomorrowDow]}.` : `Tomorrow's bake plan makes ${plan}.`}
              </li>
            );
          })}
          <li>Every night's count goes into the forecast. A day an item sold out counts as a day it could have sold more, and a day with leftovers pulls the next batch down.</li>
        </ul>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unsold, last 4 weeks" value={wasted.toLocaleString()} sub={`${Math.round((wasted / Math.max(1, made)) * 100)}% of what was made`} tone="bad" />
        <Stat label="Ingredient cost of that" value={moneyShort(costCents)} sub={`${moneyShort(rows.reduce((a, r) => a + r.retailCents, 0))} at menu price`} />
        <Stat label="On the rack right now" value={String(summary.total)} sub="Counted from made minus sold" />
        <Stat label="Day-old rack tomorrow" value={moneyShort(summary.recoverCents)} sub={`${summary.dayOld} donuts at ${DAY_OLD_PRICE * 100}% off`} tone="good" />
      </div>

      <Card
        title="Tonight's leftovers"
        note={`${new Date().getHours() < SHOP.closeHour ? "The shop is still open, so these counts keep dropping until close. " : ""}At close, confirm what is left and where each tray goes. Cream-filled donuts are not kept overnight. The rest go on the day-old rack up to a dozen each, and anything past that is donated.`}
        action={log
          ? <Pill tone="green"><Check size={11} className="-mt-0.5 mr-0.5 inline" />Logged</Pill>
          : <button className={btn.dark} disabled={entries.length === 0} onClick={() => setLog({ entries, savedAt: new Date().toISOString() })}><Check size={15} /> Log the close-out</button>}
      >
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">The rack is empty. Nothing to log.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e, i) => {
              const key = `${e.itemId}:${suggested[i]?.fate ?? e.fate}`;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                  <ItemArt item={MENU_BY_ID[e.itemId]} size={30} />
                  <p className="min-w-0 flex-1 basis-40 text-sm"><span className="tabular font-bold">{e.qty}</span> <span className="font-medium text-slate-800">{MENU_BY_ID[e.itemId].name}</span></p>
                  <div className="flex gap-1">
                    {(Object.keys(FATE) as Fate[]).map((f) => {
                      const blocked = f === 'dayold' && KEEPS_OVERNIGHT[e.itemId] === false;
                      return (
                        <button
                          key={f}
                          disabled={!!log || blocked}
                          onClick={() => setDraft((d) => ({ ...d, [key]: f }))}
                          aria-pressed={e.fate === f}
                          title={blocked ? 'Cream-filled, so it cannot be kept overnight' : undefined}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed ${e.fate === f ? (f === 'dayold' ? 'bg-emerald-600 text-white' : f === 'donated' ? 'bg-sky-600 text-white' : 'bg-rose-600 text-white') : 'bg-slate-100 text-slate-600 disabled:opacity-40'}`}
                        >
                          {FATE[f].label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
          <span className="font-semibold">{summary.dayOld}</span> to the day-old rack (about {money(summary.recoverCents)} if they sell),{' '}
          <span className="font-semibold">{summary.donated}</span> donated, <span className="font-semibold">{summary.tossed}</span> tossed. Ingredient cost of what leaves: {money(summary.lostCents)}.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Unsold donuts by week" note="Eight weeks of leftovers when the bakers made the same amount every day." className="min-w-0 lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [`${v} donuts`, 'Unsold']} />
                <Bar dataKey="wasted" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Where the waste is" note="Last 4 weeks, worst first by ingredient cost." className="min-w-0 lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 font-semibold">Item</th><th className="pb-2 text-right font-semibold">Unsold</th><th className="pb-2 text-right font-semibold">Of made</th>
                  <th className="pb-2 text-right font-semibold">Cost</th><th className="pb-2 text-right font-semibold">Sold out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.itemId}>
                    <td className="py-2 font-medium">{MENU_BY_ID[r.itemId].name}</td>
                    <td className="tabular py-2 text-right">{r.wasted}</td>
                    <td className="py-2 text-right"><Pill tone={r.rate > 0.2 ? 'red' : r.rate > 0.1 ? 'amber' : 'green'}>{Math.round(r.rate * 100)}%</Pill></td>
                    <td className="tabular py-2 text-right">{money(r.costCents)}</td>
                    <td className="tabular py-2 text-right text-slate-500">{r.soldOutDays} of {r.days} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <DemoNote>
        The history is generated to look like a shop baking by habit, which is why the waste is high. Costs come from the example recipes and supplier prices on the Supplies screen.
        Day-old pricing, the rack limit and what can be kept overnight are settings each shop chooses with its health department's rules in mind.
      </DemoNote>
    </div>
  );
}

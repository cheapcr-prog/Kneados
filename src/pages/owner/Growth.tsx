import { useMemo, useState } from 'react';
import { usePricing, useUpsells } from '../../components/Pricing';
import { PRICE } from '../../data/channels';
import { TARGETS } from '../../data/finance';
import { MENU, MENU_BY_ID, SCHEDULE, SHOP, STAFF_BY_ID, shiftHours } from '../../data/shop';
import type { Demo } from '../../data/store';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import { menuCosts } from '../../lib/costing';
import { DOW_NAMES } from '../../lib/dates';
import { menuInsights, type Insight, type Verdict } from '../../lib/insights';
import { money, moneyShort } from '../../lib/money';
import { applyPrices, hourLabel, type PricingRules } from '../../lib/smartpricing';
import { upsellOpportunity } from '../../lib/upsell';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, field } from './ui';

const HOURS = Array.from({ length: (SHOP.closeHour - SHOP.openHour) * 2 + 1 }, (_, i) => SHOP.openHour + i / 2);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function Toggle({ on, set, label }: { on: boolean; set: (on: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Pick<T extends number>({ value, set, options, show, label }: { value: T; set: (v: T) => void; options: T[]; show: (v: T) => string; label: string }) {
  return (
    <select aria-label={label} className={field.replace('w-full ', '') + ' py-1'} value={value} onChange={(e) => set(Number(e.target.value) as T)}>
      {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
    </select>
  );
}

/** Smart pricing rules, a preview of any day and time, and the suggestions made at checkout. */
export function Pricing({ demo }: { demo: Demo }) {
  const p = usePricing();
  const upsells = useUpsells();
  const { rules, setRules } = p;
  const patch = <K extends keyof PricingRules>(k: K, v: Partial<PricingRules[K]>) => setRules((r) => ({ ...r, [k]: { ...r[k], ...v } }));
  const [day, setDay] = useState(p.preview?.dow ?? 6);
  const [hour, setHour] = useState(p.preview?.hour ?? 12.5);
  const [take, setTake] = useState(0.1);

  const changedNow = p.menu.filter((m) => p.live[m.id]?.tag);
  const shown = useMemo(() => {
    const { menu, live } = applyPrices(MENU, rules, { ...p.ctx, dow: day, hour, holiday: false });
    return menu.filter((m) => live[m.id].tag).map((m) => ({ item: m, live: live[m.id] }));
  }, [rules, p.ctx, day, hour]);

  /** What the weekend price would have added on the last four weekends, if the same number had sold. */
  const weekendCents = useMemo(() => {
    const days = demo.history.slice(-28).filter((h) => h.dow === 0 || h.dow === 6);
    const units = days.reduce((a, h) => a + MENU.filter((m) => m.baked && (m.specialty || m.category === 'Specialty')).reduce((b, m) => b + (h.items[m.id]?.sold ?? 0), 0), 0);
    return Math.round((units * rules.weekend.cents * 30) / 28);
  }, [demo.history, rules.weekend.cents]);

  const counter = demo.todayOrders.filter((o) => o.source === 'register');
  const opp = useMemo(() => upsellOpportunity(counter.map((o) => o.lines), MENU_BY_ID), [counter.length]);
  const offered = opp.eligible.dozen + opp.eligible.drink + opp.eligible.donut + opp.eligible.holes;
  const previewing = p.preview && p.preview.dow === day && p.preview.hour === hour;

  return (
    <div className="space-y-4">
      <Brain label="Smart pricing" title={p.preview ? `Previewing ${DOW_NAMES[p.preview.dow]} at ${hourLabel(p.preview.hour)}: ${changedNow.length} price${changedNow.length === 1 ? '' : 's'} changed` : changedNow.length === 0 ? 'Every price is the usual one right now' : `${changedNow.length} price${changedNow.length === 1 ? ' is' : 's are'} changed right now`}>
        {changedNow.length > 0 ? <p>{changedNow.slice(0, 6).map((m) => `${m.name} ${money(m.price)}`).join(', ')}{changedNow.length > 6 ? ` and ${changedNow.length - 6} more` : ''}. The register and the shop website charge these prices on their own.</p>
          : <p>The rules below change prices on the register and the shop website on their own when their time comes. Use the preview to see any day and time.</p>}
      </Brain>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="End-of-day markdown" action={<Toggle on={rules.markdown.on} set={(on) => patch('markdown', { on })} label="End-of-day markdown" />} note="Sells what is left before close instead of throwing it out.">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
            From <Pick label="Markdown starts" value={rules.markdown.fromHour} set={(v) => patch('markdown', { fromHour: v })} options={HOURS.filter((h) => h >= SHOP.closeHour - 3 && h < SHOP.closeHour)} show={hourLabel} />
            take <Pick label="Markdown percent" value={rules.markdown.pct} set={(v) => patch('markdown', { pct: v })} options={[0.2, 0.25, 0.3, 0.4, 0.5]} show={pct} /> off any donut with
            <Pick label="Extra donuts needed" value={rules.markdown.minExtra} set={(v) => patch('markdown', { minExtra: v })} options={[4, 6, 12, 18]} show={String} /> or more extra.
          </p>
          <p className="mt-2 text-xs text-slate-500">"Extra" is how many more are on the rack than KneadOS still expects to sell today, so a donut that is selling fine keeps its price.</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            {p.markdown.lines.length === 0 ? <p className="text-slate-600">With the rack as it is now, nothing has {rules.markdown.minExtra} or more extra.</p> : (
              <>
                <p className="font-semibold text-slate-900">With the rack as it is now</p>
                <ul className="mt-1 space-y-0.5 text-slate-700">
                  {p.markdown.lines.slice(0, 5).map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.extra} extra {l.name}</span><span className="tabular"><span className="text-slate-400 line-through">{money(l.fromCents)}</span> {money(l.toCents)}</span></li>)}
                </ul>
                {p.markdown.lines.length > 5 && <p className="text-xs text-slate-500">and {p.markdown.lines.length - 5} more</p>}
                <p className="mt-1.5 text-xs text-slate-600">Selling all of them at the sale price brings in {money(p.markdown.recoverCents)}.</p>
              </>
            )}
          </div>
        </Card>

        <Card title="Slow-hour drink special" action={<Toggle on={rules.slow.on} set={(on) => patch('slow', { on })} label="Slow-hour drink special" />} note="Cheaper drinks in the quiet hours to bring people in.">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
            From <Pick label="Special starts" value={rules.slow.fromHour} set={(v) => patch('slow', { fromHour: v, toHour: Math.max(v + 1, rules.slow.toHour) })} options={HOURS.filter((h) => h % 1 === 0 && h < SHOP.closeHour)} show={hourLabel} />
            to <Pick label="Special ends" value={rules.slow.toHour} set={(v) => patch('slow', { toHour: v })} options={HOURS.filter((h) => h % 1 === 0 && h > rules.slow.fromHour)} show={hourLabel} />
            every drink is <Pick label="Special percent" value={rules.slow.pct} set={(v) => patch('slow', { pct: v })} options={[0.1, 0.15, 0.2, 0.25, 0.3]} show={pct} /> off.
          </p>
          {p.quiet && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p>Your quietest two hours before the markdown are <span className="font-semibold text-slate-900">{hourLabel(p.quiet.fromHour)} to {hourLabel(p.quiet.toHour)}</span>, which bring in {pct(p.quiet.share)} of a day's sales.</p>
              {(rules.slow.fromHour !== p.quiet.fromHour || rules.slow.toHour !== p.quiet.toHour) && <button className={`${btn.light} mt-2`} onClick={() => patch('slow', { fromHour: p.quiet!.fromHour, toHour: p.quiet!.toHour })}>Use those hours</button>}
            </div>
          )}
          <ul className="mt-3 space-y-0.5 text-sm text-slate-700">
            {MENU.filter((m) => m.category === 'Drinks').map((m) => <li key={m.id} className="flex justify-between"><span>{m.name}</span><span className="tabular"><span className="text-slate-400 line-through">{money(m.price)}</span> {money(Math.round((m.price * (1 - rules.slow.pct)) / 5) * 5)}</span></li>)}
          </ul>
        </Card>

        <Card title="Weekend and holiday price" action={<Toggle on={rules.weekend.on} set={(on) => patch('weekend', { on })} label="Weekend and holiday price" />} note="A little more for specialty items on your busiest days.">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
            On Saturdays, Sundays and holidays, add <Pick label="Weekend extra" value={rules.weekend.cents} set={(v) => patch('weekend', { cents: v })} options={[10, 15, 25, 50]} show={(c) => money(c)} /> to each filled donut, fritter, roll and croissant.
          </p>
          <p className="mt-2 text-xs text-slate-500">Classic donuts and dozen prices stay the same, so the sign in the window is still true.</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            On the last four weekends' sales this adds about <span className="font-semibold text-slate-900">{moneyShort(weekendCents)} a month</span>, if the same number sell at the higher price.
          </div>
        </Card>
      </div>

      <Card title="See the prices at any time" note="Pick a day and time. The markdown uses the rack as it stands right now.">
        <div className="flex flex-wrap items-center gap-2">
          <Pick label="Preview day" value={day} set={setDay} options={[0, 1, 2, 3, 4, 5, 6]} show={(d) => DOW_NAMES[d]} />
          <Pick label="Preview time" value={hour} set={setHour} options={HOURS.filter((h) => h < SHOP.closeHour)} show={hourLabel} />
          {previewing
            ? <button className={btn.dark} onClick={() => p.setPreview(null)}>Back to live prices</button>
            : <button className={btn.light} onClick={() => p.setPreview({ dow: day, hour })}>Show these on the register and website</button>}
        </div>
        {shown.length === 0 ? <p className="mt-3 text-sm text-slate-600">Every price is the usual one on {DOW_NAMES[day]} at {hourLabel(hour)}.</p> : (
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {shown.map(({ item, live }) => (
              <li key={item.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1">
                <span className="min-w-0 truncate">{item.name} <Pill tone={live.tag === 'weekend' ? 'blue' : live.tag === 'special' ? 'amber' : 'red'}>{live.tag === 'weekend' ? 'Weekend' : live.tag === 'special' ? 'Special' : 'Markdown'}</Pill></span>
                <span className="tabular shrink-0"><span className="text-slate-400 line-through">{money(live.baseCents)}</span> <span className="font-semibold">{money(live.cents)}</span></span>
              </li>
            ))}
          </ul>
        )}
        {p.preview && <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">The register and the shop website are showing {DOW_NAMES[p.preview.dow]} at {hourLabel(p.preview.hour)} prices. This preview is only for the demo.</p>}
      </Card>

      <Card title="Suggestions at checkout" action={<Toggle on={upsells.stats.on} set={upsells.setOn} label="Suggestions at checkout" />} note="The register tells the cashier what to offer, and the website offers it before the customer pays.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Counter tickets today" value={String(opp.tickets)} sub={`${offered} would get a suggestion`} />
          <Stat label="Donuts, no drink" value={String(opp.eligible.drink)} sub="Offer: add a coffee" />
          <Stat label="A few short of a dozen" value={String(opp.eligible.dozen)} sub="Offer: make it a dozen" />
          <Stat label="Drink only" value={String(opp.eligible.donut)} sub="Offer: add a donut" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          If <Pick label="Share who say yes" value={take} set={setTake} options={[0.05, 0.1, 0.15, 0.2, 0.3]} show={(t) => `1 in ${Math.round(1 / t)}`} /> of those customers said yes, today's counter sales would be
          <span className="font-semibold text-slate-900">{money(Math.round(opp.fullCents * take))} higher</span>.
          <span className="w-full text-xs text-slate-500">How many say yes is your guess until the shop has run this for a while. KneadOS then shows the real number below.</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Tickets rung up in this demo</span>
          <span>{upsells.stats.offered} got a suggestion</span>
          <span>{upsells.stats.accepted} said yes{upsells.stats.offered > 0 ? ` (${pct(upsells.stats.accepted / upsells.stats.offered)})` : ''}</span>
          <span>{money(upsells.stats.addedCents)} added</span>
          {upsells.stats.tickets > 0 && <button className={btn.light} onClick={upsells.reset}>Start the count over</button>}
        </div>
      </Card>
      <DemoNote>Demo: the rules really change what the Register and the Shop website charge. Ring up a ticket of donuts with no drink, or 9 of one donut, to see a suggestion. Sale prices online are for pickup today.</DemoNote>
    </div>
  );
}

const VERDICT: Record<Verdict, { label: string; tone: 'red' | 'amber' | 'green' | 'blue' | 'slate' }> = {
  losing: { label: 'Loses money', tone: 'red' }, drop: { label: 'Think about dropping', tone: 'red' }, thin: { label: 'Priced too low', tone: 'amber' },
  waste: { label: 'Too many made', tone: 'amber' }, 'runs-out': { label: 'Runs out', tone: 'blue' }, earner: { label: 'Top earner', tone: 'green' }, fine: { label: 'Fine', tone: 'slate' },
};

/** Cost of an hour of baking spread over every piece the kitchen makes, in cents per piece. */
function useLaborPerPiece(demo: Demo): number {
  return useMemo(() => {
    const weeklyWages = SCHEDULE.filter((s) => STAFF_BY_ID[s.staffId].role === 'baker').reduce((a, s) => a + shiftHours(s) * STAFF_BY_ID[s.staffId].hourlyCents, 0);
    const days = demo.history.slice(-28);
    const made = days.reduce((a, h) => a + MENU.filter((m) => m.baked).reduce((b, m) => b + (h.items[m.id]?.made ?? 0), 0), 0);
    return made > 0 ? (weeklyWages * 4) / made : 0;
  }, [demo.history]);
}

export function useMenuInsights(demo: Demo): { rows: Insight[]; laborPerPiece: number } {
  const laborPerPiece = useLaborPerPiece(demo);
  const rows = useMemo(() => {
    const cost = menuCosts(MENU.map((m) => m.id), RECIPES, SUPPLIES, PURCHASED);
    const days = demo.history.slice(-28).map((h) => Object.fromEntries(MENU.map((m) => [m.id, h.items[m.id] ?? { made: 0, sold: 0, waste: 0 }])));
    return menuInsights(days, cost, PRICE, { foodTarget: TARGETS.food, laborPerPiece: (id) => (MENU_BY_ID[id].baked ? laborPerPiece : 0), name: (id) => MENU_BY_ID[id].name });
  }, [demo.history, laborPerPiece]);
  return { rows, laborPerPiece };
}

/** Every item on the menu with what it really earns and what to do about it. */
export function MenuInsights({ demo }: { demo: Demo }) {
  const { rows, laborPerPiece } = useMenuInsights(demo);
  const act = rows.filter((r) => ['losing', 'drop', 'thin', 'waste'].includes(r.verdict));
  const losing = rows.filter((r) => r.verdict === 'losing');
  const worth = act.reduce((a, r) => a + (r.monthlyCents ?? 0), 0);
  return (
    <div className="space-y-4">
      <Brain label="Menu insights" title={losing.length > 0 ? `${losing.length} item${losing.length === 1 ? ' loses' : 's lose'} money` : act.length === 0 ? 'Every item is earning its place' : `Nothing loses money, but ${act.length} item${act.length === 1 ? ' needs' : 's need'} a change`}>
        <p>From the last 28 days of sales, recipes and waste. {act.length > 0 ? `The changes below are worth about ${moneyShort(worth)} a month together.` : ''}</p>
      </Brain>
      {act.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {act.map((r) => (
            <div key={r.itemId} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Pill>
                {r.monthlyCents ? <span className="tabular ml-auto text-xs font-bold text-emerald-700">About {moneyShort(r.monthlyCents)} a month</span> : null}
              </div>
              <p className="mt-2 font-display text-lg font-bold tracking-tight">{MENU_BY_ID[r.itemId].name}</p>
              <p className="mt-0.5 text-sm text-slate-600">{r.advice}</p>
            </div>
          ))}
        </div>
      )}
      <Card title="The whole menu" note="Earns per day is sales less ingredients for everything made, sold or not, and the bakers' time to make it.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500">
              <th className="py-1.5 font-medium">Item</th><th className="font-medium">Verdict</th><th className="text-right font-medium">Sold a day</th><th className="text-right font-medium">Price</th>
              <th className="text-right font-medium">Ingredients</th><th className="text-right font-medium">Unsold</th><th className="text-right font-medium">Earns a day</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">{MENU_BY_ID[r.itemId].name}</td>
                  <td><Pill tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Pill></td>
                  <td className="tabular text-right">{Math.round(r.soldPerDay)}</td>
                  <td className="tabular text-right">{money(r.price)}</td>
                  <td className="tabular text-right">{money(Math.round(r.cost))} <span className="text-xs text-slate-400">{pct(1 - r.margin)}</span></td>
                  <td className={`tabular text-right ${r.wasteRate >= 0.25 ? 'font-semibold text-rose-600' : ''}`}>{MENU_BY_ID[r.itemId].baked ? pct(r.wasteRate) : ''}</td>
                  <td className="tabular text-right font-semibold">{money(Math.round(r.profitPerDayCents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DemoNote>Demo: recipes, ingredient prices and sales are example data. Bakers' wages are spread evenly over every piece made, which comes to {money(Math.round(laborPerPiece))} a piece here. What a price change is worth assumes the same number sell at the new price.</DemoNote>
    </div>
  );
}

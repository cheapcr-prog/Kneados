import { ExternalLink } from 'lucide-react';
import { useRecipes } from '../../components/DrinkBar';
import { MENU } from '../../data/shop';
import type { Demo } from '../../data/store';
import { DRINK_BAR, DRINK_BAR_IDS, SUPPLIES } from '../../data/supplies';
import { unitCost } from '../../lib/costing';
import { longDate, shortDate } from '../../lib/dates';
import { amountLabel, barStock, cupsLeft } from '../../lib/drinkbar';
import { money } from '../../lib/money';
import { onOrder } from '../../lib/purchasing';
import type { SupplyPlan } from '../../lib/supplies';
import { Brain, Card, Demo as DemoNote, Pill, btn, field } from './ui';

const DRINKS = MENU.filter((m) => m.category === 'Smoothies & boba');
const SUPPLY = Object.fromEntries(DRINK_BAR.map((s) => [s.id, s]));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Smoothies, boba and toppings: what each cup takes, what is left on the shelf, and what is on order. */
export function DrinkBar({ demo, plans, onOpen }: { demo: Demo; plans: SupplyPlan[]; onOpen: (tab: 'Supplies') => void }) {
  const { recipes, setAmount, edited, reset } = useRecipes();
  const plan = Object.fromEntries(plans.map((p) => [p.supply.id, p]));
  const sold = Object.fromEntries(DRINKS.map((m) => [m.id, demo.soldToday[m.id] ?? 0]));
  const stock = barStock(Object.fromEntries(DRINK_BAR.map((s) => [s.id, plan[s.id]?.supply.onHand ?? s.onHand])), recipes, sold);
  const left = Object.fromEntries(stock.map((s) => [s.supplyId, s.left]));
  const cups = DRINKS.filter((m) => !m.addon).reduce((a, m) => a + sold[m.id], 0);
  const toppings = DRINKS.filter((m) => m.addon).reduce((a, m) => a + sold[m.id], 0);
  const scoops = stock.filter((s) => SUPPLY[s.supplyId].unit === 'scoops').reduce((a, s) => a + s.used, 0);
  const mix = stock.filter((s) => SUPPLY[s.supplyId].unit === 'fl oz').reduce((a, s) => a + s.used, 0);
  const due = DRINK_BAR.filter((s) => plan[s.id]?.status === 'order-now');
  const coming = onOrder(demo.state.pos);
  const placed = demo.state.pos.filter((p) => p.status === 'sent' && p.lines.some((l) => DRINK_BAR_IDS.includes(l.supplyId)));

  return (
    <div className="space-y-4">
      <Brain label="Drink bar" title={`${cups} smoothie${cups === 1 ? '' : 's'} and ${toppings} topping${toppings === 1 ? '' : 's'} sold today`}>
        <p>That took {amountLabel(mix, 'fl oz')} of smoothie mix and {amountLabel(scoops, 'scoops')} of powder, boba and jelly off the shelf. Every sale on the register or the website comes out of stock the moment it is paid.</p>
        {placed.length > 0 && <p>{placed.map((p) => `Order ${p.number ? `#${p.number} ` : ''}to ${p.supplier} for ${money(p.totalCents)} ${p.auto ? 'was placed automatically' : 'is placed'} and arrives ${shortDate(p.expected)}.`).join(' ')}</p>}
        {due.length > 0 && placed.length === 0 && <p>{due.map((s) => s.name).join(', ')} {due.length === 1 ? 'needs' : 'need'} ordering today.</p>}
      </Brain>

      <Card title="On the shelf" note="Start of day is the last count plus deliveries. Used today is worked out from what was sold." action={<button className={btn.light} onClick={() => onOpen('Supplies')}>Open supplies and orders</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500">
              <th className="py-1.5 font-medium">Ingredient</th><th className="text-right font-medium">Start of day</th><th className="text-right font-medium">Used today</th>
              <th className="text-right font-medium">Left now</th><th className="text-right font-medium">Usual day</th><th className="pl-4 font-medium">Reorder</th>
            </tr></thead>
            <tbody>
              {stock.map((s) => {
                const sup = SUPPLY[s.supplyId], p = plan[s.supplyId];
                return (
                  <tr key={s.supplyId} className="border-t border-slate-100 align-top">
                    <td className="py-2">
                      <p className="font-semibold">{sup.name}</p>
                      <p className="text-xs text-slate-500">{sup.supplier} · {sup.packLabel} · {money(sup.packCents)}</p>
                    </td>
                    <td className="tabular py-2 text-right">{amountLabel(s.start, sup.unit)}</td>
                    <td className="tabular py-2 text-right">{s.used > 0 ? amountLabel(s.used, sup.unit) : 'None yet'}</td>
                    <td className="tabular py-2 text-right font-semibold">{amountLabel(s.left, sup.unit)}</td>
                    <td className="tabular py-2 text-right">{p ? amountLabel(p.dailyUse, sup.unit) : ''}</td>
                    <td className="py-2 pl-4">
                      {(coming[s.supplyId] ?? 0) > 0 ? <><Pill tone="blue">On order</Pill><p className="mt-0.5 text-xs text-slate-500">{amountLabel(coming[s.supplyId], sup.unit)} on the way</p></>
                        : !p || p.status === 'ok' ? <Pill tone="green">Enough for now</Pill> : p.status === 'order-now' ? <Pill tone="red">Order today</Pill> : <Pill tone="amber">Order by {shortDate(p.orderBy!)}</Pill>}
                      {p && p.status !== 'ok' && !coming[s.supplyId] && <p className="mt-0.5 text-xs text-slate-500">{p.packs} × {sup.packLabel}, about {money(p.cents)}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recipes by the scoop" note="Change a number to match how your crew makes it. Stock, cost and reordering follow." action={edited ? <button className={btn.light} onClick={reset}>Back to the makers' recipes</button> : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500">
              <th className="py-1.5 font-medium">Drink</th><th className="font-medium">Goes in each one</th><th className="text-right font-medium">Sold today</th>
              <th className="text-right font-medium">Can still make</th><th className="text-right font-medium">Costs you</th><th className="text-right font-medium">Sells for</th><th className="text-right font-medium">You keep</th>
            </tr></thead>
            <tbody>
              {DRINKS.map((m) => {
                const recipe = recipes[m.id] ?? {};
                const cost = unitCost(recipe, SUPPLIES);
                return (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="py-1.5 font-semibold">{m.name}</td>
                    <td className="py-1.5">
                      {Object.entries(recipe).filter(([id]) => DRINK_BAR_IDS.includes(id)).map(([id, amount]) => (
                        <label key={id} className="flex items-center gap-1.5">
                          <input type="number" min={0} step={0.5} value={amount} aria-label={`${SUPPLY[id].name} in ${m.name}`} onChange={(e) => setAmount(m.id, id, Number(e.target.value) || 0)} className={`${field.replace('w-full ', '')} tabular w-20 py-1 text-right`} />
                          <span className="text-slate-600">{SUPPLY[id].unit} of {SUPPLY[id].name.toLowerCase()}</span>
                        </label>
                      ))}
                    </td>
                    <td className="tabular text-right">{sold[m.id]}</td>
                    <td className="tabular text-right">{cupsLeft(recipe, left, DRINK_BAR_IDS)}</td>
                    <td className="tabular text-right">{money(Math.round(cost))}</td>
                    <td className="tabular text-right">{money(m.price)}</td>
                    <td className="tabular text-right font-semibold">{pct((m.price - cost) / m.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Cost is the mix or topping plus the cup and lid. Ice, water, creamer and sweetener are not counted yet.</p>
      </Card>

      <Card title="Where it comes from" note="Real products, looked up on the sellers' own listings.">
        <ul className="divide-y divide-slate-100">
          {DRINK_BAR.map((s) => s.product && (
            <li key={s.id} className="py-2.5 text-sm">
              <p className="font-semibold text-slate-900">{s.product.brand} <span className="font-normal text-slate-500">from {s.supplier}</span></p>
              <p className="mt-0.5 text-slate-600">{s.product.note}</p>
              <a href={s.product.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-glaze-700 hover:underline">See the listing <ExternalLink size={11} /></a>
              <span className="ml-2 text-xs text-slate-400">Checked {longDate(s.product.checked)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <DemoNote>Demo: the products, pack sizes and listed prices are real and were checked on the date shown. Prices change, so confirm them before you order. Stock on hand, menu prices and how many sell are example numbers. An automatic order is only marked as placed here. Nothing is bought.</DemoNote>
    </div>
  );
}

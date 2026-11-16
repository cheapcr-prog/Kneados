import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { Card, Pill, Stat, btn, download } from '../../pages/owner/ui';
import { DOW_SHORT, addDays, dowOf, shortDate } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { splitTipPool } from '../../lib/tips';
import { checkStatus, rangeLabel, readingOk, type LogEntry, type Requirement } from '../../lib/compliance';
import { useShopState } from '../../data/local';
import { DOUGH_RECIPE, MILEAGE_CENTS, PIZZA_SHIFTS, PIZZA_SHOP, PIZZA_STAFF_BY_ID, PIZZA_SUPPLIERS, SIDES, SIZES, SPECIALTY_BY_ID, TOPPINGS, ZONES, pizzaDayFactor } from '../data';
import { APP_FEE_SHARE, CHANNEL_MIX, FIXED_MONTHLY, PACKS, packValue, piesIn, toppingPerPizza, type Channel } from '../logic';
import type { PizzaBrain } from '../brain';
import { usePizza } from '../store';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const CHANNEL_LABEL: Record<Channel, string> = { online: 'Own website', phone: 'Phone', counter: 'Counter', doordash: 'DoorDash', ubereats: 'Uber Eats', catering: 'Catering' };

/* ------------------------------------------------------------------ dough and forecast */

export function DoughPage({ brain }: { brain: PizzaBrain }) {
  const { state } = usePizza();
  const d = brain.dough;
  return (
    <>
      <Card title="Tonight's dough" note={`For ${shortDate(d.forDate)} after a 48 hour cold ferment. Sent to the make line's dough tab as a batch sheet.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {SIZES.map((s) => <Stat key={s.id} label={`${s.label} ${s.inches}" balls (${s.doughGrams} g)`} value={String(d.balls[s.id])} sub={`${state.doughMade[s.id]} made so far`} />)}
        </div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-2 text-sm text-slate-600">Batch: {Object.entries(d.grams).map(([k, g]) => `${k} ${(g / 1000).toFixed(1)} kg`).join(', ')}. That's {Math.round(d.flourLb)} lb of flour in {d.mixes} mixes. Recipe in baker's percent: {Object.entries(DOUGH_RECIPE).map(([k, v]) => `${k} ${v}%`).join(', ')}.</p>
      </Card>
      <Card title="Next 7 days" note="Pizzas by size, orders and deliveries. Same weekday history, weather, game days and holidays, plus pre-orders already placed.">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Day</th><th>Small</th><th>Medium</th><th>Large</th><th>Orders</th><th>Deliveries</th><th>Wings</th><th>Why</th></tr></thead>
            <tbody>
              {brain.week.map((f) => (
                <tr key={f.date} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">{DOW_SHORT[dowOf(f.date)]} {shortDate(f.date)}</td>
                  <td>{f.pizzas.S}</td><td>{f.pizzas.M}</td><td>{f.pizzas.L}</td><td>{f.orders}</td><td>{f.deliveries}</td><td>{f.wings}</td>
                  <td className="text-xs text-slate-500">{f.reasons.slice(1).join('; ') || 'A normal day'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How close the dough plan has been" note="Balls made against balls used, last 14 days. Leftover dough is good for garlic bread on day 3.">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={usePizza().history.slice(-14).map((h) => ({ day: `${DOW_SHORT[h.dow]} ${h.date.slice(8)}`, used: h.doughUsed.S + h.doughUsed.M + h.doughUsed.L, extra: Math.max(0, h.doughMade.S + h.doughMade.M + h.doughMade.L - h.doughUsed.S - h.doughUsed.M - h.doughUsed.L) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
            <Bar dataKey="used" stackId="a" fill="#059669" name="Used" /><Bar dataKey="extra" stackId="a" fill="#fbbf24" name="Left over" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ stock and purchase orders */

export function StockPage({ brain }: { brain: PizzaBrain }) {
  const { state, sendPO, receivePO } = usePizza();
  const [all, setAll] = useState(false);
  const rows = [...brain.stock].sort((a, b) => a.daysLeft - b.daysLeft).filter((l) => all || l.daysLeft < 7);
  return (
    <>
      <Card title="Orders ready to send" note="Built from the coming week's forecast and the recipe for every pizza: what each pie uses by size, half toppings counted as half.">
        {brain.pos.length === 0 && <p className="text-sm text-slate-500">Nothing needs ordering right now.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {brain.pos.map((p) => {
            const sup = PIZZA_SUPPLIERS.find((s) => s.name === p.supplier)!;
            return (
              <div key={p.supplier} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between"><h3 className="font-bold">{p.supplier}</h3><span className="tabular font-bold">{money(p.cents)}</span></div>
                <p className="text-xs text-slate-500">Delivers in {p.deliversIn} day{p.deliversIn > 1 ? 's' : ''} · order by {sup.cutoffHour > 12 ? sup.cutoffHour - 12 : sup.cutoffHour}{sup.cutoffHour >= 12 ? 'pm' : 'am'} · minimum {moneyShort(sup.minOrderCents)}{p.belowMinimum ? ' (this order is under it)' : ''}</p>
                <ul className="mt-2 text-sm">{p.lines.map((l) => <li key={l.id} className="flex justify-between"><span>{l.packs} × {l.packLabel} {l.name}</span><span className="tabular text-slate-500">{money(l.cents)}</span></li>)}</ul>
                <button onClick={() => sendPO({ supplier: p.supplier, cents: p.cents, lines: p.lines.map((l) => ({ id: l.id, name: l.name, packs: l.packs, packLabel: l.packLabel, qty: l.packs * l.packSize })) })} className={`${btn.dark} mt-3`}>Email to {sup.rep}</button>
              </div>
            );
          })}
        </div>
      </Card>
      {state.pos.length > 0 && (
        <Card title="Sent orders">
          <ul className="divide-y divide-slate-100 text-sm">
            {state.pos.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="font-bold">PO {p.number}</span><span className="flex-1">{p.supplier} · {p.lines.length} items · {money(p.cents)}</span>
                {p.status === 'sent' ? <button onClick={() => receivePO(p.id)} className={btn.green}>Check it in</button> : <Pill tone="green">Received, stock updated</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Stock on hand" note="Goes down by recipe as each pie goes into the oven, and up when a delivery is checked in." action={<button onClick={() => setAll(!all)} className={btn.light}>{all ? 'Only what runs out this week' : 'Show everything'}</button>}>
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Item</th><th>On hand</th><th>Use a day</th><th>Days left</th><th>Runs out</th><th>Supplier</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">{l.name}</td>
                  <td>{l.onHand.toFixed(l.unit === 'lb' ? 1 : 0)} {l.unit}</td>
                  <td>{l.perDay.toFixed(1)}</td>
                  <td><span className={l.reorder ? 'font-bold text-rose-600' : l.daysLeft < 4 ? 'font-bold text-amber-600' : ''}>{l.daysLeft >= 99 ? '—' : l.daysLeft.toFixed(1)}</span></td>
                  <td>{l.runsOut ? shortDate(l.runsOut) : ''}</td>
                  <td className="text-xs text-slate-500">{l.supplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ delivery */

export function DeliveryPage({ brain }: { brain: PizzaBrain }) {
  const { history } = usePizza();
  const last = history.slice(-30);
  const f = brain.facts.last30Days;
  const byChannel = (Object.keys(CHANNEL_MIX) as Channel[]).map((c) => ({ c, orders: last.reduce((a, h) => a + h.channels[c], 0) }));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Own deliveries, 30 days" value={String(f.ownDeliveries)} />
        <Stat label="Average door to door" value={`${f.avgDeliveryMinutes} min`} />
        <Stat label="Late (over 45 min)" value={pct(f.lateDeliveryShare)} tone={f.lateDeliveryShare > 0.08 ? 'bad' : undefined} />
        <Stat label="Paid to delivery apps" value={moneyShort(f.deliveryAppFeesCents)} tone="bad" sub={`${f.deliveryAppOrders} app orders`} />
      </div>
      <Card title="Average delivery time by day" note="Slow nights are Fridays, Saturdays, game days and rain: the forecast adds drivers before they happen.">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={last.map((h) => ({ day: shortDate(h.date), min: h.avgDeliveryMin }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" fontSize={11} interval={4} /><YAxis fontSize={11} domain={[20, 45]} /><Tooltip />
            <Line dataKey="min" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Minutes" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Where orders come from" note="Delivery apps keep a commission on every order; your own site and phone keep the whole ticket.">
        <table className="tabular w-full text-sm">
          <tbody>
            {byChannel.map(({ c, orders }) => (
              <tr key={c} className="border-t border-slate-100"><td className="py-1.5 font-semibold">{CHANNEL_LABEL[c]}</td><td>{orders} orders</td><td>{pct(orders / Math.max(1, f.orders))}</td><td className="text-xs text-slate-500">{APP_FEE_SHARE[c] ? `${pct(APP_FEE_SHARE[c]!)} commission` : 'no commission'}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Delivery zones" note="Fees and quoted drive times. Addresses are placed in a zone automatically at checkout.">
        <table className="tabular w-full text-sm">
          <tbody>{ZONES.map((z) => <tr key={z.id} className="border-t border-slate-100"><td className="py-1.5 font-semibold">{z.label}</td><td>{money(z.feeCents)} fee</td><td>{z.driveMinutes} min drive</td></tr>)}</tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Drivers are paid {MILEAGE_CENTS}¢ a mile (example rate) on every run, worked out from the route.</p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ game day and catering */

export function GameDayPage({ brain }: { brain: PizzaBrain }) {
  const big = brain.big;
  const pies = { S: 0, M: 0, L: 0 } as Record<'S' | 'M' | 'L', number>;
  const sides: Record<string, number> = {};
  for (const o of brain.pre) for (const l of o.lines) { if (l.kind === 'pizza') pies[l.config.size] += l.qty; else sides[l.sideId] = (sides[l.sideId] ?? 0) + l.qty; }
  const f = brain.week.find((x) => x.date === big.date);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Pre-orders for ${big.name}`} value={String(brain.pre.length)} sub={shortDate(big.date)} />
        <Stat label="Pies pre-ordered" value={String(pies.S + pies.M + pies.L)} />
        <Stat label="Deposits taken" value={moneyShort(brain.facts.gameDay.depositsCents)} />
        <Stat label="Due at pickup" value={moneyShort(brain.facts.gameDay.balanceDueCents)} />
      </div>
      <Card title={`${big.name} prep`} note="Pre-orders plus the walk-in forecast for the day. Feeds the dough plan, the wing order and the driver schedule.">
        {f && <p className="text-sm">Forecast for the whole day: <b>{f.orders}</b> orders, <b>{f.pizzas.S + f.pizzas.M + f.pizzas.L}</b> pizzas ({f.pizzas.S} small, {f.pizzas.M} medium, {f.pizzas.L} large), <b>{f.deliveries}</b> deliveries, <b>{f.wings}</b> wing orders. {f.reasons.join('. ')}.</p>}
        <p className="mt-2 text-sm">Pre-ordered: {pies.L} large, {pies.M} medium, {pies.S} small; {Object.entries(sides).map(([id, n]) => `${n} × ${SIDES.find((s) => s.id === id)?.name}`).join(', ')}.</p>
        <p className="mt-2 text-xs text-slate-500">Pre-orders drop onto the make line 20 minutes before they need the oven, so the line never sees them early.</p>
      </Card>
      <Card title="Pre-orders">
        <ul className="divide-y divide-slate-100 text-sm">
          {brain.pre.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-bold">#{o.number}</span><span className="flex-1">{o.customer.name} · {piesIn(o)} pies · {new Date(o.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} {o.fulfillment}</span>
              <span className="tabular text-xs text-slate-500">{money(o.depositCents ?? 0)} paid · {money(o.total - (o.depositCents ?? 0))} due</span>
              {o.payment === 'invoice' && <Pill tone="blue">Invoice</Pill>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Packs on the website" note="Prices are set by the shop. The saving shown to customers is worked out from menu prices.">
        <ul className="text-sm">{PACKS.map((p) => <li key={p.id} className="flex justify-between border-t border-slate-100 py-1.5"><span className="font-semibold">{p.name}</span><span className="tabular">{money(p.cents)} <span className="text-slate-400">vs {money(packValue(p))} separately</span></span></li>)}</ul>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ menu and prices */

export function MenuPage({ brain }: { brain: PizzaBrain }) {
  const { history } = usePizza();
  const per = toppingPerPizza(history);
  const sold = brain.facts.last30Days.bestSellers;
  const tops = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <>
      <Card title="Best sellers, last 30 days">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={sold} layout="vertical" margin={{ left: 40 }}>
            <XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" fontSize={11} width={110} /><Tooltip />
            <Bar dataKey="pizzas" fill="#059669" name="Pizzas" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Food cost by pizza" note="Recipe cost from what each topping, the cheese, sauce, dough and box cost you. Under about 27% is healthy for pizza.">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Pizza</th>{SIZES.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
            <tbody>
              {Object.values(SPECIALTY_BY_ID).map((sp) => (
                <tr key={sp.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">{sp.name}</td>
                  {SIZES.map((s) => {
                    const m = brain.margins.find((x) => x.id === sp.id && x.size === s.id)!;
                    return <td key={s.id}><span className={m.costShare > 0.28 ? 'font-bold text-rose-600' : ''}>{pct(m.costShare)}</span> <span className="text-xs text-slate-400">{money(m.costCents)} of {money(m.priceCents)}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Most used toppings" note="Pounds per pizza across all sales, from the recipes. This is what drives the topping orders.">
        <ul className="grid gap-x-6 text-sm sm:grid-cols-2">{tops.map(([id, lb]) => <li key={id} className="flex justify-between border-t border-slate-100 py-1"><span>{TOPPINGS.find((t) => t.id === id)?.name}</span><span className="tabular text-slate-500">{(lb * 16).toFixed(2)} oz a pizza</span></li>)}</ul>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ money */

export function MoneyPage({ brain }: { brain: PizzaBrain }) {
  const { history } = usePizza();
  const m = brain.money30;
  const lines: [string, number][] = [['Food and packaging', m.food], ['Labor with taxes', m.laborCents], ['Delivery app commission', m.appFees], ['Card fees', m.cardFees], ['Driver mileage', m.mileage], ['Rent, utilities, insurance, software', m.fixed]];
  const csv = ['date,orders,sales,food_cost,app_fees,deliveries', ...history.slice(-30).map((h) => [h.date, h.orders, (h.revenueCents / 100).toFixed(2), (h.foodCostCents / 100).toFixed(2), (h.appFeesCents / 100).toFixed(2), h.deliveries].join(','))].join('\n');
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sales, 30 days" value={moneyShort(m.revenue)} />
        <Stat label="Food cost" value={pct(m.foodShare)} />
        <Stat label="Labor" value={pct(m.laborShare)} />
        <Stat label="Profit after rent" value={moneyShort(m.profit)} tone={m.profit > 0 ? 'good' : 'bad'} />
      </div>
      <Card title="Profit and loss, last 30 days" action={<button onClick={() => download('pizza-sales-30-days.csv', csv)} className={btn.light}>Export for your accountant</button>}>
        <table className="tabular w-full text-sm">
          <tbody>
            <tr className="font-bold"><td className="py-1.5">Sales</td><td className="text-right">{money(m.revenue)}</td><td /></tr>
            {lines.map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{k}</td><td className="text-right">−{money(v)}</td><td className="pl-3 text-right text-xs text-slate-500">{pct(v / m.revenue)}</td></tr>)}
            <tr className="border-t-2 border-slate-300 font-bold"><td className="py-1.5">Profit</td><td className="text-right">{money(m.profit)}</td><td className="pl-3 text-right text-xs">{pct(m.profit / m.revenue)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Fixed costs are example monthly figures: rent {moneyShort(FIXED_MONTHLY.rent)}, utilities {moneyShort(FIXED_MONTHLY.utilities)}, insurance {moneyShort(FIXED_MONTHLY.insurance)}.</p>
      </Card>
      <Card title="Sales by day">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={history.slice(-30).map((h) => ({ day: shortDate(h.date), sales: Math.round(h.revenueCents / 100), event: pizzaDayFactor(h.date)?.name }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" fontSize={11} interval={4} /><YAxis fontSize={11} /><Tooltip formatter={(v) => `$${v}`} />
            <Bar dataKey="sales" fill="#0b1220" name="Sales" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <p className="text-xs text-slate-500">All figures come from 90 days of generated example sales for a made-up shop.</p>
    </>
  );
}

/* ------------------------------------------------------------------ team and tips */

export function TeamPage() {
  const { state } = usePizza();
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  // Counter and kitchen tips are pooled by hours; drivers keep their own delivery tips. Owners and managers are left out.
  const pool = Math.round(state.earlier.tipsCents * 0.45) + state.orders.filter((o) => o.fulfillment === 'pickup').reduce((a, o) => a + o.tip, 0);
  const workers = PIZZA_SHIFTS.filter((s) => ['cook', 'cashier'].includes(PIZZA_STAFF_BY_ID[s.staffId].role)).map((s) => ({ staffId: s.staffId, role: 'cashier' as const, hours: Math.max(0, Math.min(hour, s.end) - s.start) }));
  const shares = splitTipPool(pool, workers);
  return (
    <>
      <Card title="Tonight's crew">
        <ul className="divide-y divide-slate-100 text-sm">
          {PIZZA_SHIFTS.map((s) => {
            const p = PIZZA_STAFF_BY_ID[s.staffId];
            const on = hour >= s.start && hour < s.end;
            return <li key={s.staffId} className="flex items-center gap-2 py-1.5"><span className="w-28 font-semibold">{p.name}</span><span className="w-20 capitalize text-slate-500">{p.role}</span><span className="flex-1">{fmtH(s.start)} to {fmtH(s.end)}</span>{on ? <Pill tone="green">On now</Pill> : <Pill>Off</Pill>}</li>;
          })}
        </ul>
      </Card>
      <Card title="Tip pool so far today" note="Counter and kitchen tips split by hours worked. Managers and owners are left out, as California Labor Code 351 requires. Drivers keep the tips on their own deliveries.">
        <p className="tabular text-sm">Pool: <b>{money(pool)}</b></p>
        <ul className="tabular mt-2 text-sm">{shares.map((s) => <li key={s.staffId} className="flex justify-between border-t border-slate-100 py-1"><span>{PIZZA_STAFF_BY_ID[s.staffId].name} · {s.hours.toFixed(1)} h</span><span>{money(s.cents)}</span></li>)}</ul>
      </Card>
      <Card title="Drivers tonight">
        <ul className="tabular text-sm">
          {Object.values(state.drivers).map((d) => <li key={d.id} className="flex justify-between border-t border-slate-100 py-1"><span>{PIZZA_STAFF_BY_ID[d.id].name} · {d.runs} runs · {d.miles} mi</span><span>{money(d.tipsCents)} tips + {money(Math.round(d.miles * MILEAGE_CENTS))} mileage</span></li>)}
        </ul>
      </Card>
    </>
  );
}
const fmtH = (h: number) => `${h % 12 || 12}${h >= 12 && h < 24 ? 'pm' : 'am'}`;

/* ------------------------------------------------------------------ rewards and texts */

export function PeoplePage({ brain }: { brain: PizzaBrain }) {
  const { state } = usePizza();
  const lapsed = state.members.filter((m) => m.lastVisit && (new Date(state.today).getTime() - new Date(m.lastVisit).getTime()) / 86_400_000 >= 30);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Dough Rewards members" value={String(state.members.length)} />
        <Stat label="Not back in 30+ days" value={String(lapsed.length)} />
        <Stat label="Free pizzas waiting" value={String(brain.facts.rewards.rewardsWaiting)} />
      </div>
      <Card title="Texts sent" note="Order received, ready, on the way, rewards and campaigns. In the demo they are shown here instead of sent.">
        {state.texts.length === 0 && <p className="text-sm text-slate-500">Place an order on the website or register and the texts show up here.</p>}
        <ul className="divide-y divide-slate-100 text-sm">{state.texts.slice(0, 40).map((t, i) => <li key={i} className="py-1.5"><span className="text-xs text-slate-400">{new Date(t.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} to {t.to.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}</span><p>{t.body}</p></li>)}</ul>
      </Card>
      <Card title="Members">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Name</th><th>Orders</th><th>Punches</th><th>Last order</th><th>Usually gets</th></tr></thead>
            <tbody>{state.members.slice(0, 25).map((m) => <tr key={m.phone} className="border-t border-slate-100"><td className="py-1.5">{m.name}</td><td>{m.visits}</td><td>{m.punches}/10</td><td>{m.lastVisit ? shortDate(m.lastVisit) : ''}</td><td>{SPECIALTY_BY_ID[m.favorite ?? '']?.name}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ health and safety */

const code = (section: string, url?: string) => ({ label: `California Retail Food Code section ${section}`, url });
const HOLDING = code('113996', 'https://california.public.law/codes/health_and_safety_code_section_113996');
const PIZZA_CHECKS: Requirement[] = [
  { id: 'walkin', group: 'Temperatures', title: 'Log the walk-in temperature (dough, cheese, meats)', rule: 'Food that can spoil is kept at 41°F or colder.', source: HOLDING, verified: true, basis: 'law', everyDays: 1, perDay: 2, reading: { unit: '°F', max: 41 }, major: true, who: 'kitchen' },
  { id: 'make-table', group: 'Temperatures', title: 'Log the make-table topping rail temperature', rule: 'Cut toppings, cheese and sauce on the make line are kept at 41°F or colder. Keep the lid down between rushes.', source: HOLDING, verified: true, basis: 'law', everyDays: 1, perDay: 3, reading: { unit: '°F', max: 41 }, major: true, who: 'kitchen' },
  { id: 'wings-hot', group: 'Temperatures', title: 'Log the wing holding temperature', rule: 'Hot food that can spoil is kept at 135°F or hotter.', source: HOLDING, verified: true, basis: 'law', everyDays: 1, perDay: 2, reading: { unit: '°F', min: 135 }, major: true, who: 'kitchen' },
  { id: 'cooling', group: 'Temperatures', title: 'Log cooling of cooked sausage and meatballs', rule: 'Cooked food is cooled from 135°F to 70°F within 2 hours, and to 41°F within 4 more hours.', source: code('114002', 'https://california.public.law/codes/health_and_safety_code_section_114002'), verified: false, basis: 'law', everyDays: 1, reading: { unit: '°F', max: 41 }, major: true, who: 'kitchen' },
  { id: 'sanitizer', group: 'Cleaning and sanitizing', title: 'Test the sanitizer buckets', rule: 'Quaternary ammonium sanitizer at 200 ppm; cloths kept in the bucket between uses.', source: code('114099.6', 'https://california.public.law/codes/health_and_safety_code_section_114099.6'), verified: true, basis: 'law', everyDays: 1, perDay: 2, reading: { unit: ' ppm', min: 200, max: 400 }, major: true, who: 'kitchen' },
  { id: 'hand-sinks', group: 'Handwashing and staff', title: 'Check every hand sink: soap, towels, warm water, nothing in the way', rule: 'Each hand sink has soap, paper towels and warm water and is used only for hands.', source: code('113953'), verified: false, basis: 'law', everyDays: 1, perDay: 2, major: true, who: 'counter' },
  { id: 'delivery-bags', group: 'Cleaning and sanitizing', title: 'Wipe out the insulated delivery bags', rule: 'Not a written rule. Clean bags keep crumbs and grease out of the cars and keep pies hot.', source: { label: 'Common practice, not a written rule' }, verified: false, basis: 'practice', everyDays: 1, major: false, who: 'counter' },
  { id: 'oven-hood', group: 'Building and fire', title: 'Hood and duct cleaning over the oven and fryer', rule: 'Hoods over cooking equipment are inspected and cleaned by a qualified company on schedule.', source: { label: 'California Fire Code section 606.3.3.1' }, verified: false, basis: 'law', everyDays: 182, vendor: true, major: true, who: 'manager' },
];

export function HealthPage() {
  const { state } = usePizza();
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const [log, setLog] = useShopState<LogEntry[]>(`pizza-health-${state.today}`, () => seedPizzaLog(state.today, hour));
  const [vals, setVals] = useState<Record<string, string>>({});
  const c = { today: state.today, hour, openHour: PIZZA_SHOP.openHour, closeHour: PIZZA_SHOP.closeHour };
  return (
    <Card title="Health and safety checks" note="Long Beach Health Department enforces the California Retail Food Code. Rules here follow the state code; confirm local details with your inspector.">
      <ul className="divide-y divide-slate-100">
        {PIZZA_CHECKS.map((r) => {
          const s = checkStatus(r, log, c);
          const v = vals[r.id] ?? '';
          const tone = s.state === 'ok' ? 'green' : s.state === 'due' ? 'amber' : 'red';
          return (
            <li key={r.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={tone}>{s.state === 'ok' ? 'Done' : s.state === 'due' ? 'Due' : s.state === 'late' ? 'Late' : 'Failed'}</Pill>
                <span className="flex-1 font-semibold">{r.title}</span>
                {r.reading && <input value={v} onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })} placeholder={rangeLabel(r)} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" inputMode="decimal" />}
                <button
                  disabled={!!r.reading && v === ''}
                  onClick={() => { const value = r.reading ? Number(v) : undefined; setLog((l) => [...l, { reqId: r.id, at: localIso(new Date()), by: 'Jess P.', value, ok: value === undefined || readingOk(r, value) }]); setVals({ ...vals, [r.id]: '' }); }}
                  className={btn.green}
                >
                  Log it
                </button>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{r.rule} <span className="text-slate-400">({r.source.label})</span></p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

function seedPizzaLog(today: string, hour: number): LogEntry[] {
  const out: LogEntry[] = [];
  for (const r of PIZZA_CHECKS) {
    if (r.everyDays > 1) { out.push({ reqId: r.id, at: `${addDays(today, -120)}T09:00:00`, by: 'Jess P.', ok: true }); continue; }
    const per = r.perDay ?? 1;
    const span = (PIZZA_SHOP.closeHour - PIZZA_SHOP.openHour) / per;
    // The first check of the day is done; later ones are left for the visitor.
    if (hour >= PIZZA_SHOP.openHour && r.id !== 'cooling') out.push({ reqId: r.id, at: `${today}T${String(PIZZA_SHOP.openHour).padStart(2, '0')}:20:00`, by: 'Luis R.', value: r.reading ? (r.reading.max ? 37 : r.reading.min === 135 ? 148 : 200) : undefined, ok: true });
    void span;
  }
  return out;
}

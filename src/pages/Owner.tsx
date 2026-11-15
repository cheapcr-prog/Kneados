import { CloudRain, Gift, MessageSquareText, Sun } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ItemArt } from '../components/ItemArt';
import { MENU, MENU_BY_ID, SCHEDULE, SHOP, STAFF, STAFF_BY_ID, shiftHours } from '../data/shop';
import { useDemo, type Demo } from '../data/store';
import { DOW_NAMES, DOW_SHORT, dowOf, holidayFor, longDate, shortDate, timeLabel } from '../lib/dates';
import { explainForecast } from '../lib/forecast';
import { formatPhone, money, moneyShort } from '../lib/money';
import { PUNCHES_PER_REWARD } from '../lib/rewards';
import { isTipEligible, splitTipPool } from '../lib/tips';

const TABS = ['Today', 'Bake plan', 'Staff & tips', 'Rewards', 'Reports'] as const;
type Tab = (typeof TABS)[number];

const TEAL = '#0d9488';
const SLATE = '#cbd5e1';

export function Owner() {
  const demo = useDemo();
  const [tab, setTab] = useState<Tab>('Today');
  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{SHOP.name} · {longDate(demo.state.today)}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Owner dashboard</h1>
          <div className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`shrink-0 border-b-2 px-3 pb-2.5 text-sm font-semibold ${tab === t ? 'border-glaze-600 text-glaze-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'Today' && <Today demo={demo} />}
        {tab === 'Bake plan' && <BakePlan demo={demo} />}
        {tab === 'Staff & tips' && <StaffTips demo={demo} />}
        {tab === 'Rewards' && <Rewards demo={demo} />}
        {tab === 'Reports' && <Reports demo={demo} />}
      </div>
    </div>
  );
}

function Card({ title, children, note, className = '' }: { title?: string; children: ReactNode; note?: string; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
      {title && <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>}
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className={title ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="tabular mt-1 font-display text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function typicalFor(demo: Demo, dow: number) {
  const same = demo.history.filter((h) => h.dow === dow && !h.holiday).slice(-8);
  const n = Math.max(1, same.length);
  return { revenue: same.reduce((a, h) => a + h.revenue, 0) / n, orders: same.reduce((a, h) => a + h.orders, 0) / n };
}

function Today({ demo }: { demo: Demo }) {
  const { todayOrders, state } = demo;
  const sales = todayOrders.reduce((a, o) => a + o.subtotal, 0);
  const tips = todayOrders.reduce((a, o) => a + o.tip, 0);
  const online = todayOrders.filter((o) => o.source === 'online');
  const dow = dowOf(state.today);
  const typical = typicalFor(demo, dow);
  const byHour = useMemo(() => {
    const rows = Array.from({ length: SHOP.closeHour - SHOP.openHour }, (_, i) => ({ hour: SHOP.openHour + i, sales: 0 }));
    for (const o of todayOrders) {
      const h = new Date(o.pickupAt ?? o.createdAt).getHours();
      const row = rows.find((r) => r.hour === h);
      if (row) row.sales += o.subtotal / 100;
    }
    return rows.map((r) => ({ ...r, label: `${((r.hour + 11) % 12) + 1}${r.hour < 12 ? 'a' : 'p'}` }));
  }, [todayOrders]);
  const top = Object.entries(demo.soldToday).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const peak = byHour.reduce((a, r) => (r.sales > a.sales ? r : a), byHour[0]);
  const low = MENU.filter((m) => m.baked).map((m) => ({ m, rack: (state.bake[m.id]?.made ?? 0) - (demo.soldToday[m.id] ?? 0) })).filter((x) => x.rack <= 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales so far" value={money(sales)} sub={`A typical ${DOW_NAMES[dow]} ends near ${moneyShort(typical.revenue)}`} />
        <Stat label="Orders" value={String(todayOrders.length)} sub={`Average ticket ${money(todayOrders.length ? sales / todayOrders.length : 0)}`} />
        <Stat label="Online orders" value={String(online.length)} sub={`${online.filter((o) => o.status !== 'done').length} waiting for pickup`} />
        <Stat label="Tip pool" value={state.tippingEnabled ? money(tips) : 'Off'} sub={state.tippingEnabled ? 'Split by hours at close' : 'Tipping is turned off'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sales by hour" note="Dollars rung up each hour today" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byHour} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(0)}`, 'Sales']} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="sales" isAnimationActive={false} radius={[5, 5, 0, 0]}>
                  {byHour.map((r) => <Cell key={r.hour} fill={r.hour === peak.hour && r.sales > 0 ? TEAL : SLATE} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top sellers today">
          <ul className="space-y-2">
            {top.map(([id, qty]) => (
              <li key={id} className="flex items-center gap-2.5 text-sm">
                <ItemArt item={MENU_BY_ID[id]} size={26} />
                <span className="flex-1 truncate font-medium">{MENU_BY_ID[id].name}</span>
                <span className="tabular font-semibold">{qty}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="What needs you right now" note="Worked out from today's orders, bake list and time clock. Live AI chat with your shop's data comes in the next build.">
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">Busiest hour: </span>
            {peak.sales > 0 ? `${peak.label.replace('a', ' am').replace('p', ' pm')}, with $${peak.sales.toFixed(0)} in sales.` : 'No sales yet today.'}
          </li>
          <li>
            <span className="font-semibold text-slate-900">Running low: </span>
            {low.length ? low.map((x) => `${x.m.name} (${Math.max(0, x.rack)} left)`).join(', ') + '.' : 'Nothing. Every item has more than half a tray on the rack.'}
          </li>
          <li>
            <span className="font-semibold text-slate-900">Pickups waiting: </span>
            {online.filter((o) => o.status !== 'done').map((o) => `#${o.number} ${o.customerName} at ${timeLabel(o.pickupAt!)}`).join(', ') || 'None.'}
          </li>
          <li>
            <span className="font-semibold text-slate-900">On the clock: </span>
            {STAFF.filter((s) => state.clock[s.id]?.inAt).map((s) => s.name).join(', ') || 'Nobody.'}
          </li>
        </ul>
      </Card>
    </div>
  );
}

function BakePlan({ demo }: { demo: Demo }) {
  const { tomorrow, state } = demo;
  const dow = dowOf(tomorrow);
  const holiday = holidayFor(tomorrow);
  const baked = MENU.filter((m) => m.baked);
  const rows = baked.map((item) => {
    const f = demo.forecastTomorrow(item.id);
    const lastSame = [...demo.history].reverse().find((h) => h.dow === dow);
    return { item, f, usual: lastSame?.items[item.id]?.made ?? 0 };
  });
  const total = rows.reduce((a, r) => a + r.f.qty, 0);
  const usualTotal = rows.reduce((a, r) => a + r.usual, 0);
  const last30 = demo.history.slice(-30);
  const wasteUnits = last30.reduce((a, h) => a + baked.reduce((b, m) => b + (h.items[m.id]?.waste ?? 0), 0), 0);
  const wasteCents = last30.reduce((a, h) => a + baked.reduce((b, m) => b + (h.items[m.id]?.waste ?? 0) * m.price, 0), 0);
  const soldOutDays = last30.reduce((a, h) => a + baked.filter((m) => { const d = h.items[m.id]; return d && d.sold >= d.made; }).length, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label={`Make for ${longDate(tomorrow)}`} value={`${total}`} sub={`${Math.round(total / 12)} dozen across ${rows.length} items`} />
        <Stat label="Last 30 days: tossed at close" value={`${wasteUnits}`} sub={`${moneyShort(wasteCents)} at menu price, baking by gut feel`} />
        <Stat label="Last 30 days: sold out early" value={`${soldOutDays}`} sub="Times an item ran out before close" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Tomorrow's bake plan</h2>
            <p className="text-xs text-slate-500">
              Built from your last 8 {DOW_NAMES[dow]}s, pre-orders on the books{holiday ? `, and ${holiday.name}` : ''}. Last {DOW_NAMES[dow]} you made {usualTotal}.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button onClick={() => demo.setRain(false)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${!state.tomorrowRain ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Sun size={15} /> Clear</button>
            <button onClick={() => demo.setRain(true)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${state.tomorrowRain ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><CloudRain size={15} /> Rain</button>
          </div>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {rows.map(({ item, f, usual }) => {
            const diff = f.qty - usual;
            return (
              <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <ItemArt item={item} size={38} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs leading-snug text-slate-500">{explainForecast(item.name, DOW_NAMES[dow], f)}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-2xl font-bold leading-none">{f.qty}</p>
                  <p className={`tabular mt-1 text-[11px] font-semibold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-sky-600' : 'text-slate-400'}`}>
                    {diff === 0 ? 'same as last week' : `${diff > 0 ? '+' : ''}${diff} vs last week`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">In the demo you pick tomorrow's weather. A live shop gets the forecast for its address automatically.</p>
      </Card>
    </div>
  );
}

function StaffTips({ demo }: { demo: Demo }) {
  const { state } = demo;
  const dow = dowOf(state.today);
  const tips = demo.todayOrders.reduce((a, o) => a + o.tip, 0);
  const workers = STAFF.map((s) => ({ staffId: s.id, role: s.role, hours: demo.hoursToday(s.id) }));
  const shares = splitTipPool(tips, workers);
  const shareOf = (id: string) => shares.find((s) => s.staffId === id)?.cents ?? 0;
  const worked = workers.filter((w) => w.hours > 0);
  const labor = worked.reduce((a, w) => a + w.hours * STAFF_BY_ID[w.staffId].hourlyCents, 0);
  const sales = demo.todayOrders.reduce((a, o) => a + o.subtotal, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On the clock now" value={String(STAFF.filter((s) => state.clock[s.id]?.inAt).length)} sub={`${worked.length} worked today`} />
        <Stat label="Hours today" value={worked.reduce((a, w) => a + w.hours, 0).toFixed(1)} />
        <Stat label="Labor cost today" value={money(labor)} sub={sales > 0 ? `${Math.round((labor / sales) * 100)}% of sales so far` : undefined} />
        <Stat label="Tip pool today" value={state.tippingEnabled ? money(tips) : 'Off'} />
      </div>

      <Card title="Today's time clock and tip split" note="Tips are pooled for the day and split by hours worked. Owners and managers are left out of the pool, as California Labor Code 351 requires.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Name</th><th className="pb-2 font-semibold">Role</th><th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 text-right font-semibold">Hours</th><th className="pb-2 text-right font-semibold">Tip share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STAFF.map((s) => {
                const hours = demo.hoursToday(s.id);
                const on = !!state.clock[s.id]?.inAt;
                return (
                  <tr key={s.id}>
                    <td className="py-2.5 font-semibold">{s.name}</td>
                    <td className="py-2.5 capitalize text-slate-600">{s.role}</td>
                    <td className="py-2.5">
                      <button onClick={() => demo.clockToggle(s.id)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {on ? 'Clocked in' : hours > 0 ? 'Clocked out' : 'Off today'}
                      </button>
                    </td>
                    <td className="tabular py-2.5 text-right">{hours > 0 ? hours.toFixed(1) : ''}</td>
                    <td className="tabular py-2.5 text-right font-semibold">
                      {!state.tippingEnabled ? '' : !isTipEligible(s.role) ? <span className="text-xs font-normal text-slate-400">Not in pool</span> : hours > 0 ? money(shareOf(s.id)) : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="mt-3 flex items-center gap-2.5 border-t border-slate-100 pt-3 text-sm">
          <input type="checkbox" checked={state.tippingEnabled} onChange={(e) => demo.setTipping(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          <span><span className="font-semibold">Ask for tips at the register.</span> <span className="text-slate-500">Each shop decides. Turn it off and the tip screen never shows.</span></span>
        </label>
      </Card>

      <Card title="This week's schedule">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Name</th>
                {DOW_SHORT.map((d, i) => <th key={d} className={`pb-2 text-center font-semibold ${i === dow ? 'text-glaze-700' : ''}`}>{d}</th>)}
                <th className="pb-2 text-right font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STAFF.map((s) => {
                const mine = SCHEDULE.filter((x) => x.staffId === s.id);
                const weekHours = mine.reduce((a, x) => a + shiftHours(x), 0);
                return (
                  <tr key={s.id}>
                    <td className="py-2 pr-2 text-sm font-semibold">{s.name}</td>
                    {DOW_SHORT.map((_, i) => {
                      const sh = mine.find((x) => x.dow === i);
                      return (
                        <td key={i} className="px-0.5 py-1.5 text-center">
                          {sh ? <span className={`tabular inline-block rounded-md px-1.5 py-1 font-medium ${i === dow ? 'bg-glaze-100 text-glaze-700' : 'bg-slate-100 text-slate-700'}`}>{fmtShift(sh.start)}-{fmtShift(sh.end)}</span> : <span className="text-slate-300">off</span>}
                        </td>
                      );
                    })}
                    <td className={`tabular py-2 text-right text-sm font-semibold ${weekHours > 40 ? 'text-rose-600' : ''}`}>{weekHours}{weekHours > 40 ? ' OT' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function fmtShift(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hr = ((h + 11) % 12) + 1;
  return `${hr}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}

function Rewards({ demo }: { demo: Demo }) {
  const members = [...demo.state.members].sort((a, b) => b.visits - a.visits);
  const waiting = members.reduce((a, m) => a + m.rewards, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={String(members.length)} />
        <Stat label="Free donuts waiting" value={String(waiting)} />
        <Stat label="One punch from a reward" value={String(members.filter((m) => m.punches === PUNCHES_PER_REWARD - 1).length)} />
        <Stat label="Texts sent today" value={String(demo.state.texts.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Dough Rewards members" note={`One punch per visit. Visit ${PUNCHES_PER_REWARD} earns a free donut at this shop.`} className="lg:col-span-2">
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.phone} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-[150px] flex-1">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="tabular text-xs text-slate-500">{formatPhone(m.phone)} · {m.visits} visits</p>
                </div>
                <div className="flex gap-1" aria-label={`${m.punches} of ${PUNCHES_PER_REWARD} punches`}>
                  {Array.from({ length: PUNCHES_PER_REWARD }, (_, i) => (
                    <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < m.punches ? 'border-box-500 bg-box-500' : 'border-slate-200'}`} />
                  ))}
                </div>
                {m.rewards > 0 && <span className="flex items-center gap-1 rounded-full bg-box-50 px-2 py-0.5 text-xs font-semibold text-box-700"><Gift size={12} /> {m.rewards} free</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Texts sent" note="Every text comes from Dough Rewards and names the shop where the reward is good.">
          {demo.state.texts.length === 0 ? (
            <p className="text-sm text-slate-500">None yet today. Try it: on the Register, enter (562) 555-0101 (Carla, 9 punches) and ring up a sale.</p>
          ) : (
            <ul className="space-y-2">
              {demo.state.texts.map((t, i) => (
                <li key={i} className="rounded-xl bg-slate-50 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-700"><MessageSquareText size={13} /> To {formatPhone(t.to)} · {timeLabel(t.at)}</p>
                  <p className="mt-1 text-slate-600">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Demo: texts are shown here, not sent.</p>
        </Card>
      </div>
    </div>
  );
}

function Reports({ demo }: { demo: Demo }) {
  const last30 = demo.history.slice(-30);
  const prev30 = demo.history.slice(-60, -30);
  const sum = (xs: typeof last30, f: (h: (typeof last30)[number]) => number) => xs.reduce((a, h) => a + f(h), 0);
  const revenue = sum(last30, (h) => h.revenue);
  const prevRevenue = sum(prev30, (h) => h.revenue);
  const change = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const daily = last30.map((h) => ({ label: shortDate(h.date), revenue: Math.round(h.revenue / 100), weekend: h.dow === 0 || h.dow === 6 }));
  const baked = MENU.filter((m) => m.baked);
  const items = MENU.map((m) => ({
    m,
    sold: sum(last30, (h) => h.items[m.id]?.sold ?? 0),
    waste: sum(last30, (h) => h.items[m.id]?.waste ?? 0),
    made: sum(last30, (h) => h.items[m.id]?.made ?? 0),
  }));
  const best = [...items].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const wasteRows = items.filter((x) => baked.includes(x.m)).sort((a, b) => b.waste - a.waste).slice(0, 8);
  const byDow = DOW_SHORT.map((d, i) => {
    const days = last30.filter((h) => h.dow === i);
    return { label: d, revenue: Math.round(sum(days, (h) => h.revenue) / Math.max(1, days.length) / 100) };
  });
  const bestDow = byDow.reduce((a, r) => (r.revenue > a.revenue ? r : a), byDow[0]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales, last 30 days" value={moneyShort(revenue)} sub={`${change >= 0 ? 'Up' : 'Down'} ${Math.abs(change).toFixed(1)}% on the 30 days before`} />
        <Stat label="Orders" value={sum(last30, (h) => h.orders).toLocaleString()} sub={`Average ticket ${money(revenue / Math.max(1, sum(last30, (h) => h.orders)))}`} />
        <Stat label="Tips paid to crew" value={moneyShort(sum(last30, (h) => h.tips))} />
        <Stat label="Labor hours" value={sum(last30, (h) => h.laborHours).toLocaleString()} sub={`${moneyShort(revenue / Math.max(1, sum(last30, (h) => h.laborHours)))} in sales per hour`} />
      </div>
      <Card title="Daily sales" note="Last 30 days, in dollars. Weekends are darker.">
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={4} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Sales']} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="revenue" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {daily.map((d, i) => <Cell key={i} fill={d.weekend ? TEAL : '#99d5cf'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Average day by weekday" note="Dollars per day, last 30 days">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDow} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Average sales']} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="revenue" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                  {byDow.map((r) => <Cell key={r.label} fill={r.label === bestDow.label ? TEAL : SLATE} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Best sellers" note="Units sold, last 30 days">
          <RankList rows={best.map((x) => ({ id: x.m.id, value: x.sold }))} color="bg-glaze-500" />
        </Card>
        <Card title="Most tossed" note="Units thrown out at close, last 30 days">
          <RankList rows={wasteRows.map((x) => ({ id: x.m.id, value: x.waste, sub: x.made ? `${Math.round((x.waste / x.made) * 100)}% of what was made` : undefined }))} color="bg-rose-400" />
        </Card>
      </div>
      <p className="text-xs text-slate-500">Every number on this page comes from generated demo data for a made-up shop. A real shop's reports fill in from its own register.</p>
    </div>
  );
}

function RankList({ rows, color }: { rows: { id: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{MENU_BY_ID[r.id].name}</span>
            <span className="tabular font-semibold">{r.value.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
          {r.sub && <p className="mt-0.5 text-[11px] text-slate-500">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

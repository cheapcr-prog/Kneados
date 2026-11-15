import { Check, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FALLBACK_NOTE, askServer, useClaudeReady } from '../../components/Ask';
import { adviceText, useBreakAdvice, useTick } from '../../components/Breaks';
import { useDeliverySettings, useGiftCards, useInvoices } from '../../components/Channels';
import { usePricing } from '../../components/Pricing';
import { useSession } from '../../components/Session';
import type { Upkeep } from '../../components/Upkeep';
import type { useWeather } from '../../components/Weather';
import { PRICE, WHOLESALE, WHOLESALE_BY_ID } from '../../data/channels';
import { useShopState } from '../../data/local';
import { MENU, MENU_BY_ID, SCHEDULE, SHOP, STAFF } from '../../data/shop';
import type { Demo } from '../../data/store';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import type { Shift } from '../../data/types';
import { SUGGESTED, answer, briefing, decide, type Answer, type Decision, type ShopFacts, type Urgency } from '../../lib/brain';
import { DELIVERY_APPS, breakEvenMarkup, deliveryCents, invoiceState } from '../../lib/channels';
import { menuCosts } from '../../lib/costing';
import { DOW_NAMES, addDays, dowOf, holidayFor, isoDate, parseDate, timeLabel } from '../../lib/dates';
import { moneyShort } from '../../lib/money';
import { itemMargins, share } from '../../lib/pnl';
import { draftPO } from '../../lib/purchasing';
import { LABOR_TARGET, dayLabor, reviewSchedule } from '../../lib/schedule';
import type { SupplyPlan } from '../../lib/supplies';
import { wasteByItem } from '../../lib/waste';
import { describeWeather } from '../../lib/weather';
import { TARGETS } from '../../data/finance';
import { hourLabel } from '../../lib/smartpricing';
import { useMenuInsights } from './Growth';
import { useLocations } from './Locations';
import { pnlFor } from './Money';
import { forecastSales } from './Schedule';
import { Card, Demo as DemoNote, Pill, btn, field } from './ui';

type Weather = ReturnType<typeof useWeather>;
interface Sources { demo: Demo; plans: SupplyPlan[]; upkeep: Upkeep; weather: Weather; alerts: number }

const isDelivery = (c?: string) => c === 'doordash' || c === 'ubereats' || c === 'grubhub';

/** Reads every part of the shop into one set of plain numbers for the decision engine. */
function useShopFacts({ demo, plans, upkeep, weather, alerts }: Sources) {
  useTick();
  const { state, history, todayOrders, tomorrow } = demo;
  const today = state.today;
  const breakAdvice = useBreakAdvice();
  const { invoices } = useInvoices();
  const [delivery, setDelivery] = useDeliverySettings();
  const gift = useGiftCards();
  const locs = useLocations(demo, alerts);
  const pricing = usePricing();
  const insights = useMenuInsights(demo);
  const [shifts] = useShopState<Shift[]>('schedule', () => SCHEDULE.map((s) => ({ ...s })));
  const cost = useMemo(() => menuCosts(MENU.map((m) => m.id), RECIPES, SUPPLIES, PURCHASED), []);
  const baked = MENU.filter((m) => m.baked);

  const month = useMemo(() => {
    const days = history.slice(-30);
    const p = pnlFor(days, cost);
    const thin = itemMargins(days, cost, PRICE).filter((m) => m.sold > 100).sort((a, b) => a.margin - b.margin)[0];
    const last28 = history.slice(-28);
    const rows = wasteByItem(last28.map((h) => Object.fromEntries(baked.map((m) => [m.id, h.items[m.id] ?? { made: 0, sold: 0, waste: 0 }]))), cost, PRICE);
    const worst = [...rows].filter((r) => r.made > 0).sort((a, b) => b.rate - a.rate)[0];
    const week = Array.from({ length: 7 }, (_, i) => addDays(addDays(today, 7 - dowOf(today)), i));
    return { p, thin, rows, worst, weekSales: week.map((d) => forecastSales(demo, d)) };
    // The history and the orders on the books are all this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, state.orders, today]);

  const dow = dowOf(today);
  const tDow = dowOf(tomorrow);
  const sameDays = history.filter((h) => h.dow === dow && !h.holiday).slice(-8);
  const lastSame = [...history].reverse().find((h) => h.dow === tDow);
  const hour = new Date().getHours();
  const tomorrowOrders = state.orders.filter((o) => o.source === 'online' && o.pickupAt && isoDate(new Date(o.pickupAt)) === tomorrow);
  const units = (os: typeof tomorrowOrders) => os.reduce((a, o) => a + o.lines.filter((l) => MENU_BY_ID[l.itemId].baked).reduce((b, l) => b + l.qty, 0), 0);
  const days = month.weekSales.map((s, d) => dayLabor(d, shifts, STAFF, s));
  const notes = reviewSchedule(days, shifts, STAFF, DOW_NAMES).filter((n) => n.tone !== 'good');
  const drafts = demo.suppliers.filter((s) => !s.autoSend && !s.pickup).flatMap((s) => {
    const po = draftPO(s, plans, today);
    return po && !state.pos.some((p) => p.id === po.id) ? [po] : [];
  });
  const dl = todayOrders.filter((o) => isDelivery(o.channel));
  const connected = DELIVERY_APPS.filter((a) => delivery.connected[a.id]);
  const overdueInv = invoices.filter((i) => invoiceState(i, today) === 'overdue');

  const facts: ShopFacts = {
    shop: SHOP.name,
    today: {
      dayName: DOW_NAMES[dow], salesCents: todayOrders.reduce((a, o) => a + o.subtotal, 0), orders: todayOrders.length,
      typicalCents: sameDays.reduce((a, h) => a + h.revenue, 0) / Math.max(1, sameDays.length), open: hour >= SHOP.openHour - 3 && hour < SHOP.closeHour - 1,
    },
    rack: baked.map((m) => {
      const sold = demo.soldToday[m.id] ?? 0;
      return { name: m.name, onRack: Math.max(0, (state.bake[m.id]?.made ?? 0) - sold), stillNeeded: Math.max(0, demo.forecastToday(m.id).qty - sold), priceCents: m.price };
    }),
    tomorrow: {
      dayName: DOW_NAMES[tDow], bakeTotal: baked.reduce((a, m) => a + demo.forecastTomorrow(m.id).qty, 0), lastWeekTotal: baked.reduce((a, m) => a + (lastSame?.items[m.id]?.made ?? 0), 0),
      rain: state.tomorrowRain, weather: weather.forecast ? describeWeather(weather.forecast) : undefined,
      preorderUnits: units(tomorrowOrders), wholesaleUnits: units(tomorrowOrders.filter((o) => o.channel === 'wholesale')), holiday: holidayFor(tomorrow)?.name,
    },
    supplies: {
      orderNow: plans.filter((p) => p.status === 'order-now').map((p) => ({ name: p.supply.name, daysLeft: p.daysLeft })),
      waiting: drafts.map((po) => ({ supplier: po.supplier, totalCents: po.totalCents, items: po.lines.length })),
      autoSent: state.pos.filter((p) => p.auto && p.status === 'sent').length,
    },
    team: {
      onClock: STAFF.filter((s) => state.clock[s.id]?.inAt).length, breaks: breakAdvice.map(adviceText), scheduleNotes: notes.map((n) => n.text),
      laborShareNextWeek: share(days.reduce((a, d) => a + d.costCents, 0), month.weekSales.reduce((a, s) => a + s, 0)), laborTargetHigh: LABOR_TARGET.high,
    },
    equipment: {
      openRepairs: upkeep.openRepairs.map((r) => ({ name: upkeep.equipment.find((e) => e.equipment.id === r.equipmentId)?.equipment.name ?? 'Equipment', problem: r.problem, booked: r.status === 'scheduled' })),
      serviceOverdue: upkeep.equipment.filter((e) => e.daysToService < 0).map((e) => e.equipment.name),
    },
    tasks: { overdue: upkeep.overdue.map((t) => t.task.name) },
    waste: {
      days: 28, costCents: month.rows.reduce((a, r) => a + r.costCents, 0), rate: share(month.rows.reduce((a, r) => a + r.wasted, 0), month.rows.reduce((a, r) => a + r.made, 0)),
      worst: month.worst && { name: MENU_BY_ID[month.worst.itemId].name, rate: month.worst.rate, costCents: month.worst.costCents, perDay: month.worst.wasted / 28 },
    },
    money: {
      days: 30, salesCents: month.p.sales, foodShare: share(month.p.foodCost, month.p.sales), laborShare: share(month.p.labor, month.p.sales), netCents: month.p.net, netShare: share(month.p.net, month.p.sales),
      foodTarget: TARGETS.food, laborTarget: TARGETS.labor,
      thinnest: month.thin && { name: MENU_BY_ID[month.thin.itemId].name, margin: month.thin.margin, priceCents: month.thin.price, sold: month.thin.sold },
    },
    wholesale: {
      accounts: WHOLESALE.length, weeklyCents: WHOLESALE.reduce((a, acct) => a + deliveryCents(acct, PRICE) * acct.days.length, 0),
      overdue: overdueInv.map((i) => ({ account: WHOLESALE_BY_ID[i.accountId].name, cents: i.totalCents, daysLate: Math.round((parseDate(today).getTime() - parseDate(i.due).getTime()) / 86_400_000) })),
      unpaidCents: invoices.filter((i) => !i.paid).reduce((a, i) => a + i.totalCents, 0),
    },
    delivery: {
      ordersToday: dl.length, grossCents: dl.reduce((a, o) => a + o.subtotal, 0), feesCents: dl.reduce((a, o) => a + (o.feeCents ?? 0), 0), markup: delivery.markup,
      breakEvenMarkup: connected.length > 0 ? breakEvenMarkup(Math.max(...connected.map((a) => a.commission))) : 0,
      // What these orders would have paid at the counter, less what the apps actually paid out.
      shortCents: dl.reduce((a, o) => a + Math.max(0, o.lines.reduce((b, l) => b + l.qty * MENU_BY_ID[l.itemId].price, 0) - (o.subtotal - (o.feeCents ?? 0))), 0),
    },
    giftCards: { outstandingCents: gift.cards.reduce((a, c) => a + c.balanceCents, 0), cards: gift.cards.filter((c) => c.balanceCents > 0).length },
    locations: {
      count: locs.locations.length, transfers: locs.open.map((t) => ({ qty: t.qty, item: MENU_BY_ID[t.itemId].name, from: locs.name(t.from), to: locs.name(t.to) })),
      transferCents: locs.open.reduce((a, t) => a + t.qty * MENU_BY_ID[t.itemId].price, 0),
    },
    pricing: {
      markdownOn: pricing.rules.markdown.on, markdownPct: pricing.rules.markdown.pct, startsAt: hourLabel(pricing.rules.markdown.fromHour),
      // Worth raising from two hours before the markdown would start until the doors close.
      closingSoon: hour >= pricing.rules.markdown.fromHour - 2 && hour < SHOP.closeHour,
      extras: pricing.markdown.lines.map((l) => ({ name: l.name, extra: l.extra, toCents: l.toCents })), recoverCents: pricing.markdown.recoverCents,
      changedNow: Object.values(pricing.live).filter((l) => l.tag).length,
    },
    menu: {
      attention: insights.rows.filter((r) => ['losing', 'drop', 'thin', 'waste'].includes(r.verdict)).map((r) => ({ id: r.itemId, name: MENU_BY_ID[r.itemId].name, verdict: r.verdict, advice: r.advice, monthlyCents: r.monthlyCents })),
    },
  };

  /** Does the thing a decision asks for, where the demo can really do it. */
  const apply = (d: Decision): void => {
    if (d.id.startsWith('po:')) {
      const po = drafts.find((p) => `po:${p.supplier}` === d.id);
      if (po) demo.savePO({ ...po, status: 'sent', auto: false, sentAt: new Date().toISOString() });
    } else if (d.id === 'repairs') {
      for (const r of upkeep.openRepairs.filter((x) => x.status === 'open')) upkeep.updateRepair(r.id, { status: 'scheduled', visit: tomorrow });
    } else if (d.id === 'transfers') {
      locs.send(locs.open.map(locs.key));
    } else if (d.id === 'markdown') {
      pricing.setRules((r) => ({ ...r, markdown: { ...r.markdown, on: true } }));
    } else if (d.id === 'markup') {
      setDelivery((s) => ({ ...s, markup: Math.ceil(facts.delivery.breakEvenMarkup * 20) / 20 }));
    }
  };
  return { facts, apply };
}

interface Logged { id: string; title: string; then: string; at: string; approved: boolean }

const URGENCY: Record<Urgency, { label: string; tone: 'red' | 'amber' | 'slate' }> = {
  now: { label: 'Right now', tone: 'red' }, today: { label: 'Today', tone: 'amber' }, week: { label: 'This week', tone: 'slate' },
};

function DecisionCard({ d, onApprove, onDismiss }: { d: Decision; onApprove: () => void; onDismiss: () => void }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={URGENCY[d.urgency].tone}>{URGENCY[d.urgency].label}</Pill>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d.area}</span>
        {d.impactCents ? <span className="tabular ml-auto text-xs font-bold text-emerald-700">Worth about {moneyShort(d.impactCents)}{d.per ? ` ${d.per}` : ''}</span> : null}
      </div>
      <p className="mt-2 font-display text-lg font-bold leading-snug tracking-tight">{d.title}</p>
      <p className="mt-1 text-sm text-slate-600">{d.why}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn.dark} onClick={onApprove}><Check size={15} /> {d.action}</button>
        <button className={btn.light} onClick={onDismiss}><X size={13} /> Not now</button>
      </div>
    </li>
  );
}

export function Assistant(props: Sources & { onOpen: (tab: 'Schedule' | 'Menu insights') => void }) {
  const { demo } = props;
  const { facts, apply } = useShopFacts(props);
  const [log, setLog] = useShopState<Logged[]>(`decisions-${demo.state.today}`, () => []);
  const [chat, setChat] = useState<{ q: string; a?: Answer; by?: 'claude' | 'rules'; note?: string }[]>([]);
  const [text, setText] = useState('');
  const claude = useClaudeReady();

  const handled = new Set(log.map((l) => l.id));
  const all = decide(facts);
  const open = all.filter((d) => !handled.has(d.id));
  const lines = briefing(facts, open);
  const settle = (d: Decision, approved: boolean) => {
    if (approved) {
      apply(d);
      if (d.id === 'schedule') props.onOpen('Schedule');
      if (d.id.startsWith('menu:')) props.onOpen('Menu insights');
    }
    setLog((l) => [{ id: d.id, title: d.title, then: d.then, at: new Date().toISOString(), approved }, ...l]);
  };
  const waiting = chat.some((m) => !m.a);
  const ask = async (raw: string) => {
    const q = raw.trim().slice(0, 400);
    if (!q || waiting) return;
    setText('');
    const rules = answer(q, facts, open);
    if (!claude) {
      setChat((c) => [...c, { q, a: rules, by: 'rules' }]);
      return;
    }
    const at = chat.length;
    const history = chat.flatMap((m) => (m.a ? [{ q: m.q, a: m.a.text }] : []));
    setChat((c) => [...c, { q }]);
    const r = await askServer(q, facts, open, history);
    const done = r.ok
      ? { q, a: { text: r.text, decisions: open.filter((d) => r.decisionIds.includes(d.id)) }, by: 'claude' as const }
      : { q, a: rules, by: 'rules' as const, note: FALLBACK_NOTE[r.why] };
    setChat((c) => c.map((m, i) => (i === at ? done : m)));
  };
  const hour = new Date().getHours();
  const { staff } = useSession();
  const who = staff && (staff.role === 'owner' || staff.role === 'manager') ? staff.name.split(' ')[0] : 'Rosa';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-ink-900 p-5 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-300"><Sparkles size={13} /> KneadOS briefing</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {who}. {open.length === 0 ? 'Nothing needs you right now.' : `${open.length} thing${open.length === 1 ? '' : 's'} for you to decide.`}</h2>
        <div className="mt-1.5 max-w-3xl space-y-1 text-sm text-slate-200">{lines.map((l) => <p key={l}>{l}</p>)}</div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <ul className="space-y-3">
            {open.map((d) => <DecisionCard key={d.id} d={d} onApprove={() => settle(d, true)} onDismiss={() => settle(d, false)} />)}
          </ul>
          {log.length > 0 && (
            <Card title="Decided today">
              <ul className="divide-y divide-slate-100">
                {log.map((l) => (
                  <li key={l.id + l.at} className="py-2 text-sm">
                    <p className="flex flex-wrap items-center gap-2"><Pill tone={l.approved ? 'green' : 'slate'}>{l.approved ? 'Approved' : 'Skipped'}</Pill><span className="font-medium">{l.title}</span><span className="text-xs text-slate-400">{timeLabel(l.at)}</span></p>
                    {l.approved && <p className="mt-0.5 text-xs text-slate-500">{l.then}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title="Ask KneadOS" note={claude ? "Ask about anything in the shop. Claude answers from today's numbers." : "Ask about anything in the shop. Answers come from today's numbers."} className="self-start">
          <div className="space-y-3">
            {chat.length === 0 && <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><MessageCircle size={16} className="mt-0.5 shrink-0 text-glaze-600" /> Try one of these, or type your own question.</p>}
            {chat.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink-900 px-3 py-2 text-sm text-white">{m.q}</p>
                {!m.a ? <p className="w-fit animate-pulse rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-500" role="status">Reading the shop's numbers...</p> : (
                <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-800">
                  <p className="whitespace-pre-line">{m.a.text}</p>
                  {claude && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">{m.by === 'claude' ? <><Sparkles size={11} className="text-glaze-600" /> Answered by Claude</> : m.note || 'Answered by the built-in rules'}</p>}
                  {m.a.decisions.filter((d) => !handled.has(d.id)).map((d) => (
                    <button key={d.id} onClick={() => settle(d, true)} className="mt-2 flex w-full items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-left text-xs font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-glaze-50">
                      <Check size={13} className="shrink-0 text-emerald-600" /> {d.action}: {d.title}
                    </button>
                  ))}
                </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">{s}</button>)}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
              <input className={field} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="Ask about sales, staff, supplies, money..." aria-label="Ask KneadOS a question" />
              <button className={btn.dark} aria-label="Ask" disabled={waiting}><Send size={15} /></button>
            </form>
          </div>
        </Card>
      </div>
      <DemoNote>Demo: every figure in the briefing and the decisions is worked out from the shop's own data by KneadOS, and what to raise is rule-based. {claude ? "In the chat, Claude reads those same figures and answers in its own words. It is told to use only those figures, but check anything important before you act on it. Questions and the shop's figures are sent to Anthropic to be answered." : 'The chat answers from built-in rules.'} Approving sends purchase orders, books repairs, moves trays, turns on the markdown and changes app prices inside the demo. The other approvals are recorded here, and nothing is emailed or texted.</DemoNote>
    </div>
  );
}

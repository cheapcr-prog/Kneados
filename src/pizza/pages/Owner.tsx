import { BarChart3, Bike, Mail, Megaphone, Check, ChefHat, ClipboardCheck, Gift, LayoutDashboard, MessageCircle, Package, Pizza, Send, Sparkles, Trophy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { FALLBACK_NOTE, useClaudeReady, type AskFailure } from '../../components/Ask';
import { useTick } from '../../components/Breaks';
import { Brain, Pill } from '../../pages/owner/ui';
import { moneyShort } from '../../lib/money';
import { forecastUrl, isRainy, parseForecast, describeWeather, type DayWeather } from '../../lib/weather';
import { useShopState } from '../../data/local';
import { PIZZA_SHOP } from '../data';
import { PIZZA_SUGGESTED, briefingLines, ruleAnswer, sortDecisions, usePizzaBrain, type PizzaBrain, type PizzaDecision } from '../brain';
import { usePizza } from '../store';
import { MarketingPage } from './Marketing';
import { ResultsPage } from './MarketingResults';
import { mailCode } from '../mail';
import { TEXT_CENTS } from '../marketing';
import { addDays } from '../../lib/dates';
import { DeliveryPage, DoughPage, GameDayPage, HealthPage, MenuPage, MoneyPage, PeoplePage, StockPage, TeamPage } from './OwnerPages';

const NAV = [
  { to: '', label: 'Briefing', icon: LayoutDashboard },
  { to: 'dough', label: 'Dough & forecast', icon: ChefHat },
  { to: 'stock', label: 'Stock & orders', icon: Package },
  { to: 'delivery', label: 'Delivery', icon: Bike },
  { to: 'gameday', label: 'Game day & catering', icon: Trophy },
  { to: 'menu', label: 'Menu & prices', icon: Pizza },
  { to: 'money', label: 'Money', icon: BarChart3 },
  { to: 'team', label: 'Team & tips', icon: Users },
  { to: 'customers', label: 'Rewards & texts', icon: Gift },
  { to: 'results', label: 'Marketing results', icon: Megaphone },
  { to: 'marketing', label: 'Postcards', icon: Mail },
  { to: 'health', label: 'Health & safety', icon: ClipboardCheck },
];

export function PizzaOwner() {
  useTick(20_000);
  const demo = usePizza();
  const brain = usePizzaBrain(demo, Date.now());
  usePizzaWeather();
  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={`/pizza/demo/owner${to ? `/${to}` : ''}`} end className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-white'}`}>
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>
      <main className="min-w-0 space-y-4">
        <Routes>
          <Route index element={<Briefing brain={brain} />} />
          <Route path="dough" element={<DoughPage brain={brain} />} />
          <Route path="stock" element={<StockPage brain={brain} />} />
          <Route path="delivery" element={<DeliveryPage brain={brain} />} />
          <Route path="gameday" element={<GameDayPage brain={brain} />} />
          <Route path="menu" element={<MenuPage brain={brain} />} />
          <Route path="money" element={<MoneyPage brain={brain} />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="customers" element={<PeoplePage brain={brain} />} />
          <Route path="results" element={<ResultsPage brain={brain} />} />
          <Route path="marketing" element={<MarketingPage brain={brain} />} />
          <Route path="health" element={<HealthPage />} />
        </Routes>
      </main>
    </div>
  );
}

/** Pulls tomorrow's weather for the shop so the forecast and dough plan never need it typed in. */
export function usePizzaWeather() {
  const { tomorrow, setRain } = usePizza();
  const [w, setW] = useShopState<{ forecast?: DayWeather; at?: number; failed?: boolean }>('pizza-weather', () => ({}));
  const fresh = w.forecast?.date === tomorrow && w.at && Date.now() - w.at < 3 * 3600_000;
  useEffect(() => {
    if (fresh) return;
    let stop = false;
    fetch(forecastUrl(PIZZA_SHOP.lat, PIZZA_SHOP.lon, PIZZA_SHOP.timezone))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!stop) { const f = parseForecast(json, tomorrow); setW(f ? { forecast: f, at: Date.now() } : { failed: true }); } })
      .catch(() => { if (!stop) setW({ failed: true }); });
    return () => { stop = true; };
  }, [fresh, tomorrow, setW]);
  const forecast = w.forecast?.date === tomorrow ? w.forecast : undefined;
  useEffect(() => { if (forecast) setRain(isRainy(forecast)); }, [forecast, setRain]);
  return { forecast, text: forecast ? describeWeather(forecast) : w.failed ? 'Weather service unreachable; planning for a dry day' : 'Checking the weather…' };
}

function Briefing({ brain }: { brain: PizzaBrain }) {
  const demo = usePizza();
  const [done, setDone] = useShopState<string[]>(`pizza-done-${demo.state.today}`, () => []);
  const decisions = sortDecisions(brain.decisions).filter((d) => !done.includes(d.id));
  const weather = usePizzaWeather();
  const navigate = useNavigate();
  const approve = (d: PizzaDecision) => {
    if (d.kind === 'mail') { navigate('/pizza/demo/owner/marketing'); return; }
    if (d.kind === 'dispatch' && d.payload?.runIndex !== undefined) {
      const r = brain.runs[d.payload.runIndex];
      if (r) demo.dispatch(r.driverId, r.orderIds, r.minutes, r.miles);
    }
    if (d.kind === 'po' && d.payload?.supplier) {
      const po = brain.pos.find((p) => p.supplier === d.payload!.supplier);
      if (po) demo.sendPO({ supplier: po.supplier, cents: po.cents, lines: po.lines.map((l) => ({ id: l.id, name: l.name, packs: l.packs, packLabel: l.packLabel, qty: l.packs * l.packSize })) });
    }
    if (d.kind === 'campaign' && d.payload?.phones) {
      // A text blast is tracked like any campaign: each member gets their own code, and orders with it are credited here.
      const id = `text-${Date.now().toString(36)}`;
      const codes = Object.fromEntries(d.payload.phones.map((to) => [to, mailCode(`${id}:${to}`, 'TX')]));
      demo.addPromo({ id, channel: 'text', name: 'Text: we miss you, free garlic bread', startedOn: demo.state.today, endsOn: addDays(demo.state.today, 14), sent: d.payload.phones.length, spendCents: Math.round(d.payload.phones.length * TEXT_CENTS), spendNote: 'Texting fees', offerId: 'knots', codes, oneUse: true, redemptions: [] });
      demo.addTexts(d.payload.phones.map((to) => ({ to, at: new Date().toISOString(), kind: 'campaign' as const, body: `${PIZZA_SHOP.name}: We miss you! Free garlic bread with any pizza for the next two weeks. Use code ${codes[to]} online or say it on the phone. Reply STOP to opt out.` })));
    }
    if (d.kind === 'invoice' && d.payload?.invoiceId) demo.remindInvoice(d.payload.invoiceId);
    if (d.kind === 'call') {
      const id = d.id.replace('late-', '');
      const o = demo.state.orders.find((x) => x.id === id);
      if (o?.customer.phone) demo.addTexts([{ to: o.customer.phone, at: new Date().toISOString(), kind: 'campaign', body: `${PIZZA_SHOP.name}: Sorry, order #${o.number} is running a few minutes behind. We added $3 to your Dough Rewards for the wait.` }]);
    }
    setDone((x) => [...x, d.id]);
  };
  return (
    <>
      <Brain label={`Briefing · ${brain.facts.now.dayName} ${brain.facts.now.time}`} title={`Here's ${PIZZA_SHOP.name} right now`}>
        {briefingLines(brain.facts).map((l) => <p key={l}>{l}</p>)}
        <p className="text-slate-400">Tomorrow's weather: {weather.text}.</p>
      </Brain>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-display text-lg font-bold">Waiting on you <span className="text-slate-400">{decisions.length}</span></h2>
        <p className="text-xs text-slate-500">Every number comes from the shop's own orders, recipes and schedule. KneadOS suggests; nothing happens until you approve.</p>
        <div className="mt-3 space-y-2">
          {decisions.map((d) => (
            <article key={d.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={d.urgency === 'now' ? 'red' : d.urgency === 'today' ? 'amber' : 'slate'}>{d.urgency === 'now' ? 'Now' : d.urgency === 'today' ? 'Today' : 'This week'}</Pill>
                <Pill tone="blue">{d.area}</Pill>
                {d.impactCents ? <Pill tone="green">≈ {moneyShort(d.impactCents)} {d.per}</Pill> : null}
              </div>
              <h3 className="mt-1.5 font-bold">{d.title}</h3>
              <p className="text-sm text-slate-600">{d.why}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button onClick={() => approve(d)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"><Check size={14} /> {d.action}</button>
                <button onClick={() => setDone((x) => [...x, d.id])} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Not now</button>
                <span className="text-xs text-slate-500">{d.then}</span>
              </div>
            </article>
          ))}
          {!decisions.length && <p className="text-sm text-slate-500">All caught up.</p>}
        </div>
      </section>
      <AskChat brain={brain} />
    </>
  );
}

interface Msg { q: string; a: string; ids: string[]; note?: string; claude?: boolean }

function AskChat({ brain }: { brain: PizzaBrain }) {
  const ready = useClaudeReady();
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ('');
    setBusy(true);
    const fallback = () => ruleAnswer(question, brain.facts, brain.decisions);
    let msg: Msg;
    if (ready) {
      const r = await askPizza(question, brain, msgs.map((m) => ({ q: m.q, a: m.a })));
      if (r.ok) msg = { q: question, a: r.text, ids: r.decisionIds, claude: true };
      else { const f = fallback(); msg = { q: question, a: f.text, ids: f.ids, note: FALLBACK_NOTE[r.why] }; }
    } else {
      const f = fallback();
      msg = { q: question, a: f.text, ids: f.ids };
    }
    setMsgs((m) => [...m, msg]);
    setBusy(false);
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><MessageCircle size={18} /> Ask KneadOS</h2>
      <p className="text-xs text-slate-500">{ready ? 'Answered by Claude from a live snapshot of the shop: orders, oven, drivers, dough, stock, money and rewards.' : ready === false ? 'Answered from built-in rules over the same live snapshot.' : 'Connecting…'}</p>
      <div className="mt-3 space-y-3">
        {msgs.map((m, i) => (
          <div key={i}>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ink-900 px-3 py-2 text-sm text-white">{m.q}</p>
            <div className="mt-1.5 max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm">
              <p className="mb-0.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500"><Sparkles size={11} /> {m.claude ? 'Claude' : 'KneadOS rules'}</p>
              {m.a}
              {m.ids.length > 0 && <p className="mt-1 text-xs text-emerald-700">Related: {m.ids.map((id) => brain.decisions.find((d) => d.id === id)?.title).filter(Boolean).join('; ')}</p>}
              {m.note && <p className="mt-1 text-[11px] text-slate-500">{m.note}</p>}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-400">Thinking…</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PIZZA_SUGGESTED.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">{s}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mt-2 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="Ask about tonight, dough, drivers, stock, money…" className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm" />
        <button disabled={busy} className="rounded-full bg-ink-900 p-2.5 text-white disabled:opacity-40" aria-label="Ask"><Send size={16} /></button>
      </form>
    </section>
  );
}

type PizzaAnswer = { ok: true; text: string; decisionIds: string[] } | { ok: false; why: AskFailure };

/** Asks Claude through the shop's own server, with pizza instructions. */
async function askPizza(question: string, brain: PizzaBrain, history: { q: string; a: string }[]): Promise<PizzaAnswer> {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'pizza', question, facts: brain.facts, history: history.slice(-3), decisions: brain.decisions.map(({ id, area, urgency, title, why, action }) => ({ id, area, urgency, title, why, action })) }),
    });
    if (!res.headers.get('content-type')?.includes('application/json')) return { ok: false, why: 'off' };
    const data = (await res.json()) as { text?: string; decisionIds?: string[]; error?: AskFailure };
    if (data.error || typeof data.text !== 'string') return { ok: false, why: data.error ?? 'busy' };
    return { ok: true, text: data.text, decisionIds: data.decisionIds ?? [] };
  } catch {
    return { ok: false, why: 'busy' };
  }
}

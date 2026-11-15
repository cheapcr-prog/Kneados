import { CalendarCheck, Eye, HelpCircle, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { REVIEW_NOTE, runReview, useReviewStatus, type SavedReview } from '../../components/Review';
import { MENU, MENU_BY_ID } from '../../data/shop';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import { decide } from '../../lib/brain';
import { menuCosts } from '../../lib/costing';
import { DOW_NAMES } from '../../lib/dates';
import { useMenuInsights } from './Growth';
import { pnlFor } from './Money';
import { useShopFacts, type Sources } from './Assistant';
import { Brain, Card, Demo as DemoNote, Pill, btn } from './ui';

const EFFORT_TONE = { quick: 'green', 'some work': 'amber', project: 'blue' } as const;
const EFFORT_LABEL = { quick: 'Quick win', 'some work': 'Some work', project: 'Bigger project' } as const;

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

function Written({ saved }: { saved: SavedReview }) {
  const r = saved.review;
  return (
    <div className="space-y-4" data-review>
      <Brain label={`Deep review · written ${when(saved.at)}`} title={r.headline}>
        <p>{r.summary}</p>
      </Brain>
      <div className="grid gap-4 lg:grid-cols-2">
        {r.sections.map((s, i) => (
          <section key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">{i + 1}</span>
              <Pill>{s.area}</Pill>
              <Pill tone={EFFORT_TONE[s.effort]}>{EFFORT_LABEL[s.effort]}</Pill>
            </div>
            <h3 className="mt-2 font-display text-lg font-bold leading-snug tracking-tight">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{s.finding}</p>
            {s.evidence && <p className="mt-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600"><span className="font-bold text-slate-800">The numbers: </span>{s.evidence}</p>}
            <p className="mt-2 text-sm text-slate-900"><span className="font-bold">Do this: </span>{s.action}</p>
            {s.impact && <p className="mt-1 text-sm text-emerald-800"><span className="font-bold">What it is worth: </span>{s.impact}</p>}
          </section>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your first week" className="lg:col-span-2">
          <ol className="space-y-2">
            {r.firstWeek.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-800"><CalendarCheck size={16} className="mt-0.5 shrink-0 text-glaze-600" /><span><span className="font-bold">Step {i + 1}. </span>{step}</span></li>
            ))}
          </ol>
        </Card>
        <Card title="Numbers to watch">
          <ul className="space-y-2">
            {r.watch.map((w, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><Eye size={15} className="mt-0.5 shrink-0 text-slate-400" />{w}</li>)}
          </ul>
        </Card>
      </div>
      {r.notTracked.length > 0 && (
        <Card title="What KneadOS does not track yet" note="Claude said these would have sharpened the review.">
          <ul className="space-y-1.5">
            {r.notTracked.map((w, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><HelpCircle size={15} className="mt-0.5 shrink-0 text-slate-400" />{w}</li>)}
          </ul>
        </Card>
      )}
      <DemoNote>
        Written by Claude from {saved.shop}'s numbers on {when(saved.at)}. The figures under "The numbers" come from the shop's records. What a change is worth is Claude's own judgement, not a KneadOS calculation, so treat it as advice. This review cost {dollars(saved.costMicros)} in Claude usage.
      </DemoNote>
    </div>
  );
}

/** A full read of the business by Claude's most capable model, ending in a plan. Sold as an add-on because each one costs real money to write. */
export function DeepReview(props: Sources) {
  const { facts } = useShopFacts(props);
  const { rows } = useMenuInsights(props.demo);
  const history = props.demo.history;
  // The longer tables behind the snapshot, so the review can look at every item and every weekday.
  const detail = useMemo(() => {
    const cost = menuCosts(MENU.map((m) => m.id), RECIPES, SUPPLIES, PURCHASED);
    const p = pnlFor(history.slice(-30), cost);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const last8 = history.slice(-56);
    return {
      menuLast28Days: rows.map((r) => ({
        item: MENU_BY_ID[r.itemId]?.name ?? r.itemId, category: MENU_BY_ID[r.itemId]?.category, priceCents: r.price, ingredientCostCents: Math.round(r.cost), soldPerDay: r2(r.soldPerDay),
        marginAfterIngredients: r2(r.margin), unsoldShareOfMade: r2(r.wasteRate), unsoldCostPerDayCents: Math.round(r.wastePerDayCents), profitPerDayAfterKitchenTimeCents: Math.round(r.profitPerDayCents), daysSoldOut: r.soldOutDays, verdict: r.verdict,
      })),
      profitAndLossLast30Days: {
        salesCents: Math.round(p.sales), foodAndPackagingCents: Math.round(p.foodCost), ofWhichNeverSoldCents: Math.round(p.wasteCost), wagesCents: Math.round(p.wages), payrollTaxCents: Math.round(p.payrollTax),
        cardFeesCents: Math.round(p.cardFees), monthlyBills: p.overhead.map((o) => ({ name: o.name, cents: Math.round(o.cents) })), netCents: Math.round(p.net),
        note: 'Rent, bills, payroll tax and card rates are example figures in this demo.',
      },
      byWeekdayLast8Weeks: DOW_NAMES.map((name, dow) => {
        const days = last8.filter((h) => h.dow === dow);
        const n = Math.max(1, days.length);
        return { day: name, averageSalesCents: Math.round(days.reduce((a, h) => a + h.revenue, 0) / n), averageOrders: Math.round(days.reduce((a, h) => a + h.orders, 0) / n), averageLaborHours: r2(days.reduce((a, h) => a + h.laborHours, 0) / n), rainyDays: days.filter((h) => h.rain).length, days: days.length };
      }),
    };
  }, [rows, history]);
  const { status, setStatus } = useReviewStatus();
  const [running, setRunning] = useState(false);
  const [chars, setChars] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = async () => {
    setRunning(true); setChars(0); setSeconds(0); setFailed('');
    const result = await runReview(facts, decide(facts), detail, setChars);
    setRunning(false);
    if (result.ok) setStatus({ ready: true, saved: result.saved, blocked: 'recent' });
    else setFailed(REVIEW_NOTE[result.why]);
  };

  const blocked = status?.blocked;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-700"><Sparkles size={13} /> Add-on</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Deep review</h2>
            <p className="mt-1 text-sm text-slate-600">
              The daily briefing tells you what needs doing today. The deep review steps back. Claude's most capable model reads the whole shop at once, from sales and waste to labor, wholesale and delivery, and writes a plan: what matters most, what to change, and what to do first. It takes a minute or two.
            </p>
          </div>
          <button className={btn.dark} disabled={running || !status || !!blocked} onClick={start}>
            {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {status?.saved ? 'Write a new review' : 'Write a deep review'}
          </button>
        </div>
        {running && (
          <p data-review-progress className="mt-3 rounded-xl bg-glaze-50 p-3 text-sm text-glaze-900">
            {chars === 0 ? 'Claude is reading the shop and thinking it through.' : `Claude is writing the review. About ${Math.round(chars / 5.5).toLocaleString('en-US')} words so far.`} {seconds > 0 && `${seconds} seconds in.`} You can leave this screen. The review is saved when it is done.
          </p>
        )}
        {!running && failed && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{failed}</p>}
        {!running && !failed && blocked && (blocked !== 'recent' || !status?.saved) && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{REVIEW_NOTE[blocked]}</p>}
        {!running && blocked === 'recent' && status?.nextAt && <p className="mt-3 text-xs text-slate-500">The next review can be written after {when(status.nextAt)}.</p>}
      </section>
      {status?.saved && <Written saved={status.saved} />}
      <DemoNote>
        Demo: the deep review has its own monthly budget, apart from the chat's daily one, and the latest review is shared by everyone who opens this demo. On a live shop it would run on a schedule, weekly or monthly, from that shop's own records.
      </DemoNote>
    </div>
  );
}

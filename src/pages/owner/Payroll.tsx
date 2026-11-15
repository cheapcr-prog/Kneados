import { Check, Download, Link2 } from 'lucide-react';
import { SCHEDULE, STAFF, shiftHours } from '../../data/shop';
import { useShopState } from '../../data/local';
import type { Demo } from '../../data/store';
import { addDays, dowOf, shortDate } from '../../lib/dates';
import { money } from '../../lib/money';
import { PROVIDERS, monthlyCost, payLine, timesheetCsv } from '../../lib/payroll';
import { splitTipPool } from '../../lib/tips';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, download } from './ui';

/** Paid hours on a past day: the scheduled shift, less the half hour lunch on shifts over 5 hours. */
function paidShift(staffId: string, dow: number): number {
  const shift = SCHEDULE.find((s) => s.staffId === staffId && s.dow === dow);
  if (!shift) return 0;
  const h = shiftHours(shift);
  return h > 5 ? h - 0.5 : h;
}

export function Payroll({ demo }: { demo: Demo }) {
  const { today } = demo.state;
  const start = addDays(today, -dowOf(today));
  const period = { start, end: addDays(start, 6) };
  const days = Array.from({ length: dowOf(today) + 1 }, (_, i) => addDays(start, i));
  const [linked, setLinked] = useShopState<{ provider: string; sentAt?: string }>('payroll', () => ({ provider: 'square' }));
  const team = STAFF.filter((s) => s.hourlyCents > 0);

  const hours = (staffId: string, date: string) => (date === today ? demo.hoursToday(staffId) : paidShift(staffId, dowOf(date)));
  /** Each day's tip pool, split by that day's hours. */
  const tips: Record<string, number> = {};
  for (const date of days) {
    const pool = date === today ? demo.todayOrders.reduce((a, o) => a + o.tip, 0) : demo.history.find((h) => h.date === date)?.tips ?? 0;
    for (const share of splitTipPool(pool, STAFF.map((s) => ({ staffId: s.id, role: s.role, hours: hours(s.id, date) })))) {
      tips[share.staffId] = (tips[share.staffId] ?? 0) + share.cents;
    }
  }
  const rows = team.map((s) => ({
    ...payLine(s.id, days.map((d) => hours(s.id, d)), s.hourlyCents, demo.breakOf(s.id)?.premiumOwed ? 1 : 0, demo.state.tippingEnabled ? tips[s.id] ?? 0 : 0),
    name: s.name, hourlyCents: s.hourlyCents,
  }));
  const total = rows.reduce((a, r) => a + r.grossCents, 0);
  const ranked = [...PROVIDERS].sort((a, b) => monthlyCost(a, team.length) - monthlyCost(b, team.length));
  const cheapest = ranked[0];
  /** The cheapest one KneadOS can send hours to without a file. */
  const best = ranked.find((p) => p.link === 'direct') ?? cheapest;
  const chosen = PROVIDERS.find((p) => p.id === linked.provider) ?? cheapest;

  return (
    <div className="space-y-4">
      <Brain label="KneadOS built this week's timesheet" title={`${money(total)} in gross pay so far, ${shortDate(period.start)} to ${shortDate(period.end)}.`}>
        <p>
          Hours come from the time clock, with lunch off the clock. Overtime, any late-lunch premium hour and each person's tip share are already worked out,
          so payroll is one tap, not an hour with a calculator.
        </p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People on payroll" value={String(team.length)} sub="The owner is not on the clock" />
        <Stat label="Hours this week" value={rows.reduce((a, r) => a + r.regular + r.overtime + r.double, 0).toFixed(1)} />
        <Stat label="Overtime hours" value={rows.reduce((a, r) => a + r.overtime + r.double, 0).toFixed(1)} />
        <Stat label="Tips to pay out" value={money(rows.reduce((a, r) => a + r.tipsCents, 0))} />
      </div>

      <Card
        title="Timesheet for payroll"
        note="Over 8 hours in a day is overtime, as California requires. Managers are paid hourly here and are left out of tips."
        action={
          <div className="flex flex-wrap gap-2">
            <button className={btn.light} onClick={() => download(`timesheet-${period.start}.csv`, timesheetCsv(period, rows))}><Download size={14} /> Download file</button>
            <button className={btn.dark} onClick={() => setLinked({ provider: chosen.id, sentAt: new Date().toISOString() })}>
              {linked.sentAt ? <Check size={15} /> : <Link2 size={15} />} {linked.sentAt ? `Sent to ${chosen.name}` : `Send to ${chosen.name}`}
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Name</th><th className="pb-2 text-right font-semibold">Rate</th><th className="pb-2 text-right font-semibold">Regular</th>
                <th className="pb-2 text-right font-semibold">Overtime</th><th className="pb-2 text-right font-semibold">Premium</th><th className="pb-2 text-right font-semibold">Tips</th>
                <th className="pb-2 text-right font-semibold">Gross pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.staffId}>
                  <td className="py-2.5 font-semibold">{r.name}</td>
                  <td className="tabular py-2.5 text-right text-slate-600">{money(r.hourlyCents)}</td>
                  <td className="tabular py-2.5 text-right">{r.regular.toFixed(1)}</td>
                  <td className={`tabular py-2.5 text-right ${r.overtime + r.double > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{(r.overtime + r.double).toFixed(1)}</td>
                  <td className={`tabular py-2.5 text-right ${r.premium > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'}`}>{r.premium.toFixed(1)}</td>
                  <td className="tabular py-2.5 text-right">{money(r.tipsCents)}</td>
                  <td className="tabular py-2.5 text-right font-display text-base font-bold">{money(r.grossCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900"><td colSpan={6} className="py-2 font-bold">Total</td><td className="tabular py-2 text-right font-display text-lg font-bold">{money(total)}</td></tr>
            </tfoot>
          </table>
        </div>
        {linked.sentAt && <p className="mt-2 text-xs font-semibold text-emerald-700">Sent to {chosen.name}. They run the pay, file the taxes and send the pay stubs.</p>}
      </Card>

      <Card title="Payroll provider" note={`What each one costs this shop a month, with ${team.length} people on payroll. All of these file the payroll taxes for you. Pick one and KneadOS sends the timesheet there.`}>
        <ul className="divide-y divide-slate-100">
          {ranked.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <label className="flex min-w-0 flex-1 basis-64 cursor-pointer items-start gap-2.5">
                <input type="radio" name="provider" checked={chosen.id === p.id} onChange={() => setLinked({ provider: p.id })} className="mt-1 h-4 w-4 accent-teal-600" />
                <span>
                  <span className="text-sm font-semibold text-slate-900">{p.name}</span>{' '}
                  {p.id === cheapest.id && <Pill tone="green">Lowest cost</Pill>} {p.id === best.id && <Pill tone="blue">Best value</Pill>} {p.link === 'direct' ? <Pill tone="dark">Connects directly</Pill> : <Pill>By timesheet file</Pill>}
                  <span className="block text-xs text-slate-500">{p.note}</span>
                </span>
              </label>
              <p className="tabular text-right text-sm">
                <span className="font-display text-lg font-bold">{p.listPrice ? '' : 'about '}{money(monthlyCost(p, team.length))}</span><span className="text-slate-500"> a month</span>
                <span className="block text-xs text-slate-500">{money(p.baseCents)} + {money(p.perEmployeeCents)} per person</span>
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <DemoNote>
        Prices are each provider's cheapest full-service plan as listed in late October 2026, and they change, so check before signing up. ADP RUN only gives quotes, so its number is an outside estimate.
        In the demo nothing is sent. The timesheet file is real and downloads to your computer.
      </DemoNote>
    </div>
  );
}

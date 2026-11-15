import { ArrowLeftRight, RotateCcw, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShopState } from '../../data/local';
import { MENU, SCHEDULE, STAFF } from '../../data/shop';
import { forecastFor, type Demo } from '../../data/store';
import type { Shift } from '../../data/types';
import { addDays, DOW_NAMES, DOW_SHORT, dowOf, shortDate } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { LABOR_TARGET, dayLabor, paidHours, reviewSchedule, setShift, swapShifts } from '../../lib/schedule';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, field } from './ui';

function fmt(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}

/** Forecast sales for a date: the bake forecast for each item times what it sells for. */
export function forecastSales(demo: Demo, date: string): number {
  return Math.round(MENU.reduce((a, m) => {
    const qty = forecastFor(demo.history, demo.state.orders, date, m.id, false).qty;
    // The bake plan carries a small safety margin and about a third of donuts sell at the dozen price.
    const each = m.dozenPrice ? m.price * 0.67 + (m.dozenPrice / 12) * 0.33 : m.price;
    return a + qty * each * 0.93;
  }, 0));
}

export function Schedule({ demo }: { demo: Demo }) {
  const { today } = demo.state;
  // Next week, Sunday to Saturday.
  const weekStart = addDays(today, 7 - dowOf(today));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [shifts, setShifts] = useShopState<Shift[]>('schedule', () => SCHEDULE.map((s) => ({ ...s })));
  const [published, setPublished] = useShopState<string | null>('schedule-published', () => null);
  const [editing, setEditing] = useState<{ staffId: string; dow: number } | null>(null);
  const change = (next: Shift[]) => { setShifts(next); setPublished(null); };

  const sales = useMemo(() => dates.map((d) => forecastSales(demo, d)), [demo.history, demo.state.orders, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = dates.map((_, dow) => dayLabor(dow, shifts, STAFF, sales[dow]));
  const notes = reviewSchedule(days, shifts, STAFF, DOW_NAMES);
  const cost = days.reduce((a, d) => a + d.costCents, 0);
  const total = sales.reduce((a, s) => a + s, 0);
  const problems = notes.filter((n) => n.tone !== 'good');
  const current = editing ? shifts.find((s) => s.staffId === editing.staffId && s.dow === editing.dow) : undefined;

  return (
    <div className="space-y-4">
      <Brain label="KneadOS checked next week's schedule" title={problems.length === 0 ? 'Next week is covered and on budget.' : `${problems.length} thing${problems.length === 1 ? '' : 's'} to look at before you post it.`}>
        <ul className="list-disc space-y-1 pl-4">
          {notes.map((n, i) => <li key={i} className={n.tone === 'bad' ? 'font-semibold text-rose-300' : ''}>{n.text}</li>)}
        </ul>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Forecast sales, next week" value={moneyShort(total)} sub={`${shortDate(dates[0])} to ${shortDate(dates[6])}`} />
        <Stat label="Scheduled labor" value={moneyShort(cost)} sub={`${days.reduce((a, d) => a + d.hours, 0).toFixed(0)} paid hours`} />
        <Stat label="Labor as a share of sales" value={`${Math.round((cost / Math.max(1, total)) * 100)}%`} sub={`Target ${LABOR_TARGET.low * 100}% to ${LABOR_TARGET.high * 100}%`} tone={cost / Math.max(1, total) > LABOR_TARGET.high ? 'bad' : 'good'} />
        <Stat label="Status" value={published ? 'Posted' : 'Draft'} sub={published ? 'The team has it' : 'Not sent to the team yet'} />
      </div>

      <Card
        title={`Week of ${shortDate(dates[0])}`}
        note="Tap any box to change a shift, give someone the day off, or swap two people. The bottom rows compare what the schedule costs with what KneadOS expects to sell."
        action={
          <div className="flex flex-wrap gap-2">
            <button className={btn.light} onClick={() => change(SCHEDULE.map((s) => ({ ...s })))}><RotateCcw size={14} /> Copy this week</button>
            <button className={btn.dark} disabled={!!published} onClick={() => setPublished(new Date().toISOString())}><Send size={15} /> {published ? 'Posted to the team' : 'Post schedule'}</button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Name</th>
                {dates.map((d, i) => <th key={d} className="pb-2 text-center font-semibold">{DOW_SHORT[i]} <span className="font-normal normal-case text-slate-400">{shortDate(d).split(' ')[1]}</span></th>)}
                <th className="pb-2 text-right font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STAFF.map((s) => {
                const mine = shifts.filter((x) => x.staffId === s.id);
                const week = mine.reduce((a, x) => a + paidHours(x), 0);
                return (
                  <tr key={s.id}>
                    <td className="py-2 pr-2 text-sm font-semibold">{s.name}<span className="block text-[11px] font-normal capitalize text-slate-500">{s.role}</span></td>
                    {dates.map((_, dow) => {
                      const sh = mine.find((x) => x.dow === dow);
                      const on = editing?.staffId === s.id && editing.dow === dow;
                      return (
                        <td key={dow} className="px-0.5 py-1.5 text-center">
                          <button
                            onClick={() => setEditing(on ? null : { staffId: s.id, dow })}
                            aria-label={`${s.name}, ${DOW_NAMES[dow]}: ${sh ? `${fmt(sh.start)} to ${fmt(sh.end)}` : 'off'}`}
                            className={`tabular w-full rounded-md px-1 py-1.5 font-medium transition ${on ? 'bg-ink-900 text-white' : sh ? (s.role === 'baker' ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-glaze-100 text-glaze-700 hover:bg-glaze-200') : 'text-slate-300 hover:bg-slate-100'}`}
                          >
                            {sh ? `${fmt(sh.start)}-${fmt(sh.end)}` : 'off'}
                          </button>
                        </td>
                      );
                    })}
                    <td className={`tabular py-2 text-right text-sm font-semibold ${week > 40 ? 'text-rose-600' : ''}`}>{week.toFixed(1)}{week > 40 ? ' OT' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-slate-600">
              <tr className="border-t-2 border-slate-200">
                <td className="py-2 font-semibold text-slate-900">Forecast sales</td>
                {sales.map((v, i) => <td key={i} className="tabular py-2 text-center">{moneyShort(v)}</td>)}
                <td className="tabular py-2 text-right font-semibold text-slate-900">{moneyShort(total)}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold text-slate-900">Labor cost</td>
                {days.map((d) => <td key={d.dow} className="tabular py-1 text-center">{moneyShort(d.costCents)}</td>)}
                <td className="tabular py-1 text-right font-semibold text-slate-900">{moneyShort(cost)}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold text-slate-900">Labor share</td>
                {days.map((d) => (
                  <td key={d.dow} className="py-1 text-center">
                    <Pill tone={d.pct > LABOR_TARGET.high ? 'red' : d.pct < LABOR_TARGET.low ? 'amber' : 'green'}>{Math.round(d.pct * 100)}%</Pill>
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {editing && (
          <ShiftEditor
            key={`${editing.staffId}-${editing.dow}`}
            name={STAFF.find((s) => s.id === editing.staffId)!.name}
            day={DOW_NAMES[editing.dow]}
            shift={current}
            others={STAFF.filter((s) => s.id !== editing.staffId).map((s) => ({ id: s.id, name: s.name, shift: shifts.find((x) => x.staffId === s.id && x.dow === editing.dow) }))}
            onSave={(times) => { change(setShift(shifts, editing.staffId, editing.dow, times)); setEditing(null); }}
            onSwap={(other) => { change(swapShifts(shifts, editing.dow, editing.staffId, other)); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        )}
        {published && <p className="mt-3 text-xs font-semibold text-emerald-700">Posted. Everyone on the team got a text with their shifts for the week.</p>}
      </Card>

      <DemoNote>
        Forecast sales use the same math as the bake plan, so a rainy day or a holiday changes the staffing advice too. The labor target of {LABOR_TARGET.low * 100}% to {LABOR_TARGET.high * 100}% is this demo shop's setting, and each shop sets its own. The advice is rule-based. In the demo nothing is texted to staff. Labor cost here is {money(cost)} for the week.
      </DemoNote>
    </div>
  );
}

function ShiftEditor({ name, day, shift, others, onSave, onSwap, onClose }: {
  name: string; day: string; shift?: Shift; others: { id: string; name: string; shift?: Shift }[];
  onSave: (times: { start: string; end: string } | null) => void; onSwap: (other: string) => void; onClose: () => void;
}) {
  const [start, setStart] = useState(shift?.start ?? '05:00');
  const [end, setEnd] = useState(shift?.end ?? '13:00');
  const [other, setOther] = useState(others[0]?.id ?? '');
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">{name}, {day}</p>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-slate-500 hover:bg-slate-200"><X size={16} /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} mt-0.5 block w-32`} /></label>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} mt-0.5 block w-32`} /></label>
        <button className={btn.dark} disabled={!(start < end)} onClick={() => onSave({ start, end })}>{shift ? 'Save shift' : 'Add shift'}</button>
        {shift && <button className={btn.light} onClick={() => onSave(null)}>Give the day off</button>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Swap with
          <select value={other} onChange={(e) => setOther(e.target.value)} className={`${field} mt-0.5 block w-56`}>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.shift ? `${fmt(o.shift.start)}-${fmt(o.shift.end)}` : 'off'})</option>)}
          </select>
        </label>
        <button className={btn.light} disabled={!shift && !others.find((o) => o.id === other)?.shift} onClick={() => onSwap(other)}><ArrowLeftRight size={14} /> Swap shifts</button>
      </div>
    </div>
  );
}

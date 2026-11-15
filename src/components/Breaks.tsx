import { Coffee, Sparkles, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STAFF, STAFF_BY_ID } from '../data/shop';
import { useDemo, type Demo } from '../data/store';
import type { StaffMember } from '../data/types';
import { MEAL_MINUTES, REST_MINUTES, adviseBreaks, type BreakAdvice, type BreakStatus } from '../lib/breaks';
import { timeLabel } from '../lib/dates';

/** Re-renders on a timer so break countdowns and deadlines stay current. */
export function useTick(ms = 20_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Counter staff cover for each other, and so do bakers. The owner is not on the break clock. */
const groupOf = (s: StaffMember) => (s.role === 'baker' ? 'kitchen' : 'counter');
export const tracksBreaks = (s: StaffMember) => s.role !== 'owner';

export function isOnBreak(demo: Demo, staffId: string): boolean {
  return demo.breakOf(staffId)?.state === 'on-break';
}

export function useBreakAdvice(): BreakAdvice[] {
  const demo = useDemo();
  const people = STAFF.filter(tracksBreaks).flatMap((s) => {
    const status = demo.breakOf(s.id);
    return status ? [{ staffId: s.id, group: groupOf(s), status }] : [];
  });
  return adviseBreaks(people);
}

const kindName = (kind: 'rest' | 'meal') => (kind === 'meal' ? 'lunch' : 'a 10 minute break');

export function adviceText(a: BreakAdvice): string {
  const name = STAFF_BY_ID[a.staffId].name;
  const cover = a.covered ? '' : ' Nobody else is on that station, so somebody needs to cover.';
  if (a.urgent) return `${name} is past the 5 hour mark with no lunch. Send them now.${cover}`;
  return `Send ${name} on ${kindName(a.kind)} now.${cover}`;
}

/** A short line on where somebody stands: what they have taken and what is due. */
export function breakSummary(s: BreakStatus): { text: string; tone: 'ok' | 'warn' | 'late' | 'away' } {
  if (s.state === 'on-break') return { text: `On ${s.current!.kind === 'meal' ? 'lunch' : 'break'} until ${timeLabel(s.backAt!)}`, tone: 'away' };
  if (s.state === 'meal-late') return { text: `Lunch is late. It was due by ${timeLabel(s.mealDueBy!)}`, tone: 'late' };
  if (s.state === 'meal-due') return { text: `Lunch due by ${timeLabel(s.mealDueBy!)}`, tone: 'warn' };
  if (s.state === 'rest-due') return { text: '10 minute break is due', tone: 'warn' };
  const parts = [];
  if (s.restsOwed > 0) parts.push(`Breaks ${Math.min(s.restsTaken, s.restsOwed)} of ${s.restsOwed}`);
  if (s.mealsOwed > 0) parts.push(s.mealsTaken >= s.mealsOwed ? 'lunch taken' : `lunch by ${timeLabel(s.mealDueBy!)}`);
  return { text: parts.join(', ') || 'No break owed on this shift', tone: 'ok' };
}

export const TONE: Record<'ok' | 'warn' | 'late' | 'away', string> = {
  ok: 'text-slate-500',
  warn: 'font-semibold text-amber-700',
  late: 'font-semibold text-rose-700',
  away: 'font-semibold text-sky-700',
};

/** The owner's view: who KneadOS would send on break next. */
export function BreakPlanCard() {
  useTick();
  const demo = useDemo();
  const advice = useBreakAdvice();
  const away = STAFF.filter((s) => isOnBreak(demo, s.id));
  return (
    <div className="rounded-2xl bg-ink-900 p-4 text-white">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-300"><Sparkles size={13} /> KneadOS is running the breaks</p>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-100">
        {away.map((s) => <li key={s.id}>{s.name}: {breakSummary(demo.breakOf(s.id)!).text.replace(/^On/, 'on')}. Their pickup orders moved to whoever is on the floor.</li>)}
        {advice.map((a) => <li key={a.staffId} className={a.urgent ? 'font-semibold text-rose-300' : ''}>{adviceText(a)}</li>)}
        {away.length === 0 && advice.length === 0 && <li>Nobody is due for a break right now.</li>}
      </ul>
      <p className="mt-2 text-xs text-slate-400">One person per station goes at a time, so the counter and the kitchen stay covered. Lunch is the first to be sent, before the 5 hour mark.</p>
    </div>
  );
}

/** The register button: start a rest break or lunch. Amber when one is due. */
export function BreakButton({ staffId }: { staffId: string }) {
  useTick();
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  const status = demo.breakOf(staffId);
  if (!status || !tracksBreaks(STAFF_BY_ID[staffId])) return null;
  const summary = breakSummary(status);
  const due = status.next !== undefined;
  const start = (kind: 'rest' | 'meal') => { demo.startBreak(staffId, kind); setOpen(false); };
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${status.state === 'meal-late' ? 'bg-rose-100 text-rose-800' : due ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
      >
        <Coffee size={14} /> {status.state === 'meal-late' ? 'Lunch late' : status.next === 'meal' ? 'Lunch due' : status.next === 'rest' ? 'Break due' : 'Break'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className={`text-xs ${TONE[summary.tone]}`}>{summary.text}</p>
          <button onClick={() => start('rest')} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-200">
            <Coffee size={16} /> Start {REST_MINUTES} minute break <span className="ml-auto text-[11px] font-normal text-slate-500">paid</span>
          </button>
          <button onClick={() => start('meal')} className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-200">
            <Utensils size={16} /> Start {MEAL_MINUTES} minute lunch <span className="ml-auto text-[11px] font-normal text-slate-500">unpaid</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Covers the register while its user is on break, so nobody works through an unpaid lunch. */
export function BreakScreen({ staff }: { staff: StaffMember }) {
  useTick(5_000);
  const demo = useDemo();
  const status = demo.breakOf(staff.id);
  if (status?.state !== 'on-break' || !status.current) return null;
  const meal = status.current.kind === 'meal';
  const left = Math.ceil((new Date(status.backAt!).getTime() - Date.now()) / 60_000);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-900/95 p-6 text-center text-white">
      <div className="max-w-sm">
        {meal ? <Utensils size={40} className="mx-auto text-glaze-300" /> : <Coffee size={40} className="mx-auto text-glaze-300" />}
        <h2 className="mt-3 font-display text-3xl font-bold">{staff.name} is on {meal ? 'lunch' : 'break'}</h2>
        <p className="mt-2 text-slate-300">
          {left > 0 ? `Back at ${timeLabel(status.backAt!)}, ${left} minute${left === 1 ? '' : 's'} left.` : `The ${meal ? MEAL_MINUTES : REST_MINUTES} minutes are up.`}
          {meal ? ' Lunch is off the clock, so no register work until it ends.' : ' This break is paid.'}
        </p>
        {meal && left > 0 && <p className="mt-2 text-xs text-amber-300">Ending now makes this lunch shorter than {MEAL_MINUTES} minutes, which does not count as a full meal break.</p>}
        <button onClick={() => demo.endBreak(staff.id)} className="mt-5 rounded-full bg-glaze-400 px-6 py-3 text-sm font-bold text-ink-900 hover:bg-glaze-300">
          I'm back, end {meal ? 'lunch' : 'break'}
        </button>
      </div>
    </div>
  );
}

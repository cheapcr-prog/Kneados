import { AlertTriangle, Check, Wrench } from 'lucide-react';
import { useState } from 'react';
import { HealthChecksPanel } from './Health';
import { useShopState } from '../data/local';
import { STAFF, STAFF_BY_ID } from '../data/shop';
import { useDemo } from '../data/store';
import { TASKS, seedEquipment, seedRepairs, seedTasksDone } from '../data/upkeep';
import { shortDate } from '../lib/dates';
import { assignTasks, equipmentStatus, taskStatus, type Repair, type TaskDone, type TaskStatus } from '../lib/upkeep';

const groupOf = (role: string) => (role === 'baker' ? 'kitchen' : 'counter') as 'kitchen' | 'counter';

/** Shop tasks, equipment and repairs, shared by the register and the owner screens. */
export function useUpkeep() {
  const demo = useDemo();
  const { today } = demo.state;
  const [done, setDone] = useShopState<Record<string, TaskDone>>(`tasks-${today}`, () => seedTasksDone(today, new Date().getHours()));
  const [repairs, setRepairs] = useShopState<Repair[]>(`repairs-${today}`, () => seedRepairs(today));
  const [serviced, setServiced] = useShopState<Record<string, string>>(`serviced-${today}`, () => ({}));

  const statuses = TASKS.map((t) => taskStatus(t, done[t.id], today));
  // People on a break get no tasks until they are back. The owner is left out.
  const onFloor = STAFF.filter((s) => s.role !== 'owner' && demo.state.clock[s.id]?.inAt && demo.breakOf(s.id)?.state !== 'on-break');
  const assigned = assignTasks(statuses, onFloor.map((s) => ({ id: s.id, group: groupOf(s.role) })));
  const equipment = seedEquipment(today).map((e) => equipmentStatus({ ...e, lastService: serviced[e.id] ?? e.lastService }, repairs, today));

  return {
    today, statuses, assigned, equipment, repairs,
    overdue: statuses.filter((s) => s.state === 'overdue'),
    openRepairs: repairs.filter((r) => r.status !== 'fixed'),
    check: (taskId: string, by: string) => setDone((d) => ({ ...d, [taskId]: { date: today, by } })),
    uncheck: (taskId: string) => setDone((d) => { const next = { ...d }; delete next[taskId]; return next; }),
    report: (equipmentId: string, problem: string, by: string) =>
      setRepairs((r) => [{ id: `r-${Date.now()}`, equipmentId, problem, reportedBy: by, reportedAt: new Date().toISOString(), status: 'open' }, ...r]),
    updateRepair: (id: string, patch: Partial<Repair>) => setRepairs((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    markServiced: (equipmentId: string) => setServiced((s) => ({ ...s, [equipmentId]: today })),
  };
}

export type Upkeep = ReturnType<typeof useUpkeep>;

const STATE = {
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
  due: { label: 'Due today', cls: 'bg-amber-100 text-amber-800' },
  overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-800' },
  upcoming: { label: 'Not due', cls: 'bg-slate-100 text-slate-600' },
};

export function TaskRow({ s, up, me, showWho = true }: { s: TaskStatus; up: Upkeep; me?: string; showWho?: boolean }) {
  const who = up.assigned[s.task.id];
  const doneToday = s.state === 'done';
  const open = s.state === 'due' || s.state === 'overdue';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        onClick={() => (doneToday ? up.uncheck(s.task.id) : up.check(s.task.id, me ?? who ?? 'rosa'))}
        disabled={s.state === 'upcoming'}
        aria-label={`${doneToday ? 'Undo' : 'Check off'} ${s.task.name}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${doneToday ? 'border-emerald-600 bg-emerald-600 text-white' : s.state === 'upcoming' ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white hover:border-ink-900'}`}
      >
        {doneToday && <Check size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${doneToday ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{s.task.name}</p>
        <p className="text-xs text-slate-500">
          {s.task.everyDays === 1 ? 'Every day' : `Every ${s.task.everyDays} days`} · about {s.task.minutes} min
          {doneToday && s.last && ` · done by ${STAFF_BY_ID[s.last.by]?.name ?? s.last.by}`}
          {s.state === 'overdue' && ` · ${s.daysLate} day${s.daysLate === 1 ? '' : 's'} late, last done ${shortDate(s.last!.date)}`}
          {s.state === 'upcoming' && ` · next due ${shortDate(s.due)}`}
          {open && showWho && (who ? ` · ${who === me ? 'yours' : STAFF_BY_ID[who].name}` : ` · nobody from the ${s.task.group} is on the floor`)}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
    </li>
  );
}

/** A short form to report broken equipment. Used at the register and by the owner. */
export function ReportProblem({ up, by, onDone }: { up: Upkeep; by: string; onDone?: () => void }) {
  const [equipmentId, setEquipmentId] = useState(up.equipment[0].equipment.id);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  const input = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-glaze-500 focus:outline-none';
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => { e.preventDefault(); if (!problem.trim()) return; up.report(equipmentId, problem.trim(), by); setProblem(''); setSent(true); onDone?.(); }}
    >
      <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={input} aria-label="Which equipment">
        {up.equipment.map((x) => <option key={x.equipment.id} value={x.equipment.id}>{x.equipment.name}</option>)}
      </select>
      <textarea value={problem} onChange={(e) => { setProblem(e.target.value); setSent(false); }} rows={2} placeholder="What is wrong with it?" className={input} />
      <button type="submit" disabled={!problem.trim()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        <Wrench size={15} /> Report it
      </button>
      {sent && <p className="text-xs font-semibold text-emerald-700">Reported. The owner sees it on the Equipment screen right away.</p>}
    </form>
  );
}

/** The register's slide-over: this person's tasks first, then everyone else's, and a way to report broken equipment. */
export function ShopTasksPanel({ me }: { me: string }) {
  const up = useUpkeep();
  const open = up.statuses.filter((s) => s.state === 'due' || s.state === 'overdue');
  const mine = open.filter((s) => up.assigned[s.task.id] === me);
  const others = open.filter((s) => up.assigned[s.task.id] !== me);
  const done = up.statuses.filter((s) => s.state === 'done');
  return (
    <div className="space-y-4">
      {up.overdue.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {up.overdue.length} task{up.overdue.length === 1 ? ' is' : 's are'} overdue. Those were handed out first.</p>
      )}
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Yours today ({mine.length})</h3>
        {mine.length === 0 ? <p className="py-2 text-sm text-slate-500">Nothing on your list right now.</p> : <ul className="divide-y divide-slate-100">{mine.map((s) => <TaskRow key={s.task.id} s={s} up={up} me={me} showWho={false} />)}</ul>}
      </section>
      {others.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">The rest of the shop ({others.length})</h3>
          <ul className="divide-y divide-slate-100">{others.map((s) => <TaskRow key={s.task.id} s={s} up={up} me={me} />)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Done today ({done.length})</h3>
          <ul className="divide-y divide-slate-100">{done.map((s) => <TaskRow key={s.task.id} s={s} up={up} me={me} />)}</ul>
        </section>
      )}
      <HealthChecksPanel me={me} />
      <section className="rounded-2xl border border-slate-200 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900"><Wrench size={15} /> Something broken?</h3>
        <ReportProblem up={up} by={me} />
      </section>
    </div>
  );
}

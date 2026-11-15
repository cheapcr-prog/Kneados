import { AlertTriangle, Check, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { PACKS, PACK_BY_ID, seedHires, seedLog, seedPapers } from '../data/compliance';
import { useShopState } from '../data/local';
import { SHOP, STAFF_BY_ID } from '../data/shop';
import { useDemo } from '../data/store';
import { cardStatuses, checkStatus, paperStatuses, plusDays, rangeLabel, readingOk, readiness, type CheckStatus, type LogEntry, type Paper, type Requirement, type StaffHire } from '../lib/compliance';
import { useTick } from './Breaks';

interface Saved {
  packId: string;
  log: LogEntry[];
  papers: Paper[];
  hires: StaffHire[];
  /** Checks the owner switched off because the shop does not have that equipment. */
  off: string[];
  /** Checks the owner added. */
  custom: Requirement[];
  /** The owner's own interval for a check, in days. */
  every: Record<string, number>;
}

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

/** Health and safety checks, papers and the readiness score, shared by the register, the kitchen and the owner screens. */
export function useHealth() {
  useTick(60_000);
  const demo = useDemo();
  const { today } = demo.state;
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const [saved, setSaved] = useShopState<Saved>(`health-${today}`, () => {
    const pack = PACKS[0];
    return { packId: pack.id, log: seedLog(today, hour, pack.requirements, SHOP.openHour, SHOP.closeHour), papers: seedPapers(today), hires: seedHires(today), off: [], custom: [], every: {} };
  });
  const pack = PACK_BY_ID[saved.packId] ?? PACKS[0];
  const all = [...pack.requirements, ...saved.custom].map((r) => (saved.every[r.id] ? { ...r, everyDays: saved.every[r.id] } : r));
  const reqs = all.filter((r) => !saved.off.includes(r.id));
  const clock = { today, hour, openHour: SHOP.openHour, closeHour: SHOP.closeHour };
  const checks = reqs.map((r) => checkStatus(r, saved.log, clock));
  const papers = [...paperStatuses(pack, saved.papers, today), ...cardStatuses(saved.hires, saved.papers, pack, today)];
  const ready = readiness(checks, papers);

  return {
    today, pack, packs: PACKS, all, reqs, off: saved.off, custom: saved.custom, checks, papers, hires: saved.hires, log: saved.log, ready,
    /** Checks that need someone now: failed, behind or due. */
    open: checks.filter((c) => c.state !== 'ok'),
    record: (reqId: string, by: string, value?: number, fix?: string) => {
      const req = reqs.find((r) => r.id === reqId);
      if (!req) return;
      const ok = value === undefined ? !fix : readingOk(req, value);
      setSaved((s) => ({ ...s, log: [...s.log, { reqId, at: localIso(new Date()), by, value, ok, fix: fix || undefined }] }));
    },
    /** Marks a paper renewed for its full term from today, or as on file. */
    renew: (id: string) => setSaved((s) => {
      const years = id.startsWith('card:') ? pack.foodHandler.validYears : pack.papers.find((p) => p.id === id)?.validYears;
      const next: Paper = years ? { id, expires: plusDays(today, Math.round(years * 365)) } : { id, onFile: true };
      return { ...s, papers: [...s.papers.filter((p) => p.id !== id), next] };
    }),
    setPack: (packId: string) => setSaved((s) => ({ ...s, packId })),
    toggle: (reqId: string) => setSaved((s) => ({ ...s, off: s.off.includes(reqId) ? s.off.filter((x) => x !== reqId) : [...s.off, reqId] })),
    setEvery: (reqId: string, days: number) => setSaved((s) => ({ ...s, every: { ...s.every, [reqId]: Math.max(1, Math.round(days)) } })),
    addCustom: (title: string, everyDays: number, group: Requirement['group']) => setSaved((s) => ({
      ...s,
      custom: [...s.custom, { id: `own-${Date.now()}`, group, title, rule: 'Added by the owner for this shop.', source: { label: 'Your own shop rule' }, verified: true, basis: 'practice', everyDays: Math.max(1, Math.round(everyDays)), major: false, who: 'manager' }],
    })),
    removeCustom: (reqId: string) => setSaved((s) => ({ ...s, custom: s.custom.filter((c) => c.id !== reqId) })),
  };
}

export type Health = ReturnType<typeof useHealth>;

export const CHECK_STATE = {
  ok: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
  due: { label: 'Due now', cls: 'bg-amber-100 text-amber-800' },
  late: { label: 'Overdue', cls: 'bg-rose-100 text-rose-800' },
  failed: { label: 'Did not pass', cls: 'bg-rose-600 text-white' },
};

const nameOf = (id: string) => STAFF_BY_ID[id]?.name ?? id;
const timeOf = (at: string) => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dateOf = (at: string) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One check with the way to record it: a number, or a pass, and what was done when it does not pass. */
export function CheckRow({ s, health, me }: { s: CheckStatus; health: Health; me: string }) {
  const { req } = s;
  const [value, setValue] = useState('');
  const [fix, setFix] = useState('');
  const [failing, setFailing] = useState(false);
  const n = value.trim() === '' ? undefined : Number(value);
  const typed = n !== undefined && Number.isFinite(n);
  const bad = req.reading ? typed && !readingOk(req, n!) : failing;
  const canSave = req.reading ? typed && (!bad || fix.trim().length > 3) : !failing || fix.trim().length > 3;
  const save = () => {
    health.record(req.id, me, req.reading ? n : undefined, bad ? fix.trim() : undefined);
    setValue(''); setFix(''); setFailing(false);
  };
  const today = s.last && s.last.at.slice(0, 10) === health.today;
  return (
    <li data-check={req.id} className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{req.title}</p>
          <p className="text-xs text-slate-500">
            {req.reading ? `Must be ${rangeLabel(req)}. ` : ''}
            {s.last ? `Last: ${s.last.value !== undefined ? `${s.last.value}${req.reading?.unit ?? ''}, ` : ''}${today ? timeOf(s.last.at) : dateOf(s.last.at)} by ${nameOf(s.last.by).replace(/\.$/, '')}.` : 'No record yet.'}
            {s.state === 'late' && req.everyDays > 1 && s.daysLate > 0 ? ` ${s.daysLate} days overdue.` : ''}
            {s.state === 'ok' && s.nextDue ? ` Next due ${dateOf(`${s.nextDue}T12:00:00`)}.` : ''}
          </p>
          {s.state === 'failed' && s.last?.fix && <p className="mt-1 text-xs text-rose-700">What was done: {s.last.fix} Check it again to clear this.</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHECK_STATE[s.state].cls}`}>{CHECK_STATE[s.state].label}</span>
      </div>
      {s.state !== 'ok' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {req.reading ? (
            <label className="flex items-center gap-1.5 text-sm">
              <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label={`Reading for ${req.title}`} placeholder="Reading" className="w-24 rounded-lg border border-slate-200 px-2.5 py-2 text-sm" />
              <span className="text-slate-500">{req.reading.unit.trim()}</span>
            </label>
          ) : (
            <button onClick={() => setFailing(!failing)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${failing ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{failing ? 'Problem found' : 'Found a problem'}</button>
          )}
          <button disabled={!canSave} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">
            <Check size={13} /> {req.vendor ? 'Service done today' : req.reading ? 'Save reading' : failing ? 'Save the problem' : 'Done, all good'}
          </button>
        </div>
      )}
      {s.state !== 'ok' && bad && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-rose-700">{req.reading ? `That is outside the rule (${rangeLabel(req)}).` : 'Noted as a problem.'} Write what you did about it.</p>
          <input value={fix} onChange={(e) => setFix(e.target.value)} aria-label="What was done" placeholder="For example: moved the food to the walk-in and called for service" className="mt-1 w-full rounded-lg border border-rose-200 px-2.5 py-2 text-sm" />
        </div>
      )}
    </li>
  );
}

/** The health checks that are open right now, for the register and kitchen task lists. */
export function HealthChecksPanel({ me }: { me: string }) {
  const health = useHealth();
  const open = health.open.filter((c) => !c.req.vendor);
  return (
    <section data-health-panel>
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><ClipboardCheck size={13} /> Health checks ({open.length})</h3>
      {open.some((c) => c.state === 'failed' || c.state === 'late') && (
        <p className="mt-1 flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Some checks are overdue or did not pass. Do those first.</p>
      )}
      {open.length === 0 ? <p className="py-2 text-sm text-slate-500">Every health check is done for now.</p> : <ul className="divide-y divide-slate-100">{open.map((s) => <CheckRow key={s.req.id} s={s} health={health} me={me} />)}</ul>}
    </section>
  );
}

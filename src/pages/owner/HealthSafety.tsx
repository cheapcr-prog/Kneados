import { Download, ExternalLink, FileCheck2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CHECK_STATE, CheckRow, useHealth } from '../../components/Health';
import { RULES_CHECKED } from '../../data/compliance';
import { STAFF_BY_ID } from '../../data/shop';
import { logCsv, rangeLabel, type HealthGroup, type PaperStatus, type Requirement, type Source } from '../../lib/compliance';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, download, field } from './ui';

const GROUPS: HealthGroup[] = ['Temperatures', 'Cleaning and sanitizing', 'Handwashing and staff', 'Pests', 'Building and fire'];
const PAPER_TONE: Record<PaperStatus['state'], 'green' | 'amber' | 'red' | 'blue'> = { ok: 'green', soon: 'amber', pending: 'blue', expired: 'red', missing: 'red' };
const PAPER_LABEL: Record<PaperStatus['state'], string> = { ok: 'In order', soon: 'Renew soon', pending: 'New hire', expired: 'Expired', missing: 'Missing' };

const how = (r: Requirement) => (r.everyDays <= 1 ? ((r.perDay ?? 1) > 1 ? `${r.perDay} times a day` : 'Every day') : r.everyDays === 7 ? 'Every week' : r.everyDays === 30 ? 'Every month' : r.everyDays === 90 ? 'Every 3 months' : r.everyDays === 182 ? 'Every 6 months' : r.everyDays === 365 ? 'Every year' : `Every ${r.everyDays} days`);

function SourceLine({ source, verified }: { source: Source; verified: boolean }) {
  return (
    <span className="text-[11px] text-slate-500">
      {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">{source.label} <ExternalLink size={10} /></a> : source.label}
      {verified ? '' : ' · confirm with your inspector'}
    </span>
  );
}

/** Everything the health department expects: daily logs, service visits, cards and permits, and how ready the shop is. */
export function HealthSafety({ me }: { me: string }) {
  const h = useHealth();
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('7');
  const [showRules, setShowRules] = useState(false);
  const { score, issues, warnings } = h.ready;
  const tone = score >= 90 ? 'good' : score < 75 ? 'bad' : undefined;
  const openNow = h.open;
  const cards = h.papers.filter((p) => p.staffId);
  const papers = h.papers.filter((p) => !p.staffId);

  return (
    <div className="space-y-4">
      <Brain label="Health inspection ready" title={issues.length === 0 ? 'The shop is ready for an inspector' : `${issues.length} ${issues.length === 1 ? 'thing needs' : 'things need'} fixing before an inspector walks in`}>
        <p>
          {issues.length === 0
            ? 'Every log is up to date and every card and permit is in order.'
            : `${issues.slice(0, 3).map((i) => i.title).join('. ')}.${issues.length > 3 ? ` And ${issues.length - 3} more.` : ''}`}
        </p>
        <p className="text-slate-300">{h.pack.posting}</p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ready score" value={`${score}`} sub="Out of 100. KneadOS's own measure." tone={tone} />
        <Stat label="Needs fixing" value={String(issues.length)} tone={issues.length > 0 ? 'bad' : 'good'} sub={`${issues.filter((i) => i.major).length} serious`} />
        <Stat label="Checks open now" value={String(openNow.length)} sub={`of ${h.checks.length} checks`} />
        <Stat label="Coming up" value={String(warnings.length)} sub="Due now or renewing soon" />
      </div>

      {issues.length > 0 && (
        <Card title="Fix these first" note="These count against the score. Serious ones weigh three times as much.">
          <ul className="divide-y divide-slate-100">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div><p className="text-sm font-semibold text-slate-900">{i.title}</p><p className="text-xs text-slate-600">{i.detail}</p></div>
                {i.major ? <Pill tone="red">Serious</Pill> : <Pill tone="amber">Minor</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = h.checks.filter((c) => c.req.group === g);
          if (rows.length === 0) return null;
          const open = rows.filter((c) => c.state !== 'ok').length;
          return (
            <Card key={g} title={g} note={open === 0 ? 'All done for now.' : `${open} open.`}>
              <ul className="divide-y divide-slate-100">{rows.map((s) => <CheckRow key={s.req.id} s={s} health={h} me={me} />)}</ul>
            </Card>
          );
        })}

        <Card title="Food handler cards" note={`Every food handler needs a card within ${h.pack.foodHandler.daysAfterHire} days of being hired. A card lasts ${h.pack.foodHandler.validYears} years, and the shop pays for the course and the time.`}>
          <ul className="divide-y divide-slate-100">
            {cards.map((p) => (
              <li key={p.id} data-paper={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><p className="text-sm font-semibold text-slate-900">{STAFF_BY_ID[p.staffId!]?.name ?? p.title}</p><p className="text-xs text-slate-600">{p.detail}</p></div>
                <span className="flex items-center gap-2">
                  <Pill tone={PAPER_TONE[p.state]}>{PAPER_LABEL[p.state]}</Pill>
                  {p.state !== 'ok' && <button className={btn.light} onClick={() => h.renew(p.id)}><FileCheck2 size={13} /> New card on file</button>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2"><SourceLine source={h.pack.foodHandler.source} verified /></p>
        </Card>

        <Card title="Permits and papers on file">
          <ul className="divide-y divide-slate-100">
            {papers.map((p) => {
              const rule = h.pack.papers.find((r) => r.id === p.id)!;
              return (
                <li key={p.id} data-paper={p.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                    <span className="flex items-center gap-2">
                      <Pill tone={PAPER_TONE[p.state]}>{PAPER_LABEL[p.state]}</Pill>
                      {p.state !== 'ok' && <button className={btn.light} onClick={() => h.renew(p.id)}><FileCheck2 size={13} /> {rule.validYears ? 'Renewed' : 'On file now'}</button>}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{p.detail}. {rule.rule}</p>
                  <SourceLine source={rule.source} verified={rule.verified} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card
        title={`The rules for ${h.pack.city}`}
        note={`${h.pack.agency}${h.pack.phone ? `, ${h.pack.phone}` : ''}. Rules read on ${new Date(`${RULES_CHECKED}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <select aria-label="City rules" value={h.pack.id} onChange={(e) => h.setPack(e.target.value)} className={field.replace('w-full ', '')}>
              {h.packs.map((p) => <option key={p.id} value={p.id}>{p.city}</option>)}
            </select>
            <button className={btn.light} onClick={() => download(`health-log-${h.today}.csv`, logCsv(h.log, h.all, (id) => STAFF_BY_ID[id]?.name ?? id))}><Download size={13} /> Log for the inspector</button>
          </span>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{h.pack.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <button className={`${btn.light} mt-3`} onClick={() => setShowRules(!showRules)}><ShieldCheck size={13} /> {showRules ? 'Hide' : 'Show'} every rule and where it comes from ({h.all.length})</button>
        {showRules && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="py-1.5 pr-3">Check</th><th className="pr-3">How often</th><th className="pr-3">Must be</th><th className="pr-3">On</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {h.all.map((r) => {
                  const on = !h.off.includes(r.id);
                  const own = h.custom.some((c) => c.id === r.id);
                  return (
                    <tr key={r.id} className={on ? '' : 'opacity-50'}>
                      <td className="py-2 pr-3 align-top">
                        <p className="font-semibold text-slate-900">{r.title} {r.basis === 'practice' && <Pill>Good practice</Pill>}</p>
                        <p className="text-xs text-slate-600">{r.rule}</p>
                        <SourceLine source={r.source} verified={r.verified} />
                      </td>
                      <td className="pr-3 align-top">
                        {r.everyDays > 1 ? (
                          <label className="flex items-center gap-1 text-xs text-slate-600">Every <input aria-label={`Days between ${r.title}`} value={r.everyDays} onChange={(e) => h.setEvery(r.id, Number(e.target.value) || r.everyDays)} inputMode="numeric" className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-xs" /> days</label>
                        ) : <span className="text-xs text-slate-600">{how(r)}</span>}
                      </td>
                      <td className="pr-3 align-top text-xs text-slate-600">{rangeLabel(r) || 'Pass or fail'}</td>
                      <td className="align-top">
                        {own
                          ? <button aria-label={`Remove ${r.title}`} onClick={() => h.removeCustom(r.id)} className="rounded-md p-1 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                          : <input type="checkbox" aria-label={`Use ${r.title}`} checked={on} onChange={() => h.toggle(r.id)} className="h-4 w-4 accent-glaze-600" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
              <label className="min-w-[200px] flex-1 text-xs font-semibold text-slate-600">Add your own check<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: check the patio heater" className={`${field} mt-1`} /></label>
              <label className="text-xs font-semibold text-slate-600">Every (days)<input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className={`${field.replace('w-full ', '')} mt-1 block w-20`} /></label>
              <button className={btn.dark} disabled={title.trim().length < 4} onClick={() => { h.addCustom(title.trim(), Number(days) || 7, 'Building and fire'); setTitle(''); }}><Plus size={14} /> Add</button>
            </div>
          </div>
        )}
      </Card>

      <DemoNote>
        Demo: the readings, hire dates, cards and permit dates are example data. The rules are real and each one links to where it was read. Rules marked "confirm with your inspector" are a section number or a common practice that was not read from the source, so check those before relying on them. The ready score is KneadOS's own and is not a score from the health department. Status labels: {Object.values(CHECK_STATE).map((s) => s.label).join(', ')}.
      </DemoNote>
    </div>
  );
}

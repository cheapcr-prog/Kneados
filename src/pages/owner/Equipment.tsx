import { CalendarCheck, Check, Phone, ShieldCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import { ReportProblem, TaskRow, useUpkeep } from '../../components/Upkeep';
import { STAFF_BY_ID } from '../../data/shop';
import { addDays, longDate, shortDate } from '../../lib/dates';
import { formatPhone, money, moneyShort } from '../../lib/money';
import type { TaskArea } from '../../lib/upkeep';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, field } from './ui';

export function Equipment() {
  const up = useUpkeep();
  const [reporting, setReporting] = useState(false);
  const serviceDue = up.equipment.filter((e) => e.daysToService <= 14);
  const replace = up.equipment.filter((e) => e.advice?.startsWith('Repairs have cost'));
  const yearAgo = addDays(up.today, -365);
  const spent = up.repairs.filter((r) => r.fixedAt && r.fixedAt.slice(0, 10) >= yearAgo).reduce((a, r) => a + (r.costCents ?? 0), 0);
  const name = (id: string) => up.equipment.find((e) => e.equipment.id === id)!.equipment.name;

  return (
    <div className="space-y-4">
      <Brain label="KneadOS is watching the equipment" title={`${up.openRepairs.length} open repair${up.openRepairs.length === 1 ? '' : 's'}, ${serviceDue.length} service visit${serviceDue.length === 1 ? '' : 's'} due.`}>
        <ul className="list-disc space-y-1 pl-4">
          {up.openRepairs.map((r) => <li key={r.id}>{name(r.equipmentId)}: {r.status === 'scheduled' ? `technician booked for ${longDate(r.visit!)}.` : 'reported and not booked yet.'}</li>)}
          {serviceDue.map((e) => <li key={e.equipment.id}>{e.equipment.name}: {e.equipment.serviceTask.toLowerCase()} {e.daysToService < 0 ? `was due ${shortDate(e.serviceDue)}` : `is due ${shortDate(e.serviceDue)}`}.</li>)}
          {replace.map((e) => <li key={e.equipment.id} className="font-semibold text-amber-300">{e.equipment.name}: {moneyShort(e.repairCents)} in repairs on a {moneyShort(e.equipment.costCents)} machine. Start pricing a replacement.</li>)}
        </ul>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Equipment tracked" value={String(up.equipment.length)} sub={`${moneyShort(up.equipment.reduce((a, e) => a + e.equipment.costCents, 0))} when bought`} />
        <Stat label="Open repairs" value={String(up.openRepairs.length)} tone={up.openRepairs.length ? 'bad' : 'good'} />
        <Stat label="Repairs, last 12 months" value={moneyShort(spent)} />
        <Stat label="Still under warranty" value={String(up.equipment.filter((e) => e.inWarranty).length)} />
      </div>

      <Card title="Repairs" note="Staff report a problem from the register in a few taps. It lands here with who reported it and when." action={<button className={btn.dark} onClick={() => setReporting((v) => !v)}><Wrench size={15} /> Report a problem</button>}>
        {reporting && <div className="mb-3 max-w-md rounded-xl bg-slate-50 p-3"><ReportProblem up={up} by="rosa" onDone={() => setReporting(false)} /></div>}
        <ul className="divide-y divide-slate-100">
          {[...up.repairs].sort((a, b) => Number(a.status === 'fixed') - Number(b.status === 'fixed') || b.reportedAt.localeCompare(a.reportedAt)).map((r) => (
            <RepairRow key={r.id} title={name(r.equipmentId)} r={r} today={up.today} onUpdate={(patch) => up.updateRepair(r.id, patch)} />
          ))}
        </ul>
      </Card>

      <Card title="Equipment list" note="Every machine with its age, warranty, next service and what it has cost in repairs.">
        <ul className="divide-y divide-slate-100">
          {up.equipment.map((e) => (
            <li key={e.equipment.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-semibold text-slate-900">
                    {e.equipment.name} <span className="font-normal text-slate-500">· {e.equipment.model} · {e.equipment.where}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Bought {shortDate(e.equipment.bought)}, {e.ageYears.toFixed(1)} years old, {moneyShort(e.equipment.costCents)}. Repairs so far {money(e.repairCents)}.
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {e.inWarranty ? <Pill tone="green"><ShieldCheck size={11} className="-mt-0.5 mr-0.5 inline" />Warranty to {shortDate(e.warrantyEnds)}</Pill> : <Pill>Warranty ended {shortDate(e.warrantyEnds)}</Pill>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${e.daysToService < 0 ? 'bg-rose-100 text-rose-800' : e.daysToService <= 14 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {e.equipment.serviceTask}: {e.daysToService < 0 ? `${-e.daysToService} days overdue` : `due ${shortDate(e.serviceDue)}`}
                    </span>
                    {e.open.length > 0 && <Pill tone="red">{e.open.length} open repair{e.open.length === 1 ? '' : 's'}</Pill>}
                  </p>
                  {e.advice && <p className="mt-1.5 text-xs font-semibold text-amber-700">{e.advice}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><Phone size={12} /> {e.equipment.vendor}{e.equipment.vendorPhone && `, ${formatPhone(e.equipment.vendorPhone)}`}</span>
                  <button className={btn.light} onClick={() => up.markServiced(e.equipment.id)}><CalendarCheck size={13} /> Serviced today</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <DemoNote>The machines, prices, service companies and repair history are examples. A real shop enters its own list once, and KneadOS keeps the service dates and repair costs from then on.</DemoNote>
    </div>
  );
}

function RepairRow({ title, r, today, onUpdate }: { title: string; r: import('../../lib/upkeep').Repair; today: string; onUpdate: (patch: Partial<import('../../lib/upkeep').Repair>) => void }) {
  const [cost, setCost] = useState('');
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold text-slate-900">
          {title}{' '}
          {r.status === 'open' && <Pill tone="red">Reported</Pill>}
          {r.status === 'scheduled' && <Pill tone="amber">Technician {shortDate(r.visit!)}</Pill>}
          {r.status === 'fixed' && <Pill tone="green">Fixed</Pill>}
        </p>
        <p className="text-sm text-slate-600">{r.problem}</p>
        <p className="text-xs text-slate-500">
          Reported by {STAFF_BY_ID[r.reportedBy]?.name ?? r.reportedBy} on {shortDate(r.reportedAt.slice(0, 10))}
          {r.status === 'fixed' && ` · fixed ${shortDate(r.fixedAt!.slice(0, 10))} for ${money(r.costCents ?? 0)}`}
        </p>
      </div>
      {r.status === 'open' && <button className={btn.light} onClick={() => onUpdate({ status: 'scheduled', visit: addDays(today, 1) })}><CalendarCheck size={13} /> Book the technician</button>}
      {r.status !== 'fixed' && (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-500">$</span>
          <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Cost" inputMode="decimal" aria-label="Repair cost" className={`${field} w-20`} />
          <button className={btn.green} onClick={() => onUpdate({ status: 'fixed', fixedAt: new Date().toISOString(), costCents: Math.round((Number(cost) || 0) * 100) })}><Check size={13} /> Fixed</button>
        </div>
      )}
    </li>
  );
}

const AREAS: TaskArea[] = ['Opening', 'Safety', 'Cleaning', 'Closing'];

export function ShopTasks() {
  const up = useUpkeep();
  const open = up.statuses.filter((s) => s.state === 'due' || s.state === 'overdue');
  const done = up.statuses.filter((s) => s.state === 'done');
  const unassigned = open.filter((s) => !up.assigned[s.task.id]);
  const dailyTotal = up.statuses.filter((s) => s.task.everyDays === 1).length;
  return (
    <div className="space-y-4">
      <Brain label="KneadOS is handing out the shop tasks" title={up.overdue.length ? `${up.overdue.length} task${up.overdue.length === 1 ? ' is' : 's are'} overdue.` : 'Nothing is overdue.'}>
        <ul className="list-disc space-y-1 pl-4">
          {up.overdue.map((s) => <li key={s.task.id} className="font-semibold text-rose-300">{s.task.name}: {s.daysLate} day{s.daysLate === 1 ? '' : 's'} late{up.assigned[s.task.id] ? `. Given to ${STAFF_BY_ID[up.assigned[s.task.id]].name} today.` : '.'}</li>)}
          <li>Each task goes to whoever on that station has the least to do, and people on a break get nothing until they are back. Staff check tasks off at the register.</li>
          {unassigned.length > 0 && <li>{unassigned.length} task{unassigned.length === 1 ? ' has' : 's have'} nobody to do {unassigned.length === 1 ? 'it' : 'them'} because that station has nobody on the clock.</li>}
        </ul>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Done today" value={`${done.length}`} sub={`of ${done.length + open.length} due today`} />
        <Stat label="Still to do today" value={String(open.length)} />
        <Stat label="Overdue" value={String(up.overdue.length)} tone={up.overdue.length ? 'bad' : 'good'} />
        <Stat label="Daily tasks" value={String(dailyTotal)} sub={`${up.statuses.length - dailyTotal} weekly or monthly`} />
      </div>

      {AREAS.map((area) => {
        const rows = up.statuses.filter((s) => s.task.area === area);
        return (
          <Card key={area} title={area}>
            <ul className="divide-y divide-slate-100">{rows.map((s) => <TaskRow key={s.task.id} s={s} up={up} />)}</ul>
          </Card>
        );
      })}

      <DemoNote>The task list and how often each is due are examples. A shop sets its own list to match its health department and its equipment manuals.</DemoNote>
    </div>
  );
}

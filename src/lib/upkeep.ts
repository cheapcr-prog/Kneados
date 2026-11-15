import { addDays } from './dates';

/** Shop upkeep: recurring tasks that staff check off, and the equipment that needs service and repairs. */

export type TaskArea = 'Opening' | 'Closing' | 'Cleaning' | 'Safety';

export interface ShopTask {
  id: string;
  name: string;
  area: TaskArea;
  /** How often it is due, in days. 1 means every day. */
  everyDays: number;
  /** Who does it: counter staff or the kitchen. */
  group: 'counter' | 'kitchen';
  minutes: number;
}

export interface TaskDone {
  /** Date (YYYY-MM-DD) it was last done. */
  date: string;
  by: string;
}

export type TaskState = 'done' | 'due' | 'overdue' | 'upcoming';

export interface TaskStatus {
  task: ShopTask;
  state: TaskState;
  /** Date it is next due. */
  due: string;
  /** Days past due when overdue. */
  daysLate: number;
  last?: TaskDone;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export function taskStatus(task: ShopTask, last: TaskDone | undefined, today: string): TaskStatus {
  if (!last) return { task, state: 'due', due: today, daysLate: 0 };
  const due = addDays(last.date, task.everyDays);
  const late = daysBetween(due, today);
  if (last.date === today) return { task, state: 'done', due, daysLate: 0, last };
  // A daily task that was missed yesterday is simply due again today.
  if (late > 0 && task.everyDays > 1) return { task, state: 'overdue', due, daysLate: late, last };
  if (late >= 0) return { task, state: 'due', due: today, daysLate: 0, last };
  return { task, state: 'upcoming', due, daysLate: 0, last };
}

export interface Worker {
  id: string;
  group: 'counter' | 'kitchen';
}

/**
 * Hands today's open tasks to the people on the floor. Overdue work goes first,
 * and each task goes to whoever in the right group has the fewest minutes so far.
 */
export function assignTasks(statuses: TaskStatus[], workers: Worker[]): Record<string, string> {
  const load: Record<string, number> = Object.fromEntries(workers.map((w) => [w.id, 0]));
  const out: Record<string, string> = {};
  const open = statuses
    .filter((s) => s.state === 'due' || s.state === 'overdue')
    .sort((a, b) => b.daysLate - a.daysLate || a.task.id.localeCompare(b.task.id));
  for (const s of open) {
    const team = workers.filter((w) => w.group === s.task.group);
    if (team.length === 0) continue;
    const pick = team.reduce((best, w) => (load[w.id] < load[best.id] ? w : best));
    load[pick.id] += s.task.minutes;
    out[s.task.id] = pick.id;
  }
  return out;
}

export interface Equipment {
  id: string;
  name: string;
  where: 'Kitchen' | 'Counter';
  model: string;
  /** Date bought (YYYY-MM-DD). */
  bought: string;
  costCents: number;
  warrantyMonths: number;
  /** Who services it. */
  vendor: string;
  vendorPhone: string;
  serviceEveryDays: number;
  serviceTask: string;
  /** Date it was last serviced. */
  lastService: string;
}

export interface Repair {
  id: string;
  equipmentId: string;
  problem: string;
  reportedBy: string;
  reportedAt: string;
  status: 'open' | 'scheduled' | 'fixed';
  /** Date the technician is booked for. */
  visit?: string;
  costCents?: number;
  fixedAt?: string;
}

export interface EquipmentStatus {
  equipment: Equipment;
  ageYears: number;
  warrantyEnds: string;
  inWarranty: boolean;
  serviceDue: string;
  /** Negative when service is overdue. */
  daysToService: number;
  open: Repair[];
  repairCents: number;
  /** Set when repairs have cost a large share of what the machine cost new. */
  advice?: string;
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const out = new Date(y, m - 1 + months, d);
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
}

export function equipmentStatus(e: Equipment, repairs: Repair[], today: string): EquipmentStatus {
  const mine = repairs.filter((r) => r.equipmentId === e.id);
  const repairCents = mine.reduce((a, r) => a + (r.costCents ?? 0), 0);
  const warrantyEnds = addMonths(e.bought, e.warrantyMonths);
  const serviceDue = addDays(e.lastService, e.serviceEveryDays);
  const ageYears = daysBetween(e.bought, today) / 365;
  const share = repairCents / e.costCents;
  const open = mine.filter((r) => r.status !== 'fixed');
  let advice: string | undefined;
  if (share >= 0.5) advice = `Repairs have cost ${Math.round(share * 100)}% of what it cost new. Start pricing a replacement.`;
  else if (open.length > 0 && warrantyEnds >= today) advice = 'Still under warranty, so this repair should be covered. Call the vendor before paying anyone.';
  else if (mine.filter((r) => daysBetween(r.reportedAt.slice(0, 10), today) <= 90).length >= 2) advice = 'Two problems in three months. Ask the technician to look for the cause, not just the symptom.';
  return { equipment: e, ageYears, warrantyEnds, inWarranty: warrantyEnds >= today, serviceDue, daysToService: daysBetween(today, serviceDue), open, repairCents, advice };
}

import type { Role, Shift } from '../data/types';

/** Labor as a share of sales that a counter-service shop aims for. */
export const LABOR_TARGET = { low: 0.15, high: 0.25 };

export function shiftLength(s: Pick<Shift, 'start' | 'end'>): number {
  const [sh, sm] = s.start.split(':').map(Number);
  const [eh, em] = s.end.split(':').map(Number);
  return Math.max(0, eh + em / 60 - (sh + sm / 60));
}

/** Paid hours: lunch comes off shifts over 5 hours. */
export function paidHours(s: Pick<Shift, 'start' | 'end'>): number {
  const h = shiftLength(s);
  return h > 5 ? h - 0.5 : h;
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  hourlyCents: number;
}

export interface DayLabor {
  dow: number;
  hours: number;
  costCents: number;
  salesCents: number;
  /** Labor cost over forecast sales. 0 when there are no sales to compare with. */
  pct: number;
  bakers: number;
  counter: number;
}

export function dayLabor(dow: number, shifts: Shift[], people: Person[], salesCents: number): DayLabor {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const mine = shifts.filter((s) => s.dow === dow && byId[s.staffId]);
  const hours = mine.reduce((a, s) => a + paidHours(s), 0);
  const costCents = Math.round(mine.reduce((a, s) => a + paidHours(s) * byId[s.staffId].hourlyCents, 0));
  return {
    dow, hours, costCents, salesCents, pct: salesCents > 0 ? costCents / salesCents : 0,
    bakers: mine.filter((s) => byId[s.staffId].role === 'baker').length,
    counter: mine.filter((s) => byId[s.staffId].role !== 'baker').length,
  };
}

export interface ScheduleNote {
  dow?: number;
  tone: 'warn' | 'bad' | 'good';
  text: string;
}

/** Plain advice on a week: days that are heavy or thin against forecast sales, missing cover, and overtime. */
export function reviewSchedule(days: DayLabor[], shifts: Shift[], people: Person[], dayNames: string[]): ScheduleNote[] {
  const notes: ScheduleNote[] = [];
  const paid = people.filter((p) => p.hourlyCents > 0);
  const avgRate = paid.reduce((a, p) => a + p.hourlyCents, 0) / Math.max(1, paid.length);
  for (const d of days) {
    const name = dayNames[d.dow];
    if (d.bakers === 0) notes.push({ dow: d.dow, tone: 'bad', text: `${name} has no baker, so nothing gets made.` });
    if (d.counter === 0) notes.push({ dow: d.dow, tone: 'bad', text: `${name} has nobody on the counter.` });
    if (d.salesCents <= 0 || d.bakers === 0 || d.counter === 0) continue;
    if (d.pct > LABOR_TARGET.high) {
      const cut = (d.costCents - LABOR_TARGET.high * d.salesCents) / avgRate;
      notes.push({ dow: d.dow, tone: 'warn', text: `${name} is heavy: labor is ${Math.round(d.pct * 100)}% of forecast sales. Trimming about ${Math.max(1, Math.round(cut))} hour${Math.round(cut) > 1 ? 's' : ''} brings it to ${Math.round(LABOR_TARGET.high * 100)}%.` });
    } else if (d.pct < LABOR_TARGET.low) {
      const add = (LABOR_TARGET.low * d.salesCents - d.costCents) / avgRate;
      notes.push({ dow: d.dow, tone: 'warn', text: `${name} is thin: labor is only ${Math.round(d.pct * 100)}% of forecast sales, so the line will be slow. About ${Math.max(1, Math.round(add))} more hour${Math.round(add) > 1 ? 's' : ''} on the counter would cover it.` });
    }
  }
  for (const p of people) {
    const week = shifts.filter((s) => s.staffId === p.id).reduce((a, s) => a + paidHours(s), 0);
    if (week > 40) notes.push({ tone: 'warn', text: `${p.name} is at ${week.toFixed(1)} hours, so ${(week - 40).toFixed(1)} of them are overtime at time and a half.` });
  }
  if (notes.length === 0) notes.push({ tone: 'good', text: 'Every day is covered and labor is inside the target range all week.' });
  return notes;
}

/** Trades two people's shifts on one day. Either of them may be off that day. */
export function swapShifts(shifts: Shift[], dow: number, a: string, b: string): Shift[] {
  return shifts.map((s) => {
    if (s.dow !== dow) return s;
    if (s.staffId === a) return { ...s, staffId: b };
    if (s.staffId === b) return { ...s, staffId: a };
    return s;
  });
}

/** Sets, changes or clears (null) one person's shift on one day. */
export function setShift(shifts: Shift[], staffId: string, dow: number, times: { start: string; end: string } | null): Shift[] {
  const rest = shifts.filter((s) => !(s.staffId === staffId && s.dow === dow));
  return times ? [...rest, { staffId, dow, ...times }] : rest;
}

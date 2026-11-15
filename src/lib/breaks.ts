/**
 * Rest breaks and meal breaks, following the California rules for hourly staff:
 *  - a paid 10 minute rest break for every 4 hours worked, or major part of 4 hours (none on a shift under 3.5 hours)
 *  - an unpaid 30 minute meal break that starts before the end of the 5th hour, on any shift over 5 hours
 *  - a second meal break before the end of the 10th hour, on any shift over 10 hours
 * A missed or late meal break costs the shop one extra hour of pay for that day.
 * This is a helper, not legal advice. A shop should confirm its own policy.
 */

export type BreakKind = 'rest' | 'meal';

export interface Break {
  kind: BreakKind;
  /** ISO start time. */
  start: string;
  /** ISO end time. Missing while the break is still running. */
  end?: string;
}

export const REST_MINUTES = 10;
export const MEAL_MINUTES = 30;
/** A meal break must start before this many hours into the shift. */
export const MEAL_BY_HOURS = 5;
/** Warn this long before a meal deadline. */
export const MEAL_WARN_MINUTES = 60;

const HOUR = 3600_000;

export function restsOwed(shiftHours: number): number {
  if (shiftHours < 3.5) return 0;
  return Math.floor(shiftHours / 4) + (shiftHours % 4 > 2 ? 1 : 0);
}

export function mealsOwed(shiftHours: number): number {
  return shiftHours > 10 ? 2 : shiftHours > 5 ? 1 : 0;
}

/** Hours of unpaid meal time inside a list of breaks. A meal still running counts up to now. */
export function unpaidHours(breaks: Break[], now: Date, since?: string): number {
  return breaks
    .filter((b) => b.kind === 'meal' && (!since || b.start >= since))
    .reduce((a, b) => a + Math.max(0, (b.end ? new Date(b.end).getTime() : now.getTime()) - new Date(b.start).getTime()), 0) / HOUR;
}

export type BreakState = 'on-break' | 'meal-late' | 'meal-due' | 'rest-due' | 'ok';

export interface BreakStatus {
  state: BreakState;
  /** The break that is running now, if any. */
  current?: Break;
  /** When the running break should end (ISO). */
  backAt?: string;
  restsOwed: number;
  restsTaken: number;
  mealsOwed: number;
  mealsTaken: number;
  /** Deadline (ISO) to start the next meal break that is still owed. */
  mealDueBy?: string;
  /** True when a meal deadline passed with no meal started in time: one hour of premium pay is owed. */
  premiumOwed: boolean;
  /** Which break to send this person on next, when one is due. */
  next?: BreakKind;
}

/**
 * Where one person stands on breaks right now.
 * `plannedHours` is the length of the shift on the schedule. Without a schedule, pass the hours worked so far.
 */
export function breakStatus(shiftStart: Date, plannedHours: number, breaks: Break[], now: Date): BreakStatus {
  const start = shiftStart.getTime();
  const elapsed = (now.getTime() - start) / HOUR;
  const hours = Math.max(plannedHours, elapsed);
  const mine = breaks.filter((b) => new Date(b.start).getTime() >= start);
  const meals = mine.filter((b) => b.kind === 'meal');
  const rests = mine.filter((b) => b.kind === 'rest');
  const current = mine.find((b) => !b.end);
  const owedMeals = mealsOwed(hours);
  const owedRests = restsOwed(hours);

  // Meal n (1 or 2) must start before 5 and 10 hours into the shift.
  const deadline = (n: number) => start + n * MEAL_BY_HOURS * HOUR;
  let premiumOwed = false;
  for (let n = 1; n <= owedMeals; n++) {
    const meal = meals[n - 1];
    const startedAt = meal ? new Date(meal.start).getTime() : now.getTime();
    if (startedAt > deadline(n)) premiumOwed = true;
  }
  const mealDueBy = meals.length < owedMeals ? deadline(meals.length + 1) : undefined;
  // Rest n is best taken near the middle of each 4 hour stretch.
  const restDueAt = rests.length < owedRests ? start + (rests.length * 4 + 2) * HOUR : undefined;

  let state: BreakState = 'ok';
  let next: BreakKind | undefined;
  if (current) state = 'on-break';
  else if (mealDueBy !== undefined && now.getTime() > mealDueBy) { state = 'meal-late'; next = 'meal'; }
  else if (mealDueBy !== undefined && now.getTime() >= mealDueBy - MEAL_WARN_MINUTES * 60_000) { state = 'meal-due'; next = 'meal'; }
  else if (restDueAt !== undefined && now.getTime() >= restDueAt) { state = 'rest-due'; next = 'rest'; }

  return {
    state, current, next, premiumOwed,
    backAt: current ? new Date(new Date(current.start).getTime() + (current.kind === 'meal' ? MEAL_MINUTES : REST_MINUTES) * 60_000).toISOString() : undefined,
    restsOwed: owedRests, restsTaken: rests.length, mealsOwed: owedMeals, mealsTaken: meals.length,
    mealDueBy: mealDueBy !== undefined ? new Date(mealDueBy).toISOString() : undefined,
  };
}

export interface BreakCandidate {
  staffId: string;
  /** People in the same group cover for each other, e.g. 'counter' or 'kitchen'. */
  group: string;
  status: BreakStatus;
}

export interface BreakAdvice {
  staffId: string;
  kind: BreakKind;
  /** False when nobody else in the group is on the floor to cover. */
  covered: boolean;
  urgent: boolean;
}

const URGENCY: Record<BreakState, number> = { 'meal-late': 0, 'meal-due': 1, 'rest-due': 2, 'on-break': 9, ok: 9 };

/**
 * Who to send on break next, one person per group at a time so the counter and the kitchen stay covered.
 * A group with somebody already on break waits, unless a meal is already late.
 */
export function adviseBreaks(people: BreakCandidate[]): BreakAdvice[] {
  const advice: BreakAdvice[] = [];
  for (const group of [...new Set(people.map((p) => p.group))]) {
    const team = people.filter((p) => p.group === group);
    const away = team.some((p) => p.status.state === 'on-break');
    const due = team
      .filter((p) => p.status.next)
      .sort((a, b) => URGENCY[a.status.state] - URGENCY[b.status.state] || (a.status.mealDueBy ?? '').localeCompare(b.status.mealDueBy ?? '') || a.staffId.localeCompare(b.staffId));
    const pick = due[0];
    if (!pick) continue;
    const urgent = pick.status.state === 'meal-late';
    if (away && !urgent) continue;
    const onFloor = team.filter((p) => p.status.state !== 'on-break').length;
    advice.push({ staffId: pick.staffId, kind: pick.status.next!, covered: onFloor > 1, urgent });
  }
  return advice;
}

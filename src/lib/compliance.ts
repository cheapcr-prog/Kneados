/**
 * Health and safety compliance: what a shop has to check, log and keep on file,
 * and how ready it is if the inspector walks in. The rules themselves come from a
 * rule pack for the shop's city, so another city can load its own.
 */

export type HealthGroup = 'Temperatures' | 'Cleaning and sanitizing' | 'Handwashing and staff' | 'Pests' | 'Building and fire' | 'Papers on file';

/** Where a rule comes from, and whether its numbers were read from that source. */
export interface Source {
  label: string;
  url?: string;
}

export interface Requirement {
  id: string;
  group: HealthGroup;
  /** What the person does, as an instruction. */
  title: string;
  /** What the rule says, in plain words. */
  rule: string;
  source: Source;
  /**
   * True when the figures in `rule` were read from the source itself.
   * False means it is a section number or common practice to confirm with the inspector.
   */
  verified: boolean;
  /** A rule the inspector enforces, or good practice that keeps the shop out of trouble. */
  basis: 'law' | 'practice';
  /** How often, in days. 1 is every day. */
  everyDays: number;
  /** For daily checks: how many times a day. Checks are spread evenly over opening hours. */
  perDay?: number;
  /** A number to write down, with the range that passes. */
  reading?: { unit: string; min?: number; max?: number };
  /** Done by an outside company, so the record is the service report. */
  vendor?: boolean;
  /** A problem here is one an inspector treats as serious. */
  major: boolean;
  /** Who normally does it. */
  who: 'counter' | 'kitchen' | 'manager';
}

export interface RulePack {
  id: string;
  city: string;
  agency: string;
  phone?: string;
  /** What kind of result the agency posts after an inspection. */
  posting: string;
  notes: string[];
  requirements: Requirement[];
  /** Papers the shop keeps, apart from each person's food handler card. */
  papers: PaperRule[];
  /** How long a food handler has to get a card, and how long it lasts. */
  foodHandler: { daysAfterHire: number; validYears: number; source: Source };
}

export interface PaperRule {
  id: string;
  title: string;
  rule: string;
  source: Source;
  verified: boolean;
  /** How long it lasts, in years, when it expires. */
  validYears?: number;
  major: boolean;
}

export interface LogEntry {
  reqId: string;
  /** ISO time. */
  at: string;
  by: string;
  value?: number;
  ok: boolean;
  /** What was done about a failed check. */
  fix?: string;
}

export interface Paper {
  /** A PaperRule id, or `card:<staffId>` for a food handler card. */
  id: string;
  /** The day it runs out. */
  expires?: string;
  /** For papers that do not expire: whether it is on file. */
  onFile?: boolean;
}

export interface StaffHire {
  id: string;
  name: string;
  hired: string;
  /** Owners and managers who hold the manager certificate do not also need a food handler card. */
  exempt?: boolean;
}

export type CheckState = 'ok' | 'due' | 'late' | 'failed';

export interface CheckStatus {
  req: Requirement;
  state: CheckState;
  last?: LogEntry;
  /** How many checks are still owed today, for checks done more than once a day. */
  owedToday: number;
  doneToday: number;
  /** The day it is next due, for checks that are not daily. */
  nextDue?: string;
  daysLate: number;
}

const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const dayNumber = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
export const daysApart = (from: string, to: string) => dayNumber(to) - dayNumber(from);
export const plusDays = (date: string, n: number) => new Date((dayNumber(date) + n) * DAY).toISOString().slice(0, 10);

/** Whether a number passes the rule. */
export function readingOk(req: Requirement, value: number): boolean {
  const r = req.reading;
  if (!r) return true;
  return (r.min === undefined || value >= r.min) && (r.max === undefined || value <= r.max);
}

/** The range that passes, in words: "41°F or colder". */
export function rangeLabel(req: Requirement): string {
  const r = req.reading;
  if (!r) return '';
  const u = r.unit;
  if (r.min !== undefined && r.max !== undefined) return `${r.min} to ${r.max}${u}`;
  if (r.max !== undefined) return u === '°F' ? `${r.max}${u} or colder` : `${r.max}${u} or less`;
  if (r.min !== undefined) return u === '°F' ? `${r.min}${u} or hotter` : `${r.min}${u} or more`;
  return '';
}

export interface Clock {
  /** Today's date, YYYY-MM-DD. */
  today: string;
  /** The hour of the day right now, with fractions. */
  hour: number;
  openHour: number;
  closeHour: number;
}

/** How many of a day's checks should have happened by now. The first is due at opening. */
export function checksOwedByNow(perDay: number, c: Clock): number {
  if (c.hour < c.openHour) return 0;
  const span = (c.closeHour - c.openHour) / perDay;
  return Math.min(perDay, Math.floor((c.hour - c.openHour) / span) + 1);
}

/**
 * Where one check stands. `entries` must use local dates in `at` (the first ten characters are the day).
 * A failed check stays failed until a passing one is logged after it.
 */
export function checkStatus(req: Requirement, entries: LogEntry[], c: Clock): CheckStatus {
  const mine = entries.filter((e) => e.reqId === req.id).sort((a, b) => a.at.localeCompare(b.at));
  const last = mine[mine.length - 1];
  const doneToday = mine.filter((e) => dayOf(e.at) === c.today).length;
  const base = { req, last, doneToday, owedToday: 0, daysLate: 0 };
  if (last && !last.ok) return { ...base, state: 'failed' };

  if (req.everyDays <= 1) {
    const owed = checksOwedByNow(req.perDay ?? 1, c);
    const owedToday = Math.max(0, owed - doneToday);
    if (owedToday === 0) return { ...base, state: 'ok' };
    // One check behind is simply due. Two behind means a whole check was skipped.
    return { ...base, owedToday, state: owedToday >= 2 ? 'late' : 'due' };
  }
  if (!last) return { ...base, state: 'late', nextDue: c.today };
  const nextDue = plusDays(dayOf(last.at), req.everyDays);
  const late = daysApart(nextDue, c.today);
  if (late > 0) return { ...base, state: 'late', nextDue, daysLate: late };
  if (late === 0) return { ...base, state: 'due', nextDue };
  return { ...base, state: 'ok', nextDue };
}

export type PaperState = 'ok' | 'soon' | 'expired' | 'missing' | 'pending';

export interface PaperStatus {
  id: string;
  title: string;
  state: PaperState;
  /** In the owner's words: "Expires Mar 4" or "Needed by Dec 1". */
  detail: string;
  expires?: string;
  /** Days until it expires, or until the deadline for a new hire. Negative when past. */
  daysLeft?: number;
  major: boolean;
  staffId?: string;
}

/** Papers with fewer days left than this are flagged for renewal. */
export const RENEW_AHEAD_DAYS = 45;

const nice = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function expiryState(expires: string, today: string): { state: PaperState; detail: string; daysLeft: number } {
  const daysLeft = daysApart(today, expires);
  if (daysLeft < 0) return { state: 'expired', detail: `Expired ${nice(expires)}`, daysLeft };
  if (daysLeft <= RENEW_AHEAD_DAYS) return { state: 'soon', detail: `Expires ${nice(expires)}, in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, daysLeft };
  return { state: 'ok', detail: `Good until ${nice(expires)}`, daysLeft };
}

/** Each person's food handler card. A new hire has a set number of days to get one. */
export function cardStatuses(staff: StaffHire[], papers: Paper[], pack: RulePack, today: string): PaperStatus[] {
  return staff.filter((s) => !s.exempt).map((s) => {
    const title = `${s.name}: food handler card`;
    const paper = papers.find((p) => p.id === `card:${s.id}`);
    if (paper?.expires) return { id: `card:${s.id}`, title, staffId: s.id, major: true, expires: paper.expires, ...expiryState(paper.expires, today) };
    const deadline = plusDays(s.hired, pack.foodHandler.daysAfterHire);
    const daysLeft = daysApart(today, deadline);
    return daysLeft >= 0
      ? { id: `card:${s.id}`, title, staffId: s.id, major: true, state: 'pending' as const, detail: `New hire. Needs a card by ${nice(deadline)}, in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, daysLeft }
      : { id: `card:${s.id}`, title, staffId: s.id, major: true, state: 'missing' as const, detail: `No card on file. It was due ${nice(deadline)}`, daysLeft };
  });
}

export function paperStatuses(pack: RulePack, papers: Paper[], today: string): PaperStatus[] {
  return pack.papers.map((rule) => {
    const paper = papers.find((p) => p.id === rule.id);
    const base = { id: rule.id, title: rule.title, major: rule.major };
    if (rule.validYears) {
      if (!paper?.expires) return { ...base, state: 'missing' as const, detail: 'Not on file' };
      return { ...base, expires: paper.expires, ...expiryState(paper.expires, today) };
    }
    return paper?.onFile ? { ...base, state: 'ok' as const, detail: 'On file' } : { ...base, state: 'missing' as const, detail: 'Not on file' };
  });
}

export interface Issue {
  id: string;
  title: string;
  detail: string;
  major: boolean;
  /** Counts against the score. A warning does not. */
  counts: boolean;
}

export interface Readiness {
  /** 0 to 100. KneadOS's own measure, not a score from the health department. */
  score: number;
  issues: Issue[];
  /** Things coming up that do not count against the score yet. */
  warnings: Issue[];
  checked: number;
}

const MAJOR_WEIGHT = 3;

/**
 * How ready the shop is for an inspection. Every check and paper carries a weight,
 * three for the serious ones and one for the rest, and the score is the share of that weight in good standing.
 */
export function readiness(checks: CheckStatus[], papers: PaperStatus[]): Readiness {
  let total = 0, good = 0;
  const issues: Issue[] = [], warnings: Issue[] = [];
  for (const s of checks) {
    const w = s.req.major ? MAJOR_WEIGHT : 1;
    total += w;
    if (s.state === 'failed') {
      const r = s.last?.value !== undefined && s.req.reading ? `Last reading was ${s.last.value}${s.req.reading.unit}. It needs to be ${rangeLabel(s.req)}.` : 'The last check did not pass.';
      issues.push({ id: s.req.id, title: s.req.title, detail: `${r} Fix it and check again.`, major: s.req.major, counts: true });
    } else if (s.state === 'late') {
      issues.push({ id: s.req.id, title: s.req.title, detail: s.req.everyDays <= 1 ? `${s.owedToday} checks behind today.` : s.last ? `${s.daysLate} day${s.daysLate === 1 ? '' : 's'} overdue.` : 'No record on file.', major: s.req.major, counts: true });
    } else {
      good += w;
      if (s.state === 'due') warnings.push({ id: s.req.id, title: s.req.title, detail: s.req.everyDays <= 1 ? 'Due now.' : 'Due today.', major: s.req.major, counts: false });
    }
  }
  for (const p of papers) {
    const w = p.major ? MAJOR_WEIGHT : 1;
    total += w;
    if (p.state === 'expired' || p.state === 'missing') issues.push({ id: p.id, title: p.title, detail: p.detail, major: p.major, counts: true });
    else {
      good += w;
      if (p.state === 'soon' || p.state === 'pending') warnings.push({ id: p.id, title: p.title, detail: p.detail, major: p.major, counts: false });
    }
  }
  issues.sort((a, b) => Number(b.major) - Number(a.major));
  return { score: total === 0 ? 100 : Math.round((good / total) * 100), issues, warnings, checked: checks.length + papers.length };
}

/** The log as a spreadsheet, newest first, for handing to an inspector. */
export function logCsv(entries: LogEntry[], reqs: Requirement[], nameOf: (id: string) => string): string {
  const byId = Object.fromEntries(reqs.map((r) => [r.id, r]));
  const q = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const rows = [...entries].sort((a, b) => b.at.localeCompare(a.at)).map((e) => {
    const r = byId[e.reqId];
    return [e.at.slice(0, 10), e.at.slice(11, 16), q(r?.title ?? e.reqId), e.value !== undefined ? `${e.value}${r?.reading?.unit ?? ''}` : '', r?.reading ? q(rangeLabel(r)) : '', e.ok ? 'Pass' : 'Fail', q(e.fix ?? ''), q(nameOf(e.by))].join(',');
  });
  return ['Date,Time,Check,Reading,Must be,Result,What was done,By', ...rows].join('\n');
}

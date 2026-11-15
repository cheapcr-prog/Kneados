/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function dowOf(iso: string): number {
  return parseDate(iso).getDay();
}

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDate(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Demand multiplier for US days when donut shops are busier or slower than usual. */
export function holidayFor(iso: string): { name: string; factor: number } | undefined {
  const d = parseDate(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = d.getDay();
  const nth = Math.ceil(day / 7);
  if (m === 6 && dow === 5 && nth === 1) return { name: 'National Donut Day', factor: 1.6 };
  if (m === 10 && day === 31) return { name: 'Halloween', factor: 1.25 };
  if (m === 11 && dow === 4 && nth === 4) return { name: 'Thanksgiving', factor: 0.6 };
  if (m === 11 && dow === 3 && nth === 4 && day >= 21) return { name: 'Day before Thanksgiving', factor: 1.3 };
  if (m === 12 && day === 24) return { name: 'Christmas Eve', factor: 1.35 };
  if (m === 12 && day === 25) return { name: 'Christmas Day', factor: 0.4 };
  if (m === 1 && day === 1) return { name: "New Year's Day", factor: 1.2 };
  if (m === 2 && day === 14) return { name: "Valentine's Day", factor: 1.3 };
  if (m === 7 && day === 4) return { name: 'Fourth of July', factor: 1.15 };
  if (m === 5 && dow === 0 && nth === 2) return { name: "Mother's Day", factor: 1.3 };
  if (m === 6 && dow === 0 && nth === 3) return { name: "Father's Day", factor: 1.3 };
  return undefined;
}

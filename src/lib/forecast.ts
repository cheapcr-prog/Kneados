/**
 * Bake forecast: how many of one item to make on a given day.
 *
 * The number always comes from this math on real sales history. The AI layer only explains it.
 * Method, in order:
 *   1. Look at the last 8 same-weekday days (Saturdays predict Saturdays), newest weighted most.
 *   2. Undo things that made a past day unusual: rain, holidays, and selling out early.
 *   3. Nudge for the recent trend (last 4 weeks against the 4 before).
 *   4. Apply tomorrow's conditions: rain, holiday.
 *   5. Add pre-orders already placed, then a small safety buffer, and round up to a half tray.
 */

export interface ItemDayObservation {
  date: string;
  dow: number;
  sold: number;
  made: number;
  rain: boolean;
  /** 1 on a normal day. */
  holidayFactor: number;
}

export interface ForecastTarget {
  date: string;
  dow: number;
  rain: boolean;
  holidayFactor: number;
  holidayName?: string;
  /** Units already promised to pre-orders for that day. */
  preorderQty: number;
}

export interface ForecastPart {
  label: string;
  /** Units added or removed by this step. */
  delta: number;
}

export interface ItemForecast {
  /** Final number to make. */
  qty: number;
  /** Expected walk-in demand before pre-orders and buffer. */
  walkIn: number;
  /** Weighted average of comparable days. */
  base: number;
  parts: ForecastPart[];
  /** How many comparable days the base came from. */
  sampleDays: number;
  confidence: 'high' | 'medium' | 'low';
}

export const SAFETY_BUFFER = 0.05;
export const SELL_OUT_UPLIFT = 1.1;
const RECENCY = 0.85;
const MAX_SAMPLES = 8;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** How much rain changes sales at this shop, learned from its own history. 1 = no change. */
export function learnRainEffect(history: ItemDayObservation[]): number {
  const byDow = new Map<number, number[]>();
  for (const h of history) {
    if (h.rain || h.holidayFactor !== 1) continue;
    const list = byDow.get(h.dow) ?? [];
    list.push(h.sold);
    byDow.set(h.dow, list);
  }
  const ratios: number[] = [];
  for (const h of history) {
    if (!h.rain || h.holidayFactor !== 1) continue;
    const dry = byDow.get(h.dow);
    if (!dry || dry.length === 0) continue;
    const mean = dry.reduce((a, b) => a + b, 0) / dry.length;
    if (mean > 0) ratios.push(h.sold / mean);
  }
  // With fewer than 3 rainy days there isn't enough evidence, so assume a mild dip.
  if (ratios.length < 3) return 0.9;
  return clamp(ratios.reduce((a, b) => a + b, 0) / ratios.length, 0.6, 1.05);
}

/** Recent direction of sales: last 28 days against the 28 before. Clamped so one odd month can't swing it. */
export function learnTrend(history: ItemDayObservation[]): number {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 56) return 1;
  // Holidays are taken back out so one big day doesn't read as a trend.
  const normal = (h: ItemDayObservation) => h.sold / h.holidayFactor;
  const recent = sorted.slice(-28).reduce((a, h) => a + normal(h), 0);
  const prior = sorted.slice(-56, -28).reduce((a, h) => a + normal(h), 0);
  if (prior <= 0) return 1;
  return clamp(recent / prior, 0.9, 1.1);
}

/** Round up to the next half tray so the kitchen gets a number it can actually make. */
export function roundUpToBatch(n: number, batch = 6): number {
  if (n <= 0) return 0;
  return Math.ceil(n / batch) * batch;
}

export function forecastItem(history: ItemDayObservation[], target: ForecastTarget): ItemForecast {
  const rainEffect = learnRainEffect(history);
  const trend = learnTrend(history);

  const comparable = history
    .filter((h) => h.dow === target.dow && h.date < target.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_SAMPLES);

  let weightSum = 0;
  let total = 0;
  comparable.forEach((h, i) => {
    let demand = h.sold;
    // Sold out means real demand was higher than what the shop had to sell.
    if (h.made > 0 && h.sold >= h.made) demand *= SELL_OUT_UPLIFT;
    if (h.rain) demand /= rainEffect;
    if (h.holidayFactor !== 1) demand /= h.holidayFactor;
    const w = Math.pow(RECENCY, i);
    total += demand * w;
    weightSum += w;
  });

  const base = weightSum > 0 ? total / weightSum : 0;
  const parts: ForecastPart[] = [];
  let walkIn = base;

  // Only half the trend is applied: the weighted average already leans toward recent weeks.
  const trendFactor = 1 + (trend - 1) / 2;
  if (Math.abs(trendFactor - 1) >= 0.01) {
    const next = walkIn * trendFactor;
    parts.push({ label: trend > 1 ? 'Sales trending up' : 'Sales trending down', delta: next - walkIn });
    walkIn = next;
  }
  if (target.rain && Math.abs(rainEffect - 1) >= 0.01) {
    const next = walkIn * rainEffect;
    parts.push({ label: 'Rain in the forecast', delta: next - walkIn });
    walkIn = next;
  }
  if (target.holidayFactor !== 1) {
    const next = walkIn * target.holidayFactor;
    parts.push({ label: target.holidayName ?? 'Holiday', delta: next - walkIn });
    walkIn = next;
  }

  let qty = walkIn;
  if (target.preorderQty > 0) {
    parts.push({ label: 'Pre-orders already placed', delta: target.preorderQty });
    qty += target.preorderQty;
  }
  const buffered = qty * (1 + SAFETY_BUFFER);
  const rounded = roundUpToBatch(buffered);
  parts.push({ label: 'Safety buffer and tray rounding', delta: rounded - qty });

  const confidence = comparable.length >= 6 ? 'high' : comparable.length >= 3 ? 'medium' : 'low';
  return { qty: rounded, walkIn, base, parts, sampleDays: comparable.length, confidence };
}

/** One plain sentence a baker can read at 3am. */
export function explainForecast(itemName: string, dowName: string, f: ItemForecast): string {
  if (f.sampleDays === 0) return `No past ${dowName}s to learn from yet, so there's no number for ${itemName}.`;
  const bits = f.parts
    .filter((p) => p.label !== 'Safety buffer and tray rounding' && Math.abs(p.delta) >= 0.5)
    .map((p) => `${p.label.toLowerCase()} (${p.delta > 0 ? '+' : '-'}${Math.abs(Math.round(p.delta))})`);
  const why = bits.length ? `, adjusted for ${bits.join(', ')}` : '';
  return `Your last ${f.sampleDays} ${dowName}s averaged about ${Math.round(f.base)} ${itemName}${why}. Make ${f.qty}.`;
}

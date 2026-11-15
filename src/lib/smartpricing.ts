import type { MenuItem } from '../data/types';

/** Prices that move with the time of day and the day of the week. The owner sets the rules once. */
export interface PricingRules {
  /** Late in the day, donuts the shop has more of than it expects to sell go on sale. */
  markdown: { on: boolean; fromHour: number; pct: number; minExtra: number };
  /** During the quietest hours, drinks are cheaper to bring people in. */
  slow: { on: boolean; fromHour: number; toHour: number; pct: number };
  /** On Saturdays, Sundays and holidays, specialty items cost a little more each. */
  weekend: { on: boolean; cents: number };
}

export const DEFAULT_RULES: PricingRules = {
  // Off until the owner says yes: the briefing proposes it the first time there is something to mark down.
  markdown: { on: false, fromHour: 12, pct: 0.3, minExtra: 6 },
  slow: { on: true, fromHour: 10, toHour: 12, pct: 0.2 },
  weekend: { on: false, cents: 25 },
};

export interface PriceContext {
  /** 0 = Sunday. */
  dow: number;
  /** Hour of the day with minutes as a fraction, e.g. 12.5 for 12:30pm. */
  hour: number;
  holiday: boolean;
  closeHour: number;
  /** Per item: how many more are on the rack than the shop still expects to sell today. */
  extra: Record<string, number>;
}

export type PriceTag = 'markdown' | 'special' | 'weekend';

export interface LivePrice {
  cents: number;
  dozenCents?: number;
  /** The usual price. */
  baseCents: number;
  tag?: PriceTag;
  /** Short reason shown next to the price. */
  label?: string;
}

/** Prices end in 0 or 5 cents. */
export const round5 = (cents: number) => Math.round(cents / 5) * 5;

const isSpecialty = (item: MenuItem) => item.baked && (item.specialty || item.category === 'Specialty');

/** What one item costs right now under the rules. A markdown wins over a weekend price. */
export function priceNow(item: MenuItem, rules: PricingRules, ctx: PriceContext): LivePrice {
  const base: LivePrice = { cents: item.price, dozenCents: item.dozenPrice, baseCents: item.price };
  const { markdown, slow, weekend } = rules;
  if (markdown.on && item.baked && ctx.hour >= markdown.fromHour && ctx.hour < ctx.closeHour && (ctx.extra[item.id] ?? 0) >= markdown.minExtra) {
    return {
      ...base, cents: round5(item.price * (1 - markdown.pct)), dozenCents: item.dozenPrice && round5(item.dozenPrice * (1 - markdown.pct)),
      tag: 'markdown', label: `${Math.round(markdown.pct * 100)}% off until close`,
    };
  }
  if (slow.on && item.category === 'Drinks' && ctx.hour >= slow.fromHour && ctx.hour < slow.toHour) {
    return { ...base, cents: round5(item.price * (1 - slow.pct)), tag: 'special', label: `${Math.round(slow.pct * 100)}% off until ${hourLabel(slow.toHour)}` };
  }
  if (weekend.on && isSpecialty(item) && (ctx.dow === 0 || ctx.dow === 6 || ctx.holiday)) {
    return { ...base, cents: item.price + weekend.cents, tag: 'weekend', label: ctx.holiday ? 'Holiday price' : 'Weekend price' };
  }
  return base;
}

/** The menu as it should be charged right now, plus why each changed price changed. */
export function applyPrices(menu: MenuItem[], rules: PricingRules, ctx: PriceContext): { menu: MenuItem[]; live: Record<string, LivePrice> } {
  const live: Record<string, LivePrice> = {};
  const priced = menu.map((item) => {
    const p = (live[item.id] = priceNow(item, rules, ctx));
    return p.tag ? { ...item, price: p.cents, dozenPrice: p.dozenCents } : item;
  });
  return { menu: priced, live };
}

export function hourLabel(hour: number): string {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** The quietest run of `length` hours in a row that ends by `endBy`, from each hour's share of a day's sales. */
export function quietestWindow(shares: { hour: number; share: number }[], length: number, endBy: number): { fromHour: number; toHour: number; share: number } | undefined {
  const by = new Map(shares.map((s) => [s.hour, s.share]));
  let best: { fromHour: number; toHour: number; share: number } | undefined;
  for (const { hour } of shares) {
    const hours = Array.from({ length }, (_, i) => hour + i);
    if (hour + length > endBy || hours.some((h) => !by.has(h))) continue;
    const share = hours.reduce((a, h) => a + by.get(h)!, 0);
    if (!best || share < best.share) best = { fromHour: hour, toHour: hour + length, share };
  }
  return best;
}

export interface RackLine { id: string; name: string; onRack: number; stillNeeded: number; priceCents: number }

export interface MarkdownLine { id: string; name: string; extra: number; fromCents: number; toCents: number }

/** Which donuts a markdown would cover right now, most extra first, and what selling them all at the sale price brings in. */
export function markdownPlan(rack: RackLine[], rule: PricingRules['markdown']): { lines: MarkdownLine[]; recoverCents: number } {
  const lines = rack
    .map((r) => ({ id: r.id, name: r.name, extra: r.onRack - r.stillNeeded, fromCents: r.priceCents, toCents: round5(r.priceCents * (1 - rule.pct)) }))
    .filter((l) => l.extra >= rule.minExtra)
    .sort((a, b) => b.extra - a.extra);
  return { lines, recoverCents: lines.reduce((a, l) => a + l.extra * l.toCents, 0) };
}

/** The drink bar: what each cup takes out of stock, counted in scoops and fluid ounces. */

type Recipe = Record<string, number>;

export interface BarStock {
  supplyId: string;
  /** What was on the shelf when the day started. */
  start: number;
  /** What today's sales have taken out so far. */
  used: number;
  left: number;
}

/** Takes every drink sold today out of stock, ingredient by ingredient. Stock never shows below zero. */
export function barStock(startOfDay: Record<string, number>, recipes: Record<string, Recipe>, sold: Record<string, number>): BarStock[] {
  const used: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(sold)) {
    for (const [supplyId, amount] of Object.entries(recipes[itemId] ?? {})) used[supplyId] = (used[supplyId] ?? 0) + amount * qty;
  }
  return Object.entries(startOfDay).map(([supplyId, start]) => ({ supplyId, start, used: used[supplyId] ?? 0, left: Math.max(0, start - (used[supplyId] ?? 0)) }));
}

/** How many more of a drink the shelf can make. The ingredient that runs out first decides. `only` limits which ingredients count. */
export function cupsLeft(recipe: Recipe, left: Record<string, number>, only?: string[]): number {
  const parts = Object.entries(recipe).filter(([id, amount]) => amount > 0 && (!only || only.includes(id)));
  if (parts.length === 0) return 0;
  return Math.max(0, Math.min(...parts.map(([id, amount]) => Math.floor((left[id] ?? 0) / amount))));
}

/** Scoops print as whole numbers or halves, never as long decimals. */
export function amountLabel(n: number, unit: string): string {
  const rounded = Math.round(n * 10) / 10;
  const one = unit === 'scoops' ? 'scoop' : unit;
  return `${rounded.toLocaleString('en-US')} ${rounded === 1 ? one : unit}`;
}

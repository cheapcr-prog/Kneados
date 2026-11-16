/** Which drink each topping goes into. Drink id, then topping id, then how many cups of that drink get it. */
export type Toppings = Record<string, Record<string, number>>;

export interface ToppingLine {
  drink: string;
  addon: string;
  qty: number;
}

/** Drops toppings for drinks that left the order and never has more toppings than cups. */
export function clampToppings(t: Toppings, cart: Record<string, number>): Toppings {
  const out: Toppings = {};
  for (const [drink, adds] of Object.entries(t)) {
    const cups = cart[drink] ?? 0;
    for (const [addon, n] of Object.entries(adds)) {
      const qty = Math.min(n, cups);
      if (qty > 0) (out[drink] ??= {})[addon] = qty;
    }
  }
  return out;
}

export const toppingLines = (t: Toppings): ToppingLine[] => Object.entries(t).flatMap(([drink, adds]) => Object.entries(adds).filter(([, qty]) => qty > 0).map(([addon, qty]) => ({ drink, addon, qty })));

/** How many of each topping the order has in total, which is what gets charged. */
export function toppingTotals(t: Toppings): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of toppingLines(t)) out[l.addon] = (out[l.addon] ?? 0) + l.qty;
  return out;
}

const set = (t: Toppings, drink: string, addon: string, qty: number): Toppings => ({ ...t, [drink]: { ...t[drink], [addon]: qty } });

/** One tap on a drink's topping: one more cup gets it, and after every cup has it the next tap clears it. */
export function cycleTopping(t: Toppings, drink: string, addon: string, cups: number): Toppings {
  const now = t[drink]?.[addon] ?? 0;
  return set(t, drink, addon, now >= cups ? 0 : now + 1);
}

/** Puts a topping in the first drink that has a cup without it. Returns the same object when no drink has room. */
export function attachTopping(t: Toppings, addon: string, drinks: [string, number][]): Toppings {
  const room = drinks.find(([id, cups]) => (t[id]?.[addon] ?? 0) < cups);
  return room ? set(t, room[0], addon, (t[room[0]]?.[addon] ?? 0) + 1) : t;
}

/** Takes a topping out of one cup, from `drink` when given, otherwise from the last drink that has it. */
export function detachTopping(t: Toppings, addon: string, drink?: string): Toppings {
  const from = drink ?? Object.keys(t).reverse().find((d) => (t[d]?.[addon] ?? 0) > 0);
  if (!from || !(t[from]?.[addon] > 0)) return t;
  return set(t, from, addon, t[from][addon] - 1);
}

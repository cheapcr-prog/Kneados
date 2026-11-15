/** What it costs the shop in ingredients and packaging to make one of each menu item. */

interface PricedSupply {
  id: string;
  packSize: number;
  packCents: number;
}

/**
 * Cost of one unit in cents, from its recipe and the price of each supply.
 * `purchased` is for items the shop buys in finished, like a croissant from a bakery.
 */
export function unitCost(recipe: Record<string, number> | undefined, supplies: PricedSupply[], purchased = 0): number {
  const byId = Object.fromEntries(supplies.map((s) => [s.id, s]));
  let cents = purchased;
  for (const [supplyId, qty] of Object.entries(recipe ?? {})) {
    const s = byId[supplyId];
    if (s) cents += (qty * s.packCents) / s.packSize;
  }
  return cents;
}

/** Cost of every item on the menu, keyed by item id. */
export function menuCosts(itemIds: string[], recipes: Record<string, Record<string, number>>, supplies: PricedSupply[], purchased: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(itemIds.map((id) => [id, unitCost(recipes[id], supplies, purchased[id] ?? 0)]));
}

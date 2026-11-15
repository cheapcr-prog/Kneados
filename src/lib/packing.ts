import type { MenuItem, Order } from '../data/types';
import { boxCounts } from './pricing';

export type Counted = [itemId: string, qty: number][];

export interface PackPlan {
  /** One entry per dozen box, with what goes in it. */
  boxes: Counted[];
  /** Donuts and pastries that go in a paper bag. */
  bag: Counted;
  /** Drinks, which go in a cup holder. */
  cups: Counted;
}

/** How the counter packs an order: what goes in each box, in the bag, and in the cup holder. */
export function packPlan(order: Pick<Order, 'lines' | 'boxes'>, menu: Record<string, MenuItem>): PackPlan {
  const boxed = new Map<string, number>();
  for (const box of order.boxes ?? []) for (const id of box) boxed.set(id, (boxed.get(id) ?? 0) + 1);
  const bag: Counted = [];
  const cups: Counted = [];
  for (const line of order.lines) {
    const rest = line.qty - (boxed.get(line.itemId) ?? 0);
    if (rest <= 0) continue;
    (menu[line.itemId]?.category === 'Drinks' ? cups : bag).push([line.itemId, rest]);
  }
  return { boxes: (order.boxes ?? []).map(boxCounts), bag, cups };
}

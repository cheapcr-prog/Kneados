import type { MenuItem } from '../data/types';
import { linePrice } from './pricing';

export type OfferKind = 'dozen' | 'drink' | 'donut' | 'holes';

/** One thing worth offering the customer before they pay. */
export interface Offer {
  kind: OfferKind;
  itemId: string;
  /** How many to add. */
  qty: number;
  /** What it adds to the bill, in cents. */
  addCents: number;
  /** What the cashier says, or what the website shows. */
  ask: string;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface Line { itemId: string; qty: number }

/**
 * Up to `max` offers for a ticket, best first:
 * round 8 to 11 of one donut up to the dozen price, a coffee for a ticket with no drink,
 * a donut for a ticket that is only drinks, and a bag of holes for a small order.
 */
export function suggestOffers(lines: Line[], menu: Record<string, MenuItem>, soldOut: (id: string) => boolean = () => false, max = 2): Offer[] {
  const live = lines.filter((l) => l.qty > 0 && menu[l.itemId]);
  if (live.length === 0) return [];
  const offers: Offer[] = [];
  const has = (id: string) => live.some((l) => l.itemId === id);
  const can = (id: string) => !!menu[id] && !soldOut(id);
  const drinks = live.filter((l) => menu[l.itemId].category === 'Drinks').reduce((a, l) => a + l.qty, 0);
  const donuts = live.filter((l) => menu[l.itemId].baked).reduce((a, l) => a + l.qty, 0);

  const toDozen = live
    .map((l) => ({ l, item: menu[l.itemId], short: 12 - (l.qty % 12) }))
    .filter(({ item, short }) => item.dozenPrice !== undefined && short >= 1 && short <= 4 && !soldOut(item.id))
    .map(({ l, item, short }) => ({ item, short, addCents: linePrice(item, l.qty + short) - linePrice(item, l.qty) }))
    .sort((a, b) => a.addCents - b.addCents)[0];
  if (toDozen) {
    const { item, short, addCents } = toDozen;
    offers.push({
      kind: 'dozen', itemId: item.id, qty: short, addCents,
      ask: addCents <= 0 ? `Make it a dozen? ${short} more ${item.name} cost nothing extra at the dozen price.` : `Make it a dozen? ${short} more ${item.name} for ${usd(addCents)}.`,
    });
  }
  if (donuts > 0 && drinks === 0 && can('coffee')) {
    offers.push({ kind: 'drink', itemId: 'coffee', qty: 1, addCents: menu.coffee.price, ask: `Add a ${menu.coffee.name.toLowerCase()} for ${usd(menu.coffee.price)}?` });
  }
  if (drinks > 0 && donuts === 0 && can('glazed')) {
    offers.push({ kind: 'donut', itemId: 'glazed', qty: 1, addCents: menu.glazed.price, ask: `Add a ${menu.glazed.name.toLowerCase()} donut for ${usd(menu.glazed.price)}?` });
  }
  if (donuts > 0 && donuts < 6 && !has('holes') && can('holes')) {
    offers.push({ kind: 'holes', itemId: 'holes', qty: 1, addCents: menu.holes.price, ask: `Add a bag of donut holes for ${usd(menu.holes.price)}?` });
  }
  return offers.slice(0, max);
}

export interface Opportunity {
  tickets: number;
  /** Tickets that would have been shown each offer. */
  eligible: Record<OfferKind, number>;
  /** What every eligible ticket saying yes would add, in cents. */
  fullCents: number;
}

/** How many of a day's counter tickets an offer would have been made on, and what the offers add up to. */
export function upsellOpportunity(tickets: Line[][], menu: Record<string, MenuItem>): Opportunity {
  const eligible: Record<OfferKind, number> = { dozen: 0, drink: 0, donut: 0, holes: 0 };
  let fullCents = 0;
  for (const t of tickets) {
    const first = suggestOffers(t, menu, undefined, 1)[0];
    if (!first) continue;
    eligible[first.kind] += 1;
    fullCents += first.addCents;
  }
  return { tickets: tickets.length, eligible, fullCents };
}

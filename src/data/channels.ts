import { DELIVERY_APPS, appPrice, deliveryCents, deliveryNet, giftCode, type DeliveryApp, type GiftCard, type Invoice, type WholesaleAccount } from '../lib/channels';
import { addDays, dowOf } from '../lib/dates';
import { MENU, MENU_BY_ID, SHOP } from './shop';
import type { Order, OrderLine } from './types';

/** Example accounts. A real shop adds its own cafés, offices and schools. */
export const WHOLESALE: WholesaleAccount[] = [
  { id: 'w-cafe', name: 'Second Street Coffee', kind: 'Café', contact: 'Priya N.', email: 'orders@secondstreetcoffee.example', discount: 0.3, termsDays: 15, days: [1, 2, 3, 4, 5, 6, 0], readyAt: '05:15', standing: { glazed: 24, chocolate: 12, maple: 12, oldfashioned: 12 } },
  { id: 'w-office', name: 'Harbor Freight Forwarding', kind: 'Office', contact: 'Dan K.', email: 'frontdesk@harborff.example', discount: 0.15, termsDays: 7, days: [1, 5], readyAt: '07:30', standing: { glazed: 24, sprinkle: 12, jelly: 12 } },
  { id: 'w-market', name: 'Belmont Corner Market', kind: 'Market', contact: 'Luis A.', email: 'luis@belmontmarket.example', discount: 0.35, termsDays: 30, days: [2, 4, 6], readyAt: '05:45', standing: { glazed: 36, chocolate: 12, sugar: 12, fritter: 12 } },
  { id: 'w-school', name: 'Wilson High Booster Club', kind: 'School', contact: 'Coach Reyes', email: 'boosters@wilsonhigh.example', discount: 0.25, termsDays: 30, days: [5], readyAt: '06:30', standing: { glazed: 60, sprinkle: 24, chocolate: 24 } },
];

export const WHOLESALE_BY_ID = Object.fromEntries(WHOLESALE.map((a) => [a.id, a]));

/** Menu price of every item, by id. */
export const PRICE: Record<string, number> = Object.fromEntries(MENU.map((m) => [m.id, m.price]));

/** The markup the demo shop puts on its delivery app menus. */
export const DEFAULT_APP_MARKUP = 0.2;

const at = (date: string, h: number, m: number) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

export function wholesaleLines(account: WholesaleAccount): OrderLine[] {
  return Object.entries(account.standing).map(([itemId, qty]) => ({ itemId, qty, lineCents: Math.round(qty * (PRICE[itemId] ?? 0) * (1 - account.discount)) }));
}

/** A delivery app order at the app's menu prices, with the app's cut worked out. */
export function deliveryOrder(app: DeliveryApp, customer: string, items: [string, number][], pickupAt: Date, status: Order['status'], markup = DEFAULT_APP_MARKUP): Omit<Order, 'id' | 'number' | 'createdAt'> {
  const info = DELIVERY_APPS.find((a) => a.id === app)!;
  const lines = items.map(([itemId, qty]) => ({ itemId, qty, lineCents: appPrice(MENU_BY_ID[itemId].price, markup) * qty }));
  const subtotal = lines.reduce((a, l) => a + l.lineCents, 0);
  // The app collects the sales tax and sends it in for the shop, so it is not part of the payout.
  return {
    source: 'online', channel: app, customerName: `${customer} (${info.name})`, pickupAt: pickupAt.toISOString(), lines, subtotal, tax: 0, tip: 0, total: subtotal,
    payment: 'app', status, feeCents: deliveryNet(subtotal, info.commission).feeCents,
  };
}

const SAMPLE_BASKETS: [string, [string, number][]][] = [
  ['Jamie R.', [['glazed', 6], ['coffee', 2]]],
  ['Sam T.', [['fritter', 2], ['icedcoffee', 2]]],
  ['Avery P.', [['sprinkle', 4], ['custard', 2], ['milk', 2]]],
  ['Morgan D.', [['maple', 3], ['chocolate', 3], ['coffee', 1]]],
  ['Chris L.', [['cinnamon', 2], ['croissant', 1], ['icedcoffee', 1]]],
];

/** A made-up basket for the "send a test order" button. */
export const sampleBasket = (n: number) => SAMPLE_BASKETS[n % SAMPLE_BASKETS.length];

/** Orders that are on the books when the demo starts: today's and tomorrow's wholesale runs and a few delivery app orders. */
export function buildChannelOrders(today: string, now: Date): Order[] {
  const orders: Order[] = [];
  const placed = new Date(now.getTime() - 20 * 3600_000).toISOString();
  let number = 950;
  for (const date of [today, addDays(today, 1)]) {
    for (const acct of WHOLESALE.filter((a) => a.days.includes(dowOf(date)))) {
      const [h, m] = acct.readyAt.split(':').map(Number);
      const ready = at(date, h, m);
      const lines = wholesaleLines(acct);
      const subtotal = lines.reduce((a, l) => a + l.lineCents, 0);
      number += 1;
      orders.push({
        id: `ws-${acct.id}-${date}`, number, source: 'online', channel: 'wholesale', createdAt: placed, pickupAt: ready.toISOString(), customerName: acct.name,
        lines, subtotal, tax: 0, tip: 0, total: subtotal, payment: 'invoice', status: ready < now ? 'done' : 'new',
      });
    }
  }
  const open = at(today, SHOP.openHour, 0);
  const close = at(today, SHOP.closeHour, 0);
  const live = now >= open && now.getTime() + 40 * 60_000 <= close.getTime();
  const seeded: [DeliveryApp, number, Date, Order['status']][] = [
    ['doordash', 0, at(today, 7, 40), 'done'],
    ['ubereats', 1, at(today, 8, 55), 'done'],
    ['doordash', 2, at(today, 10, 20), 'done'],
    ['ubereats', 3, live ? new Date(now.getTime() + 12 * 60_000) : at(today, 11, 35), 'new'],
  ];
  for (const [app, basket, when, status] of seeded) {
    const [customer, items] = sampleBasket(basket);
    number += 1;
    if (!live && when > now) continue;
    const o = deliveryOrder(app, customer, items, when, when < now ? 'done' : status);
    orders.push({ ...o, id: `dl-${number}`, number, createdAt: new Date(when.getTime() - 18 * 60_000).toISOString() });
  }
  return orders;
}

/** Four weeks of invoices per account. One old one is left unpaid so the overdue state shows. */
export function seedInvoices(today: string): Invoice[] {
  const thisSunday = addDays(today, -dowOf(today));
  const out: Invoice[] = [];
  for (const acct of WHOLESALE) {
    const perDelivery = deliveryCents(acct, PRICE);
    for (let w = 4; w >= 1; w--) {
      const weekStart = addDays(thisSunday, -7 * w);
      const issued = addDays(weekStart, 7);
      const due = addDays(issued, acct.termsDays);
      const paid = w > 1 && !(acct.id === 'w-office' && w === 3);
      out.push({ id: `inv-${acct.id}-${weekStart}`, accountId: acct.id, weekStart, deliveries: acct.days.length, totalCents: perDelivery * acct.days.length, issued, due, paid });
    }
  }
  return out.sort((a, b) => b.issued.localeCompare(a.issued));
}

export function seedGiftCards(today: string): GiftCard[] {
  const mk = (seed: number, name: string, loaded: number, balance: number, daysAgo: number): GiftCard => ({ code: giftCode(seed), name, loadedCents: loaded, balanceCents: balance, sold: addDays(today, -daysAgo) });
  return [
    mk(11, 'Tina W.', 2500, 2500, 2),
    mk(12, 'Coach Reyes', 5000, 3175, 9),
    mk(13, 'Grandma Jo', 2000, 650, 21),
    mk(14, 'Harbor Dental staff', 10000, 10000, 5),
    mk(15, 'Marcus L.', 1000, 0, 34),
    mk(16, 'Teacher gift', 1500, 1500, 12),
  ];
}

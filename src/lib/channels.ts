/** Sales that do not come over the counter: delivery apps, wholesale accounts and gift cards. */

export type DeliveryApp = 'doordash' | 'ubereats' | 'grubhub';

export interface DeliveryAppInfo {
  id: DeliveryApp;
  name: string;
  /** Share of each order the app keeps. Example rates: every shop negotiates its own plan. */
  commission: number;
  color: string;
}

export const DELIVERY_APPS: DeliveryAppInfo[] = [
  { id: 'doordash', name: 'DoorDash', commission: 0.25, color: '#ef4444' },
  { id: 'ubereats', name: 'Uber Eats', commission: 0.3, color: '#16a34a' },
  { id: 'grubhub', name: 'Grubhub', commission: 0.2, color: '#f97316' },
];

/** Menu price on a delivery app: the shop price plus a markup, rounded up to the next 5 cents. */
export function appPrice(cents: number, markup: number): number {
  return Math.ceil((cents * (1 + markup)) / 5 - 1e-9) * 5;
}

/** What the shop keeps from a delivery order after the app's commission. */
export function deliveryNet(subtotalCents: number, commission: number): { feeCents: number; netCents: number } {
  const feeCents = Math.round(subtotalCents * commission);
  return { feeCents, netCents: subtotalCents - feeCents };
}

/** The markup that makes a delivery order pay the shop the same as a counter sale. */
export function breakEvenMarkup(commission: number): number {
  return commission / (1 - commission);
}

// Wholesale

export interface WholesaleAccount {
  id: string;
  name: string;
  kind: 'Café' | 'Office' | 'Market' | 'School';
  contact: string;
  email: string;
  /** Share off menu price. */
  discount: number;
  /** Days until an invoice is due. */
  termsDays: number;
  /** Days of the week they get a delivery, 0 = Sunday. */
  days: number[];
  /** Local time the order must be ready, HH:MM. */
  readyAt: string;
  /** What goes out on each of those days: item id to quantity. */
  standing: Record<string, number>;
}

/** Dollar value of one delivery at the account's wholesale price. */
export function deliveryCents(account: WholesaleAccount, price: Record<string, number>): number {
  return Object.entries(account.standing).reduce((a, [id, qty]) => a + Math.round(qty * (price[id] ?? 0) * (1 - account.discount)), 0);
}

export interface Invoice {
  id: string;
  accountId: string;
  /** First day (Sunday) of the week it bills. */
  weekStart: string;
  deliveries: number;
  totalCents: number;
  /** Date the invoice went out and the date it is due. */
  issued: string;
  due: string;
  paid: boolean;
}

export type InvoiceState = 'paid' | 'open' | 'overdue';

export function invoiceState(inv: Invoice, today: string): InvoiceState {
  if (inv.paid) return 'paid';
  return inv.due < today ? 'overdue' : 'open';
}

// Gift cards

export interface GiftCard {
  code: string;
  /** Who it was bought for. */
  name: string;
  loadedCents: number;
  balanceCents: number;
  /** Date sold (YYYY-MM-DD). */
  sold: string;
}

/** A code that is easy to read out loud: no 0, O, 1 or I. */
export function giftCode(seed: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = (seed * 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[n % alphabet.length];
    n = (Math.imul(n, 1103515245) + 12345) >>> 0;
    if (i === 3) out += '-';
  }
  return out;
}

/** Takes as much of a bill as the card can cover. */
export function redeemGift(card: GiftCard, billCents: number): { card: GiftCard; appliedCents: number; stillOwedCents: number } {
  const appliedCents = Math.max(0, Math.min(card.balanceCents, billCents));
  return { card: { ...card, balanceCents: card.balanceCents - appliedCents }, appliedCents, stillOwedCents: billCents - appliedCents };
}

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.+)$/, '$1-$2');

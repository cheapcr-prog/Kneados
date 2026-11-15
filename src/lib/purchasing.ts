import { addDays, dowOf } from './dates';
import type { SupplyPlan } from './supplies';

export interface Supplier {
  /** Matches the supplier name on each supply. */
  name: string;
  rep: string;
  /** Where purchase orders are emailed. Empty for a store the shop drives to. */
  email: string;
  phone: string;
  account: string;
  /** Days of the week they deliver, 0 = Sunday. */
  deliveryDays: number[];
  minOrderCents: number;
  /** True: KneadOS sends the order by itself. False: the owner approves each one first. */
  autoSend: boolean;
  /** A store the shop picks up from, so the order is a shopping list, not an email. */
  pickup?: boolean;
}

export interface POLine {
  supplyId: string;
  name: string;
  packs: number;
  packLabel: string;
  /** Total quantity in the supply's own unit. */
  qty: number;
  unit: string;
  cents: number;
  /** Added before it was strictly due, to reach the supplier's minimum order. */
  early: boolean;
}

export type POStatus = 'draft' | 'sent' | 'received';

export interface PurchaseOrder {
  id: string;
  /** Set when the order is saved, e.g. 1001. */
  number?: number;
  supplier: string;
  to: string;
  lines: POLine[];
  totalCents: number;
  /** Date (YYYY-MM-DD) the order was drafted. */
  date: string;
  /** Date it should arrive. */
  expected: string;
  status: POStatus;
  sentAt?: string;
  receivedAt?: string;
  /** True when KneadOS sent it without asking. */
  auto: boolean;
  /** True when the total is still under the supplier's minimum. */
  belowMinimum: boolean;
}

const lineOf = (p: SupplyPlan, early: boolean): POLine => ({
  supplyId: p.supply.id, name: p.supply.name, packs: p.packs, packLabel: p.supply.packLabel,
  qty: p.packs * p.supply.packSize, unit: p.supply.unit, cents: p.cents, early,
});

/** The first day on or after `from` that the supplier delivers. */
export function nextDelivery(supplier: Pick<Supplier, 'deliveryDays'>, from: string): string {
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    if (supplier.deliveryDays.includes(dowOf(day))) return day;
  }
  return from;
}

/**
 * Drafts today's purchase order for one supplier from the supply plans.
 * Everything that must be ordered today goes on it. If that is under the supplier's minimum,
 * things that are due in the next few days are pulled forward until the minimum is met.
 * Returns null when nothing from this supplier needs ordering today.
 */
export function draftPO(supplier: Supplier, plans: SupplyPlan[], today: string): PurchaseOrder | null {
  const mine = plans.filter((p) => p.supply.supplier === supplier.name && p.packs > 0);
  const due = mine.filter((p) => p.status === 'order-now');
  if (due.length === 0) return null;
  const lines = due.map((p) => lineOf(p, false));
  let total = lines.reduce((a, l) => a + l.cents, 0);
  for (const p of mine.filter((x) => x.status === 'order-soon')) {
    if (total >= supplier.minOrderCents) break;
    lines.push(lineOf(p, true));
    total += p.cents;
  }
  const lead = Math.max(...due.map((p) => p.supply.leadDays));
  return {
    id: `po-${today}-${supplier.name}-${lines.map((l) => l.supplyId).join('+')}`,
    supplier: supplier.name, to: supplier.email, lines, totalCents: total, date: today,
    expected: nextDelivery(supplier, addDays(today, lead)),
    status: 'draft', auto: false, belowMinimum: total < supplier.minOrderCents,
  };
}

const sumQty = (orders: PurchaseOrder[]) => {
  const out: Record<string, number> = {};
  for (const po of orders) for (const l of po.lines) out[l.supplyId] = (out[l.supplyId] ?? 0) + l.qty;
  return out;
};

/** Quantity of each supply that is ordered and not here yet. */
export const onOrder = (orders: PurchaseOrder[]) => sumQty(orders.filter((p) => p.status === 'sent'));
/** Quantity of each supply that has been delivered and put away. */
export const delivered = (orders: PurchaseOrder[]) => sumQty(orders.filter((p) => p.status === 'received'));

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The email a supplier receives. Plain text, so it reads the same in any inbox. */
export function poEmail(shop: { name: string; address: string; phone: string }, supplier: Supplier, po: PurchaseOrder, dayLabel: string): { subject: string; body: string } {
  const number = po.number ? `PO-${po.number}` : 'Purchase order';
  const rows = po.lines.map((l) => `  ${String(l.packs).padStart(2)} x ${l.packLabel}, ${l.name}: ${dollars(l.cents)}`);
  const lines = [
    `Hi${supplier.rep ? ` ${supplier.rep.split(' ')[0]}` : ''},`,
    '',
    `Please send the order below to ${shop.name}.`,
    '',
    ...rows,
    '',
    `Estimated total: ${dollars(po.totalCents)}`,
    `Deliver by: ${dayLabel}`,
    `Deliver to: ${shop.address}`,
    ...(supplier.account ? [`Account: ${supplier.account}`] : []),
    '',
    `Please reply to confirm, or call ${shop.phone} if anything is out of stock.`,
    '',
    'Thank you,',
    shop.name,
  ];
  return {
    subject: `${number} from ${shop.name}${supplier.account ? ` (account ${supplier.account})` : ''}`,
    body: lines.join('\n'),
  };
}

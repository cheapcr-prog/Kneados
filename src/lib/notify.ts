import { timeLabel } from './dates';

/** Texts a customer gets about a pickup order. Kept short so each fits in one SMS. */

const first = (name?: string) => (name?.trim().split(/\s+/)[0] ? `Hi ${name.trim().split(/\s+/)[0]}, ` : '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function orderReceivedText(shop: string, order: { number: number; customerName?: string; pickupAt?: string }): string {
  const when = order.pickupAt ? ` for pickup at ${timeLabel(order.pickupAt)}` : '';
  return `${shop}: ${cap(`${first(order.customerName)}we got order #${order.number}${when}.`)} We will text you when it is packed.`;
}

export function orderReadyText(shop: string, order: { number: number; customerName?: string }): string {
  return `${shop}: ${cap(`${first(order.customerName)}order #${order.number} is packed and ready at the counter.`)} See you soon!`;
}

import type { Dozens, EventOrder, Fundraiser } from '../lib/events';
import { DEFAULT_EVENT_RULES, quote } from '../lib/events';
import { addDays } from '../lib/dates';

/** Example bookings so the screen is not empty. A real shop's come from its booking page. */
export function seedEvents(today: string): EventOrder[] {
  const mk = (id: string, name: string, phone: string, occasion: string, inDays: number, time: string, dozens: Dozens, extra: Partial<EventOrder> = {}): EventOrder => {
    const q = quote(dozens, DEFAULT_EVENT_RULES);
    return { id, orderId: `ev:${id}`, name, phone, occasion, date: addDays(today, inDays), time, dozens, totalCents: q.totalCents, depositCents: q.depositCents, balancePaid: false, ...extra };
  };
  return [
    mk('seed-shower', 'Linh Nguyen', '5625550142', 'Baby shower', 0, '10:30', { classic: 3, assorted: 2 }),
    mk('seed-dental', 'Harbor Dental', '5625550177', 'Staff breakfast', 1, '07:30', { assorted: 4 }, { balancePaid: true }),
    mk('seed-band', 'Wilson High Band Boosters', '5625550119', 'Car wash fundraiser', 3, '08:00', { classic: 8 }, { fundraiser: 'WILSONBAND' }),
    mk('seed-quince', 'Maya Ortiz', '5625550163', 'Quinceañera', 6, '11:00', { classic: 4, assorted: 4, premium: 4 }),
  ];
}

/** Example fundraisers: one running, one finished and waiting on its check, one coming up. */
export function seedFundraisers(today: string): Fundraiser[] {
  return [
    { id: 'f-band', code: 'WILSONBAND', org: 'Wilson High Band Boosters', contact: 'Coach Reyes', start: addDays(today, -4), end: addDays(today, 3), share: 0.2, goalCents: 50000, priorSalesCents: 96400, priorOrders: 41 },
    { id: 'f-pta', code: 'LOWELLPTA', org: 'Lowell Elementary PTA', contact: 'Dana Whitfield', start: addDays(today, -16), end: addDays(today, -9), share: 0.2, goalCents: 40000, priorSalesCents: 231500, priorOrders: 97 },
    { id: 'f-soccer', code: 'SHORESC', org: 'Belmont Shore Soccer Club', contact: 'Marco Diaz', start: addDays(today, 12), end: addDays(today, 18), share: 0.15, goalCents: 30000, priorSalesCents: 0, priorOrders: 0 },
  ];
}

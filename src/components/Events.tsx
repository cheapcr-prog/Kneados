import { useEffect, useMemo } from 'react';
import { seedEvents, seedFundraisers } from '../data/events';
import { useShopState } from '../data/local';
import { SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { Order } from '../data/types';
import { longDate, timeLabel } from '../lib/dates';
import { DEFAULT_EVENT_RULES, activeFundraiser, eventBoxes, eventLines, fundTotals, normalizeFundCode, quote, type Dozens, type EventOrder, type EventRules, type FundTotals, type Fundraiser } from '../lib/events';
import { money } from '../lib/money';

interface Saved {
  events: EventOrder[];
  funds: Fundraiser[];
  rules: EventRules;
}

export type LiveEvent = EventOrder & { balanceCents: number; pickedUp: boolean; paid: boolean };
export type LiveFund = Fundraiser & FundTotals;
export interface Booking { name: string; phone: string; occasion: string; date: string; time: string; dozens: Dozens; fundCode?: string }

export const clockLabel = (t: string) => timeLabel(`2026-01-01T${t}:00`);
const pickupDate = (e: Pick<EventOrder, 'date' | 'time'>) => {
  const [y, mo, d] = e.date.split('-').map(Number);
  const [h, m] = e.time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

function useSaved() {
  const today = useDemo().state.today;
  return useShopState<Saved>('events', () => ({ events: seedEvents(today), funds: seedFundraisers(today), rules: DEFAULT_EVENT_RULES }));
}

/** Event bookings and fundraisers: the list, the money, and the actions the owner and the booking page use. */
export function useEvents() {
  const demo = useDemo();
  const { today, orders } = demo.state;
  const [saved, setSaved] = useSaved();

  const events = useMemo((): LiveEvent[] => {
    const status = new Map(orders.filter((o) => o.id.startsWith('ev:')).map((o) => [o.id, o.status]));
    return saved.events
      .map((e) => {
        const pickedUp = status.get(e.orderId) === 'done';
        // Handing the boxes over is when the rest is collected.
        const paid = e.balancePaid || pickedUp;
        return { ...e, pickedUp, paid, balanceCents: paid ? 0 : e.totalCents - e.depositCents };
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [saved.events, orders]);

  const funds = useMemo((): LiveFund[] => saved.funds.map((f) => ({ ...f, ...fundTotals(f, orders, today) })), [saved.funds, orders, today]);

  const book = (b: Booking): EventOrder => {
    const q = quote(b.dozens, saved.rules);
    const id = `e${Date.now().toString(36)}`;
    const fund = b.fundCode ? activeFundraiser(b.fundCode, saved.funds, today) : undefined;
    const event: EventOrder = {
      id, orderId: `ev:${id}`, name: b.name.trim(), phone: b.phone.replace(/\D/g, ''), occasion: b.occasion.trim(), date: b.date, time: b.time, dozens: b.dozens,
      totalCents: q.totalCents, depositCents: q.depositCents, balancePaid: false, ...(fund ? { fundraiser: fund.code } : {}),
    };
    setSaved((s) => ({ ...s, events: [...s.events, event] }));
    demo.sendTexts([{ to: event.phone, body: `${SHOP.name}: you're booked. ${q.dozens} dozen for ${longDate(b.date)} at ${clockLabel(b.time)}. Deposit paid ${money(q.depositCents)}, ${money(q.balanceCents)} due at pickup.` }]);
    return event;
  };

  return {
    events, funds, rules: saved.rules, today,
    upcoming: events.filter((e) => e.date >= today && !e.pickedUp),
    book,
    fundFor: (code: string) => activeFundraiser(code, saved.funds, today),
    payBalance: (id: string) => setSaved((s) => ({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, balancePaid: true } : e)) })),
    setRules: (patch: Partial<EventRules>) => setSaved((s) => ({ ...s, rules: { ...s.rules, ...patch } })),
    addFund: (f: Pick<Fundraiser, 'org' | 'contact' | 'code' | 'share' | 'goalCents' | 'start' | 'end'>) =>
      setSaved((s) => ({ ...s, funds: [...s.funds, { ...f, code: normalizeFundCode(f.code), id: `f${Date.now().toString(36)}`, priorSalesCents: 0, priorOrders: 0 }] })),
    markPaid: (id: string) => setSaved((s) => ({ ...s, funds: s.funds.map((f) => (f.id === id ? { ...f, paidOut: today } : f)) })),
  };
}

/**
 * Keeps an order on the books for every event booking.
 * That is how a booking reaches the bake plan the day before and the packing queue on the day.
 */
export function EventSync() {
  const demo = useDemo();
  const [saved] = useSaved();
  const { orders } = demo.state;
  const { syncOrders } = demo;
  useEffect(() => {
    const now = new Date();
    const existing = new Map(orders.filter((o) => o.id.startsWith('ev:')).map((o) => [o.id, o]));
    const wanted: Order[] = saved.events.map((e, i) => {
      const at = pickupDate(e);
      return {
        id: e.orderId, number: 600 + i, source: 'online', channel: 'catering', createdAt: existing.get(e.orderId)?.createdAt ?? now.toISOString(), pickupAt: at.toISOString(),
        customerName: e.occasion ? `${e.name} (${e.occasion})` : e.name, lines: eventLines(e.dozens), boxes: eventBoxes(e.dozens),
        subtotal: e.totalCents, tax: 0, tip: 0, total: e.totalCents, payment: 'online', depositCents: e.depositCents,
        status: existing.get(e.orderId)?.status ?? (at < now ? 'done' : 'new'), ...(e.fundraiser ? { fundraiser: e.fundraiser } : {}),
      };
    });
    const sig = (list: Order[]) => list.map((o) => `${o.id}|${o.total}|${o.pickupAt}`).sort().join(';');
    if (sig(wanted) !== sig([...existing.values()])) syncOrders('ev:', wanted);
  }, [saved.events, orders, syncOrders]);
  return null;
}

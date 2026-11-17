/**
 * Pizza mode's brain: one snapshot of the whole shop (facts), the decisions worth the owner's attention, and plain answers.
 * Every number is worked out by logic.ts from the shop's data. This file only decides what matters and words it.
 */
import { useMemo } from 'react';
import { DOW_NAMES, addDays, dowOf } from '../lib/dates';
import { money, moneyShort } from '../lib/money';
import { DRIVERS, PIZZA_SHIFTS, PIZZA_SHOP, PIZZA_STAFF_BY_ID, SIZES, SPECIALTY_BY_ID, ZONES, nextBigDay, pizzaDayFactor, type SizeId } from './data';
import { APP_FEE_SHARE, MINUTE, doughPlan, draftOrders, lateBy, menuMargins, planRuns, piesIn, pnl, quoteTime, stockPlan, unitCost, type DraftPO, type PizzaOrder, type RunPlan, type StockLine } from './logic';
import type { PizzaDemo } from './store';
import { invoiceState } from '../lib/channels';
import { estimate, mailingList, namedAudience, results, tracking } from './mail';

export type PizzaArea = 'Money' | 'Make line' | 'Delivery' | 'Dough' | 'Stock' | 'Team' | 'Menu' | 'Customers' | 'Game day' | 'Waste' | 'Sales channels' | 'Marketing';

export interface PizzaDecision {
  id: string;
  area: PizzaArea;
  urgency: 'now' | 'today' | 'week';
  title: string;
  why: string;
  action: string;
  then: string;
  impactCents?: number;
  per?: 'today' | 'a month' | 'this mailing';
  /** What approving does in the demo. */
  kind: 'call' | 'dispatch' | 'dough' | 'po' | 'driver' | 'campaign' | 'price' | 'note' | 'invoice' | 'mail';
  payload?: { runIndex?: number; supplier?: string; phones?: string[]; invoiceId?: string };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const at = (iso: string) => new Date(iso).getTime();

export function usePizzaBrain(demo: PizzaDemo, nowMs: number) {
  const { state, history, tomorrow, forecastFor } = demo;
  return useMemo(() => {
    const now = new Date(nowMs);
    const hour = now.getHours() + now.getMinutes() / 60;
    const active = state.orders.filter((o) => o.status !== 'done' && !(o.scheduled && fireSoon(o, nowMs) === false));
    const live = state.orders.filter((o) => !o.scheduled || o.promisedAt.slice(0, 10) === state.today);
    const drivers = DRIVERS.map((d) => state.drivers[d.id]);
    const freeIn = Math.min(...drivers.filter((d) => d.status !== 'off').map((d) => (d.status === 'in' ? 0 : Math.max(0, (at(d.backAt ?? now.toISOString()) - nowMs) / MINUTE))), 60);
    const cooks = PIZZA_SHIFTS.filter((s) => PIZZA_STAFF_BY_ID[s.staffId].role === 'cook' && s.start <= Math.max(17, hour) && s.end > Math.max(17, hour)).length || 1;
    const quotePickup = quoteTime(active, 1, { cooks });
    const quoteDelivery = quoteTime(active, 1, { cooks, zone: 'B', driversFreeInMin: freeIn });
    const late = active.filter((o) => !o.scheduled).map((o) => ({ o, by: lateBy(o, nowMs) })).filter((x) => x.by > 0).sort((a, b) => b.by - a.by);
    const runs = planRuns(state.orders, drivers, nowMs);

    // Dough made tonight is for two days out (48 hour cold ferment).
    const doughDate = addDays(state.today, 2);
    const recent = history.slice(-28);
    const garlicRate = recent.reduce((a, h) => a + (h.sides['garlic-knots'] ?? 0), 0) / Math.max(1, recent.reduce((a, h) => a + h.orders, 0));
    const dough = doughPlan(forecastFor(doughDate), garlicRate);
    const tomorrowF = forecastFor(tomorrow);
    const week = Array.from({ length: 7 }, (_, i) => forecastFor(addDays(state.today, i + 1)));
    const stock = stockPlan(history, week, state.onHand, state.today, hour);
    const sentTo = new Set(state.pos.filter((p) => p.status === 'sent').map((p) => p.supplier));
    const pos = draftOrders(stock).filter((p) => !sentTo.has(p.supplier));
    const last30 = history.slice(-30);
    const money30 = pnl(last30);
    const margins = menuMargins();
    const sum = (f: (h: (typeof history)[number]) => number, days = last30) => days.reduce((a, h) => a + f(h), 0);
    const orders30 = sum((h) => h.orders);
    const appOrders = sum((h) => h.channels.doordash + h.channels.ubereats);
    const tossed14 = history.slice(-14).reduce((a, h) => a + SIZES.reduce((b, s) => b + Math.max(0, h.doughMade[s.id] - h.doughUsed[s.id]), 0), 0);
    const big = nextBigDay(state.today);
    const pre = state.orders.filter((o) => o.scheduled && o.promisedAt.slice(0, 10) === big.date);
    const lapsed = state.members.filter((m) => m.lastVisit && dayDiff(m.lastVisit, state.today) >= 30);

    // Drivers needed at tomorrow's peak: about 17% of a day's deliveries land in the busiest hour,
    // and one driver handles about 3.5 deliveries an hour with stacked runs.
    const peakDeliveries = Math.round(tomorrowF.deliveries * 0.17);
    const driversNeeded = Math.ceil(peakDeliveries / 3.5);
    const driversScheduled = DRIVERS.length;

    const facts = {
      mode: 'pizza',
      shop: PIZZA_SHOP.name,
      now: { dayName: DOW_NAMES[now.getDay()], time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) },
      tonight: {
        ordersSoFar: state.earlier.orders + live.filter((o) => !o.scheduled).length,
        salesSoFarCents: state.earlier.salesCents + live.filter((o) => !o.scheduled).reduce((a, o) => a + o.subtotal, 0),
        onTheLine: { toMake: active.filter((o) => o.status === 'new' && !o.scheduled).length, inOven: active.filter((o) => o.status === 'oven').length, readyWaiting: active.filter((o) => o.status === 'ready').length, outForDelivery: active.filter((o) => o.status === 'out').length },
        quoteMinutes: { pickup: quotePickup.minutes, delivery: quoteDelivery.minutes },
        lateOrders: late.map(({ o, by }) => ({ number: o.number, minutesLate: by, status: o.status, fulfillment: o.fulfillment, customer: o.customer.name })),
      },
      drivers: drivers.map((d) => ({ name: PIZZA_STAFF_BY_ID[d.id].name, status: d.status, backInMinutes: d.status === 'out' && d.backAt ? Math.max(0, Math.round((at(d.backAt) - nowMs) / MINUTE)) : 0, runsTonight: d.runs, milesTonight: d.miles, tipsTonightCents: d.tipsCents })),
      suggestedRuns: runs.map((r) => ({ driver: PIZZA_STAFF_BY_ID[r.driverId].name, orders: r.orderIds.map((id) => state.orders.find((o) => o.id === id)?.number), miles: r.miles, minutes: r.minutes })),
      doughTonight: { forDate: dough.forDate, forDay: DOW_NAMES[dowOf(dough.forDate)], ballsToMake: dough.balls, madeSoFar: state.doughMade, flourLb: Math.round(dough.flourLb), mixerBatches: dough.mixes, reasons: dough.reasons },
      tomorrow: { date: tomorrow, dayName: DOW_NAMES[dowOf(tomorrow)], event: pizzaDayFactor(tomorrow)?.name ?? null, rain: state.rain, orders: tomorrowF.orders, pizzas: tomorrowF.pizzas, deliveries: tomorrowF.deliveries, wings: tomorrowF.wings, peakHourDeliveries: peakDeliveries, driversNeededAtPeak: driversNeeded, driversScheduled },
      stock: stock.filter((l) => l.reorder || l.daysLeft < 4).map((l) => ({ name: l.name, onHand: Math.round(l.onHand * 10) / 10, unit: l.unit, usePerDay: Math.round(l.perDay * 10) / 10, daysLeft: Math.round(l.daysLeft * 10) / 10, runsOut: l.runsOut ?? null, supplier: l.supplier, nextDeliveryInDays: l.nextDeliveryIn })),
      purchaseOrdersReady: pos.map((p) => ({ supplier: p.supplier, cents: p.cents, items: p.lines.length, belowMinimum: p.belowMinimum })),
      gameDay: { name: big.name, date: big.date, preorders: pre.length, pies: pre.reduce((a, o) => a + piesIn(o), 0), depositsCents: pre.reduce((a, o) => a + (o.depositCents ?? 0), 0), balanceDueCents: pre.reduce((a, o) => a + o.total - (o.depositCents ?? 0), 0) },
      last30Days: {
        salesCents: money30.revenue, foodCostShare: Math.round(money30.foodShare * 1000) / 1000, laborShare: Math.round(money30.laborShare * 1000) / 1000, profitCents: money30.profit,
        orders: orders30, avgTicketCents: Math.round(money30.revenue / Math.max(1, orders30)),
        deliveryAppOrders: appOrders, deliveryAppFeesCents: money30.appFees, ownDeliveries: sum((h) => h.deliveries),
        avgDeliveryMinutes: Math.round(sum((h) => h.avgDeliveryMin * h.deliveries) / Math.max(1, sum((h) => h.deliveries))),
        lateDeliveryShare: Math.round((sum((h) => h.lateDeliveries) / Math.max(1, sum((h) => h.deliveries))) * 1000) / 1000,
        doughBallsTossedLast14Days: tossed14,
        bestSellers: Object.entries(last30.reduce<Record<string, number>>((a, h) => { for (const [k, n] of Object.entries(h.bySpecialty)) a[k] = (a[k] ?? 0) + n; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ name: id === 'byo' ? 'Build your own' : SPECIALTY_BY_ID[id].name, pizzas: n })),
      },
      menuFoodCost: margins.filter((m) => m.size === 'L').map((m) => ({ pizza: `Large ${m.name}`, priceCents: m.priceCents, foodCostCents: m.costCents, costShare: Math.round(m.costShare * 1000) / 1000 })),
      postcards: (() => {
        const foodShare = Math.round(money30.foodShare * 1000) / 1000;
        const list = mailingList(state.today);
        const recentIds = new Set(state.campaigns.filter((c) => c.sentOn > addDays(state.today, -30)).flatMap((c) => c.recipients));
        const lapsedToMail = namedAudience('lapsed', list, state.today, recentIds).length;
        const next = estimate({ audience: 'lapsed', pieces: lapsedToMail, size: '4x6', mailClass: 'first', offerId: 'knots', avgTicketCents: Math.round(money30.revenue / Math.max(1, orders30)), foodShare, history: state.campaigns.filter((c) => c.sentOn <= addDays(state.today, -21)) });
        return {
          mailings: state.campaigns.map((c) => { const r = results(c, foodShare); return { name: c.name, audience: c.audience, sentOn: c.sentOn, cards: c.pieces, costCents: c.totalCents, ordersWithCode: r.redeemed, responseRate: Math.round(r.rate * 1000) / 1000, salesCents: r.salesCents, profitAfterMailCents: r.profitCents, newCustomers: r.newCustomers, orderedAgainSince: r.orderedAgain, status: tracking(c, state.today).status }; }),
          nextSuggested: { audience: 'customers who stopped ordering (45 days to a year)', cards: lapsedToMail, costCents: next.costCents, expectedOrders: next.expected, expectedProfitCents: next.netCents, responseRateUsed: Math.round(next.responseRate * 1000) / 1000 },
        };
      })(),
      rewards: { members: state.members.length, lapsed30Days: lapsed.length, rewardsWaiting: state.members.reduce((a, m) => a + m.rewards, 0) },
      companyInvoices: state.invoices.map((i) => ({ number: i.number, company: i.company, po: i.po ?? null, forWhat: i.memo, deliveredOn: i.serviceDate, due: i.due, totalCents: i.totalCents, status: invoiceState(i, state.today), paidOn: i.paidOn ?? null, remindersSent: i.reminders.length })),
      // Orders the AI took tonight on calls and by text, so the owner can ask how it is doing.
      aiOrderTaker: (() => { const ai = state.orders.filter((o) => o.ai); return { ordersTonight: ai.length, byCall: ai.filter((o) => o.ai?.surface === 'call').length, byText: ai.filter((o) => o.ai?.surface === 'text').length, salesCents: ai.reduce((a, o) => a + o.subtotal, 0), payLinksSent: ai.filter((o) => o.payment === 'online').length }; })(),
      deliveryZones: ZONES.map((z) => ({ zone: z.id, feeCents: z.feeCents, driveMinutes: z.driveMinutes })),
    };

    const decisions = decide({ facts, late, runs, dough, pos, stock, margins, tossed14, lapsed: lapsed.map((m) => m.phone), state, tomorrowF, driversNeeded, driversScheduled, peakDeliveries });
    return { facts, decisions, quotePickup, quoteDelivery, late, runs, dough, stock, pos, tomorrowF, week, money30, margins, big, pre, cooks, freeIn };
  }, [state, history, tomorrow, forecastFor, nowMs]);
}

function fireSoon(o: PizzaOrder, now: number) {
  return at(o.promisedAt) - now < 90 * MINUTE;
}
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

interface DecideIn {
  facts: { tomorrow: { dayName: string; event: string | null; deliveries: number }; last30Days: { deliveryAppFeesCents: number; deliveryAppOrders: number; orders: number }; postcards: { nextSuggested: { cards: number; costCents: number; expectedOrders: number; expectedProfitCents: number; responseRateUsed: number } } };
  late: { o: PizzaOrder; by: number }[];
  runs: RunPlan[];
  dough: ReturnType<typeof doughPlan>;
  pos: DraftPO[];
  stock: StockLine[];
  margins: ReturnType<typeof menuMargins>;
  tossed14: number;
  lapsed: string[];
  state: PizzaDemo['state'];
  tomorrowF: { wings: number };
  driversNeeded: number;
  driversScheduled: number;
  peakDeliveries: number;
}

function decide(d: DecideIn): PizzaDecision[] {
  const out: PizzaDecision[] = [];
  for (const { o, by } of d.late.slice(0, 2)) {
    out.push({
      id: `late-${o.id}`, area: 'Make line', urgency: 'now', kind: 'call',
      title: `Text ${o.customer.name} that #${o.number} is running ${by} min behind`,
      why: `Promised ${new Date(o.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, still ${o.status === 'new' ? 'waiting to be made' : o.status === 'oven' ? 'in the oven' : o.status === 'ready' ? 'waiting for a driver' : 'on the road'}. A heads-up text keeps the review from going bad.`,
      action: 'Send the text', then: 'KneadOS texts the customer a new time and adds a $3 credit to their Dough Rewards.',
    });
  }
  d.runs.forEach((r, i) => {
    // Only runs that can leave now: a free driver and every pie boxed.
    if (r.leaveAt > Date.now() + 60_000 || r.orderIds.some((id) => d.state.orders.find((o) => o.id === id)?.status !== 'ready')) return;
    const nums = r.orderIds.map((id) => `#${d.state.orders.find((o) => o.id === id)?.number}`).join(' and ');
    const name = PIZZA_STAFF_BY_ID[r.driverId].name.split(' ')[0];
    out.push({ id: `run-${r.orderIds.join('-')}`, area: 'Delivery', urgency: 'now', kind: 'dispatch', payload: { runIndex: i }, title: `Send ${name} with ${nums}`, why: `${r.why}. About ${r.minutes} min out and back, ${money(r.mileageCents)} mileage.`, action: 'Dispatch', then: `${name} gets the route on their phone and each customer gets an on-the-way text.` });
  });
  const made = d.state.doughMade;
  const short = SIZES.filter((s) => made[s.id] < d.dough.balls[s.id]);
  if (short.length) {
    out.push({
      id: 'dough', area: 'Dough', urgency: 'today', kind: 'dough',
      title: `Make ${SIZES.map((s) => `${d.dough.balls[s.id]} ${s.label.toLowerCase()}`).join(', ')} dough balls tonight`,
      why: `They are for ${DOW_NAMES[dowOf(d.dough.forDate)]} after a 48 hour cold ferment. ${d.dough.reasons.slice(0, 2).join('. ')}. That is ${Math.round(d.dough.flourLb)} lb of flour in ${d.dough.mixes} mixer batches.`,
      action: 'Send to the kitchen', then: 'The kitchen screen shows the batch sheet with grams for every ingredient.',
    });
  }
  for (const p of d.pos) {
    const soon = p.lines.filter((l) => l.runsOut && l.daysLeft < p.deliversIn + 1).map((l) => l.name.toLowerCase());
    out.push({
      id: `po-${p.supplier}`, area: 'Stock', urgency: soon.length ? 'today' : 'week', kind: 'po', payload: { supplier: p.supplier },
      title: `Order ${moneyShort(p.cents)} from ${p.supplier}`,
      why: `${p.lines.length} item${p.lines.length > 1 ? 's' : ''} below what the coming week's forecast needs by recipe${soon.length ? `; ${soon.slice(0, 3).join(', ')} run${soon.length === 1 ? 's' : ''} out before the next truck otherwise` : ''}.${p.belowMinimum ? ' Below their order minimum, so KneadOS pulls forward items due next.' : ''}`,
      action: 'Send the order', then: `The purchase order is emailed to ${p.supplier} and stock goes up when it is checked in.`,
    });
  }
  if (d.driversNeeded > d.driversScheduled) {
    out.push({ id: 'drivers', area: 'Team', urgency: 'today', kind: 'driver', title: `Add a driver for ${d.facts.tomorrow.dayName} 5 to 8pm`, why: `Forecast ${d.facts.tomorrow.deliveries} deliveries${d.facts.tomorrow.event ? ` (${d.facts.tomorrow.event})` : ''}, about ${d.peakDeliveries} in the busiest hour. One driver covers about 3.5 an hour, so ${d.driversNeeded} are needed and ${d.driversScheduled} are scheduled.`, action: 'Offer the shift', then: 'The open shift is texted to off drivers; first to accept gets it.' });
  }
  const wingsOnHand = d.state.onHand.wings ?? 0;
  const wingsLb = d.tomorrowF.wings * 1.1;
  if (wingsLb > wingsOnHand * 0.8) {
    out.push({ id: 'wings', area: 'Game day', urgency: 'today', kind: 'note', title: `Thaw ${Math.ceil(wingsLb - wingsOnHand * 0.5)} lb of wings for tomorrow`, why: `Tomorrow needs about ${Math.round(wingsLb)} lb (${d.tomorrowF.wings} orders of 10). ${Math.round(wingsOnHand)} lb are on hand and frozen wings need a day in the walk-in.`, action: 'Add to prep list', then: 'It goes on tonight\'s close-down prep list.' });
  }
  if (d.facts.last30Days.deliveryAppFeesCents > 0) {
    const fees = d.facts.last30Days.deliveryAppFeesCents;
    const avgFee = Math.round(fees / Math.max(1, d.facts.last30Days.deliveryAppOrders));
    out.push({ id: 'apps', area: 'Sales channels', urgency: 'week', kind: 'campaign', title: 'Move delivery-app regulars to your own site', why: `DoorDash and Uber Eats took ${moneyShort(fees)} in the last 30 days, about ${money(avgFee)} an order (${pct(APP_FEE_SHARE.doordash ?? 0)} commission). Moving one in five of those orders to your site keeps about ${moneyShort(fees / 5)} a month.`, impactCents: Math.round(fees / 5), per: 'a month', action: 'Print bag inserts', then: 'Every app order gets a card with a QR code: $3 off and double rewards points when you order direct.' });
  }
  if (d.tossed14 > 20) {
    const ballCents = unitCost('dough-M');
    out.push({ id: 'dough-waste', area: 'Waste', urgency: 'week', kind: 'note', title: 'Use leftover dough balls for garlic bread before they turn', why: `${d.tossed14} dough balls were made and not used in the last 14 days. Day-3 dough is still good for garlic bread, which uses half a ball.`, impactCents: Math.round(d.tossed14 * (30 / 14) * ballCents), per: 'a month', action: 'Add the rule', then: 'The make line uses the oldest dough for garlic bread first.' });
  }
  const worst = [...d.margins].filter((m) => m.size === 'L').sort((a, b) => b.costShare - a.costShare)[0];
  if (worst && worst.costShare > 0.28) {
    const target = Math.ceil((worst.costCents / 0.27) / 100) * 100 - 1;
    out.push({ id: `price-${worst.id}`, area: 'Menu', urgency: 'week', kind: 'price', title: `Raise the large ${worst.name} to ${money(target)}`, why: `Its toppings and cheese cost ${money(worst.costCents)}, which is ${pct(worst.costShare)} of the ${money(worst.priceCents)} price. Most of the menu sits under 27%.`, action: 'Change the price', then: 'The new price goes to the website, the register and the delivery apps together.' });
  }
  // A company invoice past due: one email usually gets it paid.
  for (const inv of d.state.invoices.filter((i) => invoiceState(i, d.state.today) === 'overdue' && !i.reminders.includes(d.state.today))) {
    const late = dayDiff(inv.due, d.state.today);
    out.push({
      id: `invoice-${inv.id}`, area: 'Money', urgency: 'today', kind: 'invoice', payload: { invoiceId: inv.id }, impactCents: inv.totalCents, per: 'today',
      title: `Remind ${inv.company} about invoice ${inv.number}`,
      why: `${money(inv.totalCents)} for ${inv.memo.toLowerCase()} on ${inv.serviceDate} was due ${late} day${late === 1 ? '' : 's'} ago${inv.reminders.length ? `. The last reminder went out ${inv.reminders[inv.reminders.length - 1]}` : ''}.`,
      action: 'Send the reminder', then: `${inv.email} gets a past-due email with the pay link. If it is still open in a week, call ${inv.contact}.`,
    });
  }
  const pc = d.facts.postcards.nextSuggested;
  if (pc.cards >= 30 && pc.expectedProfitCents > 0 && !d.state.campaigns.some((c) => c.audience === 'lapsed' && c.sentOn > addDays(d.state.today, -30))) {
    out.push({ id: 'postcards-lapsed', area: 'Marketing', urgency: 'week', kind: 'mail', title: `Mail postcards to ${pc.cards} customers who stopped ordering`, why: `${pc.cards} past delivery customers have not ordered in 45 days or more. Cards cost ${moneyShort(pc.costCents)} through Lob; at ${Math.round(pc.responseRateUsed * 1000) / 10}% coming back (your last mailing to this group), that is about ${pc.expectedOrders} orders and ${moneyShort(pc.expectedProfitCents)} profit after the mail.`, impactCents: pc.expectedProfitCents, per: 'this mailing', action: 'Plan the mailing', then: 'Opens Postcards with the list, offer, photo and words filled in. Nothing mails until you approve the cost.' });
  }
  if (d.lapsed.length) {
    out.push({ id: 'winback', area: 'Customers', urgency: 'week', kind: 'campaign', payload: { phones: d.lapsed }, title: `Text ${d.lapsed.length} Dough Rewards members who stopped ordering`, why: `They have not ordered in 30 days or more. A free garlic bread with their next pizza costs about $1.40 in food.`, action: 'Send the texts', then: 'Each gets a text with a one-time code, good for two weeks.' });
  }
  return out;
}

const URGENCY = { now: 0, today: 1, week: 2 };
export const sortDecisions = (ds: PizzaDecision[]) => [...ds].sort((a, b) => URGENCY[a.urgency] - URGENCY[b.urgency]);

/** The few lines at the top of the owner's briefing. */
export function briefingLines(f: ReturnType<typeof usePizzaBrain>['facts']): string[] {
  const t = f.tonight;
  const lines = [
    `${t.ordersSoFar} orders and ${moneyShort(t.salesSoFarCents)} so far today. ${t.onTheLine.toMake} to make, ${t.onTheLine.inOven} in the oven, ${t.onTheLine.readyWaiting} ready, ${t.onTheLine.outForDelivery} on the road.`,
    `Quoting ${t.quoteMinutes.pickup} min for pickup and ${t.quoteMinutes.delivery} min for delivery right now${t.lateOrders.length ? `; ${t.lateOrders.length} order${t.lateOrders.length > 1 ? 's are' : ' is'} running late` : ', and nothing is running late'}.`,
    `Tomorrow is ${f.tomorrow.dayName}${f.tomorrow.event ? ` (${f.tomorrow.event})` : ''}${f.tomorrow.rain ? ' with rain' : ''}: about ${f.tomorrow.orders} orders, ${f.tomorrow.pizzas.S + f.tomorrow.pizzas.M + f.tomorrow.pizzas.L} pizzas and ${f.tomorrow.deliveries} deliveries.`,
    `${f.gameDay.name} on ${new Date(f.gameDay.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${f.gameDay.preorders} pre-orders for ${f.gameDay.pies} pies, ${moneyShort(f.gameDay.depositsCents)} in deposits taken.`,
  ];
  return lines;
}

/** Built-in answers for when Claude is not connected. Simple keyword routing over the same facts. */
export function ruleAnswer(q: string, f: ReturnType<typeof usePizzaBrain>['facts'], decisions: PizzaDecision[]): { text: string; ids: string[] } {
  const s = q.toLowerCase();
  const pick = (area: PizzaArea[]) => decisions.filter((d) => area.includes(d.area));
  const say = (text: string, ds: PizzaDecision[] = []) => ({ text, ids: ds.map((d) => d.id) });
  if (/invoice|owe|unpaid|past due|overdue|catering|office lunch|receivable/.test(s)) {
    const open = f.companyInvoices.filter((i) => i.status !== 'paid');
    const late = open.filter((i) => i.status === 'overdue');
    const total = open.reduce((a, i) => a + i.totalCents, 0);
    if (!open.length) return say('Every company invoice is paid.');
    return say(`${open.length} company invoice${open.length === 1 ? ' is' : 's are'} unpaid, ${money(total)} in all. ${late.length ? `${late.map((i) => `${i.company} owes ${money(i.totalCents)} on invoice ${i.number}, due ${i.due}`).join('; ')}. That one is past due, so send a reminder today.` : 'None are past due yet.'}`, pick(['Money']));
  }
  if (/postcard|mail|flyer|marketing|eddm|lob\b/.test(s)) {
    const m = f.postcards.mailings;
    const n = f.postcards.nextSuggested;
    const lines = m.map((c) => `"${c.name}": ${c.cards} cards for ${money(c.costCents)}, ${c.ordersWithCode} orders with the code (${Math.round(c.responseRate * 1000) / 10}%), ${money(c.salesCents)} in sales, ${money(c.profitAfterMailCents)} profit after the mail${c.newCustomers ? `, ${c.newCustomers} new customers` : ''}`);
    return say(`${lines.join('. ')}. Next: ${n.cards} customers who stopped ordering could get a card for ${money(n.costCents)}, about ${n.expectedOrders} orders expected.`, pick(['Marketing']));
  }
  if (/dough|ball|flour|mix/.test(s)) {
    const b = f.doughTonight.ballsToMake;
    return say(`Make ${b.S} small, ${b.M} medium and ${b.L} large dough balls tonight for ${f.doughTonight.forDay}. That is ${f.doughTonight.flourLb} lb of flour in ${f.doughTonight.mixerBatches} mixer batches. ${f.doughTonight.reasons[0]}.`, pick(['Dough']));
  }
  if (/driver|deliver|dispatch|late|route/.test(s)) {
    const runs = f.suggestedRuns.map((r) => `${r.driver.split(' ')[0]} takes #${r.orders.join(' and #')}`).join('; ');
    return say(`Delivery quote is ${f.tonight.quoteMinutes.delivery} min. ${runs ? `Next runs: ${runs}.` : 'No delivery is waiting for a driver.'} Last 30 days averaged ${f.last30Days.avgDeliveryMinutes} min door to door with ${Math.round(f.last30Days.lateDeliveryShare * 100)}% late.`, pick(['Delivery', 'Make line', 'Team']));
  }
  if (/order|stock|run out|cheese|pepperoni|supplier|inventory/.test(s)) {
    const low = f.stock.slice(0, 4).map((l) => `${l.name} (${l.daysLeft} days left)`).join(', ');
    return say(`${low ? `Running low: ${low}.` : 'Nothing is running low this week.'} ${f.purchaseOrdersReady.length ? `Orders ready to send: ${f.purchaseOrdersReady.map((p) => `${p.supplier} ${moneyShort(p.cents)}`).join(', ')}.` : ''}`, pick(['Stock']));
  }
  if (/money|profit|losing|cost|margin|price/.test(s)) {
    const l = f.last30Days;
    return say(`Last 30 days: ${moneyShort(l.salesCents)} in sales, food cost ${Math.round(l.foodCostShare * 100)}%, labor ${Math.round(l.laborShare * 100)}%, about ${moneyShort(l.profitCents)} profit after rent. The biggest leak you can fix is delivery-app commission: ${moneyShort(l.deliveryAppFeesCents)} this month.`, pick(['Sales channels', 'Menu', 'Waste']));
  }
  if (/game|sunday|football|pre-?order|tomorrow/.test(s)) {
    return say(`Tomorrow: about ${f.tomorrow.orders} orders and ${f.tomorrow.deliveries} deliveries. ${f.gameDay.name}: ${f.gameDay.preorders} pre-orders for ${f.gameDay.pies} pies so far, ${moneyShort(f.gameDay.balanceDueCents)} still due at pickup.`, pick(['Game day', 'Team']));
  }
  const top = decisions.slice(0, 3);
  return say(top.length ? `First: ${top[0].title.toLowerCase()}. ${top[0].why}` : 'Everything is on track right now.', top);
}

export const PIZZA_SUGGESTED = ['What should I do first?', 'How much dough tonight?', 'Are deliveries running late?', 'What needs ordering?', 'Where am I losing money?', 'Are we ready for game day?', 'Which companies owe us money?', 'Did the postcards pay off?'];
export type PizzaBrain = ReturnType<typeof usePizzaBrain>;
export { SPECIALTY_BY_ID };
export type { SizeId };

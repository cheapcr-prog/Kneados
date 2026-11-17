import { describe, expect, it } from 'vitest';
import { addDays, dowOf } from '../lib/dates';
import { INVENTORY, SIDE_BY_ID, SPECIALTIES } from './data';
import { BUSY_PIES, DEAL_MAX_UNITS, MAX_COST_SHARE, MAX_OFF_SHARE, applyDeals, cleanDeals, dealsNow, hourlyDemand, roomToDiscount, suggestDeals, type Deal } from './deals';
import { buildPizzaHistory, configFor, forecastDay, pizzaFoodCost, pizzaPrice, stockPlan, totals, type Line } from './logic';
import { ticketFor } from './orderbot';
import { DEFAULT_FRAUD } from '../lib/fraud';

const today = '2026-11-17';
const history = buildPizzaHistory(today);
const week = Array.from({ length: 7 }, (_, i) => forecastDay(history, addDays(today, i + 1)));
const stockWith = (onHand: Record<string, number>) => stockPlan(history, week, onHand, today, 18);
const suggest = (onHand: Record<string, number> = {}) => suggestDeals({ stock: stockWith(onHand), history, dow: dowOf(today) });
const side = (sideId: string, qty = 1): Line => ({ kind: 'side', sideId, qty, unitCents: SIDE_BY_ID[sideId].cents });
const large = (qty = 1): Line => { const config = configFor('pepperoni', 'L'); return { kind: 'pizza', config, specialtyId: 'pepperoni', qty, unitCents: pizzaPrice(config, 'pepperoni').cents }; };

describe('deals from supply', () => {
  it('finds stock that will spoil before it sells, and says how much', () => {
    const romaine = stockWith({}).find((s) => s.id === 'romaine')!;
    const shelf = INVENTORY.find((i) => i.id === 'romaine')!.shelfDays;
    const deal = suggest().find((d) => d.id === 'use-romaine')!;
    expect(deal.sideIds).toEqual(['caesar']);
    expect(deal.why).toContain(`${shelf} day shelf life`);
    // The waste figure is the surplus at what the shop pays for it.
    const surplus = romaine.onHand - romaine.perDay * shelf;
    expect(deal.savesCents).toBe(Math.round(surplus * (2640 / 12)));
    expect(deal.pitch).toContain('Caesar Salad is');
  });

  it('makes no deal when the stock will sell in time', () => {
    expect(suggest({ romaine: 9 }).some((d) => d.id === 'use-romaine')).toBe(false);
    expect(suggest({ wings: 46 }).some((d) => d.id === 'use-wings')).toBe(false);
  });

  it('covers every item that uses the surplus, with one price that is safe on all of them', () => {
    const deal = suggest({ wings: 400 }).find((d) => d.id === 'use-wings')!;
    expect(deal.sideIds?.sort()).toEqual(['wings-bbq', 'wings-buffalo']);
    expect(deal.title).toContain('all wings');
    for (const id of deal.sideIds!) expect(deal.offCents).toBeLessThanOrEqual(roomToDiscount(SIDE_BY_ID[id].cents, SIDE_BY_ID[id].costCents));
  });
});

describe('deals from demand', () => {
  it('finds the quiet stretch of this weekday and compares it with the busiest', () => {
    const deal = suggest().find((d) => d.kind === 'slow-hours')!;
    const demand = hourlyDemand(history, dowOf(today));
    const at = (h: number) => demand[h - 11];
    expect(deal.toHour! - deal.fromHour!).toBe(2);
    expect((at(deal.fromHour!) + at(deal.fromHour! + 1)) / 2).toBeLessThan(Math.max(...demand) * 0.45);
    expect(deal.pickupOnly).toBe(true);
    expect(deal.size).toBe('L');
  });
});

describe('the limits every deal is held to', () => {
  it('never takes more than the share allowed, and never pushes food cost past the floor', () => {
    for (const deal of suggest({ wings: 400 })) {
      const items = deal.sideIds
        ? deal.sideIds.map((id) => ({ price: SIDE_BY_ID[id].cents, cost: SIDE_BY_ID[id].costCents }))
        : SPECIALTIES.map((s) => ({ price: s.prices.L, cost: pizzaFoodCost(configFor(s.id, 'L')) }));
      for (const i of items) {
        expect(deal.offCents).toBeLessThanOrEqual(i.price * MAX_OFF_SHARE);
        expect(i.cost / (i.price - deal.offCents)).toBeLessThanOrEqual(MAX_COST_SHARE + 1e-9);
      }
      expect(deal.offCents % 50).toBe(0);
      expect(deal.offCents).toBeGreaterThan(0);
    }
  });

  it('gives no room when an item is already thin', () => {
    expect(roomToDiscount(1000, 450)).toBe(0);
    expect(roomToDiscount(1000, 100)).toBe(250);
  });
});

describe('when a deal runs and what it takes off', () => {
  const slow: Deal = { id: 'slow-14', kind: 'slow-hours', title: 't', why: 'w', pitch: 'p', offCents: 400, size: 'L', pickupOnly: true, fromHour: 14, toHour: 16 };
  const caesar: Deal = { id: 'use-romaine', kind: 'use-up', title: 't', why: 'w', pitch: 'p', offCents: 200, sideIds: ['caesar'] };

  it('runs only inside its hours, and pauses when the kitchen is busy', () => {
    expect(dealsNow([slow, caesar], 13.9).map((d) => d.id)).toEqual(['use-romaine']);
    expect(dealsNow([slow, caesar], 14).map((d) => d.id)).toEqual(['slow-14', 'use-romaine']);
    expect(dealsNow([slow, caesar], 16).map((d) => d.id)).toEqual(['use-romaine']);
    expect(dealsNow([slow, caesar], 15, BUSY_PIES)).toEqual([]);
  });

  it('comes off each unit, up to a few per order, and only on pickup when it says so', () => {
    expect(applyDeals([side('caesar', 2), large()], [caesar, slow], 'pickup')).toEqual({ cents: 800, applied: [{ id: 'use-romaine', title: 't', cents: 400 }, { id: 'slow-14', title: 't', cents: 400 }] });
    expect(applyDeals([large(2)], [slow], 'delivery').cents).toBe(0);
    expect(applyDeals([side('caesar', 9)], [caesar], '').cents).toBe(DEAL_MAX_UNITS * 200);
    expect(applyDeals([side('garlic-knots')], [caesar], 'pickup').cents).toBe(0);
  });

  it('prices the ticket with the deal taken off before tax', () => {
    const order = { items: [{ kind: 'side' as const, specialty: '', size: '' as const, crust: '' as const, sauce: '' as const, cheese: '' as const, add: [], remove: [], notes: [], side: 'caesar', qty: 1 }], fulfillment: 'pickup' as const, name: '', address: '', payment: '' as const, note: '' };
    const shop = { quote: () => 15, out: [], open: true, fraud: DEFAULT_FRAUD, deals: [caesar] };
    const t = ticketFor(order, { phone: '', known: false }, shop);
    expect(t.deals).toEqual([{ id: 'use-romaine', title: 't', cents: 200 }]);
    expect(t.totals).toEqual(totals([side('caesar')], { discountCents: 200 }));
    expect(t.totals.subtotal).toBe(SIDE_BY_ID.caesar.cents - 200);
  });
});

describe('deals sent to the phone line are checked again', () => {
  it('keeps a real suggestion as it is', () => {
    const real = suggest({ wings: 400 });
    expect(cleanDeals(JSON.parse(JSON.stringify(real))).map((d) => [d.id, d.offCents])).toEqual(real.map((d) => [d.id, d.offCents]));
  });

  it('drops a deal that is too deep, names an unknown item, or is not a deal at all', () => {
    const ok = { id: 'use-romaine', kind: 'use-up', title: 't', why: 'w', pitch: 'p', offCents: 200, sideIds: ['caesar'] };
    expect(cleanDeals([ok])).toHaveLength(1);
    expect(cleanDeals([{ ...ok, offCents: 900 }])).toEqual([]);
    expect(cleanDeals([{ ...ok, sideIds: ['lobster'] }])).toEqual([]);
    expect(cleanDeals([{ ...ok, pitch: '' }])).toEqual([]);
    expect(cleanDeals([{ id: 'slow-14', kind: 'slow-hours', title: 't', why: 'w', pitch: 'p', offCents: 5000, size: 'L', fromHour: 14, toHour: 16 }])).toEqual([]);
    expect(cleanDeals('free pizza')).toEqual([]);
    expect(cleanDeals(Array.from({ length: 20 }, () => ok))).toHaveLength(6);
  });
});

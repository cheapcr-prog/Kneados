import { describe, expect, it } from 'vitest';
import { SIZE_BY_ID } from './data';
import { buildPizzaHistory, configFor, doughPlan, forecastDay, packLines, packValue, PACKS, pizzaPrice, pizzaUsage, planRuns, quoteTime, route, stockPlan, toppingCents, totals, upsells, zoneFor, type DriverState, type PizzaOrder } from './logic';
import { invoiceFor, reminderEmail, validEmail } from './logic';
import { invoiceState } from '../lib/channels';

const today = '2026-11-15';

describe('pizza prices', () => {
  it('charges a topping in full on the whole pie and half on a half', () => {
    expect(toppingCents('L', 'pepperoni', 'whole')).toBe(SIZE_BY_ID.L.toppingCents);
    expect(toppingCents('L', 'pepperoni', 'left')).toBe(Math.ceil(SIZE_BY_ID.L.toppingCents / 2 / 5) * 5);
  });
  it('builds up a build-your-own price', () => {
    const p = pizzaPrice({ size: 'M', crust: 'pan', sauce: 'red', cheese: 'extra', toppings: { sausage: 'whole', bacon: 'left' } });
    expect(p.cents).toBe(1599 + 300 + 200 + 200 + Math.ceil(275 / 2 / 5) * 5);
  });
  it('does not charge again for a specialty\'s own toppings, only extras', () => {
    const base = configFor('supreme', 'L');
    expect(pizzaPrice(base, 'supreme').cents).toBe(2799);
    expect(pizzaPrice({ ...base, toppings: { ...base.toppings, jalapeno: 'right' } }, 'supreme').cents).toBe(2799 + 125);
  });
  it('taxes food and the delivery fee', () => {
    const t = totals([{ kind: 'side', sideId: 'soda-can', qty: 4, unitCents: 225 }], { zone: 'A' });
    expect(t.subtotal).toBe(900);
    expect(t.deliveryFee).toBe(299);
    expect(t.tax).toBe(Math.round(1199 * 0.1025));
  });
});

describe('recipes', () => {
  it('uses half the topping on a half', () => {
    const whole = pizzaUsage({ size: 'M', crust: 'hand', sauce: 'red', cheese: 'regular', toppings: { pepperoni: 'whole' } });
    const half = pizzaUsage({ size: 'M', crust: 'hand', sauce: 'red', cheese: 'regular', toppings: { pepperoni: 'left' } });
    expect(half.pepperoni).toBeCloseTo(whole.pepperoni / 2);
    expect(whole['dough-M']).toBe(1);
    expect(whole['box-M']).toBe(1);
  });
  it('uses a gluten-free shell instead of a dough ball', () => {
    const u = pizzaUsage({ size: 'S', crust: 'gf', sauce: 'red', cheese: 'regular', toppings: {} });
    expect(u['gf-shell']).toBe(1);
    expect(u['dough-S']).toBeUndefined();
  });
});

describe('history and forecast', () => {
  const h = buildPizzaHistory(today);
  it('is the same for everyone on a given day', () => {
    expect(buildPizzaHistory(today)[10]).toEqual(h[10]);
    expect(h).toHaveLength(90);
  });
  it('expects a football Sunday to be busier than a Tuesday', () => {
    const sun = forecastDay(h, '2026-11-22');
    const tue = forecastDay(h, '2026-11-17');
    expect(sun.orders).toBeGreaterThan(tue.orders);
    expect(sun.reasons.join()).toContain('Football Sunday');
  });
  it('adds pre-orders and rain', () => {
    const dry = forecastDay(h, '2026-11-18');
    const wet = forecastDay(h, '2026-11-18', { rain: true, preorderPies: { S: 0, M: 0, L: 10 } });
    expect(wet.pizzas.L).toBeGreaterThanOrEqual(dry.pizzas.L + 10);
  });
  it('plans dough in trays of six with a buffer', () => {
    const f = forecastDay(h, '2026-11-18');
    const d = doughPlan(f, 0.2);
    for (const s of ['S', 'M', 'L'] as const) {
      expect(d.balls[s] % 6).toBe(0);
      expect(d.balls[s]).toBeGreaterThanOrEqual(f.pizzas[s]);
    }
    expect(d.mixes).toBeGreaterThanOrEqual(1);
  });
});

describe('stock', () => {
  const h = buildPizzaHistory(today);
  const week = Array.from({ length: 7 }, (_, i) => forecastDay(h, `2026-11-${16 + i}`));
  it('reorders what runs out before the next delivery', () => {
    const plan = stockPlan(h, week, { basil: 0.1 }, today, 10);
    const basil = plan.find((l) => l.id === 'basil')!;
    expect(basil.reorder).toBe(true);
    expect(basil.packs).toBeGreaterThan(0);
  });
  it('leaves well-stocked items alone', () => {
    const plan = stockPlan(h, week, { onion: 500 }, today, 10);
    expect(plan.find((l) => l.id === 'onion')!.reorder).toBe(false);
  });
});

describe('quotes and dispatch', () => {
  const base = { channel: 'online', createdAt: '2026-11-15T01:00:00Z', subtotal: 0, deliveryFee: 0, tax: 0, tip: 0, total: 0, payment: 'online' } as const;
  const order = (id: string, x: number, y: number, status: PizzaOrder['status'], promisedIn = 30): PizzaOrder => ({
    ...base, id, number: Number(id.slice(1)), fulfillment: 'delivery', promisedAt: new Date(Date.now() + promisedIn * 60_000).toISOString(),
    customer: { name: id, phone: '', x, y, zone: zoneFor({ x, y }) }, lines: [{ kind: 'pizza', config: configFor('cheese', 'L'), specialtyId: 'cheese', qty: 1, unitCents: 1999 }], status,
  });
  it('quotes longer when the line is busy', () => {
    const quiet = quoteTime([], 1, {});
    const busy = quoteTime(Array.from({ length: 6 }, (_, i) => order(`o${i}`, 0.5, 0.5, 'new')), 1, {});
    expect(busy.minutes).toBeGreaterThan(quiet.minutes);
    expect(quoteTime([], 1, { zone: 'C' }).minutes).toBeGreaterThan(quiet.minutes);
  });
  it('stacks nearby orders on one run and gives it to a free driver', () => {
    const drivers: DriverState[] = [{ id: 'dev', status: 'in', orderIds: [], runs: 0, miles: 0, tipsCents: 0 }];
    const runs = planRuns([order('a1', 1, 1, 'ready'), order('a2', 1.3, 1.1, 'ready'), order('a3', -2.5, -1, 'ready')], drivers, Date.now());
    expect(runs[0].orderIds.sort()).toEqual(['a1', 'a2']);
    expect(runs[0].driverId).toBe('dev');
  });
  it('routes to the nearest stop first and back to the shop', () => {
    const r = route([{ x: 2, y: 0 }, { x: 1, y: 0 }]);
    expect(r.order).toEqual([1, 0]);
    expect(r.miles).toBeCloseTo(4 * 1.25);
  });
});

describe('packs and upsells', () => {
  it('spreads a pack price over its items without losing a cent', () => {
    for (const p of PACKS) {
      const lines = packLines(p);
      const sum = lines.reduce((a, l) => a + l.unitCents * l.qty, 0);
      expect(Math.abs(sum - p.cents)).toBeLessThanOrEqual(lines.length);
      expect(packValue(p)).toBeGreaterThan(p.cents);
    }
  });
  it('suggests a bigger size and a side with real numbers', () => {
    const h = buildPizzaHistory(today);
    const cfg = configFor('pepperoni', 'S');
    const ups = upsells([{ kind: 'pizza', config: cfg, specialtyId: 'pepperoni', qty: 1, unitCents: pizzaPrice(cfg, 'pepperoni').cents }], h, 'Football Sunday');
    expect(ups[0].id).toBe('size-up');
    expect(ups[0].why).toMatch(/\d+% more pizza/);
    expect(ups.some((u) => u.id === 'wings')).toBe(true);
  });
});

describe('bake and cut notes', () => {
  it('keeps only one choice from each group', async () => {
    const { toggleNote } = await import('./logic');
    let n = toggleNote([], 'Well done', 'red');
    n = toggleNote(n, 'Light bake', 'red');
    n = toggleNote(n, 'Square cut', 'red');
    n = toggleNote(n, 'Uncut', 'red');
    n = toggleNote(n, 'Light sauce', 'red');
    n = toggleNote(n, 'Extra sauce', 'red');
    expect(n.sort()).toEqual(['Extra sauce', 'Light bake', 'Uncut']);
    expect(toggleNote(n, 'Uncut', 'red')).not.toContain('Uncut');
  });
  it('has no sauce amount without sauce', async () => {
    const { toggleNote, validNotes } = await import('./logic');
    expect(toggleNote([], 'Extra sauce', 'none')).toEqual([]);
    expect(validNotes(['Extra sauce', 'Well done'], 'none')).toEqual(['Well done']);
  });
  it('puts the notes on the kitchen ticket', async () => {
    const { pizzaDetails } = await import('./logic');
    expect(pizzaDetails({ ...configFor('pepperoni', 'L'), notes: ['Well done', 'Square cut'] }, 'pepperoni')).toEqual(expect.arrayContaining(['Well done', 'Square cut']));
  });
});

describe('company invoices', () => {
  const order = { id: 'pz-9', number: 2209, total: 18275, customer: { name: 'Dana Lee' } };
  it('bills the company on net 15 from the lunch date', () => {
    const inv = invoiceFor(order, { company: ' Harbor Dental ', email: 'ap@harbordental.com', po: ' 4471 ' }, 'Office Lunch', '2026-11-26', '2026-11-16', 1043);
    expect(inv).toMatchObject({ id: 'inv-1043', company: 'Harbor Dental', po: '4471', due: '2026-12-11', totalCents: 18275, paid: false, contact: 'Dana Lee' });
    expect(invoiceFor(order, { company: 'X', email: 'a@b.co', po: '  ' }, 'm', '2026-11-26', '2026-11-16', 1).po).toBeUndefined();
  });
  it('turns overdue after the due date and the reminder says so', () => {
    const inv = invoiceFor(order, { company: 'Harbor Dental', email: 'ap@harbordental.com' }, 'Office Lunch', '2026-11-01', '2026-10-28', 1040);
    expect(invoiceState(inv, '2026-11-16')).toBe('open');
    expect(invoiceState(inv, '2026-11-20')).toBe('overdue');
    expect(invoiceState({ ...inv, paid: true }, '2026-11-20')).toBe('paid');
    const r = reminderEmail(inv, '2026-11-20', 'Shoreline Slice Co.');
    expect(r.subject).toMatch(/^Past due/);
    expect(r.body).toContain('due 4 days ago');
    expect(r.body).toContain('/pizza/demo/pay/inv-1040');
  });
  it('checks billing emails', () => {
    expect(validEmail('ap@harbordental.com')).toBe(true);
    expect(validEmail('ap@harbor')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAUD } from '../lib/fraud';
import { SIDE_BY_ID } from './data';
import { configFor, pizzaPrice, type Line } from './logic';
import { EMPTY_ORDER, TURN_SCHEMA, buildLines, fill, greeting, item, linesToItems, matchAddress, menuText, missing, offersWrongPayment, oneQuestion, orderPolicy, hideMachinery, needsLookup, parseTurn, quickReplies, rememberAddress, ticketFor, turnContext, type BotOrder, type Caller, type ShopNow } from './orderbot';
import { SAMPLES } from './orderbotSamples';
import { geocodeQuery, parseCensus } from './geocode';

const shop: ShopNow = { quote: (pies, zone) => 20 + (pies - 1) * 3 + (zone ? 15 : 0), out: [], open: true, fraud: DEFAULT_FRAUD };
const usualLines: Line[] = [
  { kind: 'pizza', config: configFor('pepperoni', 'L'), specialtyId: 'pepperoni', qty: 1, unitCents: pizzaPrice(configFor('pepperoni', 'L'), 'pepperoni').cents },
  { kind: 'side', sideId: 'wings-buffalo', qty: 1, unitCents: SIDE_BY_ID['wings-buffalo'].cents },
];
const regular: Caller = { phone: '5625552000', known: true, name: 'Maya R.', address: '210 Termino Ave', lastLines: usualLines, lastFulfillment: 'delivery', orders: 12, punches: 2 };
const stranger: Caller = { phone: '5625550188', known: false };
const hidden: Caller = { phone: '', known: false };
const order = (o: Partial<BotOrder>): BotOrder => ({ items: [], fulfillment: '', name: '', address: '', payment: '', note: '', ...o });

describe('turning what the AI heard into ticket lines', () => {
  it('prices a specialty with the register\'s own price code', () => {
    const { lines, problems } = buildLines([item({ kind: 'pizza', specialty: 'supreme', size: 'L' })]);
    expect(problems).toEqual([]);
    expect(lines[0].unitCents).toBe(2799);
  });
  it('charges half price for a topping on one half and double for extra', () => {
    const plain = buildLines([item({ kind: 'pizza', specialty: 'byo', size: 'L' })]).lines[0].unitCents;
    const half = buildLines([item({ kind: 'pizza', specialty: 'byo', size: 'L', add: [{ topping: 'mushroom', side: 'left', extra: false }] })]).lines[0].unitCents;
    const whole = buildLines([item({ kind: 'pizza', specialty: 'byo', size: 'L', add: [{ topping: 'mushroom', side: 'whole', extra: false }] })]).lines[0].unitCents;
    const extra = buildLines([item({ kind: 'pizza', specialty: 'byo', size: 'L', add: [{ topping: 'mushroom', side: 'whole', extra: true }] })]).lines[0].unitCents;
    expect(half - plain).toBeGreaterThan(0);
    expect(half - plain).toBeLessThan(whole - plain);
    expect(extra - plain).toBe((whole - plain) * 2);
  });
  it('takes a topping off a specialty without changing its price', () => {
    const l = buildLines([item({ kind: 'pizza', specialty: 'supreme', size: 'L', remove: ['olive'] })]).lines[0];
    expect(l.kind === 'pizza' && l.config.toppings.olive).toBeUndefined();
    expect(l.unitCents).toBe(2799);
  });
  it('will not guess a size', () => {
    const b = buildLines([item({ kind: 'pizza', specialty: 'pepperoni' })]);
    expect(b.lines).toEqual([]);
    expect(b.problems[0]).toMatch(/Size/);
  });
  it('names a crust that does not come in that size', () => {
    expect(buildLines([item({ kind: 'pizza', specialty: 'cheese', size: 'S', crust: 'pan' })]).problems[0]).toMatch(/Detroit pan only comes in medium or large/);
    expect(buildLines([item({ kind: 'pizza', specialty: 'cheese', size: 'L', crust: 'gf' })]).problems[0]).toMatch(/Gluten-free only comes in small/);
  });
  it('leaves off what is sold out and says so', () => {
    const b = buildLines([item({ kind: 'side', side: 'caesar' }), item({ kind: 'pizza', specialty: 'byo', size: 'M', add: [{ topping: 'bacon', side: 'whole', extra: false }] })], ['caesar', 'bacon']);
    expect(b.lines).toHaveLength(1);
    expect(b.problems).toEqual(['Caesar Salad is sold out tonight', 'Bacon is out tonight']);
  });
  it('keeps one bake note and drops a sauce note on a pizza with no sauce', () => {
    const l = buildLines([item({ kind: 'pizza', specialty: 'byo', size: 'M', sauce: 'none', notes: ['Well done', 'Light bake', 'Extra sauce'] })]).lines[0];
    expect(l.kind === 'pizza' && l.config.notes).toEqual(['Well done']);
  });
  it('puts the usual back on the ticket exactly', () => {
    const custom: Line[] = [{ kind: 'pizza', config: { ...configFor('supreme', 'M'), crust: 'thin', toppings: { ...configFor('supreme', 'M').toppings, jalapeno: 'left', pepperoni: 'whole' }, extra: ['pepperoni'], notes: ['Square cut'] }, specialtyId: 'supreme', qty: 2, unitCents: 0 }];
    delete (custom[0] as { config: { toppings: Record<string, string> } }).config.toppings.olive;
    const again = buildLines(linesToItems([...usualLines, ...custom])).lines;
    expect(again.slice(0, 2)).toEqual(usualLines);
    expect(again[2].kind === 'pizza' && again[2].config).toEqual(custom[0].kind === 'pizza' && custom[0].config);
  });
});

describe('addresses', () => {
  it('finds a street the way people say it', () => {
    expect(matchAddress('210 Termino Avenue')?.line).toBe('210 Termino Ave');
    expect(matchAddress('uh its on redondo, 1925')?.line).toBe('1925 Redondo Ave');
    expect(matchAddress('1180 east 4th street')?.line).toBe('1180 E 4th St');
    expect(matchAddress('1180 E 4th St')?.line).toBe('1180 E 4th St');
    expect(matchAddress('12 Nowhere Lane')).toBeUndefined();
    expect(matchAddress('')).toBeUndefined();
  });
});

describe('the rules a phone or text order follows', () => {
  it('lets a regular pay cash at the door or by link', () => {
    expect(orderPolicy({ totalCents: 9000, pies: 3, fulfillment: 'delivery', caller: regular, addressFound: true, addressSaid: true }).payments).toEqual(['pay_link', 'cash_at_door']);
  });
  it('makes a big first delivery pay on the link, with ID at the door', () => {
    const p = orderPolicy({ totalCents: 9000, pies: 3, fulfillment: 'delivery', caller: stranger, addressFound: true, addressSaid: true });
    expect(p.payments).toEqual(['pay_link']);
    expect(p.idCheck).toBe(true);
    expect(orderPolicy({ totalCents: 3000, pies: 1, fulfillment: 'delivery', caller: stranger, addressFound: true, addressSaid: true }).payments).toContain('cash_at_door');
  });
  it('gives a hidden number pickup only, paid at the counter', () => {
    const p = orderPolicy({ totalCents: 18000, pies: 8, fulfillment: 'delivery', caller: hidden, addressFound: true, addressSaid: true });
    expect(p.payments).toEqual(['pay_at_pickup']);
    expect(p.noDelivery).toBeTruthy();
  });
  it('sends a very large order to the manager', () => {
    expect(orderPolicy({ totalCents: 26000, pies: 9, fulfillment: 'pickup', caller: regular, addressFound: false, addressSaid: false }).transfer).toBeTruthy();
    expect(orderPolicy({ totalCents: 20000, pies: 13, fulfillment: 'pickup', caller: regular, addressFound: false, addressSaid: false }).transfer).toBeTruthy();
  });
  it('follows the owner\'s own amounts', () => {
    const p = orderPolicy({ totalCents: 9000, pies: 3, fulfillment: 'delivery', caller: stranger, addressFound: true, addressSaid: true }, { ...DEFAULT_FRAUD, bigFirstOrderCents: 0, idCheckOverCents: 0 });
    expect(p.payments).toContain('cash_at_door');
    expect(p.idCheck).toBe(false);
  });
});

describe('what must be settled before the kitchen gets it', () => {
  const pie = item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' });
  it('walks through pickup or delivery, address, name and payment', () => {
    const asks = (o: BotOrder, c = stranger) => missing(o, ticketFor(o, c, shop), 'call').map((n) => n.ask);
    expect(asks(order({}))[0]).toMatch(/get started/);
    expect(asks(order({ items: [pie] }))[0]).toMatch(/pickup or delivery/);
    expect(asks(order({ items: [pie], fulfillment: 'delivery' }))[0]).toMatch(/delivery address/);
    expect(asks(order({ items: [pie], fulfillment: 'delivery', address: '12 Nowhere Lane' }))[0]).toMatch(/couldn't find 12 Nowhere Lane/);
    expect(asks(order({ items: [pie], fulfillment: 'delivery', address: '210 Termino Ave' }))[0]).toMatch(/name/);
    expect(asks(order({ items: [pie], fulfillment: 'delivery', address: '210 Termino Ave', name: 'Jo' }))[0]).toMatch(/How would you like to pay/);
    expect(asks(order({ items: [pie], fulfillment: 'delivery', address: '210 Termino Ave', name: 'Jo', payment: 'cash_at_door' }))).toEqual([]);
  });
  it('will not let the AI send an order with a payment the rules do not allow', () => {
    const big = order({ items: [item({ kind: 'pizza', specialty: 'supreme', size: 'L', qty: 3 })], fulfillment: 'delivery', address: '210 Termino Ave', name: 'Jo', payment: 'cash_at_door' });
    expect(missing(big, ticketFor(big, stranger, shop), 'call')[0].ask).toMatch(/secure link/);
    expect(missing(big, ticketFor(big, regular, shop), 'call')).toEqual([]);
  });
  it('does not need a name by text', () => {
    const o = order({ items: [pie], fulfillment: 'pickup', payment: 'pay_at_pickup' });
    expect(missing(o, ticketFor(o, stranger, shop), 'text')).toEqual([]);
    expect(missing(o, ticketFor(o, stranger, shop), 'call')).toHaveLength(1);
  });
});

describe('what the AI says', () => {
  it('gets its numbers from the ticket', () => {
    const o = order({ items: [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })], fulfillment: 'delivery', address: '210 Termino Ave' });
    const t = ticketFor(o, regular, shop);
    // Large pepperoni 22.99 + zone A delivery 2.99, taxed at 10.25%.
    expect(t.totals.total).toBe(2299 + 299 + Math.round((2299 + 299) * 0.1025));
    expect(fill('Total {total}, fee {fee}, about {minutes} minutes. Order {number}.', t, { number: 2201 })).toBe(`Total $28.64, fee $2.99, about 35 minutes. Order 2201.`);
  });
  it('greets a regular with the usual and a new caller with a question', () => {
    expect(greeting(regular, 'call')).toMatch(/^Thanks for calling Shoreline Slice Co\. Hi Maya! Want your usual Large Pepperoni and Buffalo Wings, delivered to 210 Termino Ave\?/);
    expect(greeting(stranger, 'call')).toMatch(/pickup or delivery/);
    expect(greeting(regular, 'text')).toMatch(/Reply YES/);
  });
  it('hands Claude the caller, the priced ticket and the rules', () => {
    const o = order({ items: [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })], fulfillment: 'delivery', address: '210 Termino Ave' });
    const c = turnContext('call', regular, o, ticketFor(o, regular, shop), shop, ['Add garlic bread.']);
    expect(c.caller.lastOrderItems).toHaveLength(2);
    expect(c.ticket.total).toBe('$28.64');
    expect(c.ticket.stillNeeded.join(' ')).toMatch(/pay/);
    expect(c.rules.allowedPayments).toEqual(['pay_link', 'cash_at_door']);
  });
});

describe('reading Claude\'s reply', () => {
  it('keeps what is on the menu and drops what is not', () => {
    const t = parseTurn(JSON.stringify({ say: ' Hi ', action: 'place_order', order: { items: [{ kind: 'pizza', specialty: 'pepperoni', size: 'XL', crust: 'stuffed', sauce: '', cheese: '', add: [{ topping: 'anchovy', side: 'whole', extra: false }, { topping: 'bacon', side: 'top', extra: 'yes' }], remove: ['x'], notes: ['Burn it'], side: '', qty: 500 }], fulfillment: 'drone', name: 'Al', address: '', payment: 'card_number', note: '  2 cola,\n 1 orange ' } }))!;
    expect(t.order.note).toBe('2 cola, 1 orange');
    expect(t.say).toBe('Hi');
    expect(t.order.items[0]).toMatchObject({ size: '', crust: '', add: [{ topping: 'bacon', side: 'whole', extra: false }], remove: [], notes: [], qty: 20 });
    expect(t.order.fulfillment).toBe('');
    expect(t.order.payment).toBe('');
    expect(parseTurn('nope')).toBeNull();
    expect(parseTurn(JSON.stringify({ say: '', order: {}, action: 'continue' }))).toBeNull();
  });
  it('has a schema that only allows real menu ids', () => {
    const p = TURN_SCHEMA.properties.order.properties.items.items.properties;
    expect(p.specialty.enum).toContain('supreme');
    expect(p.add.items.properties.topping.enum).toContain('pineapple');
    expect(menuText()).toContain('supreme: The Supreme');
    expect(menuText()).toBe(menuText());
  });
});

describe('the sample conversations', () => {
  const callers = { regular, new: stranger, hidden };
  for (const s of SAMPLES) {
    it(`"${s.title}" follows the rules at every step`, () => {
      const caller = callers[s.caller];
      for (const step of s.steps) {
        const t = ticketFor(step.turn.order, caller, shop);
        expect(t.problems).toEqual([]);
        expect(fill(step.turn.say, t, { number: 2201 })).not.toMatch(/[{}]/);
        if (step.turn.action === 'place_order') expect(missing(step.turn.order, t, s.surface)).toEqual([]);
      }
    });
  }
  it('the new-number sample needs the pay link and an ID check', () => {
    const last = SAMPLES.find((s) => s.id === 'new-text')!.steps.at(-1)!.turn.order;
    const t = ticketFor(last, stranger, shop);
    expect(t.policy.payments).toEqual(['pay_link']);
    expect(t.policy.idCheck).toBe(true);
  });
});

describe('one question at a time, and answers that fit the order', () => {
  const shopNow: ShopNow = { quote: () => 25, out: [], open: true, fraud: DEFAULT_FRAUD };
  const regular: Caller = { phone: '5625550101', known: true, name: 'Maya R.', address: '210 Termino Ave' };
  const pie = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })];
  const delivery: BotOrder = { ...EMPTY_ORDER, items: pie, fulfillment: 'delivery', address: '210 Termino Ave' };

  it('holds a second stacked question for the next turn', () => {
    expect(oneQuestion('Is 210 Termino Ave the right address? Since it is delivery, link or cash. Which works for you?')).toBe('Is 210 Termino Ave the right address?');
    expect(oneQuestion('Got it, a large pepperoni. Pickup or delivery?')).toBe('Got it, a large pepperoni. Pickup or delivery?');
    expect(oneQuestion('Order is in.')).toBe('Order is in.');
  });

  it('spots paying at the counter offered on a delivery', () => {
    expect(offersWrongPayment('You can pay with a card link, or pick pay at pickup if you would rather come get it.', delivery)).toBe(true);
    expect(offersWrongPayment('You can pay with a secure card link or cash at the door.', delivery)).toBe(false);
    expect(offersWrongPayment('Pay at the counter or cash at the door?', { ...delivery, fulfillment: 'pickup' })).toBe(true);
  });

  it('never shows payment codes in what is still needed', () => {
    const notes = missing(delivery, ticketFor(delivery, regular, shopNow), 'text').map((n) => n.note).join(' ');
    expect(notes).toContain('cash at the door');
    expect(notes).not.toMatch(/pay_link|cash_at_door|pay_at_pickup/);
    const wrong = { ...delivery, payment: 'pay_at_pickup' as const };
    const need = missing(wrong, ticketFor(wrong, regular, shopNow), 'text');
    expect(need[0].code).toBe('payment_not_allowed');
    expect(need[0].note).not.toMatch(/pay_at_pickup|pay_link/);
  });

  it('tells the AI the ways to pay for delivery before delivery is on the order', () => {
    const unknown = { ...EMPTY_ORDER, items: pie };
    const ctx = turnContext('text', regular, unknown, ticketFor(unknown, regular, shopNow), shopNow, []);
    expect(ctx.rules.paymentsIfDelivery.map((p) => p.id)).toEqual(['pay_link', 'cash_at_door']);
    expect(ctx.rules.paymentsIfPickup.map((p) => p.id)).toEqual(['pay_at_pickup', 'pay_link']);
  });

  it('offers tap-able answers that match the question', () => {
    const t = ticketFor(delivery, regular, shopNow);
    expect(quickReplies('Perfect. How would you like to pay: a card link or cash at the door?', delivery, t)).toEqual(['Text me a card link', 'Cash at the door']);
    expect(quickReplies('Got it. Deliver to 210 Termino Ave?', delivery, t)).toEqual(['Yes', 'No']);
    expect(quickReplies('Is 210 Termino Ave the right address?', delivery, t)).toEqual(['Yes', 'No']);
    const none = { ...EMPTY_ORDER, items: pie };
    expect(quickReplies('Got it. Is this for pickup or delivery?', none, ticketFor(none, regular, shopNow))).toEqual(['Pickup', 'Delivery']);
    expect(quickReplies('What size?', none, ticketFor(none, regular, shopNow))).toEqual([]);
  });
});

describe('a real address is checked the moment it is given', () => {
  const shopNow: ShopNow = { quote: () => 25, out: [], open: true, fraud: DEFAULT_FRAUD };
  const stranger: Caller = { phone: '5625550188', known: false };
  const pie = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })];
  const to = (address: string): BotOrder => ({ ...EMPTY_ORDER, items: pie, fulfillment: 'delivery', address, name: 'John' });

  it('prices a looked-up Long Beach address in the right zone', () => {
    const census = { result: { addressMatches: [{ matchedAddress: '1746 XIMENO AVE, LONG BEACH, CA, 90815', coordinates: { x: -118.1388, y: 33.7887 }, addressComponents: { city: 'LONG BEACH' } }] } };
    const found = parseCensus(census)!;
    expect(found.line).toBe('1746 Ximeno Ave');
    expect(needsLookup('1746 Ximeno Ave')).toBe(true);
    rememberAddress('1746 Ximeno Ave', found);
    expect(needsLookup('1746 Ximeno Avenue')).toBe(false);
    const t = ticketFor(to('1746 Ximeno Ave'), stranger, shopNow);
    expect(t.zone).toBe('B');
    expect(t.totals.deliveryFee).toBe(399);
    expect(missing(to('1746 Ximeno Ave'), t, 'text').some((n) => n.code === 'address')).toBe(false);
  });

  it('does not look up the example addresses, and never swaps a house number for another on the same street', () => {
    expect(needsLookup('210 Termino Ave')).toBe(false);
    expect(matchAddress('555 Termino Ave')).toBeUndefined();
    expect(matchAddress('on Termino')?.line).toBe('210 Termino Ave');
  });

  it('offers pickup or a different address when the address is not found or too far', () => {
    rememberAddress('99999 Nowhere St', null);
    const lost = to('99999 Nowhere St');
    const t = ticketFor(lost, stranger, shopNow);
    const need = missing(lost, t, 'text').find((n) => n.code === 'address')!;
    expect(need.ask).toContain('switch to pickup');
    expect(quickReplies(need.ask, lost, t)).toEqual(['Switch to pickup', 'Different address']);
    rememberAddress('100 Main St, Seal Beach', parseCensus({ result: { addressMatches: [{ matchedAddress: '100 MAIN ST, SEAL BEACH, CA, 90740', coordinates: { x: -118.1054, y: 33.7404 }, addressComponents: { city: 'SEAL BEACH' } }] } }));
    const far = to('100 Main St, Seal Beach');
    const tf = ticketFor(far, stranger, shopNow);
    expect(tf.zone).toBe('C');
    rememberAddress('1 World Way, Los Angeles', { line: '1 World Way, Los Angeles', x: -14, y: 12 });
    const out = to('1 World Way, Los Angeles');
    const need2 = missing(out, ticketFor(out, stranger, shopNow), 'text').filter((n) => n.code === 'address');
    expect(need2).toHaveLength(1);
    expect(need2[0].ask).toContain('past our delivery area');
  });

  it('builds the lookup query in the shop city unless another is named', () => {
    expect(geocodeQuery('1746 Ximeno Ave')).toBe('1746 Ximeno Ave, Long Beach, CA');
    expect(geocodeQuery('1746 Ximeno in Long Beach')).toBe('1746 Ximeno, Long Beach, CA');
    expect(geocodeQuery('Termino')).toBe('');
  });

  it('drops any sentence about the system', () => {
    expect(hideMachinery('Thanks, John! 1746 Ximeno in Long Beach. Let me confirm that one with the system. How would you like to pay?')).toBe('Thanks, John! 1746 Ximeno in Long Beach. How would you like to pay?');
    expect(hideMachinery('Got it, a large pepperoni.')).toBe('Got it, a large pepperoni.');
  });
});

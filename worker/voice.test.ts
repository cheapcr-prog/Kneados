import { describe, expect, it } from 'vitest';
import { item, type BotOrder, type BotTurn } from '../src/pizza/orderbot';
import { ticketFromPhone } from '../src/pizza/phoneLine';
import { FIRST_PHONE_NUMBER, PhoneLine } from './line';
import { VoiceSession, callTicket, callerFrom, connectTwiml, doneTwiml, fromTwilio, readTicket, tenDigits, twilioSignature, type PhoneOrder, type SavedCustomer, type VoiceDeps } from './voice';

const TOKEN = 'test-auth-token';

describe('only Twilio may open a call', () => {
  it('accepts a correctly signed webhook and rejects a changed one', async () => {
    const url = 'https://kneados.app/api/voice';
    const params = { To: '+15625550100', From: '+15625550142', CallSid: 'CA1' };
    const sig = await twilioSignature(TOKEN, url, params);
    expect(await fromTwilio(TOKEN, url, params, sig)).toBe(true);
    expect(await fromTwilio(TOKEN, url, { ...params, From: '+15625550143' }, sig)).toBe(false);
    expect(await fromTwilio('other', url, params, sig)).toBe(false);
    expect(await fromTwilio(TOKEN, url, params, null)).toBe(false);
  });

  it('matches the signature Twilio documents', async () => {
    // The worked example from Twilio's "Validating Signatures" guide.
    const sig = await twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' });
    expect(sig).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });

  it('hands out a call ticket that expires and cannot be forged', async () => {
    const t = await callTicket(TOKEN, '5625550142', '5625550100', 1_000_000);
    expect(await readTicket(TOKEN, t, 1_000_000)).toEqual({ from: '5625550142', to: '5625550100' });
    expect(await readTicket(TOKEN, t, 1_000_000 + 200_000)).toBeNull();
    expect(await readTicket('other', t, 1_000_000)).toBeNull();
    expect(await readTicket(TOKEN, t.replace('5625550142', '5625550199'), 1_000_000)).toBeNull();
    expect(await readTicket(TOKEN, undefined)).toBeNull();
  });

  it('reads caller ID, and treats a blocked number as hidden', () => {
    expect(tenDigits('+15625550142')).toBe('5625550142');
    expect(tenDigits('anonymous')).toBe('');
    expect(tenDigits('+266696687')).toBe('');
  });

  it('tells Twilio to greet and connect, and escapes what it says', async () => {
    const xml = await connectTwiml('kneados.app', 'Thanks for calling "Slice & Co."', 'tick').text();
    expect(xml).toContain('wss://kneados.app/api/voice/ws');
    expect(xml).toContain('&quot;Slice and Co.&quot;');
    expect(xml).toContain('<Parameter name="t" value="tick"/>');
    // A stray noise must not cut the assistant off, and a pause mid-sentence must not end the caller's turn.
    expect(xml).toContain('interruptible="speech"');
    expect(xml).toContain('interruptSensitivity="low"');
    // Words said while the assistant is talking must still reach us, and a bare "yes" must never be filtered out.
    expect(xml).toContain('reportInputDuringAgentSpeech="speech"');
    expect(xml).not.toContain('ignoreBackchannel');
    expect(xml).toContain('turnDetection="true"');
    expect(xml).toContain('Pineapple');
    expect(await doneTwiml('{"reason":"transfer"}').text()).toContain('manager');
    expect(await doneTwiml(undefined).text()).toContain('<Hangup/>');
  });
});

const pie = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })];
const order = (over: Partial<BotOrder>): BotOrder => ({ items: pie, fulfillment: '', name: '', address: '', payment: '', note: '', ...over });

function call(turns: (BotTurn | null)[], saved: SavedCustomer | null = null) {
  const said: string[] = [];
  const ended: string[] = [];
  const placed: { order: Omit<PhoneOrder, 'id' | 'number'>; phone: string }[] = [];
  const prompts: string[] = [];
  const deps: VoiceDeps = {
    model: async (user) => { prompts.push(user); return turns.shift() ?? null; },
    lookUp: async () => null,
    line: { place: async (o, phone) => { placed.push({ order: o, phone }); return 7001; } },
    say: (t) => said.push(t),
    end: (_ms, reason) => ended.push(reason),
    now: () => Date.UTC(2026, 10, 16, 20, 0),
  };
  return { session: new VoiceSession(callerFrom('5625550142', saved, deps.now!()), deps), deps, said, ended, placed, prompts };
}

describe('a phone call, start to make line', () => {
  it('takes a pickup order, sets the only way to pay, and books it with the real total', async () => {
    const c = call([
      { say: 'One large pepperoni. Is this for pickup or delivery?', order: order({}), action: 'continue' },
      { say: 'Pickup it is. What name should I put on the order?', order: order({ fulfillment: 'pickup' }), action: 'continue' },
      { say: 'Thanks Elias. One large pepperoni for pickup, {total}, ready in about {minutes} minutes. Is that right?', order: order({ fulfillment: 'pickup', name: 'Elias' }), action: 'continue' },
      { say: "You're all set. Order number {number}, ready at about {time}. You'll pay at the counter.", order: order({ fulfillment: 'pickup', name: 'Elias' }), action: 'place_order' },
    ]);
    await c.session.heard('large pepperoni');
    await c.session.heard('pickup');
    await c.session.heard('Elias');
    expect(c.said[2]).toMatch(/\$\d+\.\d\d/);
    expect(c.session.order.payment).toBe('pay_at_pickup');
    await c.session.heard('yes');
    expect(c.placed).toHaveLength(1);
    expect(c.placed[0].phone).toBe('5625550142');
    expect(c.placed[0].order.last4).toBe('0142');
    expect(c.said[3]).toContain('7001');
    expect(c.said[3]).toMatch(/\d{1,2}:\d\d (AM|PM)/);
    expect(c.ended).toEqual(['placed']);
    expect(c.session.over).toBe(true);
    await c.session.heard('thanks');
    expect(c.said).toHaveLength(4);
    // The make line gets the same ticket, priced by the same code.
    const ticket = ticketFromPhone({ ...c.placed[0].order, id: 'ph-7001', number: 7001 });
    expect(ticket.total).toBeGreaterThan(2000);
    expect(ticket.customer.phone).toBe('');
    expect(ticket.note).toContain('ending 0142');
    expect(ticket.ai?.surface).toBe('call');
  });

  it('will not book an order the AI tries to send early', async () => {
    const c = call([{ say: 'Order number {number} is in!', order: order({}), action: 'place_order' }]);
    await c.session.heard('large pepperoni thanks bye');
    expect(c.placed).toHaveLength(0);
    expect(c.said[0]).toBe('Is this for pickup or delivery?');
    expect(c.ended).toEqual([]);
  });

  it('never offers a pay link on a line that cannot text one', async () => {
    const c = call([{ say: 'Got it.', order: order({ fulfillment: 'pickup' }), action: 'continue' }]);
    await c.session.heard('large pepperoni for pickup');
    expect(c.prompts[0]).not.toContain('"id":"pay_link"');
  });

  it('asks again once when the model fails, then hands off', async () => {
    const c = call([null, null]);
    await c.session.heard('hello');
    expect(c.said[0]).toContain('say it once more');
    await c.session.heard('hello?');
    expect(c.ended).toEqual(['transfer']);
  });

  it('answers once when the caller says two things in a row, using the latest', async () => {
    const pickup: BotTurn = { say: 'Pickup it is. What can I get started for you?', order: order({ items: [], fulfillment: 'pickup' }), action: 'continue' };
    const delivery: BotTurn = { say: 'Delivery it is. What is the street address?', order: order({ items: [], fulfillment: 'delivery' }), action: 'continue' };
    const c = call([]);
    const replies = [pickup, delivery];
    // The caller changes their mind while the first reply is still being worked out.
    c.deps.model = async (user) => { c.prompts.push(user); if (c.prompts.length === 1) void c.session.heard('Actually delivery.'); return replies.shift() ?? null; };
    await c.session.heard('For pickup.');
    await c.session.heard('');
    // The pickup reply was stale by the time it was ready, so the caller only hears the answer to everything they said.
    expect(c.said).toEqual(['Delivery it is. What is the street address?']);
    expect(c.prompts[1]).toContain('Actually delivery.');
    expect(c.session.order.fulfillment).toBe('delivery');
  });

  it('stops suggesting add-ons once the caller says that is everything', async () => {
    const more: BotTurn = { say: 'Anything else?', order: order({ fulfillment: 'pickup' }), action: 'continue' };
    const c = call([more, more, more]);
    await c.session.heard('a large pepperoni for pickup');
    await c.session.heard('what sizes do you have');
    await c.session.heard("That's it.");
    expect(c.prompts[1]).not.toMatch(/"suggestions":\s*\[\s*\]/);
    expect(c.prompts[2]).toMatch(/"suggestions":\s*\[\s*\]/);
  });

  it('says a short filler when a reply is slow, and not when it is quick', async () => {
    const reply: BotTurn = { say: 'What can I get started for you?', order: order({ items: [], fulfillment: 'pickup' }), action: 'continue' };
    const slow = call([]);
    slow.deps.fillerAfterMs = 5;
    slow.deps.model = () => new Promise((done) => setTimeout(() => done(reply), 40));
    await slow.session.heard('pickup');
    expect(slow.said.length).toBe(2);
    expect(slow.said[0].length).toBeLessThan(20);
    expect(slow.said[1]).toBe(reply.say);
    // The filler is not part of the conversation the model sees.
    expect(slow.session.transcript.some((l) => l.text === slow.said[0])).toBe(false);

    const quick = call([reply]);
    await quick.session.heard('pickup');
    expect(quick.said).toEqual([reply.say]);
  });

  it('greets a returning caller by name with the usual', () => {
    const c = call([], { name: 'Elias', items: pie, fulfillment: 'pickup', orders: 2 });
    expect(c.session.transcript[0].text).toContain('Ciao Elias');
    expect(c.session.transcript[0].text).toContain('Large Pepperoni');
  });

  it('remembers only what the caller heard when they talk over the AI', () => {
    const c = call([]);
    const first = c.session.transcript[0].text;
    c.session.interrupted(first.slice(0, 20));
    expect(c.session.transcript[0].text).toContain('spoke over the rest');
  });
});

describe("the line's memory", () => {
  const fake = () => { const m = new Map<string, unknown>(); return { storage: { get: async <T,>(k: string) => m.get(k) as T | undefined, put: async (k: string, v: unknown) => { m.set(k, v); } } }; };
  const sample: Omit<PhoneOrder, 'id' | 'number'> = { at: new Date().toISOString(), minutes: 15, last4: '0142', order: order({ fulfillment: 'pickup', name: 'Elias', payment: 'pay_at_pickup' }), transcript: [] };

  it('numbers orders, lists them, and knows the caller next time', async () => {
    const line = new PhoneLine(fake());
    const post = (o: unknown) => line.fetch(new Request('https://line/place', { method: 'POST', body: JSON.stringify(o) }));
    expect(await (await post({ order: sample, phone: '5625550142' })).json()).toEqual({ number: FIRST_PHONE_NUMBER });
    expect(await (await post({ order: sample, phone: '5625550142' })).json()).toEqual({ number: FIRST_PHONE_NUMBER + 1 });
    const feed = (await (await line.fetch(new Request('https://line/orders'))).json()) as { orders: PhoneOrder[] };
    expect(feed.orders.map((o) => o.number)).toEqual([FIRST_PHONE_NUMBER, FIRST_PHONE_NUMBER + 1]);
    expect(JSON.stringify(feed)).not.toContain('5625550142');
    const ring = (await (await line.fetch(new Request('https://line/ring?from=5625550142'))).json()) as { customer: SavedCustomer };
    expect(ring.customer).toMatchObject({ name: 'Elias', orders: 2, fulfillment: 'pickup' });
    const stranger = (await (await line.fetch(new Request('https://line/ring?from=5625550000'))).json()) as { customer: null };
    expect(stranger.customer).toBeNull();
  });
});

describe('words the voice reads badly (real call, 2026-11-16)', () => {
  it('says barbecue instead of spelling out BBQ', async () => {
    const { forSpeech } = await import('./voice');
    expect(forSpeech('one BBQ chicken and BBQ Wings (10)')).toBe('one barbecue chicken and barbecue Wings, 10 piece');
    expect(forSpeech('bbq sauce, Bar-B-Q, barbeque')).toBe('barbecue sauce, barbecue, barbecue');
  });
  it('says other menu shorthand as words and leaves prices alone', async () => {
    const { forSpeech } = await import('./voice');
    expect(forSpeech('a 2 liter diet cola, Sausage & Mushroom, jalapenos, $33.62')).toBe('a two liter diet cola, Sausage and Mushroom, jalapeños, $33.62');
    expect(forSpeech('ready in 15 min')).toBe('ready in 15 minutes');
  });
});

describe('a street name heard wrong (real call, 2026-11-16: "Eximino" for Ximeno)', () => {
  it('finds the real street that sounds like it and tells the caller', async () => {
    const c = call([{ say: 'Got it, 1746 Eximino Avenue. How would you like to pay?', order: order({ fulfillment: 'delivery', address: '1746 Eximino Avenue' }), action: 'continue' }]);
    const asked: string[] = [];
    c.deps.lookUp = async (said) => { asked.push(said); return /ximeno/i.test(said) && !/eximino/i.test(said) ? { line: '1746 Ximeno Ave', x: 0.8, y: 0.4 } : null; };
    await c.session.heard('Deliver it to 1746 Ximeno Avenue.');
    expect(asked[0]).toBe('1746 Eximino Avenue');
    expect(asked).toContain('1746 Ximeno Avenue');
    expect(c.session.order.address).toBe('1746 Ximeno Ave');
    expect(c.said[0]).toContain('Ximeno');
    expect(c.said[0]).not.toContain('Eximino');
    expect(c.said[0]).not.toContain("couldn't find");
  });

  it('still says it cannot find the address when no real street has that house', async () => {
    const c = call([{ say: 'Got it. How would you like to pay?', order: order({ fulfillment: 'delivery', address: '1746 Eximino Avenue' }), action: 'continue' }]);
    await c.session.heard('1746 Eximino Avenue.');
    expect(c.said[0]).toContain("couldn't find");
  });
});

describe('calling right back after ordering (Elias, 2026-11-16)', () => {
  const now = Date.UTC(2026, 10, 16, 20, 0);
  const saved = (minutesAgo: number): SavedCustomer => ({ name: 'Elias Solares', items: pie, fulfillment: 'pickup', orders: 2, last: { number: 7003, at: new Date(now - minutesAgo * 60_000).toISOString(), minutes: 15 } });

  it('greets with the order just placed instead of offering the usual', () => {
    const c = call([], saved(3));
    const hello = c.session.transcript[0].text;
    expect(hello).toContain('Your order number 7003 is being made and should be ready for pickup around');
    expect(hello).toContain('Are you calling about that order?');
    expect(hello).not.toContain('usual');
    expect((hello.match(/\?/g) ?? []).length).toBe(1);
  });

  it('says it should be ready once the promised time has passed, and forgets it after a while', () => {
    expect(call([], saved(20)).session.transcript[0].text).toContain('should be ready for pickup now');
    expect(call([], saved(15 + 46)).session.transcript[0].text).toContain('Want your usual');
  });

  it('answers "where is my order" itself, without asking the AI', async () => {
    const c = call([], saved(3));
    await c.session.heard('Yeah, how long until my order is ready?');
    expect(c.prompts).toHaveLength(0);
    expect(c.said[0]).toContain('order number 7003');
    expect(c.said[0]).toContain('anything else');
  });

  it('tells the AI about the recent order, and hands a problem to a person', async () => {
    const c = call([{ say: "I'm so sorry about that, Elias. Let me get a team member to fix it.", order: order({ items: [] }), action: 'transfer' }], saved(3));
    await c.session.heard('Yes, you forgot my garlic bread.');
    expect(c.prompts[0]).toContain('recentOrder');
    expect(c.prompts[0]).toContain('7003');
    expect(c.ended).toEqual(['transfer']);
  });
});

describe('the phone line remembers the latest order', () => {
  it('saves its number and time with the caller', async () => {
    const store = new Map<string, unknown>();
    const line = new PhoneLine({ storage: { get: async <T,>(k: string) => store.get(k) as T | undefined, put: async (k, v) => { store.set(k, v); } } });
    const at = new Date().toISOString();
    await line.fetch(new Request('https://line/place', { method: 'POST', body: JSON.stringify({ order: { at, minutes: 15, last4: '0142', order: order({ fulfillment: 'pickup', name: 'Elias' }), transcript: [] }, phone: '5625550142' }) }));
    const { customer } = (await (await line.fetch(new Request('https://line/ring?from=5625550142'))).json()) as { customer: SavedCustomer };
    expect(customer.last).toEqual({ number: FIRST_PHONE_NUMBER, at, minutes: 15 });
  });
});

describe('wait times count the phone orders already being made (Elias, 2026-11-16)', () => {
  const now = Date.UTC(2026, 10, 16, 20, 0);
  const pies = (qty: number) => order({ items: [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L', qty })], fulfillment: 'pickup' });
  const placed = (minutesAgo: number, minutes: number, qty: number) => ({ at: new Date(now - minutesAgo * 60_000).toISOString(), minutes, order: pies(qty) });

  it('counts pizzas still waiting and pizzas baking, and drops orders that are ready', async () => {
    const { kitchenLoad } = await import('./voice');
    expect(kitchenLoad([placed(1, 20, 4), placed(10, 15, 2), placed(30, 15, 9)], now)).toEqual({ ahead: 4, inOven: 2 });
    expect(kitchenLoad([{ at: new Date(now).toISOString(), minutes: 15, order: order({ items: [item({ kind: 'side', side: 'caesar' })] }) }], now)).toEqual({ ahead: 0, inOven: 0 });
  });

  it('quotes a longer wait when the kitchen is busy', async () => {
    const { lineShop } = await import('./voice');
    const quiet = lineShop().quote(1);
    const busy = lineShop({ ahead: 12, inOven: 6 }).quote(1);
    expect(quiet).toBe(15);
    expect(busy).toBeGreaterThan(quiet);
  });

  it('the line reports its load when the phone rings', async () => {
    const store = new Map<string, unknown>();
    const line = new PhoneLine({ storage: { get: async <T,>(k: string) => store.get(k) as T | undefined, put: async (k, v) => { store.set(k, v); } } });
    await line.fetch(new Request('https://line/place', { method: 'POST', body: JSON.stringify({ order: { at: new Date().toISOString(), minutes: 20, last4: '0142', order: pies(3), transcript: [] }, phone: '5625550142' }) }));
    const { busy } = (await (await line.fetch(new Request('https://line/ring?from=5625550142'))).json()) as { busy: { ahead: number; inOven: number } };
    expect(busy).toEqual({ ahead: 3, inOven: 0 });
  });
});

describe('asking about deals (real call, 2026-11-16: it was handed off and the call ended)', () => {
  it('says there are none and keeps taking the order', async () => {
    const c = call([{ say: 'Let me get a manager to tell you what is running.', order: order({ items: [] }), action: 'transfer' }]);
    await c.session.heard('What, um, what deals do you have?');
    expect(c.ended).toEqual([]);
    expect(c.said[0]).toBe("We don't have any deals running right now. What can I get started for you?");
  });

  it('still hands off when the caller asks for a manager', async () => {
    const c = call([{ say: 'Let me get a manager for you.', order: order({ items: [] }), action: 'transfer' }]);
    await c.session.heard('I want to talk to a manager about your deals.');
    expect(c.ended).toEqual(['transfer']);
  });
});

describe('deals on the phone (Elias, 2026-11-16: deals from supply and demand)', () => {
  const caesar = { id: 'use-romaine', kind: 'use-up' as const, title: '$2 off Caesar Salad', why: 'w', pitch: 'Caesar Salad is $2 off today, down to $7.99.', offCents: 200, sideIds: ['caesar'] };
  const slow = { id: 'slow-14', kind: 'slow-hours' as const, title: 't', why: 'w', pitch: 'Every large pizza is $4 off for pickup between 2pm and 4pm today.', offCents: 400, size: 'L' as const, pickupOnly: true, fromHour: 14, toHour: 16 };
  // The test clock is noon in Long Beach, outside the slow-hours deal.
  const withDeals = (turns: (BotTurn | null)[], busy?: { ahead: number; inOven: number }) => {
    const c = call(turns);
    c.deps.deals = [caesar, slow];
    if (busy) c.deps.busy = busy;
    return { ...c, session: new VoiceSession(callerFrom('5625550142', null, c.deps.now!()), c.deps) };
  };

  it('tells the AI only the deals running this minute', async () => {
    const c = withDeals([{ say: 'Sure.', order: order({ items: [] }), action: 'continue' }]);
    await c.session.heard('Hi.');
    expect(c.prompts[0]).toContain('Caesar Salad is $2 off today');
    expect(c.prompts[0]).not.toContain('between 2pm and 4pm');
  });

  it('says the deal itself when the AI tries to hand a deals question to a manager', async () => {
    const c = withDeals([{ say: 'Let me get a manager.', order: order({ items: [] }), action: 'transfer' }]);
    await c.session.heard('Any deals today?');
    expect(c.ended).toEqual([]);
    expect(c.said[0]).toBe('Caesar Salad is $2 off today, down to $7.99. What can I get started for you?');
  });

  it('offers nothing while the kitchen is slammed', async () => {
    const c = withDeals([{ say: 'Let me get a manager.', order: order({ items: [] }), action: 'transfer' }], { ahead: 12, inOven: 6 });
    await c.session.heard('Any deals today?');
    expect(c.said[0]).toContain("don't have any deals running");
  });

  it('takes the deal off the order and sends it to the make line with the order', async () => {
    const salad = order({ items: [item({ kind: 'side', side: 'caesar' })], fulfillment: 'pickup', name: 'Elias', payment: 'pay_at_pickup' });
    const c = withDeals([{ say: 'Your order is in, number {number}, {total}.', order: salad, action: 'place_order' }]);
    await c.session.heard('A Caesar salad for pickup, name is Elias, pay at the counter, that is it.');
    expect(c.placed[0].order.deals?.map((d) => d.id)).toEqual(['use-romaine']);
    const made = ticketFromPhone({ ...c.placed[0].order, id: 'ph-1', number: 7001 });
    expect(made.subtotal).toBe(999 - 200);
    expect(made.note).toContain('Deal: $2 off Caesar Salad');
    expect(c.said[0]).toContain(`$${(made.total / 100).toFixed(2)}`);
  });
});

describe('the phone line keeps the deals the owner turned on', () => {
  it('checks them on the way in and hands them to the next call', async () => {
    const store = new Map<string, unknown>();
    const line = new PhoneLine({ storage: { get: async <T,>(k: string) => store.get(k) as T | undefined, put: async (k, v) => { store.set(k, v); } } });
    const good = { id: 'use-romaine', kind: 'use-up', title: 't', why: 'w', pitch: 'p', offCents: 200, sideIds: ['caesar'] };
    await line.fetch(new Request('https://line/deals', { method: 'POST', body: JSON.stringify([good, { ...good, id: 'too-deep', offCents: 900 }]) }));
    const { deals } = (await (await line.fetch(new Request('https://line/ring?from=5625550142'))).json()) as { deals: { id: string }[] };
    expect(deals.map((d) => d.id)).toEqual(['use-romaine']);
  });
});

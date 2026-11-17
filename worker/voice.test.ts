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
    expect(xml).toContain('Slice &amp; Co.');
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
  return { session: new VoiceSession(callerFrom('5625550142', saved), deps), deps, said, ended, placed, prompts };
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

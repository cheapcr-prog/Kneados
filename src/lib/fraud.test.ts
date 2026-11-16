import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAUD, demoCardOk, failedTries, namesDiffer, orderRisk, triesLeft, zipFar, type CardTry, type RiskInput } from './fraud';

const base: RiskInput = { totalCents: 1800, fulfillment: 'pickup', firstTime: false, orderName: 'Maria Lopez', cardName: 'Maria Lopez', failedTries: 0 };
const now = 1_800_000_000_000;

describe('card tries', () => {
  const tries: CardTry[] = [
    { at: now - 10 * 60_000, phone: '5625550101', device: 'd1', ok: false },
    { at: now - 20 * 60_000, phone: '3105550000', device: 'd1', ok: false },
    { at: now - 2 * 60 * 60_000, phone: '5625550101', device: 'd1', ok: false },
    { at: now - 5 * 60_000, phone: '5625550101', device: 'd1', ok: true },
  ];
  it('counts declines in the last hour by phone or by device', () => {
    expect(failedTries(tries, '5625550101', 'd9', now)).toBe(1);
    // Switching to another phone number on the same device does not reset the count.
    expect(failedTries(tries, '7145550000', 'd1', now)).toBe(2);
    expect(triesLeft(tries, '7145550000', 'd1', DEFAULT_FRAUD, now)).toBe(1);
    expect(triesLeft([...tries, { at: now, phone: 'x', device: 'd1', ok: false }], 'y', 'd1', DEFAULT_FRAUD, now)).toBe(0);
  });
  it('knows the demo cards', () => {
    expect(demoCardOk('4242 4242 4242 4242')).toBe(true);
    expect(demoCardOk('4000000000000002')).toBe(false);
  });
});

describe('order risk', () => {
  it('lets an ordinary small order through untouched', () => {
    expect(orderRisk(base, DEFAULT_FRAUD)).toEqual({ flags: [], idCheck: false, payInPerson: false, threeDS: false });
  });
  it('asks for ID on a big online order and the bank check on a very big one', () => {
    const r = orderRisk({ ...base, totalCents: 6000 }, DEFAULT_FRAUD);
    expect(r.idCheck).toBe(true);
    expect(r.threeDS).toBe(false);
    expect(orderRisk({ ...base, totalCents: 12000 }, DEFAULT_FRAUD).threeDS).toBe(true);
  });
  it('flags a new phone with a big order', () => {
    const r = orderRisk({ ...base, firstTime: true, totalCents: 8000 }, DEFAULT_FRAUD);
    expect(r.flags.map((f) => f.code)).toContain('new-phone-big');
    expect(r.idCheck).toBe(true);
  });
  it('makes first-time customers pay at the counter when the owner turns that on', () => {
    const r = orderRisk({ ...base, firstTime: true }, { ...DEFAULT_FRAUD, firstTimePayInPerson: true });
    expect(r.payInPerson).toBe(true);
    expect(r.threeDS).toBe(false);
    expect(orderRisk({ ...base, firstTime: false }, { ...DEFAULT_FRAUD, firstTimePayInPerson: true }).payInPerson).toBe(false);
  });
  it('flags a delivery billed to a far away ZIP and asks the bank', () => {
    const r = orderRisk({ ...base, fulfillment: 'delivery', billingZip: '33101', deliveryAreas: ['908'] }, DEFAULT_FRAUD);
    expect(r.flags.map((f) => f.code)).toEqual(['zip-far']);
    expect(r.threeDS).toBe(true);
    expect(r.idCheck).toBe(true);
    expect(orderRisk({ ...base, fulfillment: 'delivery', billingZip: '90804', deliveryAreas: ['908'] }, DEFAULT_FRAUD).flags).toEqual([]);
    expect(orderRisk({ ...base, billingZip: '33101', deliveryAreas: ['908'] }, DEFAULT_FRAUD).flags).toEqual([]);
  });
  it('flags earlier declines and a different name on the card', () => {
    expect(orderRisk({ ...base, failedTries: 2 }, DEFAULT_FRAUD).flags[0].label).toMatch(/2 declined cards/);
    expect(orderRisk({ ...base, cardName: 'Jo Diaz' }, DEFAULT_FRAUD).flags.map((f) => f.code)).toEqual(['name-differs']);
  });
});

describe('names and ZIPs', () => {
  it('matches names loosely', () => {
    expect(namesDiffer('Sam Lee', 'Samantha Lee')).toBe(false);
    expect(namesDiffer('maria lopez', 'MARIA L LOPEZ')).toBe(false);
    expect(namesDiffer('Sam Lee', 'Jo Diaz')).toBe(true);
    expect(namesDiffer('', 'Jo Diaz')).toBe(false);
  });
  it('compares ZIP areas', () => {
    expect(zipFar('90815', ['908'])).toBe(false);
    expect(zipFar('92101', ['908', '907'])).toBe(true);
    expect(zipFar('921', ['908'])).toBe(false);
  });
});

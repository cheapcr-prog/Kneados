import { describe, expect, it } from 'vitest';
import { cardCode, cardPayload, lastFour, phoneFromCode, pressKey, readScan } from './wallet';

const MEMBERS = ['5625550101', '2015550199', '9999999999', '2000000000', '5625550102'];

describe('wallet card', () => {
  it('makes a card number that leads back to the member', () => {
    for (const phone of MEMBERS) {
      const code = cardCode(phone);
      expect(code).toMatch(/^DR-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      expect(code).not.toContain(phone.slice(-4));
      expect(phoneFromCode(code, MEMBERS)).toBe(phone);
    }
  });
  it('cannot be worked out from the phone number without the key', () => {
    expect(cardCode('5625550101', 'other-shop-key')).not.toBe(cardCode('5625550101'));
    // Numbers next to each other get unrelated cards, so one card does not reveal its neighbors.
    const a = cardCode('5625550101').replace(/-/g, '');
    const b = cardCode('5625550102').replace(/-/g, '');
    const same = [...a].filter((ch, i) => ch === b[i]).length;
    expect(same).toBeLessThan(6);
  });
  it('gives no card for a short number', () => {
    expect(cardCode('562555')).toBe('');
  });
  it('turns down made-up card numbers and cards of people who are not members', () => {
    expect(phoneFromCode('DR-00000-00001', MEMBERS)).toBeUndefined();
    expect(phoneFromCode('XX-12345-12345', MEMBERS)).toBeUndefined();
    expect(phoneFromCode('hello', MEMBERS)).toBeUndefined();
    expect(phoneFromCode(cardCode('3105550000'), MEMBERS)).toBeUndefined();
    const real = cardCode('5625550101');
    const last = real.slice(-1) === 'A' ? 'B' : 'A';
    expect(phoneFromCode(real.slice(0, -1) + last, MEMBERS)).toBeUndefined();
  });
  it('reads the QR code, a typed card number and a plain phone number, and says which', () => {
    expect(readScan(cardPayload('5625550102'), MEMBERS)).toEqual({ phone: '5625550102', by: 'card' });
    expect(readScan(cardCode('5625550102').toLowerCase(), MEMBERS)).toEqual({ phone: '5625550102', by: 'card' });
    expect(readScan('(562) 555-0103', MEMBERS)).toEqual({ phone: '5625550103', by: 'typed' });
    expect(readScan('15625550103', MEMBERS)).toEqual({ phone: '5625550103', by: 'typed' });
  });
  it('ignores other codes', () => {
    expect(readScan('https://example.com/menu', MEMBERS)).toBeUndefined();
    expect(readScan('0123456789012', MEMBERS)).toBeUndefined();
    expect(readScan('', MEMBERS)).toBeUndefined();
    expect(readScan(cardPayload('3105550000'), MEMBERS)).toBeUndefined();
  });
  it('handles keypad presses', () => {
    let d = '';
    for (const k of '5625550101') d = pressKey(d, k);
    expect(d).toBe('5625550101');
    expect(pressKey(d, '9')).toBe('5625550101');
    expect(pressKey(d, 'back')).toBe('562555010');
    expect(pressKey(d, 'clear')).toBe('');
    expect(pressKey('56', 'x')).toBe('56');
  });
  it('shows only the last four digits', () => {
    expect(lastFour('5625550101')).toBe('(•••) •••-0101');
  });
});

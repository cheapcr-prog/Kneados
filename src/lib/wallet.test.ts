import { describe, expect, it } from 'vitest';
import { cardCode, cardPayload, phoneFromCode, pressKey, readScan } from './wallet';

describe('wallet card', () => {
  it('makes a card number that leads back to the phone', () => {
    for (const phone of ['5625550101', '2015550199', '9999999999', '2000000000']) {
      const code = cardCode(phone);
      expect(code).toMatch(/^DR-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
      expect(code).not.toContain(phone);
      expect(phoneFromCode(code)).toBe(phone);
    }
  });
  it('gives no card for a short number', () => {
    expect(cardCode('562555')).toBe('');
  });
  it('turns down made-up card numbers', () => {
    expect(phoneFromCode('DR-00000-00001')).toBeUndefined();
    expect(phoneFromCode('XX-12345-12345')).toBeUndefined();
    expect(phoneFromCode('hello')).toBeUndefined();
    const real = cardCode('5625550101');
    const last = real.slice(-1) === 'A' ? 'B' : 'A';
    expect(phoneFromCode(real.slice(0, -1) + last)).toBeUndefined();
  });
  it('reads the QR code, a typed card number and a plain phone number', () => {
    expect(readScan(cardPayload('5625550102'))).toBe('5625550102');
    expect(readScan(cardCode('5625550102').toLowerCase())).toBe('5625550102');
    expect(readScan('(562) 555-0103')).toBe('5625550103');
    expect(readScan('15625550103')).toBe('5625550103');
  });
  it('ignores other codes', () => {
    expect(readScan('https://example.com/menu')).toBeUndefined();
    expect(readScan('0123456789012')).toBeUndefined();
    expect(readScan('')).toBeUndefined();
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
});

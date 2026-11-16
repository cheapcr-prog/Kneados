import { describe, expect, it } from 'vitest';
import { MAX_MISSES, MISS_WINDOW_MS, READABLE, addMiss, isLocked, keyedHash, minutesLocked, oneTimeCode, randomCode, toReadable } from './secure';
import { newGiftCode } from './channels';

describe('random codes', () => {
  it('use only the readable letters and are not repeated', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = randomCode(8);
      expect(c).toHaveLength(8);
      for (const ch of c) expect(READABLE).toContain(ch);
      seen.add(c);
    }
    expect(seen.size).toBe(500);
  });
  it('make gift card codes in the ABCD-2345 shape', () => {
    expect(newGiftCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(newGiftCode()).not.toBe(newGiftCode());
  });
  it('make six digit one-time codes', () => {
    expect(oneTimeCode()).toMatch(/^\d{6}$/);
  });
});

describe('keyed fingerprints', () => {
  it('are the same for the same key and text, and change with either', () => {
    expect(keyedHash('k', '5625550101')).toBe(keyedHash('k', '5625550101'));
    expect(keyedHash('k', '5625550101')).not.toBe(keyedHash('k2', '5625550101'));
    expect(keyedHash('k', '5625550101')).not.toBe(keyedHash('k', '5625550102'));
    expect(keyedHash('k', 'x')).toBeLessThan(2 ** 50);
  });
  it('write out at a fixed length', () => {
    expect(toReadable(0, 4)).toBe('AAAA');
    expect(toReadable(2 ** 50 - 1, 10)).toHaveLength(10);
  });
});

describe('wrong tries', () => {
  const t0 = 1_700_000_000_000;
  it(`locks after ${MAX_MISSES} misses and unlocks when the window passes`, () => {
    let t = { misses: [] as number[] };
    for (let i = 0; i < MAX_MISSES - 1; i++) t = addMiss(t, t0 + i * 1000);
    expect(isLocked(t, t0 + 5000)).toBe(false);
    t = addMiss(t, t0 + 5000);
    expect(isLocked(t, t0 + 6000)).toBe(true);
    expect(minutesLocked(t, t0 + 6000)).toBe(15);
    expect(isLocked(t, t0 + MISS_WINDOW_MS + 1000)).toBe(false);
  });
  it('forgets old misses', () => {
    let t = { misses: [t0, t0 + 1, t0 + 2, t0 + 3] };
    t = addMiss(t, t0 + MISS_WINDOW_MS + 10);
    expect(t.misses).toHaveLength(1);
  });
});

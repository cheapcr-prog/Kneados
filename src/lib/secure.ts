/**
 * Small safety helpers shared by gift cards, rewards cards and invoice links.
 *
 * The rule behind all of them: a code that unlocks money or someone's details must not be
 * guessable from anything else (a phone number, an order number, the card sold before it),
 * and a person typing codes at random must hit a wall after a few misses.
 */

/** Letters and digits that are easy to read out loud: no 0, O, 1 or I. */
export const READABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random whole numbers from the browser's (or the server's) secure random source. */
function secureInts(n: number): Uint32Array {
  const out = new Uint32Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** A random code of `length` characters from `alphabet`, with no bias toward any character. */
export function randomCode(length: number, alphabet = READABLE): string {
  const limit = Math.floor(0x1_0000_0000 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    for (const n of secureInts(length - out.length)) {
      // Throw away the few values that would make some characters a little more likely.
      if (n < limit) out += alphabet[n % alphabet.length];
    }
  }
  return out;
}

/**
 * A keyed fingerprint of some text, as a whole number below 2^50.
 * Without the key you cannot work it out from the text, or the text from it.
 * The live system computes this on the server with HMAC-SHA256 and a key that never reaches a browser.
 */
export function keyedHash(key: string, text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const input = `${key}\u0000${text}\u0000${key}`;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  }
  return (h2 >>> 0) % 0x40000 * 0x1_0000_0000 + (h1 >>> 0);
}

/** A number as fixed-length text in the readable alphabet. */
export function toReadable(n: number, length: number, alphabet = READABLE): string {
  let out = '';
  let rest = n;
  for (let i = 0; i < length; i++) {
    out = alphabet[rest % alphabet.length] + out;
    rest = Math.floor(rest / alphabet.length);
  }
  return out;
}

/** A six digit one-time code, like the one texted before a free reward is used. */
export const oneTimeCode = () => randomCode(6, '0123456789');

/** Remembers wrong tries and says when to stop accepting more. */
export interface Tries {
  misses: number[];
}

/** Wrong tries allowed in the window before entry is locked. */
export const MAX_MISSES = 5;
/** How long misses are remembered, and how long a lock lasts. */
export const MISS_WINDOW_MS = 15 * 60 * 1000;

/** The misses still inside the window. */
const recent = (t: Tries, now: number) => t.misses.filter((at) => now - at < MISS_WINDOW_MS);

/** Adds one wrong try. */
export const addMiss = (t: Tries, now = Date.now()): Tries => ({ misses: [...recent(t, now), now] });

/** True when there have been too many wrong tries lately. */
export const isLocked = (t: Tries, now = Date.now()) => recent(t, now).length >= MAX_MISSES;

/** Minutes until a lock lifts, rounded up. */
export function minutesLocked(t: Tries, now = Date.now()): number {
  const r = recent(t, now);
  if (r.length < MAX_MISSES) return 0;
  return Math.ceil((r[r.length - MAX_MISSES] + MISS_WINDOW_MS - now) / 60_000);
}

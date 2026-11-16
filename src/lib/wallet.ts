import { keyedHash, toReadable } from './secure';

/**
 * The Dough Rewards wallet card. The code on the card stands in for the phone number,
 * so a number is never printed in the barcode.
 *
 * The code is a keyed fingerprint of the phone number, not the number written another way.
 * Nobody can work out a member's phone from their card, or make a card for someone else's phone,
 * without the shop's key. On a live shop the key lives on the server and the code is checked there;
 * the demo has no server, so its key ships with the page.
 */
const PREFIX = 'DR';
export const DEMO_CARD_KEY = 'kneados-demo-card-key-v1';

/** The card number for a member's phone, for example DR-1K7QM-2ZDA4. */
export function cardCode(phone: string, key = DEMO_CARD_KEY): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return '';
  const body = toReadable(keyedHash(key, digits), 10);
  return `${PREFIX}-${body.slice(0, 5)}-${body.slice(5)}`;
}

const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Which of these members' phones a card number belongs to, or nothing when it is not one of their cards. */
export function phoneFromCode(code: string, phones: readonly string[], key = DEMO_CARD_KEY): string | undefined {
  const clean = cleanCode(code);
  if (!clean.startsWith(PREFIX) || clean.length !== PREFIX.length + 10) return undefined;
  return phones.find((p) => cleanCode(cardCode(p, key)) === clean);
}

/** What the QR code on the card holds. */
export const cardPayload = (phone: string, key = DEMO_CARD_KEY) => `doughrewards:${cardCode(phone, key)}`;

/**
 * How a customer was found. A scanned card proves they hold the card. A typed number only
 * proves someone knows the number, so using a free reward then needs a texted code first.
 */
export type FoundBy = 'card' | 'typed';

/**
 * Reads whatever the scanner picked up: the card's QR code, a typed card number,
 * or a plain ten digit phone number from a handheld scanner.
 */
export function readScan(text: string, phones: readonly string[], key = DEMO_CARD_KEY): { phone: string; by: FoundBy } | undefined {
  const t = text.trim();
  const payload = /^doughrewards:(.+)$/i.exec(t);
  if (payload) {
    const phone = phoneFromCode(payload[1], phones, key);
    return phone ? { phone, by: 'card' } : undefined;
  }
  const fromCode = phoneFromCode(t, phones, key);
  if (fromCode) return { phone: fromCode, by: 'card' };
  const digits = t.replace(/\D/g, '');
  if (/^[\d\s().+-]+$/.test(t) && digits.length === 10) return { phone: digits, by: 'typed' };
  if (/^[\d\s().+-]+$/.test(t) && digits.length === 11 && digits.startsWith('1')) return { phone: digits.slice(1), by: 'typed' };
  return undefined;
}

/** Keypad presses. Keeps at most ten digits. */
export function pressKey(digits: string, key: string): string {
  if (key === 'back') return digits.slice(0, -1);
  if (key === 'clear') return '';
  if (!/^\d$/.test(key) || digits.length >= 10) return digits;
  return digits + key;
}

/** The last four digits, for showing whose phone a code went to without showing the whole number. */
export const lastFour = (phone: string) => `(•••) •••-${phone.replace(/\D/g, '').slice(-4)}`;

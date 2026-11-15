/**
 * The Dough Rewards wallet card. The code on the card stands in for the phone number,
 * so a number is never printed in the barcode.
 */
const PREFIX = 'DR';
const MULT = 7919;
const OFFSET = 4321;

/** The card number for a member's phone, for example DR-1K7Q-M2ZD. */
export function cardCode(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return '';
  const body = (Number(digits) * MULT + OFFSET).toString(36).toUpperCase().padStart(10, '0');
  return `${PREFIX}-${body.slice(0, 5)}-${body.slice(5)}`;
}

/** The phone a card number belongs to, or nothing when the number is not a real card. */
export function phoneFromCode(code: string): string | undefined {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean.startsWith(PREFIX) || clean.length !== PREFIX.length + 10) return undefined;
  const n = parseInt(clean.slice(PREFIX.length), 36) - OFFSET;
  if (!Number.isSafeInteger(n) || n <= 0 || n % MULT !== 0) return undefined;
  const digits = String(n / MULT);
  return digits.length === 10 ? digits : undefined;
}

/** What the QR code on the card holds. */
export const cardPayload = (phone: string) => `doughrewards:${cardCode(phone)}`;

/**
 * Reads whatever the scanner picked up: the card's QR code, a typed card number,
 * or a plain ten digit phone number from a handheld scanner.
 */
export function readScan(text: string): string | undefined {
  const t = text.trim();
  const payload = /^doughrewards:(.+)$/i.exec(t);
  if (payload) return phoneFromCode(payload[1]);
  const fromCode = phoneFromCode(t);
  if (fromCode) return fromCode;
  const digits = t.replace(/\D/g, '');
  if (/^[\d\s().+-]+$/.test(t) && digits.length === 10) return digits;
  if (/^[\d\s().+-]+$/.test(t) && digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return undefined;
}

/** Keypad presses. Keeps at most ten digits. */
export function pressKey(digits: string, key: string): string {
  if (key === 'back') return digits.slice(0, -1);
  if (key === 'clear') return '';
  if (!/^\d$/.test(key) || digits.length >= 10) return digits;
  return digits + key;
}

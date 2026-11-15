export function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function moneyShort(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** Long Beach, CA combined sales tax rate used by the demo shop. Each shop sets its own. */
export const DEMO_TAX_RATE = 0.1025;

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

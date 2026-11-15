import type { Role } from '../data/types';

/**
 * Daily tip pool, split by hours worked.
 *
 * California Labor Code 351 says tips belong to the employees who earned them. Owners and
 * managers can't take a share, so they're left out of the pool by default.
 */

export interface TipWorker {
  staffId: string;
  role: Role;
  hours: number;
}

export interface TipShare {
  staffId: string;
  hours: number;
  cents: number;
}

export const TIP_INELIGIBLE: Role[] = ['owner', 'manager'];

export function isTipEligible(role: Role): boolean {
  return !TIP_INELIGIBLE.includes(role);
}

/**
 * Splits the pool so every cent is handed out and nobody is off by rounding.
 * Returns an empty list when nobody eligible worked: the pool then carries over.
 */
export function splitTipPool(poolCents: number, workers: TipWorker[]): TipShare[] {
  const eligible = workers.filter((w) => isTipEligible(w.role) && w.hours > 0);
  const totalHours = eligible.reduce((a, w) => a + w.hours, 0);
  if (poolCents <= 0 || totalHours <= 0) return [];

  const raw = eligible.map((w) => {
    const exact = (poolCents * w.hours) / totalHours;
    return { staffId: w.staffId, hours: w.hours, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = poolCents - raw.reduce((a, r) => a + r.cents, 0);
  // Hand leftover cents to the largest remainders first. Ties go to whoever worked more hours.
  const order = [...raw].sort((a, b) => b.remainder - a.remainder || b.hours - a.hours || a.staffId.localeCompare(b.staffId));
  for (const r of order) {
    if (leftover <= 0) break;
    r.cents += 1;
    leftover -= 1;
  }
  return raw.map(({ staffId, hours, cents }) => ({ staffId, hours, cents }));
}

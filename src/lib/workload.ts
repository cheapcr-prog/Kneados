import type { MenuItem, Order, Role, StaffMember } from '../data/types';
import { packPlan } from './packing';

/** Slack between finishing an order and the customer walking in, so it is never packed late. */
export const READY_BUFFER_SEC = 5 * 60;

/** Who should pack first when they are on the clock. Bakers are the last resort. */
const PACK_ORDER: Role[] = ['cashier', 'manager', 'owner', 'baker'];

/** A rough time to pack an order, in seconds. A live shop's numbers would be learned from its own packing times. */
export function packSeconds(order: Pick<Order, 'lines' | 'boxes'>, menu: Record<string, MenuItem>): number {
  const plan = packPlan(order, menu);
  const count = (items: [string, number][]) => items.reduce((a, [, q]) => a + q, 0);
  const boxed = plan.boxes.reduce((a, b) => a + count(b), 0);
  return 20 + plan.boxes.length * 10 + (boxed + count(plan.bag)) * 4 + count(plan.cups) * 15;
}

export interface Assignment {
  orderId: string;
  /** Who packs it. Undefined when nobody is on the clock. */
  staffId?: string;
  packSec: number;
  /** Start packing by this time (ISO) to have it ready before pickup. */
  startBy: string;
  /** True once the start-by time has passed. */
  packNow: boolean;
}

export interface Workload {
  /** One per open order, in the order they should be packed. */
  queue: Assignment[];
  /** Seconds of packing each person has been given. */
  load: Record<string, number>;
  /** The roles that are packing right now, e.g. only bakers are on the clock. */
  packers: StaffMember[];
}

/**
 * Shares today's open pickup orders across the people on the clock.
 * Orders are taken in the order they must be started, and each goes to whoever has the least to pack so far.
 * Counter staff pack first. A manager or owner packs only if no cashier is on the clock, and bakers only if nobody else is.
 * An order somebody has already started stays with the plan it was given, since the list is rebuilt the same way each time.
 */
export function planWorkload(orders: Order[], onClock: StaffMember[], menu: Record<string, MenuItem>, now: Date): Workload {
  const role = PACK_ORDER.find((r) => onClock.some((s) => s.role === r));
  const packers = role ? onClock.filter((s) => s.role === role) : [];
  const load: Record<string, number> = Object.fromEntries(packers.map((s) => [s.id, 0]));

  const queue = orders
    .filter((o) => o.pickupAt && o.status !== 'done')
    .map((o) => {
      const packSec = packSeconds(o, menu);
      const startBy = new Date(new Date(o.pickupAt!).getTime() - (packSec + READY_BUFFER_SEC) * 1000);
      return { order: o, packSec, startBy };
    })
    .sort((a, b) => a.startBy.getTime() - b.startBy.getTime() || a.order.number - b.order.number)
    .map(({ order, packSec, startBy }): Assignment => {
      const packer = packers.reduce<StaffMember | undefined>((best, s) => (best === undefined || load[s.id] < load[best.id] ? s : best), undefined);
      // An order that is already packed and waiting adds no work.
      if (packer && order.status !== 'ready') load[packer.id] += packSec;
      return { orderId: order.id, staffId: packer?.id, packSec, startBy: startBy.toISOString(), packNow: order.status !== 'ready' && now >= startBy };
    });

  return { queue, load, packers };
}

import { addDays } from '../lib/dates';
import type { Subscription } from '../lib/subscriptions';
import { SHOP } from './shop';

/** The van leaves at this time on delivery days. */
export const ROUTE_LEAVES = '07:30';

/** Example offices. The names, addresses and map positions are made up for the demo. */
export function seedSubscriptions(today: string): Subscription[] {
  const mk = (id: string, company: string, contact: string, address: string, dLat: number, dLon: number, dow: number, dozens: number, mix: Subscription['mix'], by: string, weeksAgo: number): Subscription => ({
    id, company, contact, email: `${contact.split(' ')[0].toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, '')}.example`, address,
    lat: SHOP.lat + dLat, lon: SHOP.lon + dLon, dow, dozens, mix, by, since: addDays(today, -7 * weeksAgo), status: 'active', skips: [],
  });
  return [
    mk('s-pier', 'Pier Point Insurance', 'Angela R.', '200 Demo Ocean Blvd, Suite 400', 0.004, 0.012, 5, 3, 'assorted', '09:00', 14),
    mk('s-dental', 'Harbor Dental Group', 'Dr. Kim', '1450 Demo Atlantic Ave', 0.021, -0.006, 5, 2, 'classic', '08:30', 9),
    mk('s-arch', 'Tidewater Architects', 'Noah B.', '88 Demo Pine Ave, Floor 3', 0.008, 0.021, 5, 2, 'premium', '09:00', 6),
    mk('s-auto', 'Signal Auto Body', 'Rick M.', '2710 Demo Cherry Ave', 0.036, 0.018, 5, 4, 'classic', '08:00', 21),
    mk('s-school', 'Lowell Elementary staff room', 'Ms. Ortiz', '5201 Demo 2nd St', -0.006, 0.045, 5, 3, 'assorted', '08:00', 11),
    mk('s-cowork', 'Shoreline Cowork', 'Jas P.', '300 Demo Broadway', 0.002, 0.027, 1, 4, 'assorted', '09:00', 8),
    mk('s-realty', 'Coastline Realty', 'Maria G.', '4100 Demo Viking Way', 0.047, 0.052, 1, 2, 'classic', '09:30', 5),
    mk('s-clinic', 'Bixby Family Clinic', 'Tessa W.', '3900 Demo Long Beach Blvd', 0.055, -0.002, 3, 3, 'classic', '08:30', 16),
    mk('s-studio', 'Fourth Street Yoga', 'Dee L.', '2100 Demo 4th St', 0.003, 0.034, 3, 1, 'premium', '10:00', 3),
    mk('s-ship', 'Pacific Freight Brokers', 'Omar S.', '111 Demo Harbor Plaza', -0.012, -0.014, 2, 5, 'assorted', '08:00', 19),
    mk('s-bank', 'Belmont Credit Union', 'Lena H.', '5000 Demo E 2nd St', -0.004, 0.049, 4, 2, 'classic', '09:00', 7),
    mk('s-gym', 'Iron Tide Fitness', 'Cole D.', '1800 Demo Ximeno Ave', 0.018, 0.058, 4, 2, 'premium', '09:30', 2),
    mk('s-church', 'Grace Community Church', 'Pastor Lee', '3600 Demo Bellflower Blvd', 0.03, 0.072, 0, 6, 'classic', '08:30', 24),
    mk('s-yard', 'Marina Boat Yard', 'Sal V.', '6200 Demo Marina Dr', -0.01, 0.07, 6, 3, 'assorted', '08:00', 10),
  ];
}

/** A map position for an address typed into the signup form. The demo has no address lookup, so it places it near the shop. */
export function placeNear(address: string): { lat: number; lon: number } {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) { h ^= address.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = ((h >>> 10) % 1000) / 1000;
  return { lat: SHOP.lat - 0.01 + a * 0.06, lon: SHOP.lon - 0.01 + b * 0.07 };
}

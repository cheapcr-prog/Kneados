import { addDays } from '../lib/dates';
import type { Equipment, Repair, ShopTask, TaskDone } from '../lib/upkeep';

/** The demo shop's upkeep list. Example tasks and intervals: a real shop follows its own health department and equipment manuals. */
export const TASKS: ShopTask[] = [
  { id: 'open-coffee', name: 'Brew coffee and stock the cup station', area: 'Opening', everyDays: 1, group: 'counter', minutes: 10 },
  { id: 'open-case', name: 'Fill and label the display case', area: 'Opening', everyDays: 1, group: 'counter', minutes: 15 },
  { id: 'open-till', name: 'Count the cash drawer', area: 'Opening', everyDays: 1, group: 'counter', minutes: 5 },
  { id: 'temps', name: 'Log fridge and milk temperatures', area: 'Safety', everyDays: 1, group: 'counter', minutes: 3 },
  { id: 'sanitizer', name: 'Test the sanitizer buckets', area: 'Safety', everyDays: 1, group: 'kitchen', minutes: 3 },
  { id: 'oil-filter', name: 'Filter the fryer oil', area: 'Cleaning', everyDays: 1, group: 'kitchen', minutes: 20 },
  { id: 'oil-change', name: 'Change the fryer oil', area: 'Cleaning', everyDays: 7, group: 'kitchen', minutes: 45 },
  { id: 'glazer', name: 'Break down and wash the glazing table', area: 'Closing', everyDays: 1, group: 'kitchen', minutes: 20 },
  { id: 'close-case', name: 'Empty the case and log what is left', area: 'Closing', everyDays: 1, group: 'counter', minutes: 10 },
  { id: 'floors', name: 'Sweep and mop the front', area: 'Closing', everyDays: 1, group: 'counter', minutes: 15 },
  { id: 'espresso', name: 'Backflush the espresso machine', area: 'Cleaning', everyDays: 1, group: 'counter', minutes: 8 },
  { id: 'proofer', name: 'Deep clean the proofer', area: 'Cleaning', everyDays: 7, group: 'kitchen', minutes: 30 },
  { id: 'hood', name: 'Clean the hood filters', area: 'Cleaning', everyDays: 14, group: 'kitchen', minutes: 30 },
  { id: 'grease-trap', name: 'Check the grease trap', area: 'Safety', everyDays: 30, group: 'kitchen', minutes: 15 },
  { id: 'ice', name: 'Clean and sanitize the ice bin', area: 'Cleaning', everyDays: 7, group: 'counter', minutes: 20 },
  { id: 'windows', name: 'Wash the front windows', area: 'Cleaning', everyDays: 7, group: 'counter', minutes: 15 },
];

/** Who did what before the demo starts. Opening tasks are done once the shop has been open a while. */
export function seedTasksDone(today: string, hour: number): Record<string, TaskDone> {
  const ago = (n: number) => addDays(today, -n);
  const done: Record<string, TaskDone> = {
    'oil-change': { date: ago(6), by: 'luis' },
    proofer: { date: ago(9), by: 'mai' },
    hood: { date: ago(19), by: 'luis' },
    'grease-trap': { date: ago(24), by: 'danny' },
    ice: { date: ago(3), by: 'jess' },
    windows: { date: ago(7), by: 'andre' },
  };
  for (const t of TASKS.filter((x) => x.everyDays === 1)) done[t.id] = { date: ago(1), by: t.group === 'kitchen' ? 'luis' : 'jess' };
  if (hour >= 6) for (const id of ['open-coffee', 'open-case', 'open-till', 'sanitizer']) done[id] = { date: today, by: id === 'sanitizer' ? 'luis' : 'jess' };
  return done;
}

/** The demo shop's equipment. Models, prices and service companies are examples, not real quotes. */
export function seedEquipment(today: string): Equipment[] {
  const ago = (n: number) => addDays(today, -n);
  return [
    { id: 'fryer', name: 'Donut fryer', where: 'Kitchen', model: '34 inch gas fryer', bought: ago(2010), costCents: 780000, warrantyMonths: 12, vendor: 'Restaurant repair service', vendorPhone: '5625550181', serviceEveryDays: 180, serviceTask: 'Burner and thermostat check', lastService: ago(142) },
    { id: 'proofer', name: 'Proofer cabinet', where: 'Kitchen', model: 'Single door proof box', bought: ago(1280), costCents: 420000, warrantyMonths: 24, vendor: 'Restaurant repair service', vendorPhone: '5625550181', serviceEveryDays: 365, serviceTask: 'Door gasket and humidity check', lastService: ago(390) },
    { id: 'mixer', name: '60 quart mixer', where: 'Kitchen', model: 'Floor mixer with dough hook', bought: ago(2900), costCents: 1150000, warrantyMonths: 12, vendor: 'Restaurant repair service', vendorPhone: '5625550181', serviceEveryDays: 365, serviceTask: 'Grease and belt check', lastService: ago(201) },
    { id: 'hood', name: 'Exhaust hood and fire system', where: 'Kitchen', model: '10 foot hood with fire suppression', bought: ago(2900), costCents: 1400000, warrantyMonths: 12, vendor: 'Hood and fire service', vendorPhone: '5625550194', serviceEveryDays: 180, serviceTask: 'Fire suppression inspection (required twice a year)', lastService: ago(168) },
    { id: 'espresso', name: 'Espresso machine', where: 'Counter', model: 'Two group machine', bought: ago(410), costCents: 890000, warrantyMonths: 24, vendor: 'Coffee equipment service', vendorPhone: '5625550173', serviceEveryDays: 180, serviceTask: 'Descale and gasket change', lastService: ago(96) },
    { id: 'case', name: 'Refrigerated display case', where: 'Counter', model: '6 foot bakery case', bought: ago(1650), costCents: 520000, warrantyMonths: 36, vendor: 'Refrigeration service', vendorPhone: '5625550127', serviceEveryDays: 180, serviceTask: 'Coil cleaning', lastService: ago(60) },
    { id: 'ice', name: 'Ice machine', where: 'Counter', model: 'Undercounter ice maker', bought: ago(1650), costCents: 310000, warrantyMonths: 36, vendor: 'Refrigeration service', vendorPhone: '5625550127', serviceEveryDays: 180, serviceTask: 'Descale and filter change', lastService: ago(175) },
    { id: 'pos', name: 'Register iPad and card reader', where: 'Counter', model: 'iPad with stand and reader', bought: ago(300), costCents: 110000, warrantyMonths: 12, vendor: 'KneadOS support', vendorPhone: '', serviceEveryDays: 365, serviceTask: 'Battery and reader check', lastService: ago(300) },
  ];
}

export function seedRepairs(today: string): Repair[] {
  const at = (n: number) => addDays(today, -n) + 'T15:10:00.000Z';
  return [
    { id: 'r1', equipmentId: 'proofer', problem: 'Door gasket is torn and steam leaks out, so dough is proofing slowly.', reportedBy: 'luis', reportedAt: at(1), status: 'open' },
    { id: 'r2', equipmentId: 'ice', problem: 'Making about half the ice it should.', reportedBy: 'jess', reportedAt: at(4), status: 'scheduled', visit: addDays(today, 1) },
    { id: 'r3', equipmentId: 'ice', problem: 'Water leaking under the machine.', reportedBy: 'andre', reportedAt: at(62), status: 'fixed', costCents: 28500, fixedAt: at(59) },
    { id: 'r4', equipmentId: 'fryer', problem: 'Pilot light keeps going out.', reportedBy: 'mai', reportedAt: at(210), status: 'fixed', costCents: 41000, fixedAt: at(208) },
    { id: 'r5', equipmentId: 'fryer', problem: 'Thermostat reads 20 degrees low. Replaced the thermostat and gas valve.', reportedBy: 'luis', reportedAt: at(410), status: 'fixed', costCents: 162000, fixedAt: at(405) },
    { id: 'r6', equipmentId: 'fryer', problem: 'Cracked fry pot weld, re-welded.', reportedBy: 'luis', reportedAt: at(700), status: 'fixed', costCents: 215000, fixedAt: at(694) },
    { id: 'r7', equipmentId: 'mixer', problem: 'Loud grinding in second gear. New transmission bearing.', reportedBy: 'mai', reportedAt: at(520), status: 'fixed', costCents: 96000, fixedAt: at(512) },
  ];
}

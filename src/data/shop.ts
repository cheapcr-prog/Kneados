import type { MenuItem, RewardsMember, Shift, StaffMember } from './types';

/** The demo shop. It is made up: every number in the demo comes from generated data, not a real business. */
export const SHOP = {
  name: 'Good Batch Donuts',
  tagline: 'Fried fresh at 4am. Gone by noon.',
  city: 'Long Beach, CA',
  address: '123 Demo Street, Long Beach, CA',
  phone: '(562) 555-0142',
  hours: 'Open daily 5am to 1pm',
  openHour: 5,
  closeHour: 13,
  tippingEnabled: true,
  tipChoices: [100, 200, 300],
  /** What a mixed dozen costs before any specialty extras, in cents. */
  dozenBase: 1800,
};

const d = (id: string, name: string, category: MenuItem['category'], price: number, dozenPrice: number | undefined, baseDaily: number, icing: string, dough: string, description: string, allergens: string[], extra: Partial<MenuItem> = {}): MenuItem => ({
  id, name, category, price, dozenPrice, baseDaily, icing, dough, description, allergens, baked: true, taxable: false, ...extra,
});

const WHEAT = ['Wheat', 'Egg', 'Milk', 'Soy'];

export const MENU: MenuItem[] = [
  d('glazed', 'Glazed', 'Classics', 175, 1800, 150, '#fde9c4', '#d99a4e', 'The one everybody came for. Light, warm, sugar-glazed.', WHEAT),
  d('chocolate', 'Chocolate Bar', 'Classics', 225, 2400, 85, '#5a3a22', '#d99a4e', 'Long raised bar, thick chocolate icing.', WHEAT),
  d('maple', 'Maple Bar', 'Classics', 225, 2400, 80, '#c98a3d', '#d99a4e', 'Raised bar with real maple icing.', WHEAT),
  d('sprinkle', 'Pink Sprinkle', 'Classics', 200, 2100, 70, '#fb6f9f', '#d99a4e', 'Strawberry icing, rainbow sprinkles. Kids pick it every time.', WHEAT, { sprinkles: true }),
  d('oldfashioned', 'Old Fashioned', 'Classics', 200, 2100, 55, '#f3dcae', '#b9782f', 'Craggy, crisp edges, soft cake center.', WHEAT),
  d('sugar', 'Sugar Twist', 'Classics', 200, 2100, 45, '#fff6e5', '#d99a4e', 'Hand-twisted and rolled in sugar.', WHEAT),
  d('jelly', 'Raspberry Jelly', 'Filled', 250, 2700, 50, '#fff6e5', '#d99a4e', 'Powdered shell, raspberry filling.', WHEAT),
  d('custard', 'Boston Cream', 'Filled', 275, 3000, 45, '#5a3a22', '#d99a4e', 'Vanilla custard inside, chocolate on top.', WHEAT),
  d('fritter', 'Apple Fritter', 'Specialty', 350, undefined, 40, '#f3dcae', '#a5631f', 'Big, crisp, loaded with apple and cinnamon.', WHEAT, { boxUpcharge: 150 }),
  d('cinnamon', 'Cinnamon Roll', 'Specialty', 375, undefined, 35, '#fff6e5', '#b9782f', 'Rolled by hand, iced while warm.', WHEAT, { boxUpcharge: 150 }),
  d('croissant', 'Ham & Cheese Croissant', 'Specialty', 550, undefined, 30, '#f6c36a', '#d99a4e', 'Baked every morning. Great with coffee.', WHEAT, { taxable: true }),
  d('holes', 'Donut Holes (dozen)', 'Classics', 350, undefined, 38, '#fde9c4', '#d99a4e', 'A dozen glazed holes in a bag.', WHEAT),
  d('coffee', 'Hot Coffee', 'Drinks', 250, undefined, 120, '#3b2a1e', '#f8fafc', 'Fresh pot every 30 minutes.', [], { baked: false, taxable: true }),
  d('icedcoffee', 'Iced Coffee', 'Drinks', 395, undefined, 60, '#8a6242', '#f8fafc', 'Cold, sweet, strong.', ['Milk'], { baked: false, taxable: true }),
  d('milk', 'Milk', 'Drinks', 225, undefined, 25, '#ffffff', '#f8fafc', 'Whole or chocolate.', ['Milk'], { baked: false, taxable: false }),
];

export const MENU_BY_ID: Record<string, MenuItem> = Object.fromEntries(MENU.map((m) => [m.id, m]));

export const STAFF: StaffMember[] = [
  { id: 'rosa', name: 'Rosa M.', role: 'owner', pin: '1111', hourlyCents: 0 },
  { id: 'danny', name: 'Danny T.', role: 'manager', pin: '2222', hourlyCents: 2400 },
  { id: 'luis', name: 'Luis R.', role: 'baker', pin: '3333', hourlyCents: 2200 },
  { id: 'mai', name: 'Mai N.', role: 'baker', pin: '4444', hourlyCents: 2100 },
  { id: 'jess', name: 'Jess P.', role: 'cashier', pin: '5555', hourlyCents: 1800 },
  { id: 'andre', name: 'Andre W.', role: 'cashier', pin: '6666', hourlyCents: 1800 },
];

export const STAFF_BY_ID: Record<string, StaffMember> = Object.fromEntries(STAFF.map((s) => [s.id, s]));

const week = (staffId: string, days: number[], start: string, end: string): Shift[] => days.map((dow) => ({ staffId, dow, start, end }));

export const SCHEDULE: Shift[] = [
  ...week('rosa', [1, 2, 3, 4, 5, 6], '05:00', '11:00'),
  ...week('danny', [0, 3, 4, 5, 6], '04:30', '13:30'),
  ...week('luis', [0, 1, 2, 5, 6], '02:00', '10:00'),
  ...week('mai', [0, 3, 4, 5, 6], '02:00', '10:00'),
  ...week('jess', [0, 1, 2, 3, 6], '05:00', '13:00'),
  ...week('andre', [0, 4, 5, 6], '05:00', '13:00'),
  ...week('andre', [1, 2], '07:00', '13:00'),
];

export function shiftHours(s: Shift): number {
  const [sh, sm] = s.start.split(':').map(Number);
  const [eh, em] = s.end.split(':').map(Number);
  return eh + em / 60 - (sh + sm / 60);
}

export const SEED_MEMBERS: RewardsMember[] = [
  { phone: '5625550101', name: 'Carla V.', punches: 9, rewards: 0, visits: 29, joined: '2026-08-02' },
  { phone: '5625550102', name: 'Tom H.', punches: 4, rewards: 1, visits: 14, joined: '2026-09-11' },
  { phone: '5625550103', name: 'Priya S.', punches: 7, rewards: 0, visits: 7, joined: '2026-10-05' },
  { phone: '5625550104', name: 'Marcus L.', punches: 2, rewards: 2, visits: 42, joined: '2026-07-19' },
  { phone: '5625550105', name: 'Office: Harbor Dental', punches: 6, rewards: 0, visits: 16, joined: '2026-09-28' },
  { phone: '5625550106', name: 'Elena G.', punches: 1, rewards: 0, visits: 1, joined: '2026-11-08' },
];

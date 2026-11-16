/**
 * The pizza demo shop. It is made up: every number in pizza mode comes from generated data, not a real business.
 * Prices, recipes and portions are examples a real shop replaces with its own.
 */
import { addDays, dowOf } from '../lib/dates';

export const PIZZA_SHOP = {
  name: 'Shoreline Slice Co.',
  tagline: 'Hand-stretched, deck-baked, out the door hot.',
  city: 'Long Beach, CA',
  lat: 33.77,
  lon: -118.19,
  timezone: 'America/Los_Angeles',
  address: '456 Demo Avenue, Long Beach, CA',
  phone: '(562) 555-0177',
  hours: 'Open daily 11am to 10pm, Fri and Sat to 11pm',
  openHour: 11,
  closeHour: 22,
  /** Deck oven: how many pies bake at once, and how long one bakes. */
  ovenSlots: 6,
  bakeMinutes: 7,
  /** Minutes to stretch, sauce and top one pie on the make line. */
  makeMinutes: 3,
  /** Minutes a driver needs at the shop between runs (load bags, cash out). */
  dispatchMinutes: 4,
  taxRate: 0.1025,
};

/* ---------------------------------------------------------------- sizes, crusts, sauces, cheese */

export type SizeId = 'S' | 'M' | 'L';

export interface Size {
  id: SizeId;
  label: string;
  inches: number;
  slices: number;
  /** Dough ball weight in grams. */
  doughGrams: number;
  cheeseGrams: number;
  sauceGrams: number;
  /** How much of a medium portion each topping gets on this size. */
  toppingScale: number;
  /** Plain cheese pizza price, in cents. */
  baseCents: number;
  /** Price of one regular topping on the whole pie, in cents. */
  toppingCents: number;
  /** Price of one premium topping on the whole pie, in cents. */
  premiumCents: number;
  boxCents: number;
}

export const SIZES: Size[] = [
  { id: 'S', label: 'Small', inches: 10, slices: 6, doughGrams: 250, cheeseGrams: 110, sauceGrams: 90, toppingScale: 0.55, baseCents: 1199, toppingCents: 150, premiumCents: 200, boxCents: 38 },
  { id: 'M', label: 'Medium', inches: 14, slices: 8, doughGrams: 400, cheeseGrams: 200, sauceGrams: 150, toppingScale: 1, baseCents: 1599, toppingCents: 200, premiumCents: 275, boxCents: 52 },
  { id: 'L', label: 'Large', inches: 18, slices: 10, doughGrams: 620, cheeseGrams: 320, sauceGrams: 230, toppingScale: 1.6, baseCents: 1999, toppingCents: 250, premiumCents: 350, boxCents: 68 },
];
export const SIZE_BY_ID = Object.fromEntries(SIZES.map((s) => [s.id, s])) as Record<SizeId, Size>;

export type CrustId = 'hand' | 'thin' | 'pan' | 'gf';
export const CRUSTS: { id: CrustId; label: string; note: string; extraCents: number; sizes: SizeId[] }[] = [
  { id: 'hand', label: 'Hand-tossed', note: 'Our 48 hour cold-fermented dough', extraCents: 0, sizes: ['S', 'M', 'L'] },
  { id: 'thin', label: 'Thin & crispy', note: 'Same dough, stretched thin', extraCents: 0, sizes: ['S', 'M', 'L'] },
  { id: 'pan', label: 'Detroit pan', note: 'Thick, airy, crispy cheese edge', extraCents: 300, sizes: ['M', 'L'] },
  { id: 'gf', label: 'Gluten-free', note: '10 inch only. Made in a shared kitchen.', extraCents: 300, sizes: ['S'] },
];

export type SauceId = 'red' | 'garlic' | 'bbq' | 'pesto' | 'none';
export const SAUCES: { id: SauceId; label: string; color: string; extraCents: number }[] = [
  { id: 'red', label: 'Classic red', color: '#c2321d', extraCents: 0 },
  { id: 'garlic', label: 'Garlic white', color: '#f3e9d2', extraCents: 0 },
  { id: 'bbq', label: 'BBQ', color: '#6b2a14', extraCents: 0 },
  { id: 'pesto', label: 'Basil pesto', color: '#4d7c2a', extraCents: 100 },
  { id: 'none', label: 'No sauce', color: '#e8c58c', extraCents: 0 },
];

export type CheeseId = 'regular' | 'light' | 'extra' | 'vegan' | 'none';
export const CHEESES: { id: CheeseId; label: string; amount: number; extra: Record<SizeId, number> }[] = [
  { id: 'regular', label: 'Mozzarella', amount: 1, extra: { S: 0, M: 0, L: 0 } },
  { id: 'light', label: 'Light cheese', amount: 0.6, extra: { S: 0, M: 0, L: 0 } },
  { id: 'extra', label: 'Extra cheese', amount: 1.5, extra: { S: 150, M: 200, L: 250 } },
  { id: 'vegan', label: 'Vegan cheese', amount: 0, extra: { S: 200, M: 250, L: 300 } },
  { id: 'none', label: 'No cheese', amount: 0, extra: { S: 0, M: 0, L: 0 } },
];

/* ---------------------------------------------------------------- toppings */

export type Shape = 'disc' | 'cup' | 'crumble' | 'strip' | 'square' | 'cube' | 'slice' | 'ring' | 'leaf' | 'chunk' | 'dollop' | 'dot';

export interface Topping {
  id: string;
  name: string;
  kind: 'meat' | 'veggie';
  premium?: boolean;
  /** Grams on a whole medium pie. */
  grams: number;
  /** What the shop pays for a pound, in cents. */
  costPerLbCents: number;
  /** How it is drawn on the live pizza. */
  shape: Shape;
  color: string;
  accent?: string;
  /** How many pieces go on a whole medium pie in the drawing. */
  pieces: number;
}

export const TOPPINGS: Topping[] = [
  { id: 'pepperoni', name: 'Pepperoni', kind: 'meat', grams: 70, costPerLbCents: 499, shape: 'disc', color: '#b8321e', accent: '#8f1f12', pieces: 18 },
  { id: 'cupchar', name: 'Cup & char pepperoni', kind: 'meat', premium: true, grams: 70, costPerLbCents: 649, shape: 'cup', color: '#a32a17', accent: '#5e140a', pieces: 22 },
  { id: 'sausage', name: 'Italian sausage', kind: 'meat', grams: 85, costPerLbCents: 399, shape: 'crumble', color: '#7a4428', accent: '#5a2f1a', pieces: 26 },
  { id: 'bacon', name: 'Bacon', kind: 'meat', premium: true, grams: 60, costPerLbCents: 699, shape: 'strip', color: '#9c3b2a', accent: '#f0b8a6', pieces: 12 },
  { id: 'ham', name: 'Ham', kind: 'meat', grams: 70, costPerLbCents: 449, shape: 'square', color: '#f0a49b', accent: '#e07f75', pieces: 14 },
  { id: 'chicken', name: 'Grilled chicken', kind: 'meat', premium: true, grams: 90, costPerLbCents: 499, shape: 'cube', color: '#e6cf9f', accent: '#b89156', pieces: 16 },
  { id: 'meatball', name: 'Meatball', kind: 'meat', premium: true, grams: 90, costPerLbCents: 449, shape: 'disc', color: '#6e3b22', accent: '#4a2414', pieces: 10 },
  { id: 'mushroom', name: 'Mushrooms', kind: 'veggie', grams: 70, costPerLbCents: 299, shape: 'slice', color: '#d9c4a4', accent: '#8a6a45', pieces: 16 },
  { id: 'onion', name: 'Red onion', kind: 'veggie', grams: 55, costPerLbCents: 109, shape: 'ring', color: '#9b4f96', pieces: 14 },
  { id: 'greenpepper', name: 'Green peppers', kind: 'veggie', grams: 60, costPerLbCents: 199, shape: 'strip', color: '#2f8a3b', accent: '#1f6b2b', pieces: 14 },
  { id: 'olive', name: 'Black olives', kind: 'veggie', grams: 45, costPerLbCents: 449, shape: 'ring', color: '#1f1f1f', pieces: 22 },
  { id: 'jalapeno', name: 'Jalapeños', kind: 'veggie', grams: 35, costPerLbCents: 249, shape: 'ring', color: '#3e9b3a', pieces: 14 },
  { id: 'banana', name: 'Banana peppers', kind: 'veggie', grams: 40, costPerLbCents: 299, shape: 'ring', color: '#d7c94a', pieces: 14 },
  { id: 'pineapple', name: 'Pineapple', kind: 'veggie', grams: 80, costPerLbCents: 199, shape: 'chunk', color: '#f4d03f', accent: '#d4ac0d', pieces: 16 },
  { id: 'tomato', name: 'Roma tomato', kind: 'veggie', grams: 70, costPerLbCents: 249, shape: 'disc', color: '#e0422b', accent: '#f6a08f', pieces: 10 },
  { id: 'spinach', name: 'Spinach', kind: 'veggie', grams: 40, costPerLbCents: 399, shape: 'leaf', color: '#2d6a2e', pieces: 14 },
  { id: 'basil', name: 'Fresh basil', kind: 'veggie', grams: 8, costPerLbCents: 1599, shape: 'leaf', color: '#3f8f3a', pieces: 9 },
  { id: 'garlic', name: 'Roasted garlic', kind: 'veggie', grams: 15, costPerLbCents: 499, shape: 'dot', color: '#f1e3b8', accent: '#c9a96a', pieces: 20 },
  { id: 'freshmozz', name: 'Fresh mozzarella', kind: 'veggie', premium: true, grams: 90, costPerLbCents: 599, shape: 'dollop', color: '#fbf8ef', accent: '#e9e1c9', pieces: 9 },
  { id: 'ricotta', name: 'Ricotta', kind: 'veggie', premium: true, grams: 70, costPerLbCents: 449, shape: 'dollop', color: '#fffdf6', accent: '#ece4cf', pieces: 10 },
];
export const TOPPING_BY_ID = Object.fromEntries(TOPPINGS.map((t) => [t.id, t])) as Record<string, Topping>;

/* ---------------------------------------------------------------- the pizza a customer builds */

export type Side = 'whole' | 'left' | 'right';

export interface PizzaConfig {
  size: SizeId;
  crust: CrustId;
  sauce: SauceId;
  cheese: CheeseId;
  /** Topping id to where it goes. `left` and `right` are halves. */
  toppings: Record<string, Side>;
  /** Well done, light bake, cut in squares and so on. */
  notes?: string[];
}

export interface Specialty {
  id: string;
  name: string;
  blurb: string;
  photo: string;
  sauce: SauceId;
  cheese: CheeseId;
  toppings: string[];
  /** Price by size, in cents. */
  prices: Record<SizeId, number>;
  /** Share of all pizzas sold, used only to generate the demo's sales history. */
  share: number;
  tag?: string;
}

const P = (s: number, m: number, l: number): Record<SizeId, number> => ({ S: s, M: m, L: l });

export const SPECIALTIES: Specialty[] = [
  { id: 'pepperoni', name: 'Pepperoni', blurb: 'Red sauce, whole-milk mozzarella, a full layer of pepperoni.', photo: '/pizza/pepperoni.webp', sauce: 'red', cheese: 'regular', toppings: ['pepperoni'], prices: P(1399, 1899, 2299), share: 0.25, tag: 'Best seller' },
  { id: 'cheese', name: 'Classic Cheese', blurb: 'Red sauce and a blanket of whole-milk mozzarella. Kids\' pick.', photo: '/pizza/cheese.webp', sauce: 'red', cheese: 'regular', toppings: [], prices: P(1199, 1599, 1999), share: 0.13 },
  { id: 'double-pep', name: 'Double Pep', blurb: 'Classic pepperoni under, cup & char pepperoni on top, hot honey drizzle.', photo: '/pizza/double-pep.webp', sauce: 'red', cheese: 'regular', toppings: ['pepperoni', 'cupchar'], prices: P(1699, 2299, 2799), share: 0.07, tag: 'New' },
  { id: 'supreme', name: 'The Supreme', blurb: 'Pepperoni, sausage, mushrooms, green peppers, red onion, black olives.', photo: '/pizza/supreme.webp', sauce: 'red', cheese: 'regular', toppings: ['pepperoni', 'sausage', 'mushroom', 'greenpepper', 'onion', 'olive'], prices: P(1699, 2299, 2799), share: 0.08 },
  { id: 'margherita', name: 'Margherita', blurb: 'Red sauce, fresh mozzarella, roma tomato, fresh basil.', photo: '/pizza/margherita.webp', sauce: 'red', cheese: 'light', toppings: ['freshmozz', 'tomato', 'basil'], prices: P(1599, 2099, 2599), share: 0.06 },
  { id: 'bbq-chicken', name: 'BBQ Chicken', blurb: 'BBQ sauce, grilled chicken, red onion, bacon.', photo: '/pizza/bbq-chicken.webp', sauce: 'bbq', cheese: 'regular', toppings: ['chicken', 'onion', 'bacon'], prices: P(1699, 2299, 2799), share: 0.07 },
  { id: 'sausage-mush', name: 'Sausage & Mushroom', blurb: 'Fennel sausage, cremini mushrooms, roasted garlic.', photo: '/pizza/sausage.webp', sauce: 'red', cheese: 'regular', toppings: ['sausage', 'mushroom', 'garlic'], prices: P(1599, 2099, 2599), share: 0.05 },
  { id: 'veggie', name: 'Garden Veggie', blurb: 'Mushrooms, green peppers, red onion, olives, tomato, spinach.', photo: '/pizza/veggie.webp', sauce: 'red', cheese: 'regular', toppings: ['mushroom', 'greenpepper', 'onion', 'olive', 'tomato', 'spinach'], prices: P(1599, 2099, 2599), share: 0.04 },
  { id: 'white', name: 'Spinach White Pie', blurb: 'Garlic white sauce, ricotta, spinach, fresh mozzarella.', photo: '/pizza/white.webp', sauce: 'garlic', cheese: 'regular', toppings: ['ricotta', 'spinach', 'freshmozz'], prices: P(1599, 2099, 2599), share: 0.03 },
  { id: 'mushroom', name: 'Wild Mushroom', blurb: 'Pesto, mushrooms, roasted garlic, ricotta.', photo: '/pizza/mushroom.webp', sauce: 'pesto', cheese: 'regular', toppings: ['mushroom', 'garlic', 'ricotta'], prices: P(1599, 2099, 2599), share: 0.02 },
];
export const SPECIALTY_BY_ID = Object.fromEntries(SPECIALTIES.map((s) => [s.id, s])) as Record<string, Specialty>;
/** Build-your-own share of pizzas, for the history generator. */
export const BYO_SHARE = 0.2;

/* ---------------------------------------------------------------- sides and drinks */

export interface SideItem {
  id: string;
  name: string;
  blurb: string;
  photo: string;
  cents: number;
  /** What the shop pays for the ingredients and packaging, in cents. */
  costCents: number;
  category: 'Wings' | 'Sides' | 'Drinks';
  /** Share of orders that include it, for the history generator. */
  attach: number;
  /** Inventory it draws on and how much (in that item's unit). */
  uses?: Record<string, number>;
}

export const SIDES: SideItem[] = [
  { id: 'wings-buffalo', name: 'Buffalo Wings (10)', blurb: 'Bone-in, crispy, tossed in buffalo. Ranch or blue cheese.', photo: '/pizza/wings-buffalo.webp', cents: 1499, costCents: 520, category: 'Wings', attach: 0.16, uses: { wings: 1.1 } },
  { id: 'wings-bbq', name: 'BBQ Wings (10)', blurb: 'Bone-in, smoky-sweet BBQ glaze, scallions.', photo: '/pizza/wings-bbq.webp', cents: 1499, costCents: 520, category: 'Wings', attach: 0.09, uses: { wings: 1.1 } },
  { id: 'garlic-knots', name: 'Garlic Bread', blurb: 'Our dough, garlic butter, parmesan, red sauce to dip.', photo: '/pizza/garlic-bread.webp', cents: 699, costCents: 140, category: 'Sides', attach: 0.22, uses: { 'dough-M': 0.5 } },
  { id: 'caesar', name: 'Caesar Salad', blurb: 'Romaine, parmesan, croutons, house Caesar.', photo: '/pizza/caesar.webp', cents: 999, costCents: 260, category: 'Sides', attach: 0.08, uses: { romaine: 0.35 } },
  { id: 'soda-2l', name: 'Soda, 2 liter', blurb: 'Cola, diet cola, lemon-lime or orange.', photo: '/pizza/soda.webp', cents: 449, costCents: 140, category: 'Drinks', attach: 0.18, uses: { 'soda-2l': 1 } },
  { id: 'soda-can', name: 'Soda, can', blurb: 'Ice cold. Cola, diet cola, lemon-lime or orange.', photo: '/pizza/soda.webp', cents: 225, costCents: 55, category: 'Drinks', attach: 0.2, uses: { 'soda-can': 1 } },
];
export const SIDE_BY_ID = Object.fromEntries(SIDES.map((s) => [s.id, s])) as Record<string, SideItem>;

/* ---------------------------------------------------------------- staff */

export type PizzaRole = 'owner' | 'manager' | 'cook' | 'cashier' | 'driver';

export interface PizzaStaff {
  id: string;
  name: string;
  role: PizzaRole;
  pin: string;
  hourlyCents: number;
}

export const PIZZA_STAFF: PizzaStaff[] = [
  { id: 'marco', name: 'Marco D.', role: 'owner', pin: '1111', hourlyCents: 0 },
  { id: 'jess', name: 'Jess P.', role: 'manager', pin: '2222', hourlyCents: 2500 },
  { id: 'luis', name: 'Luis R.', role: 'cook', pin: '3333', hourlyCents: 2100 },
  { id: 'ana', name: 'Ana G.', role: 'cook', pin: '4444', hourlyCents: 2000 },
  { id: 'kayla', name: 'Kayla S.', role: 'cashier', pin: '5555', hourlyCents: 1900 },
  { id: 'dev', name: 'Dev K.', role: 'driver', pin: '6666', hourlyCents: 1800 },
  { id: 'sam', name: 'Sam W.', role: 'driver', pin: '7777', hourlyCents: 1800 },
  { id: 'chris', name: 'Chris L.', role: 'driver', pin: '8888', hourlyCents: 1800 },
];
export const PIZZA_STAFF_BY_ID = Object.fromEntries(PIZZA_STAFF.map((s) => [s.id, s])) as Record<string, PizzaStaff>;
export const DRIVERS = PIZZA_STAFF.filter((s) => s.role === 'driver');

/** Tonight's shifts. Start and end are hours of the day. */
export const PIZZA_SHIFTS: { staffId: string; start: number; end: number }[] = [
  { staffId: 'jess', start: 15, end: 23 },
  { staffId: 'luis', start: 10, end: 18 },
  { staffId: 'ana', start: 16, end: 23 },
  { staffId: 'kayla', start: 16, end: 22 },
  { staffId: 'dev', start: 16, end: 22 },
  { staffId: 'sam', start: 17, end: 22 },
  { staffId: 'chris', start: 18, end: 23 },
];

/** Mileage paid to drivers who use their own car, in cents per mile. An example rate; the shop sets its own. */
export const MILEAGE_CENTS = 70;

/* ---------------------------------------------------------------- delivery zones and addresses */

export interface Zone {
  id: 'A' | 'B' | 'C';
  label: string;
  maxMiles: number;
  feeCents: number;
  /** Typical one-way drive, in minutes. */
  driveMinutes: number;
}

export const ZONES: Zone[] = [
  { id: 'A', label: 'Zone A, under 1.5 mi', maxMiles: 1.5, feeCents: 299, driveMinutes: 7 },
  { id: 'B', label: 'Zone B, 1.5 to 3 mi', maxMiles: 3, feeCents: 399, driveMinutes: 12 },
  { id: 'C', label: 'Zone C, 3 to 5 mi', maxMiles: 5, feeCents: 499, driveMinutes: 18 },
];

export interface Address {
  line: string;
  /** Miles east and north of the shop, for the dispatch map. */
  x: number;
  y: number;
}

/** Example addresses on real Long Beach streets. House numbers are made up. */
export const ADDRESSES: Address[] = [
  { line: '210 Termino Ave', x: 0.6, y: -0.5 },
  { line: '1180 E 4th St', x: -0.9, y: 0.4 },
  { line: '3320 E Broadway', x: 0.3, y: 0.3 },
  { line: '5010 E 2nd St', x: 1.4, y: -0.9 },
  { line: '2745 E Ocean Blvd', x: -0.4, y: -1.0 },
  { line: '1925 Redondo Ave', x: 0.5, y: 1.6 },
  { line: '640 Junipero Ave', x: -0.6, y: 0.1 },
  { line: '4400 E Anaheim St', x: 1.1, y: 1.4 },
  { line: '3901 Atlantic Ave', x: -2.3, y: 2.6 },
  { line: '5555 E Pacific Coast Hwy', x: 2.0, y: 1.2 },
  { line: '1450 Livingston Dr', x: 1.7, y: -0.4 },
  { line: '2200 Bellflower Blvd', x: 2.8, y: 1.9 },
  { line: '700 Pine Ave', x: -3.1, y: 0.2 },
  { line: '6400 E Spring St', x: 3.4, y: 3.0 },
  { line: '1820 Studebaker Rd', x: 4.0, y: 0.6 },
  { line: '330 Cherry Ave', x: -1.3, y: -0.6 },
];

/* ---------------------------------------------------------------- inventory and suppliers */

export interface InvItem {
  id: string;
  name: string;
  unit: string;
  supplier: string;
  /** Units in one case or bag. */
  pack: number;
  packLabel: string;
  /** Price of one pack, in cents. */
  packCents: number;
  /** Kept on hand at the start of the demo, in units. */
  onHand: number;
  /** Days it keeps once opened. Used for the over-order warning. */
  shelfDays: number;
}

/** Toppings are tracked in pounds and use the topping's own cost. */
export const INVENTORY: InvItem[] = [
  { id: 'flour', name: 'High-gluten flour', unit: 'lb', supplier: 'Coastline Foodservice', pack: 50, packLabel: '50 lb bag', packCents: 2900, onHand: 140, shelfDays: 180 },
  { id: 'mozz', name: 'Whole-milk mozzarella, shredded', unit: 'lb', supplier: 'Coastline Foodservice', pack: 20, packLabel: '4 x 5 lb case', packCents: 7180, onHand: 64, shelfDays: 21 },
  { id: 'sauce', name: 'Crushed tomatoes (#10 can)', unit: 'lb', supplier: 'Coastline Foodservice', pack: 39.6, packLabel: 'case of 6 cans', packCents: 3890, onHand: 52, shelfDays: 365 },
  { id: 'wings', name: 'Chicken wings, jumbo', unit: 'lb', supplier: 'Coastline Foodservice', pack: 40, packLabel: '40 lb case', packCents: 15600, onHand: 46, shelfDays: 5 },
  { id: 'romaine', name: 'Romaine hearts', unit: 'lb', supplier: 'Westside Produce', pack: 12, packLabel: '12 lb case', packCents: 2640, onHand: 9, shelfDays: 7 },
  { id: 'box-S', name: 'Pizza box, 10 inch', unit: 'box', supplier: 'Pacific Paper & Box', pack: 50, packLabel: 'bundle of 50', packCents: 1900, onHand: 90, shelfDays: 3650 },
  { id: 'box-M', name: 'Pizza box, 14 inch', unit: 'box', supplier: 'Pacific Paper & Box', pack: 50, packLabel: 'bundle of 50', packCents: 2600, onHand: 140, shelfDays: 3650 },
  { id: 'box-L', name: 'Pizza box, 18 inch', unit: 'box', supplier: 'Pacific Paper & Box', pack: 50, packLabel: 'bundle of 50', packCents: 3400, onHand: 75, shelfDays: 3650 },
  { id: 'soda-2l', name: 'Soda, 2 liter', unit: 'bottle', supplier: 'Coastline Foodservice', pack: 8, packLabel: 'case of 8', packCents: 1120, onHand: 30, shelfDays: 180 },
  { id: 'soda-can', name: 'Soda, cans', unit: 'can', supplier: 'Coastline Foodservice', pack: 24, packLabel: 'case of 24', packCents: 1320, onHand: 70, shelfDays: 180 },
  { id: 'gf-shell', name: 'Gluten-free 10 inch shells', unit: 'shell', supplier: 'Coastline Foodservice', pack: 12, packLabel: 'case of 12', packCents: 3000, onHand: 10, shelfDays: 90 },
];

/** Pounds on hand of each topping at the start of the demo. A few are low on purpose. */
export const TOPPING_ON_HAND: Record<string, number> = {
  pepperoni: 9, cupchar: 3.2, sausage: 14, bacon: 6, ham: 5, chicken: 7, meatball: 6, mushroom: 6, onion: 12, greenpepper: 6,
  olive: 5, jalapeno: 4, banana: 4, pineapple: 6, tomato: 5, spinach: 2.5, basil: 0.6, garlic: 1.4, freshmozz: 4, ricotta: 4,
};
/** Which supplier carries each topping. */
export const TOPPING_SUPPLIER = (t: Topping) => (t.kind === 'veggie' && !['olive', 'jalapeno', 'banana', 'pineapple', 'freshmozz', 'ricotta', 'garlic'].includes(t.id) ? 'Westside Produce' : 'Coastline Foodservice');

export interface PizzaSupplier {
  name: string;
  rep: string;
  email: string;
  /** Days of the week they deliver, 0 = Sunday. */
  deliveryDays: number[];
  minOrderCents: number;
  /** Order by this hour the day before delivery. */
  cutoffHour: number;
}

export const PIZZA_SUPPLIERS: PizzaSupplier[] = [
  { name: 'Coastline Foodservice', rep: 'Renee', email: 'orders@coastline-food.example', deliveryDays: [1, 3, 5], minOrderCents: 25000, cutoffHour: 16 },
  { name: 'Westside Produce', rep: 'Hector', email: 'orders@westside-produce.example', deliveryDays: [1, 2, 3, 4, 5, 6], minOrderCents: 7500, cutoffHour: 20 },
  { name: 'Pacific Paper & Box', rep: 'Lin', email: 'sales@pacific-paper.example', deliveryDays: [2, 4], minOrderCents: 15000, cutoffHour: 14 },
];

/** Dough recipe in baker's percent: flour is 100. */
export const DOUGH_RECIPE = { flour: 100, water: 63, salt: 2.5, oil: 2, sugar: 1, yeast: 0.4 };
export const DOUGH_TOTAL_PCT = Object.values(DOUGH_RECIPE).reduce((a, b) => a + b, 0);
/** Hours the dough cold-ferments before it is used. */
export const FERMENT_HOURS = 48;

/* ---------------------------------------------------------------- game days and big nights */

/** Busy and quiet days for a pizza shop, as a demand multiplier. */
export function pizzaDayFactor(iso: string): { name: string; factor: number } | undefined {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = dowOf(iso);
  const md = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (md === '10-31') return { name: 'Halloween', factor: 1.45 };
  if (md === '12-31') return { name: "New Year's Eve", factor: 1.4 };
  if (md === '12-24' || md === '12-25') return { name: 'Christmas', factor: 0.4 };
  // Thanksgiving is the fourth Thursday of November: a quiet day, and the night before is one of the busiest.
  if (m === 11) {
    const first = new Date(y, 10, 1).getDay();
    const thanksgiving = 1 + ((4 - first + 7) % 7) + 21;
    if (d === thanksgiving) return { name: 'Thanksgiving', factor: 0.35 };
    if (d === thanksgiving - 1) return { name: 'Thanksgiving Eve', factor: 1.3 };
  }
  // Pro football season, early September to early January.
  const inSeason = (m >= 9 && !(m === 9 && d < 7)) || (m === 1 && d <= 10);
  if (inSeason && dow === 0) return { name: 'Football Sunday', factor: 1.3 };
  if (inSeason && dow === 1) return { name: 'Monday night game', factor: 1.18 };
  if (inSeason && dow === 4) return { name: 'Thursday night game', factor: 1.1 };
  return undefined;
}

/** The next big pizza day within two weeks, for game-day pre-orders. */
export function nextBigDay(today: string): { date: string; name: string; factor: number } {
  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, i);
    const f = pizzaDayFactor(date);
    if (f && f.factor >= 1.25) return { date, ...f };
  }
  const date = addDays(today, ((7 - dowOf(today)) % 7) || 7);
  return { date, name: 'Sunday', factor: 1 };
}

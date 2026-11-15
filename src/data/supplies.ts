import type { Supply } from '../lib/supplies';

/**
 * The demo shop's supplies. Every number here is an example, not real supplier pricing.
 * A live shop loads its own suppliers, pack sizes, prices and delivery times.
 */
export const SUPPLIES: Supply[] = [
  { id: 'raisedmix', name: 'Raised donut mix', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 3800, supplier: 'Bakery supplier', leadDays: 2, onHand: 620 },
  { id: 'cakemix', name: 'Cake donut mix', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 4200, supplier: 'Bakery supplier', leadDays: 2, onHand: 95 },
  { id: 'shortening', name: 'Fry shortening', unit: 'lb', packSize: 50, packLabel: '50 lb cube', packCents: 7200, supplier: 'Bakery supplier', leadDays: 2, onHand: 100 },
  { id: 'sugar', name: 'Powdered sugar for glaze', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 4100, supplier: 'Bakery supplier', leadDays: 2, onHand: 120 },
  { id: 'chocicing', name: 'Chocolate icing', unit: 'lb', packSize: 23, packLabel: '23 lb pail', packCents: 5800, supplier: 'Bakery supplier', leadDays: 2, onHand: 62 },
  { id: 'mapleicing', name: 'Maple icing', unit: 'lb', packSize: 23, packLabel: '23 lb pail', packCents: 6100, supplier: 'Bakery supplier', leadDays: 2, onHand: 44 },
  { id: 'filling', name: 'Jelly and custard filling', unit: 'lb', packSize: 20, packLabel: '20 lb pail', packCents: 4600, supplier: 'Bakery supplier', leadDays: 2, onHand: 84 },
  { id: 'coffee', name: 'Coffee beans', unit: 'lb', packSize: 5, packLabel: '5 lb bag', packCents: 4200, supplier: 'Coffee roaster', leadDays: 3, onHand: 22 },
  { id: 'milk', name: 'Milk', unit: 'gal', packSize: 4, packLabel: 'case of 4 gallons', packCents: 1700, supplier: 'Cash and carry', leadDays: 0, onHand: 9, coverDays: 3 },
  { id: 'boxes', name: 'Pink dozen boxes', unit: 'boxes', packSize: 100, packLabel: 'bundle of 100', packCents: 4800, supplier: 'Packaging supplier', leadDays: 4, onHand: 240 },
  { id: 'bags', name: 'Paper bags', unit: 'bags', packSize: 500, packLabel: 'case of 500', packCents: 2900, supplier: 'Packaging supplier', leadDays: 4, onHand: 2400 },
  { id: 'cups', name: 'Cups and lids', unit: 'cups', packSize: 500, packLabel: 'case of 500', packCents: 6400, supplier: 'Packaging supplier', leadDays: 4, onHand: 3400 },
];

/** Roughly what leaves in a dozen box and what leaves in a bag, per donut made. */
const PACKAGING = { boxes: 0.045, bags: 0.11 };

/** How much of each supply one unit of a menu item uses. Example recipes, in the supply's own unit. */
export const RECIPES: Record<string, Record<string, number>> = {
  glazed: { raisedmix: 0.1, shortening: 0.025, sugar: 0.035, ...PACKAGING },
  chocolate: { raisedmix: 0.13, shortening: 0.03, chocicing: 0.04, ...PACKAGING },
  maple: { raisedmix: 0.13, shortening: 0.03, mapleicing: 0.04, ...PACKAGING },
  sprinkle: { raisedmix: 0.1, shortening: 0.025, sugar: 0.03, ...PACKAGING },
  oldfashioned: { cakemix: 0.12, shortening: 0.035, sugar: 0.03, ...PACKAGING },
  sugar: { raisedmix: 0.12, shortening: 0.03, sugar: 0.02, ...PACKAGING },
  jelly: { raisedmix: 0.11, shortening: 0.025, sugar: 0.02, filling: 0.06, ...PACKAGING },
  custard: { raisedmix: 0.11, shortening: 0.025, chocicing: 0.03, filling: 0.06, ...PACKAGING },
  fritter: { raisedmix: 0.22, shortening: 0.05, sugar: 0.05, bags: 0.6 },
  cinnamon: { raisedmix: 0.2, shortening: 0.03, sugar: 0.05, bags: 0.6 },
  croissant: { bags: 1 },
  holes: { raisedmix: 0.12, shortening: 0.03, sugar: 0.04, bags: 1 },
  coffee: { coffee: 0.022, cups: 1 },
  icedcoffee: { coffee: 0.028, milk: 0.02, cups: 1 },
  milk: { milk: 0.0625, cups: 1 },
};

import type { Supply } from '../lib/supplies';

/**
 * The demo shop's supplies. Every number here is an example, not real supplier pricing.
 * A live shop loads its own suppliers, pack sizes, prices and delivery times.
 */
/**
 * The drink bar: smoothie mixes, boba and toppings. These are real products. Pack sizes, and prices where the note says so,
 * were read from the sellers' own listings on the date shown. Stock on hand is an example.
 */
const CHECKED = '2026-11-15';
export const DRINK_BAR: Supply[] = [
  {
    id: 'strawmix', name: 'Strawberry smoothie mix', unit: 'fl oz', packSize: 276, packLabel: 'case of 6 bottles, 46 fl oz each', packCents: 8999, supplier: 'WebstaurantStore', leadDays: 3, onHand: 520,
    product: { brand: 'Dr. Smoothie Classic Strawberry Fruit Smoothie Mix', url: 'https://www.webstaurantstore.com/dr-smoothie-classic-strawberry-fruit-smoothie-mix-46-fl-oz-case/103DRCLSSTRA.html', checked: CHECKED, note: 'Listed at $89.99 a case. The maker\'s recipe is 2.5 fl oz of mix and 1.5 fl oz of water for every 8 oz of smoothie, about 18 small smoothies a bottle.' },
  },
  {
    id: 'mangomix', name: 'Mango smoothie mix', unit: 'fl oz', packSize: 276, packLabel: 'case of 6 bottles, 46 fl oz each', packCents: 8999, supplier: 'WebstaurantStore', leadDays: 3, onHand: 700,
    product: { brand: 'Dr. Smoothie 100% Crushed Mango Fruit Smoothie Mix', url: 'https://www.webstaurantstore.com/vendor/dr-smoothie.html', checked: CHECKED, note: 'Sold in the same case of six 46 fl oz bottles. The price here is an example, copied from the strawberry mix.' },
  },
  {
    id: 'taro', name: 'Taro powder', unit: 'scoops', packSize: 75, packLabel: '2.2 lb bag, about 75 scoops', packCents: 2299, supplier: 'Bossen', leadDays: 4, onHand: 400,
    product: { brand: 'Bossen Premium Taro Powder Mix, 2.2 lb', url: 'https://www.webstaurantstore.com/bossen-2-2-lb-premium-taro-powder-mix-case/535PWDTAROPCS.html', checked: CHECKED, note: 'Listed at $22.99 a bag, or $332.49 for a case of 20. Bossen\'s recipe is 4 tablespoons for a 16 oz drink, which is 3 of its 4 teaspoon scoops, about 25 drinks a bag. The recipe also takes creamer and sweetener, which are not tracked here yet.' },
  },
  {
    id: 'tapioca', name: 'Tapioca pearls (boba)', unit: 'scoops', packSize: 360, packLabel: 'case of 6 bags, 6 lb each', packCents: 4000, supplier: 'Lollicup', leadDays: 3, onHand: 290,
    product: { brand: 'Tea Zone Original Tapioca Pearls', url: 'https://lollicupstore.com/products/a1000', checked: CHECKED, note: 'Listed at $40.00 for a case of 6 bags. The listing does not say how many servings a bag makes, so 60 cooked scoops a bag is an estimate. Count your own and change it.' },
  },
  {
    id: 'popping', name: 'Strawberry popping boba', unit: 'scoops', packSize: 212, packLabel: 'case of 4 tubs, 7.04 lb each', packCents: 8999, supplier: 'Bossen', leadDays: 4, onHand: 130,
    product: { brand: 'Bossen Pure25 Strawberry Bursting Boba', url: 'https://www.webstaurantstore.com/bossen-7-26-lb-pure25-strawberry-bursting-boba-case/535BOBASTRBR.html', checked: CHECKED, note: 'Listed at $89.99 a case. About 53 servings of 3 tablespoons a tub. Use within a week of opening.' },
  },
  {
    id: 'jelly', name: 'Strawberry fruit jelly', unit: 'scoops', packSize: 200, packLabel: 'case of 4 tubs, 8.38 lb each', packCents: 7499, supplier: 'Bossen', leadDays: 4, onHand: 150,
    product: { brand: 'Bossen Strawberry Jelly Topping', url: 'https://www.webstaurantstore.com/bossen-8-38-lb-strawberry-jelly-topping-case/535JLYSTRBRY.html', checked: CHECKED, note: 'Listed at $74.99 a case. About 50 servings of 3 tablespoons a tub. Use within two weeks of opening.' },
  },
];

export const SUPPLIES: Supply[] = [
  { id: 'raisedmix', name: 'Raised donut mix', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 3800, supplier: 'Bakery supplier', leadDays: 2, onHand: 620 },
  { id: 'cakemix', name: 'Cake donut mix', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 4200, supplier: 'Bakery supplier', leadDays: 2, onHand: 95 },
  { id: 'shortening', name: 'Fry shortening', unit: 'lb', packSize: 50, packLabel: '50 lb cube', packCents: 7200, supplier: 'Bakery supplier', leadDays: 2, onHand: 100 },
  { id: 'sugar', name: 'Powdered sugar for glaze', unit: 'lb', packSize: 50, packLabel: '50 lb bag', packCents: 4100, supplier: 'Bakery supplier', leadDays: 2, onHand: 120 },
  { id: 'chocicing', name: 'Chocolate icing', unit: 'lb', packSize: 23, packLabel: '23 lb pail', packCents: 5800, supplier: 'Bakery supplier', leadDays: 2, onHand: 62 },
  { id: 'mapleicing', name: 'Maple icing', unit: 'lb', packSize: 23, packLabel: '23 lb pail', packCents: 6100, supplier: 'Bakery supplier', leadDays: 2, onHand: 44 },
  { id: 'filling', name: 'Jelly and custard filling', unit: 'lb', packSize: 20, packLabel: '20 lb pail', packCents: 4600, supplier: 'Bakery supplier', leadDays: 2, onHand: 84 },
  { id: 'toppings', name: 'Sprinkles, nuts and toppings', unit: 'lb', packSize: 10, packLabel: '10 lb box', packCents: 3600, supplier: 'Bakery supplier', leadDays: 2, onHand: 46 },
  { id: 'coffee', name: 'Coffee beans', unit: 'lb', packSize: 5, packLabel: '5 lb bag', packCents: 4200, supplier: 'Coffee roaster', leadDays: 3, onHand: 22 },
  { id: 'milk', name: 'Milk', unit: 'gal', packSize: 4, packLabel: 'case of 4 gallons', packCents: 1700, supplier: 'Cash and carry', leadDays: 0, onHand: 9, coverDays: 3 },
  { id: 'boxes', name: 'Pink dozen boxes', unit: 'boxes', packSize: 100, packLabel: 'bundle of 100', packCents: 4800, supplier: 'Packaging supplier', leadDays: 4, onHand: 240 },
  { id: 'bags', name: 'Paper bags', unit: 'bags', packSize: 500, packLabel: 'case of 500', packCents: 2900, supplier: 'Packaging supplier', leadDays: 4, onHand: 2400 },
  { id: 'cups', name: 'Cups and lids', unit: 'cups', packSize: 500, packLabel: 'case of 500', packCents: 6400, supplier: 'Packaging supplier', leadDays: 4, onHand: 3400 },
  ...DRINK_BAR,
];

export const DRINK_BAR_IDS = DRINK_BAR.map((s) => s.id);

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
  chociced: { raisedmix: 0.1, shortening: 0.025, chocicing: 0.035, ...PACKAGING },
  rainbow: { raisedmix: 0.1, shortening: 0.025, sugar: 0.03, toppings: 0.015, ...PACKAGING },
  chocsprinkle: { raisedmix: 0.1, shortening: 0.025, chocicing: 0.035, toppings: 0.02, ...PACKAGING },
  glazedcake: { cakemix: 0.12, shortening: 0.035, sugar: 0.03, ...PACKAGING },
  crumb: { cakemix: 0.12, shortening: 0.035, toppings: 0.03, ...PACKAGING },
  cookies: { raisedmix: 0.1, shortening: 0.025, sugar: 0.03, toppings: 0.02, ...PACKAGING },
  chocnut: { raisedmix: 0.1, shortening: 0.025, chocicing: 0.035, toppings: 0.02, ...PACKAGING },
  maplenut: { raisedmix: 0.1, shortening: 0.025, mapleicing: 0.035, toppings: 0.025, ...PACKAGING },
  coconut: { raisedmix: 0.1, shortening: 0.025, chocicing: 0.035, toppings: 0.02, ...PACKAGING },
  bavarian: { raisedmix: 0.11, shortening: 0.025, sugar: 0.02, filling: 0.06, ...PACKAGING },
  longjohn: { raisedmix: 0.13, shortening: 0.03, chocicing: 0.04, filling: 0.06, toppings: 0.01, ...PACKAGING },
  almondcroissant: { bags: 1 },
  croissant: { bags: 1 },
  holes: { raisedmix: 0.12, shortening: 0.03, sugar: 0.04, bags: 1 },
  coffee: { coffee: 0.022, cups: 1 },
  icedcoffee: { coffee: 0.028, milk: 0.02, cups: 1 },
  milk: { milk: 0.0625, cups: 1 },
  // Drink bar. Mix is in fluid ounces and everything else in scoops, straight from the makers' own recipes.
  'smoothie-straw': { strawmix: 5, cups: 1 },
  'smoothie-straw-lg': { strawmix: 7.5, cups: 1 },
  'smoothie-mango': { mangomix: 5, cups: 1 },
  'smoothie-mango-lg': { mangomix: 7.5, cups: 1 },
  'smoothie-taro': { taro: 3, cups: 1 },
  'smoothie-taro-lg': { taro: 4.5, cups: 1 },
  'addon-boba': { tapioca: 1 },
  'addon-popping': { popping: 1 },
  'addon-jelly': { jelly: 1 },
};

/** What the shop pays for items it buys in finished, in cents each. Example prices. */
export const PURCHASED: Record<string, number> = { croissant: 210, almondcroissant: 190 };

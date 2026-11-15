/**
 * Nutrition and ingredients for the demo menu. These are rough example figures for typical donut shop items,
 * not lab results. A real shop enters numbers from its mix supplier's spec sheets or a nutrition lab.
 */
export interface Nutrition {
  calories: number;
  fatG: number;
  carbsG: number;
  sugarG: number;
  proteinG: number;
  sodiumMg: number;
  ingredients: string;
}

const RAISED = 'enriched wheat flour, water, palm and soybean oil, sugar, yeast, egg, nonfat milk, salt';
const CAKE = 'enriched wheat flour, sugar, buttermilk, palm and soybean oil, egg, baking powder, nutmeg, salt';

const n = (calories: number, fatG: number, carbsG: number, sugarG: number, proteinG: number, sodiumMg: number, ingredients: string): Nutrition => ({ calories, fatG, carbsG, sugarG, proteinG, sodiumMg, ingredients });

export const NUTRITION: Record<string, Nutrition> = {
  glazed: n(240, 13, 29, 12, 4, 210, `${RAISED}, glaze (powdered sugar, water, vanilla)`),
  chocolate: n(330, 16, 43, 21, 5, 290, `${RAISED}, chocolate icing (sugar, cocoa, soybean oil, soy lecithin)`),
  maple: n(320, 15, 43, 22, 5, 290, `${RAISED}, maple icing (sugar, water, maple flavor)`),
  sprinkle: n(280, 14, 36, 18, 4, 220, `${RAISED}, strawberry icing (sugar, water, color), rainbow sprinkles (sugar, corn starch, soy lecithin, color)`),
  oldfashioned: n(310, 18, 34, 17, 3, 300, `${CAKE}, glaze (powdered sugar, water, vanilla)`),
  sugar: n(260, 13, 33, 13, 4, 230, `${RAISED}, granulated sugar`),
  chociced: n(280, 14, 35, 17, 4, 220, `${RAISED}, chocolate icing (sugar, cocoa, soybean oil, soy lecithin), vanilla drizzle`),
  rainbow: n(280, 14, 36, 18, 4, 220, `${RAISED}, vanilla icing (sugar, water, vanilla), rainbow sprinkles (sugar, corn starch, soy lecithin, color)`),
  chocsprinkle: n(300, 15, 38, 20, 4, 220, `${RAISED}, chocolate icing (sugar, cocoa, soybean oil, soy lecithin), chocolate sprinkles`),
  glazedcake: n(290, 16, 34, 16, 3, 300, `${CAKE}, glaze (powdered sugar, water, vanilla)`),
  crumb: n(330, 17, 41, 22, 4, 310, `${CAKE}, cinnamon crumb (wheat flour, sugar, soybean oil, cinnamon)`),
  cookies: n(310, 15, 40, 21, 4, 250, `${RAISED}, vanilla icing (sugar, water, vanilla), chocolate cookie pieces (wheat flour, sugar, cocoa, soy lecithin)`),
  chocnut: n(320, 18, 36, 18, 6, 230, `${RAISED}, chocolate icing (sugar, cocoa, soybean oil, soy lecithin), chopped peanuts`),
  maplenut: n(320, 17, 38, 19, 6, 240, `${RAISED}, maple icing (sugar, water, maple flavor), chopped peanuts`),
  coconut: n(310, 17, 37, 19, 4, 220, `${RAISED}, chocolate icing (sugar, cocoa, soybean oil, soy lecithin), toasted coconut`),
  jelly: n(290, 13, 39, 18, 4, 240, `${RAISED}, raspberry filling (sugar, raspberries, pectin), powdered sugar`),
  custard: n(310, 15, 39, 17, 5, 260, `${RAISED}, vanilla custard (milk, sugar, egg yolk, corn starch), chocolate icing (sugar, cocoa, soy lecithin)`),
  bavarian: n(300, 15, 37, 16, 5, 250, `${RAISED}, Bavarian cream (milk, cream, sugar, egg yolk, corn starch), powdered sugar`),
  longjohn: n(390, 21, 45, 23, 6, 310, `${RAISED}, vanilla cream (milk, sugar, egg yolk, corn starch), chocolate icing (sugar, cocoa, soy lecithin), pecans`),
  fritter: n(460, 23, 58, 29, 5, 380, `${RAISED}, apples, cinnamon, glaze (powdered sugar, water, vanilla)`),
  cinnamon: n(480, 20, 68, 34, 7, 420, `${RAISED}, cinnamon sugar, butter, icing (powdered sugar, cream cheese, vanilla)`),
  croissant: n(420, 24, 34, 5, 16, 780, 'croissant (wheat flour, butter, milk, yeast, sugar, salt, egg), ham, Swiss cheese'),
  almondcroissant: n(460, 28, 43, 18, 9, 320, 'croissant (wheat flour, butter, milk, yeast, sugar, salt, egg), almond cream (almonds, butter, sugar, egg), sliced almonds'),
  holes: n(420, 22, 52, 22, 6, 380, `${RAISED}, glaze (powdered sugar, water, vanilla)`),
  coffee: n(5, 0, 0, 0, 0, 5, 'brewed coffee'),
  icedcoffee: n(120, 3, 21, 20, 3, 45, 'brewed coffee, milk, cane sugar syrup, ice'),
  milk: n(150, 8, 12, 12, 8, 105, 'whole milk, vitamin D'),
};

/** Items with dairy cream or custard inside are not kept on the rack overnight. */
export const KEEPS_OVERNIGHT: Record<string, boolean> = { custard: false, bavarian: false, longjohn: false, croissant: false, almondcroissant: true };

/** The allergens shown as columns on the allergen chart. Coconut is listed because customers ask, though it is no longer a major allergen in US labeling rules. */
export const ALLERGENS = ['Milk', 'Egg', 'Wheat', 'Soy', 'Peanuts', 'Tree nuts', 'Coconut'] as const;

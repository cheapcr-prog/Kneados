import { describe, expect, it } from 'vitest';
import { MENU, MENU_BY_ID } from '../data/shop';
import { decide, type ShopFacts } from './brain';
import { menuInsights } from './insights';
import { DEFAULT_RULES, applyPrices, hourLabel, markdownPlan, priceNow, quietestWindow, round5, type PriceContext } from './smartpricing';
import { suggestOffers, upsellOpportunity } from './upsell';

const ctx = (patch: Partial<PriceContext> = {}): PriceContext => ({ dow: 3, hour: 8, holiday: false, closeHour: 13, extra: {}, ...patch });
const rules = { ...DEFAULT_RULES, markdown: { ...DEFAULT_RULES.markdown, on: true }, weekend: { on: true, cents: 25 } };
const glazed = MENU_BY_ID.glazed, coffee = MENU_BY_ID.coffee, fritter = MENU_BY_ID.fritter;

describe('smart pricing', () => {
  it('leaves every price alone on an ordinary morning', () => {
    expect(applyPrices(MENU, rules, ctx()).menu).toEqual(MENU);
  });
  it('marks down only donuts the shop has too many of, and only late in the day', () => {
    const late = ctx({ hour: 12.25, extra: { glazed: 18, maple: 2 } });
    expect(priceNow(glazed, rules, late)).toMatchObject({ cents: 120, dozenCents: 1260, baseCents: 175, tag: 'markdown' });
    expect(priceNow(MENU_BY_ID.maple, rules, late).tag).toBeUndefined();
    expect(priceNow(glazed, rules, ctx({ hour: 11.5, extra: { glazed: 18 } })).tag).toBeUndefined();
    expect(priceNow(glazed, rules, ctx({ hour: 13, extra: { glazed: 18 } })).tag).toBeUndefined();
  });
  it('takes the drink special off at the end of the quiet hours', () => {
    expect(priceNow(coffee, rules, ctx({ hour: 10 }))).toMatchObject({ cents: 200, tag: 'special', label: '20% off until 12pm' });
    expect(priceNow(coffee, rules, ctx({ hour: 12 })).cents).toBe(250);
    expect(priceNow(glazed, rules, ctx({ hour: 10 })).tag).toBeUndefined();
  });
  it('adds the weekend extra to specialty singles only, and a markdown beats it', () => {
    expect(priceNow(fritter, rules, ctx({ dow: 6 }))).toMatchObject({ cents: 375, dozenCents: 3000, tag: 'weekend' });
    expect(priceNow(glazed, rules, ctx({ dow: 6 })).cents).toBe(175);
    expect(priceNow(fritter, rules, ctx({ dow: 2, holiday: true })).label).toBe('Holiday price');
    expect(priceNow(fritter, rules, ctx({ dow: 6, hour: 12.5, extra: { fritter: 8 } }))).toMatchObject({ cents: 245, tag: 'markdown' });
  });
  it('does nothing when a rule is switched off', () => {
    const off = { markdown: { ...rules.markdown, on: false }, slow: { ...rules.slow, on: false }, weekend: { on: false, cents: 25 } };
    expect(applyPrices(MENU, off, ctx({ dow: 6, hour: 12.5, extra: { glazed: 40 } })).menu).toEqual(MENU);
  });
  it('rounds to a nickel and names hours the way a shop does', () => {
    expect([round5(122.5), round5(197), hourLabel(12), hourLabel(12.5), hourLabel(5), hourLabel(13)]).toEqual([125, 195, '12pm', '12:30pm', '5am', '1pm']);
  });
  it('finds the quietest two hours that end before the markdown starts', () => {
    const shares = [5, 6, 7, 8, 9, 10, 11, 12].map((hour, i) => ({ hour, share: [0.07, 0.14, 0.21, 0.2, 0.14, 0.1, 0.08, 0.06][i] }));
    expect(quietestWindow(shares, 2, 12)).toMatchObject({ fromHour: 10, toHour: 12 });
    expect(quietestWindow(shares, 2, 13)).toMatchObject({ fromHour: 11, toHour: 13 });
  });
  it('lists what a markdown would cover, most extra first', () => {
    const plan = markdownPlan([
      { id: 'a', name: 'Glazed', onRack: 30, stillNeeded: 12, priceCents: 175 },
      { id: 'b', name: 'Maple Bar', onRack: 10, stillNeeded: 8, priceCents: 175 },
      { id: 'c', name: 'Apple Fritter', onRack: 9, stillNeeded: 0, priceCents: 350 },
    ], rules.markdown);
    expect(plan.lines.map((l) => [l.name, l.extra, l.toCents])).toEqual([['Glazed', 18, 120], ['Apple Fritter', 9, 245]]);
    expect(plan.recoverCents).toBe(18 * 120 + 9 * 245);
  });
});

describe('checkout suggestions', () => {
  const offer = (lines: [string, number][]) => suggestOffers(lines.map(([itemId, qty]) => ({ itemId, qty })), MENU_BY_ID);
  it('offers nothing on an empty ticket', () => {
    expect(offer([])).toEqual([]);
  });
  it('offers the rest of a dozen for what the dozen price really adds', () => {
    // 10 glazed are $17.50 and a dozen is $18.00, so two more cost 50 cents.
    expect(offer([['glazed', 10], ['coffee', 1]])[0]).toMatchObject({ kind: 'dozen', itemId: 'glazed', qty: 2, addCents: 50 });
    expect(offer([['glazed', 11], ['coffee', 1]])[0].ask).toContain('cost nothing extra');
    expect(offer([['glazed', 5], ['coffee', 1]]).some((o) => o.kind === 'dozen')).toBe(false);
    expect(offer([['glazed', 12], ['coffee', 1]]).some((o) => o.kind === 'dozen')).toBe(false);
  });
  it('offers a coffee with donuts and a donut with coffee', () => {
    expect(offer([['glazed', 2]]).map((o) => o.kind)).toEqual(['drink', 'holes']);
    expect(offer([['glazed', 2]])[0].ask).toBe('Add a hot coffee for $2.50?');
    expect(offer([['coffee', 1]]).map((o) => o.kind)).toEqual(['donut']);
    expect(offer([['glazed', 2], ['coffee', 1], ['holes', 1]])).toEqual([]);
  });
  it('never offers something that is sold out, and never more than two things', () => {
    expect(suggestOffers([{ itemId: 'glazed', qty: 2 }], MENU_BY_ID, (id) => id === 'coffee').map((o) => o.kind)).toEqual(['holes']);
    expect(offer([['glazed', 10]]).length).toBe(2);
  });
  it('uses the price being charged right now', () => {
    const cheap = { ...MENU_BY_ID, coffee: { ...coffee, price: 200 } };
    expect(suggestOffers([{ itemId: 'glazed', qty: 1 }], cheap)[0]).toMatchObject({ addCents: 200, ask: 'Add a hot coffee for $2.00?' });
  });
  it('counts how many of a day\'s tickets would have had an offer', () => {
    const o = upsellOpportunity([[{ itemId: 'glazed', qty: 2 }], [{ itemId: 'coffee', qty: 1 }], [{ itemId: 'glazed', qty: 10 }], [{ itemId: 'glazed', qty: 1 }, { itemId: 'coffee', qty: 1 }, { itemId: 'holes', qty: 1 }]], MENU_BY_ID);
    expect(o).toEqual({ tickets: 4, eligible: { dozen: 1, drink: 1, donut: 1, holes: 0 }, fullCents: 250 + 175 + 50 });
  });
});

describe('menu insights', () => {
  const day = (made: number, sold: number) => ({ made, sold, waste: made - sold });
  const days = Array.from({ length: 10 }, () => ({ star: day(100, 96), dud: day(20, 6), thin: day(30, 28), over: day(120, 90), gone: day(40, 40), drink: { made: 0, sold: 50, waste: 0 } }));
  const price = { star: 175, dud: 175, thin: 500, over: 175, gone: 175, drink: 250 };
  const cost = { star: 20, dud: 60, thin: 200, over: 20, gone: 20, drink: 30 };
  const rows = menuInsights(days, cost, price, { foodTarget: 0.3, laborPerPiece: (id) => (id === 'drink' ? 0 : 25), name: (id) => id });
  const by = (id: string) => rows.find((r) => r.itemId === id)!;
  it('flags an item that costs more to make than it brings in', () => {
    // 6 sold at $1.75 is $10.50. 20 made at 85 cents each is $17.00.
    expect(by('dud')).toMatchObject({ verdict: 'losing', profitPerDayCents: -650, monthlyCents: 19_500 });
    expect(rows[0].itemId).toBe('dud');
  });
  it('raises a price that is under the food cost goal, by 50 cents at most', () => {
    expect(by('thin')).toMatchObject({ verdict: 'thin', newPrice: 550, monthlyCents: 28 * 50 * 30 });
  });
  it('bakes fewer of what keeps going unsold', () => {
    expect(by('over')).toMatchObject({ verdict: 'waste', bakeFewer: 15, monthlyCents: 15 * 20 * 30 });
  });
  it('says to make more of what sells out', () => {
    expect(by('gone').verdict).toBe('runs-out');
  });
  it('treats a drink as made to order, with no kitchen time', () => {
    expect(by('drink')).toMatchObject({ wasteRate: 0, profitPerDayCents: 50 * 220 });
  });
});

describe('the briefing proposes pricing moves', () => {
  const base = decide({
    shop: 'Test', today: { dayName: 'Wednesday', salesCents: 0, typicalCents: 1, orders: 0, open: false }, rack: [],
    tomorrow: { dayName: 'Thursday', bakeTotal: 100, lastWeekTotal: 100, rain: false, preorderUnits: 0, wholesaleUnits: 0 },
    supplies: { orderNow: [], waiting: [], autoSent: 0 }, team: { onClock: 0, breaks: [], scheduleNotes: [], laborShareNextWeek: 0.2, laborTargetHigh: 0.25 },
    equipment: { openRepairs: [], serviceOverdue: [] }, tasks: { overdue: [] }, waste: { days: 28, costCents: 0, rate: 0, worst: { name: 'Sugar Twist', rate: 0.05, costCents: 0, perDay: 1 } },
    money: { days: 30, salesCents: 1, foodShare: 0.2, laborShare: 0.2, netCents: 1, netShare: 0.3, foodTarget: 0.3, laborTarget: 0.3 },
    wholesale: { accounts: 0, weeklyCents: 0, overdue: [], unpaidCents: 0 }, delivery: { ordersToday: 0, grossCents: 0, feesCents: 0, markup: 0.5, breakEvenMarkup: 0.4, shortCents: 0 },
    giftCards: { outstandingCents: 0, cards: 0 }, locations: { count: 1, transfers: [], transferCents: 0 },
    pricing: { markdownOn: false, markdownPct: 0.3, startsAt: '12pm', closingSoon: true, extras: [{ name: 'Glazed', extra: 18, toCents: 125 }, { name: 'Maple Bar', extra: 7, toCents: 125 }], recoverCents: 3125, changedNow: 0 },
    menu: { attention: [{ id: 'sugar', name: 'Sugar Twist', verdict: 'drop', advice: 'x' }, { id: 'chocnut', name: 'Chocolate Peanut', verdict: 'drop', advice: 'Earns little and a third goes unsold.', monthlyCents: 4000 }] },
  } satisfies ShopFacts);
  it('asks to mark down what is left, with the real counts and price', () => {
    const d = base.find((x) => x.id === 'markdown')!;
    expect(d.title).toBe('Mark down 18 extra Glazed to $1.25 at 12pm and 1 other donut');
    expect(d.impactCents).toBe(3125);
    expect(d.urgency).toBe('now');
  });
  it('picks a menu item the waste decision is not already about', () => {
    expect(base.find((x) => x.id.startsWith('menu:'))).toMatchObject({ id: 'menu:chocnut', title: 'Make Chocolate Peanut only on your busiest days', impactCents: 4000 });
  });
});

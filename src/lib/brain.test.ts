import { describe, expect, it } from 'vitest';
import { answer, briefing, decide, type ShopFacts } from './brain';

const facts = (patch: Partial<ShopFacts> = {}): ShopFacts => ({
  shop: 'Test Donuts',
  today: { dayName: 'Wednesday', salesCents: 120_000, typicalCents: 240_000, orders: 300, open: true },
  rack: [{ name: 'Glazed', onRack: 6, stillNeeded: 40, priceCents: 175 }, { name: 'Maple Bar', onRack: 30, stillNeeded: 20, priceCents: 175 }],
  tomorrow: { dayName: 'Thursday', bakeTotal: 1200, lastWeekTotal: 1260, rain: true, weather: 'Rain, high 61°, 80% chance of rain', preorderUnits: 144, wholesaleUnits: 96 },
  supplies: { orderNow: [{ name: 'Milk', daysLeft: 1 }], waiting: [{ supplier: 'Packaging supplier', totalCents: 21_300, items: 2 }], autoSent: 1 },
  team: { onClock: 4, breaks: ['Send Jess P. on lunch now.'], scheduleNotes: ['Saturday is heavy at 31% of forecast sales.'], laborShareNextWeek: 0.27, laborTargetHigh: 0.25 },
  equipment: { openRepairs: [{ name: 'Fryer 2', problem: 'Thermostat reads 15 degrees low.', booked: false }], serviceOverdue: ['Proofer'] },
  tasks: { overdue: ['Filter fryer oil', 'Sanitizer test strips'] },
  waste: { days: 28, costCents: 280_000, rate: 0.14, worst: { name: 'Sugar Twist', rate: 0.3, costCents: 28_000, perDay: 18 } },
  money: { days: 30, salesCents: 9_000_000, foodShare: 0.18, laborShare: 0.22, netCents: 3_000_000, netShare: 0.33, foodTarget: 0.3, laborTarget: 0.3, thinnest: { name: 'Ham & Cheese Croissant', margin: 0.61, priceCents: 550, sold: 900 } },
  wholesale: { accounts: 4, weeklyCents: 110_000, overdue: [{ account: 'Harbor Freight', cents: 16_320, daysLate: 10 }], unpaidCents: 126_000 },
  delivery: { ordersToday: 4, grossCents: 7_250, feesCents: 1_980, markup: 0.2, breakEvenMarkup: 0.4286, shortCents: 780 },
  giftCards: { outstandingCents: 17_825, cards: 5 },
  locations: { count: 3, transfers: [{ qty: 54, item: 'Glazed', from: 'Signal Hill', to: 'Lakewood' }], transferCents: 9_450 },
  ...patch,
});

describe('decide', () => {
  const d = decide(facts());
  const by = (id: string) => d.find((x) => x.id === id)!;
  it('puts what is needed right now first', () => {
    expect(d[0].urgency).toBe('now');
    expect(d.map((x) => x.urgency)).toEqual([...d.map((x) => x.urgency)].sort((a, b) => ['now', 'today', 'week'].indexOf(a) - ['now', 'today', 'week'].indexOf(b)));
  });
  it('fries whole trays of what will run out and leaves the rest alone', () => {
    expect(by('rack').title).toBe('Fry 36 more Glazed now');
    expect(by('rack').impactCents).toBe(34 * 175);
  });
  it('uses the numbers it was given, word for word', () => {
    expect(by('bake').title).toBe('Bake 1,200 for Thursday, 60 fewer than last Thursday');
    expect(by('bake').why).toContain('80% chance of rain');
    expect(by('po:Packaging supplier').title).toBe('Send the $213.00 order to Packaging supplier');
    expect(by('invoice:Harbor Freight').why).toContain('10 days past due');
    expect(by('markup').title).toBe('Raise delivery app prices from 20% to 45% over shop prices');
    expect(by('price').impactCents).toBe(900 * 50);
  });
  it('halves the worst waste in whole half-dozens', () => {
    expect(by('waste').title).toBe('Make 6 fewer Sugar Twist a day');
    expect(by('waste').impactCents).toBe(Math.round((28_000 / 28) * 30 * (6 / 18)));
  });
  it('stays quiet when there is nothing to fix', () => {
    const calm = decide(facts({
      rack: [], team: { onClock: 3, breaks: [], scheduleNotes: [], laborShareNextWeek: 0.2, laborTargetHigh: 0.25 }, supplies: { orderNow: [], waiting: [], autoSent: 0 },
      equipment: { openRepairs: [], serviceOverdue: [] }, tasks: { overdue: [] }, waste: { days: 28, costCents: 0, rate: 0.02 },
      money: { ...facts().money, thinnest: undefined }, wholesale: { accounts: 4, weeklyCents: 1, overdue: [], unpaidCents: 0 },
      delivery: { ...facts().delivery, markup: 0.45 }, locations: { count: 3, transfers: [], transferCents: 0 },
    }));
    expect(calm.map((x) => x.id)).toEqual(['bake']);
  });
  it('does not ask for a batch when the shop is closed', () => {
    expect(decide(facts({ today: { ...facts().today, open: false } })).some((x) => x.id === 'rack')).toBe(false);
  });
});

describe('answer', () => {
  const f = facts();
  const d = decide(f);
  it('answers from the numbers and brings the matching decisions', () => {
    const a = answer('Which invoices are late?', f, d);
    expect(a.text).toContain('Harbor Freight, $163.20, 10 days late');
    expect(a.decisions.map((x) => x.id)).toEqual(['invoice:Harbor Freight']);
  });
  it('keeps a name with a full stop whole and reads plain questions', () => {
    expect(d.find((x) => x.area === 'Team' && x.urgency === 'now')!.title).toBe('Send Jess P. on lunch now');
    expect(answer('Who owes me money?', f, d).text).toContain('Harbor Freight');
    expect(answer('Where am I losing money?', f, d).text).toContain('Sugar Twist');
  });
  it('knows the weather', () => {
    expect(answer('is it going to rain?', f, d).text).toContain('80% chance of rain');
  });
  it('falls back to the top decisions', () => {
    const a = answer('hello', f, d);
    expect(a.decisions).toHaveLength(3);
    expect(a.text).toContain('1. ');
  });
  it('writes a short briefing', () => {
    const b = briefing(f, d);
    expect(b[0]).toBe('Sales are $1,200 from 300 orders so far, 50% of a usual full Wednesday.');
    expect(b[2]).toContain(`${d.length} decisions waiting`);
  });
});

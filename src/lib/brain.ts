/**
 * The part of KneadOS that looks at the whole shop and says what to do next.
 * Every number in a decision is worked out by the rest of the app and handed in as `ShopFacts`.
 * Nothing here guesses a figure: it only decides what is worth the owner's attention and words it.
 */

export type Area = 'Counter' | 'Bake plan' | 'Supplies' | 'Team' | 'Equipment' | 'Tasks' | 'Waste' | 'Prices' | 'Wholesale' | 'Delivery' | 'Locations' | 'Customers' | 'Health' | 'Events';
export type Urgency = 'now' | 'today' | 'week';

export interface Decision {
  id: string;
  area: Area;
  urgency: Urgency;
  /** What KneadOS wants to do, as an instruction. */
  title: string;
  /** The numbers behind it. */
  why: string;
  /** What approving is worth, in cents, when it can be worked out. `per` says over what time. */
  impactCents?: number;
  per?: 'today' | 'a month';
  /** The label on the approve button. */
  action: string;
  /** What happens when it is approved. */
  then: string;
}

export interface ShopFacts {
  shop: string;
  today: { dayName: string; salesCents: number; typicalCents: number; orders: number; open: boolean };
  rack: { name: string; onRack: number; stillNeeded: number; priceCents: number }[];
  tomorrow: { dayName: string; bakeTotal: number; lastWeekTotal: number; rain: boolean; weather?: string; preorderUnits: number; wholesaleUnits: number; holiday?: string };
  supplies: { orderNow: { name: string; daysLeft: number | null }[]; waiting: { supplier: string; totalCents: number; items: number }[]; autoSent: number };
  team: { onClock: number; breaks: string[]; scheduleNotes: string[]; laborShareNextWeek: number; laborTargetHigh: number };
  equipment: { openRepairs: { name: string; problem: string; booked: boolean }[]; serviceOverdue: string[] };
  tasks: { overdue: string[] };
  waste: { days: number; costCents: number; rate: number; worst?: { name: string; rate: number; costCents: number; perDay: number } };
  money: { days: number; salesCents: number; foodShare: number; laborShare: number; netCents: number; netShare: number; foodTarget: number; laborTarget: number; thinnest?: { name: string; margin: number; priceCents: number; sold: number } };
  wholesale: { accounts: number; weeklyCents: number; overdue: { account: string; cents: number; daysLate: number }[]; unpaidCents: number };
  delivery: { ordersToday: number; grossCents: number; feesCents: number; markup: number; breakEvenMarkup: number; shortCents: number };
  giftCards: { outstandingCents: number; cards: number };
  locations: { count: number; transfers: { qty: number; item: string; from: string; to: string }[]; transferCents: number };
  /** End-of-day markdown: whether the rule is on, when it starts, and what it would cover with the rack as it is. */
  pricing?: { markdownOn: boolean; markdownPct: number; startsAt: string; closingSoon: boolean; extras: { name: string; extra: number; toCents: number }[]; recoverCents: number; changedNow: number };
  /** Menu items that need a change, worst first, with the advice worked out by menu insights. */
  /** Health department readiness: the score, what counts against it, and what is coming up. */
  health?: { city: string; score: number; issues: { title: string; detail: string; major: boolean }[]; comingUp: { title: string; detail: string }[] };
  /** Customer texts that are due, by campaign, and whether each sends on its own. */
  customers?: { members: number; texts: { kind: string; title: string; due: number; names: string[]; auto: boolean; offer: string }[]; sentLast30Days: number };
  /** Event bookings still to come, and fundraisers with what each group has earned. */
  events?: { upcoming: number; dozensNext7Days: number; bookedCents: number; balanceDueCents: number; next?: { name: string; dozens: number; when: string }; fundraisers: { org: string; state: string; raisedCents: number; orders: number; endedDaysAgo?: number }[] };
  menu?: { attention: { id: string; name: string; verdict: string; advice: string; monthlyCents?: number }[] };
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
/** Whole trays of a dozen, at least one. */
const trays = (units: number) => Math.max(1, Math.ceil(units / 12)) * 12;

const ORDER: Record<Urgency, number> = { now: 0, today: 1, week: 2 };

/** Everything worth deciding right now, most urgent first and then by what it is worth. */
export function decide(f: ShopFacts): Decision[] {
  const out: Decision[] = [];

  const short = f.rack.filter((r) => r.stillNeeded - r.onRack >= 6).sort((a, b) => (b.stillNeeded - b.onRack) * b.priceCents - (a.stillNeeded - a.onRack) * a.priceCents).slice(0, 3);
  if (f.today.open && short.length > 0) {
    out.push({
      id: 'rack', area: 'Counter', urgency: 'now',
      title: `Fry ${list(short.map((r) => `${trays(r.stillNeeded - r.onRack)} more ${r.name}`))} now`,
      why: short.map((r) => `${r.name}: ${r.onRack} on the rack, about ${r.stillNeeded} still expected to sell before close.`).join(' '),
      impactCents: short.reduce((a, r) => a + (r.stillNeeded - r.onRack) * r.priceCents, 0), per: 'today',
      action: 'Tell the kitchen', then: 'The kitchen screen gets the extra batch at the top of the list.',
    });
  }

  for (const b of f.team.breaks) {
    const title = b.match(/^(.*?(?:now|lunch))\.(\s|$)/)?.[1] ?? b;
    const rest = b.slice(title.length + 1).trim();
    out.push({ id: `break:${b}`, area: 'Team', urgency: 'now', title, why: rest || 'Their break is due, and only one person per station goes at a time so the floor stays covered.', action: 'Send them', then: 'It shows on the register for that person, and their packing goes to someone else until they are back.' });
  }

  for (const w of f.supplies.waiting) {
    out.push({
      id: `po:${w.supplier}`, area: 'Supplies', urgency: 'today', title: `Send the ${usd(w.totalCents)} order to ${w.supplier}`,
      why: `${plural(w.items, 'item')} from this supplier will run low before the next delivery. This supplier is set to wait for your OK.`,
      action: 'Approve and send', then: 'The purchase order is marked sent and the stock shows as on order.',
    });
  }
  const urgent = f.supplies.orderNow.filter((s) => s.daysLeft !== null && s.daysLeft <= 1);
  if (urgent.length > 0 && f.supplies.waiting.length === 0) {
    out.push({
      id: 'supply-run', area: 'Supplies', urgency: 'today', title: `Pick up ${list(urgent.map((s) => s.name.toLowerCase()))} today`,
      why: urgent.map((s) => `${s.name} has ${s.daysLeft === 0 ? 'less than a day' : 'about a day'} left.`).join(' '),
      action: 'Add to today\'s run', then: 'It goes on the pickup list for whoever does the cash and carry run.',
    });
  }

  const unbooked = f.equipment.openRepairs.filter((r) => !r.booked);
  if (unbooked.length > 0) {
    out.push({
      id: 'repairs', area: 'Equipment', urgency: 'today', title: `Book a technician for the ${list(unbooked.map((r) => r.name.toLowerCase()))}`,
      why: unbooked.map((r) => `${r.name}: ${r.problem}`).join(' '),
      action: 'Book it', then: 'The repair is marked as booked on the Equipment screen.',
    });
  }
  if (f.equipment.serviceOverdue.length > 0) {
    out.push({
      id: 'service', area: 'Equipment', urgency: 'week', title: `Schedule service for the ${list(f.equipment.serviceOverdue.map((n) => n.toLowerCase()))}`,
      why: `${plural(f.equipment.serviceOverdue.length, 'machine')} ${f.equipment.serviceOverdue.length === 1 ? 'is' : 'are'} past the service date. Regular service is cheaper than a breakdown during the morning rush.`,
      action: 'Add to this week', then: 'It goes on this week\'s task list.',
    });
  }
  if (f.tasks.overdue.length > 0) {
    out.push({
      id: 'tasks', area: 'Tasks', urgency: 'today', title: `Get ${plural(f.tasks.overdue.length, 'overdue task')} done before close`,
      why: `Still open: ${list(f.tasks.overdue.slice(0, 4))}${f.tasks.overdue.length > 4 ? ' and more' : ''}.`,
      action: 'Remind the crew', then: 'The tasks are pinned to the top of the register task list for whoever is on the floor.',
    });
  }

  const t = f.tomorrow;
  const diff = t.bakeTotal - t.lastWeekTotal;
  const reasons = [
    t.weather ? `The forecast is ${t.weather.toLowerCase()}${t.rain ? ', so walk-in sales are cut back' : ''}.` : '',
    t.preorderUnits > 0 ? `${t.preorderUnits} donuts are already pre-ordered${t.wholesaleUnits > 0 ? `, ${t.wholesaleUnits} of them for wholesale accounts` : ''}.` : '',
    t.holiday ? `It is ${t.holiday}.` : '',
  ].filter(Boolean).join(' ');
  out.push({
    id: 'bake', area: 'Bake plan', urgency: 'today',
    title: `Bake ${t.bakeTotal.toLocaleString('en-US')} for ${t.dayName}${diff === 0 ? '' : `, ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than last ${t.dayName}`}`,
    why: `Built from the last 8 ${t.dayName}s. ${reasons}`.trim(),
    action: 'Send to the kitchen', then: 'The bakers see this plan on the kitchen screen when they start.',
  });

  for (const o of f.wholesale.overdue) {
    out.push({
      id: `invoice:${o.account}`, area: 'Wholesale', urgency: 'today', title: `Chase ${o.account} for ${usd(o.cents)}`,
      why: `Their invoice is ${plural(o.daysLate, 'day')} past due. They are still getting deliveries.`,
      impactCents: o.cents, action: 'Send a reminder', then: 'A reminder email with the invoice goes to the account contact.',
    });
  }

  if (f.locations.transfers.length > 0) {
    const top = f.locations.transfers[0];
    out.push({
      id: 'transfers', area: 'Locations', urgency: 'now',
      title: `Move ${top.qty} ${top.item} from ${top.from} to ${top.to}${f.locations.transfers.length > 1 ? ` and ${plural(f.locations.transfers.length - 1, 'other tray move')}` : ''}`,
      why: 'One shop baked more than it will sell and another is going to run out. Only whole trays move, and no shop gives up what it still needs.',
      impactCents: f.locations.transferCents, per: 'today', action: 'Send a driver', then: 'The moves are marked as sent on the Locations screen.',
    });
  }

  const pr = f.pricing;
  if (pr && !pr.markdownOn && pr.closingSoon && pr.extras.length > 0) {
    const top = pr.extras[0];
    out.push({
      id: 'markdown', area: 'Prices', urgency: 'now',
      title: `Mark down ${top.extra} extra ${top.name} to ${usd(top.toCents)} at ${pr.startsAt}${pr.extras.length > 1 ? ` and ${plural(pr.extras.length - 1, 'other donut')}` : ''}`,
      why: `${list(pr.extras.slice(0, 4).map((e) => `${e.extra} ${e.name}`))} ${pr.extras.length === 1 && pr.extras[0].extra === 1 ? 'is' : 'are'} on the rack beyond what is still expected to sell today. At ${pct(pr.markdownPct)} off they bring in up to ${usd(pr.recoverCents)} instead of going to the day-old rack or the bin.`,
      impactCents: pr.recoverCents, per: 'today', action: 'Turn on the markdown', then: `The register and the shop website drop those prices at ${pr.startsAt} on their own, today and every day.`,
    });
  }
  const hl = f.health;
  if (hl && hl.issues.length > 0) {
    const serious = hl.issues.filter((i) => i.major).length;
    out.push({
      id: 'health', area: 'Health', urgency: serious > 0 ? 'now' : 'today',
      title: `Fix ${plural(hl.issues.length, 'health department item')} before an inspector walks in`,
      why: `${hl.issues.slice(0, 3).map((i) => `${i.title}: ${i.detail.replace(/\.$/, '')}.`).join(' ')}${hl.issues.length > 3 ? ` And ${hl.issues.length - 3} more.` : ''} The shop's ready score is ${hl.score} out of 100.`,
      action: 'Open Health & safety', then: 'The checks are also on the register and kitchen task lists for whoever is on the floor.',
    });
  }
  const renew = hl?.comingUp.filter((c) => /card|permit|certificate/i.test(c.title)) ?? [];
  if (renew.length > 0) {
    out.push({
      id: 'health:papers', area: 'Health', urgency: 'week', title: `Renew ${plural(renew.length, 'card or permit', 'cards and permits')} before ${renew.length === 1 ? 'it runs' : 'they run'} out`,
      why: renew.slice(0, 4).map((c) => `${c.title}: ${c.detail}.`).join(' '),
      action: 'Open Health & safety', then: 'Each one is marked renewed there once the new card or permit is in hand.',
    });
  }

  for (const fr of f.events?.fundraisers.filter((x) => x.state === 'ended' && x.raisedCents > 0) ?? []) {
    out.push({
      id: `events:payout:${fr.org}`, area: 'Events', urgency: 'week', title: `Send ${fr.org} their fundraiser check for ${usd(fr.raisedCents)}`,
      why: `Their fundraiser ended ${plural(fr.endedDaysAgo ?? 0, 'day')} ago with ${plural(fr.orders, 'order')}. The group is waiting on the money.`,
      action: 'Open Events & fundraisers', then: 'Mark the check sent there once it is in the mail.',
    });
  }

  for (const t of f.customers?.texts ?? []) {
    if (t.due === 0 || t.auto) continue;
    out.push({
      id: `texts:${t.kind}`, area: 'Customers', urgency: t.kind === 'review' || t.kind === 'birthday' ? 'today' : 'week',
      title: t.kind === 'winback' ? `Text ${plural(t.due, 'regular')} who ${t.due === 1 ? 'has' : 'have'} stopped coming in`
        : t.kind === 'birthday' ? `Send ${plural(t.due, 'birthday text')}`
        : t.kind === 'review' ? `Ask ${plural(t.due, 'regular')} for a Google review`
        : `Text ${plural(t.due, 'member')} about ${t.title}`,
      why: `${list(t.names.slice(0, 4))}${t.due > 4 ? ` and ${t.due - 4} more` : ''} ${t.due === 1 ? 'is' : 'are'} due. ${t.offer}`,
      action: `Send ${plural(t.due, 'text')}`, then: 'The texts go out with the wording on the Customer texts screen, and each person is not texted about this again.',
    });
  }
  // The waste decision already covers the worst item for leftovers, so this picks a different one.
  const m = f.menu?.attention.find((a) => (a.verdict === 'losing' || a.verdict === 'drop') && a.name !== f.waste.worst?.name);
  if (m) {
    out.push({
      id: `menu:${m.id}`, area: 'Prices', urgency: 'week', title: m.verdict === 'losing' ? `Take ${m.name} off the menu or raise its price` : `Make ${m.name} only on your busiest days`,
      why: m.advice, impactCents: m.monthlyCents, per: 'a month', action: 'Open menu insights', then: 'Menu insights opens with every item and what it earns.',
    });
  }

  const d = f.delivery;
  if (d.markup < d.breakEvenMarkup - 0.02) {
    const to = Math.ceil(d.breakEvenMarkup * 20) / 20;
    out.push({
      id: 'markup', area: 'Delivery', urgency: 'week', title: `Raise delivery app prices from ${pct(d.markup)} to ${pct(to)} over shop prices`,
      why: `At ${pct(d.markup)} a delivery order pays you less than the same order at the counter once the app takes its cut. ${d.ordersToday > 0 ? `Today that gap is ${usd(d.shortCents)} across ${plural(d.ordersToday, 'order')}.` : ''}`.trim(),
      impactCents: d.shortCents > 0 ? d.shortCents * 30 : undefined, per: 'a month', action: `Set to ${pct(to)}`, then: 'The app menu prices change on the Delivery apps screen.',
    });
  }

  const w = f.waste.worst;
  if (w && w.rate >= 0.12 && w.perDay >= 3) {
    const cut = Math.max(6, Math.floor(w.perDay / 2 / 6) * 6);
    out.push({
      id: 'waste', area: 'Waste', urgency: 'week', title: `Make ${cut} fewer ${w.name} a day`,
      why: `${pct(w.rate)} of the ${w.name} made in the last ${f.waste.days} days went unsold, about ${Math.round(w.perDay)} a day and ${usd(w.costCents)} in ingredients.`,
      impactCents: Math.round((w.costCents / f.waste.days) * 30 * (cut / w.perDay)), per: 'a month', action: 'Lower the plan', then: 'The bake plan for this item drops by that amount on days it has been left over.',
    });
  }

  const thin = f.money.thinnest;
  if (thin && thin.margin < 0.65) {
    out.push({
      id: 'price', area: 'Prices', urgency: 'week', title: `Raise ${thin.name} by 50 cents`,
      why: `It keeps ${pct(thin.margin)} of its ${usd(thin.priceCents)} price after ingredients, the thinnest on the menu. You sold ${thin.sold.toLocaleString('en-US')} in the last ${f.money.days} days.`,
      impactCents: Math.round((thin.sold * 50 * 30) / f.money.days), per: 'a month', action: 'Change the price', then: 'The new price shows on the register and the shop website.',
    });
  }

  if (f.team.laborShareNextWeek > f.team.laborTargetHigh && f.team.scheduleNotes.length > 0) {
    out.push({
      id: 'schedule', area: 'Team', urgency: 'week', title: 'Trim next week\'s schedule before posting it',
      why: `Labor is planned at ${pct(f.team.laborShareNextWeek)} of forecast sales against a goal of ${pct(f.team.laborTargetHigh)}. ${f.team.scheduleNotes[0]}`,
      action: 'Open the schedule', then: 'The Schedule screen opens with the heavy days marked.',
    });
  } else if (f.team.scheduleNotes.length > 0) {
    out.push({
      id: 'schedule', area: 'Team', urgency: 'week', title: 'Fix next week\'s schedule before posting it',
      why: f.team.scheduleNotes[0], action: 'Open the schedule', then: 'The Schedule screen opens with the problem days marked.',
    });
  }

  return out.sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || (b.impactCents ?? 0) - (a.impactCents ?? 0));
}

/** The one-paragraph morning read: how the day is going and what matters most. */
export function briefing(f: ShopFacts, decisions: Decision[]): string[] {
  const lines: string[] = [];
  const share = f.today.typicalCents > 0 ? f.today.salesCents / f.today.typicalCents : 0;
  lines.push(`Sales are ${usd0(f.today.salesCents)} from ${plural(f.today.orders, 'order')} so far, ${pct(share)} of a usual full ${f.today.dayName}.`);
  lines.push(`Over the last ${f.money.days} days you kept ${pct(f.money.netShare)} of sales as profit, with food at ${pct(f.money.foodShare)} and labor at ${pct(f.money.laborShare)}.`);
  const now = decisions.filter((x) => x.urgency === 'now').length;
  const worth = decisions.filter((x) => x.per === 'a month').reduce((a, x) => a + (x.impactCents ?? 0), 0);
  lines.push(`${plural(decisions.length, 'decision')} waiting${now > 0 ? `, ${now} of them for right now` : ''}.${worth > 0 ? ` The pricing and waste ones together are worth about ${usd0(worth)} a month.` : ''}`);
  return lines;
}

interface Topic {
  words: string[];
  areas: Area[];
  say: (f: ShopFacts) => string;
}

const TOPICS: Topic[] = [
  { words: ['weather', 'rain', 'forecast', 'tomorrow', 'bake', 'make', 'fry'], areas: ['Bake plan', 'Counter'],
    say: (f) => `Tomorrow is ${f.tomorrow.dayName}. The plan is ${f.tomorrow.bakeTotal.toLocaleString('en-US')} donuts against ${f.tomorrow.lastWeekTotal.toLocaleString('en-US')} last ${f.tomorrow.dayName}. ${f.tomorrow.weather ? `The forecast is ${f.tomorrow.weather.toLowerCase()}${f.tomorrow.rain ? ', so the walk-in part is cut back' : ', so there is no weather change'}.` : 'The weather forecast has not loaded, so the plan assumes a clear day.'} ${f.tomorrow.preorderUnits} are already pre-ordered.` },
  { words: ['sale', 'sold', 'today', 'busy', 'slow', 'revenue', 'how are we'], areas: ['Counter'],
    say: (f) => `Today is at ${usd(f.today.salesCents)} from ${plural(f.today.orders, 'order')}. A usual full ${f.today.dayName} brings in about ${usd0(f.today.typicalCents)}, so you are ${pct(f.today.typicalCents > 0 ? f.today.salesCents / f.today.typicalCents : 0)} of the way there.` },
  { words: ['profit', 'margin', 'losing', 'food cost', 'p&l', 'earn', 'price'], areas: ['Prices'],
    say: (f) => `Over the last ${f.money.days} days sales were ${usd0(f.money.salesCents)} and profit was ${usd0(f.money.netCents)}, which is ${pct(f.money.netShare)}. Food cost ran ${pct(f.money.foodShare)} against a goal of ${pct(f.money.foodTarget)}, and labor ${pct(f.money.laborShare)} against ${pct(f.money.laborTarget)}.${f.money.thinnest ? ` The thinnest item is ${f.money.thinnest.name} at ${pct(f.money.thinnest.margin)} margin.` : ''}${f.menu && f.menu.attention.length > 0 ? ` On the menu, ${plural(f.menu.attention.length, 'item needs', 'items need')} a change, starting with ${f.menu.attention[0].name}.` : ''}` },
  { words: ['markdown', 'mark down', 'discount', 'special', 'on sale', 'sale price'], areas: ['Prices'],
    say: (f) => !f.pricing ? 'Smart pricing is not set up yet.' : `The end-of-day markdown is ${f.pricing.markdownOn ? `on: ${pct(f.pricing.markdownPct)} off from ${f.pricing.startsAt}` : 'off'}. ${f.pricing.extras.length === 0 ? 'Nothing on the rack is running ahead of what will sell.' : `Right now ${list(f.pricing.extras.slice(0, 3).map((e) => `${e.extra} ${e.name}`))} ${f.pricing.extras.length === 1 && f.pricing.extras[0].extra === 1 ? 'is' : 'are'} more than will sell at full price.`} ${plural(f.pricing.changedNow, 'price is', 'prices are')} changed at this moment.` },
  { words: ['waste', 'toss', 'thrown', 'losing', 'leftover', 'day-old', 'day old'], areas: ['Waste'],
    say: (f) => `In the last ${f.waste.days} days ${pct(f.waste.rate)} of what was baked went unsold, ${usd(f.waste.costCents)} in ingredients.${f.waste.worst ? ` ${f.waste.worst.name} is the worst at ${pct(f.waste.worst.rate)}, about ${Math.round(f.waste.worst.perDay)} a day.` : ''}` },
  { words: ['suppl', 'order', 'stock', 'run out', 'flour', 'mix', 'buy', 'purchase'], areas: ['Supplies'],
    say: (f) => `${f.supplies.orderNow.length === 0 ? 'Nothing needs ordering today.' : `${list(f.supplies.orderNow.map((s) => s.name))} ${f.supplies.orderNow.length === 1 ? 'needs' : 'need'} ordering now.`} ${f.supplies.autoSent > 0 ? `${plural(f.supplies.autoSent, 'purchase order')} already went out automatically.` : ''} ${f.supplies.waiting.length > 0 ? `${plural(f.supplies.waiting.length, 'order')} worth ${usd(f.supplies.waiting.reduce((a, w) => a + w.totalCents, 0))} ${f.supplies.waiting.length === 1 ? 'is' : 'are'} waiting for your OK.` : ''}`.replace(/\s+/g, ' ').trim() },
  { words: ['staff', 'labor', 'schedule', 'shift', 'break', 'lunch', 'team', 'crew'], areas: ['Team'],
    say: (f) => `${plural(f.team.onClock, 'person', 'people')} on the clock. ${f.team.breaks.length > 0 ? f.team.breaks.join(' ') : 'Nobody is due a break right now.'} Next week's labor is planned at ${pct(f.team.laborShareNextWeek)} of forecast sales against a goal of ${pct(f.team.laborTargetHigh)}.${f.team.scheduleNotes.length > 0 ? ` ${f.team.scheduleNotes[0]}` : ''}` },
  { words: ['equipment', 'repair', 'broken', 'fryer', 'machine', 'service', 'task', 'clean'], areas: ['Equipment', 'Tasks'],
    say: (f) => `${f.equipment.openRepairs.length === 0 ? 'No open repairs.' : `${plural(f.equipment.openRepairs.length, 'open repair')}: ${f.equipment.openRepairs.map((r) => `${r.name} (${r.problem.replace(/\.$/, '')})`).join(', ')}.`} ${f.equipment.serviceOverdue.length > 0 ? `Service is overdue on the ${list(f.equipment.serviceOverdue.map((n) => n.toLowerCase()))}.` : ''} ${f.tasks.overdue.length > 0 ? `${plural(f.tasks.overdue.length, 'task')} overdue.` : 'No tasks overdue.'}`.replace(/\s+/g, ' ').trim() },
  { words: ['event', 'fundraiser', 'deposit', 'party', 'booking', 'booked'], areas: ['Events'],
    say: (f) => (f.events
      ? `${plural(f.events.upcoming, 'event')} ${f.events.upcoming === 1 ? 'is' : 'are'} booked, worth ${usd(f.events.bookedCents)}, with ${f.events.dozensNext7Days} dozen in the next 7 days and ${usd(f.events.balanceDueCents)} still to collect at pickup.${f.events.next ? ` Next up is ${f.events.next.name}, ${f.events.next.dozens} dozen ${f.events.next.when}.` : ''}${f.events.fundraisers.length > 0 ? ` Fundraisers: ${f.events.fundraisers.map((x) => `${x.org} (${x.state}) has raised ${usd(x.raisedCents)}`).join('; ')}.` : ''}`
      : 'KneadOS has no event bookings for this shop yet.') },
  { words: ['health', 'inspect', 'inspector', 'compliance', 'temperature', 'sanitizer', 'permit', 'food handler', 'card', 'grease', 'pest'], areas: ['Health'],
    say: (f) => (f.health
      ? `The shop's health inspection ready score is ${f.health.score} out of 100 under the ${f.health.city} rules. ${f.health.issues.length === 0 ? 'Nothing is overdue.' : `${plural(f.health.issues.length, 'item')} need fixing: ${f.health.issues.slice(0, 3).map((i) => `${i.title} (${i.detail.replace(/\.$/, '')})`).join('; ')}.`}${f.health.comingUp.length > 0 ? ` Coming up: ${f.health.comingUp.slice(0, 2).map((c) => c.title).join('; ')}.` : ''}`
      : 'KneadOS is not tracking health checks for this shop yet.') },
  { words: ['wholesale', 'invoice', 'account', 'owe', 'catering', 'paid'], areas: ['Wholesale'],
    say: (f) => `${f.wholesale.accounts} wholesale accounts bring in about ${usd0(f.wholesale.weeklyCents)} a week. ${usd(f.wholesale.unpaidCents)} is waiting to be paid.${f.wholesale.overdue.length > 0 ? ` Past due: ${f.wholesale.overdue.map((o) => `${o.account}, ${usd(o.cents)}, ${plural(o.daysLate, 'day')} late`).join('; ')}.` : ' Nothing is past due.'}` },
  { words: ['delivery', 'doordash', 'uber', 'grubhub', 'app', 'commission'], areas: ['Delivery'],
    say: (f) => `${plural(f.delivery.ordersToday, 'delivery order')} today for ${usd(f.delivery.grossCents)}. The apps kept ${usd(f.delivery.feesCents)}. Your app prices are ${pct(f.delivery.markup)} over shop prices, and it takes ${pct(f.delivery.breakEvenMarkup)} to keep what a counter sale keeps.` },
  { words: ['gift'], areas: [],
    say: (f) => `${plural(f.giftCards.cards, 'gift card')} still have money on them, ${usd(f.giftCards.outstandingCents)} in total. That is money already collected for donuts you still owe.` },
  { words: ['location', 'shops', 'store', 'transfer', 'signal', 'lakewood'], areas: ['Locations'],
    say: (f) => `${f.locations.count} shops. ${f.locations.transfers.length === 0 ? 'Every shop has what it needs right now.' : `${plural(f.locations.transfers.length, 'tray move')} would save about ${usd0(f.locations.transferCents)} in sales today, starting with ${f.locations.transfers[0].qty} ${f.locations.transfers[0].item} from ${f.locations.transfers[0].from} to ${f.locations.transfers[0].to}.`}` },
];

export interface Answer {
  text: string;
  /** Decisions that go with the answer. */
  decisions: Decision[];
}

/** Answers a plain question from the shop's own numbers. Unknown questions get the top decisions. */
export function answer(question: string, f: ShopFacts, decisions: Decision[]): Answer {
  const q = question.toLowerCase();
  const hits = TOPICS.map((t) => ({ t, n: t.words.filter((w) => q.includes(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  if (hits.length === 0) {
    const top = decisions.slice(0, 3);
    return { text: top.length > 0 ? `Here is what I would do first. ${top.map((x, i) => `${i + 1}. ${x.title}.`).join(' ')}` : 'Nothing needs a decision right now. The shop is running to plan.', decisions: top };
  }
  const areas = new Set(hits.flatMap((h) => h.t.areas));
  return { text: hits.map((h) => h.t.say(f)).join(' '), decisions: decisions.filter((x) => areas.has(x.area)).slice(0, 3) };
}

export const SUGGESTED = ['What should I do first?', 'How much should we bake tomorrow?', 'Where am I losing money?', 'What needs ordering?', 'Who is due a break?', 'Who owes me money?'];

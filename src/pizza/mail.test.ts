import { describe, expect, it } from 'vitest';
import { applyOffer, centsPerCard, estimate, findCode, mailCode, mailingList, namedAudience, pickRoutes, results, scoreRoutes, seedCampaigns, tracking } from './mail';
import { configFor, pizzaPrice, type Line } from './logic';

const today = '2026-11-17';
const list = mailingList(today);
const large: Line = { kind: 'pizza', config: configFor('pepperoni', 'L'), specialtyId: 'pepperoni', qty: 1, unitCents: pizzaPrice(configFor('pepperoni', 'L'), 'pepperoni').cents };

describe('postcard prices', () => {
  it('uses Lob list prices for named mail and USPS EDDM postage plus print for every-door mail', () => {
    expect(centsPerCard('lapsed', '4x6', 'first')).toBe(64.9);
    expect(centsPerCard('lapsed', '4x6', 'standard')).toBe(64.9); // 4x6 only mails First Class
    expect(centsPerCard('neighbors', '6x9', 'standard')).toBe(40);
  });
});

describe('who gets a card', () => {
  it('lapsed means two or more orders and nothing in 45 days to a year', () => {
    const l = namedAudience('lapsed', list, today);
    expect(l.length).toBeGreaterThan(30);
    for (const c of l) {
      const ago = (new Date(today).getTime() - new Date(c.lastOrder).getTime()) / 86_400_000;
      expect(c.orders).toBeGreaterThanOrEqual(2);
      expect(ago).toBeGreaterThanOrEqual(45);
      expect(ago).toBeLessThanOrEqual(365);
    }
  });
  it('leaves out anyone mailed in the last 30 days', () => {
    const l = namedAudience('lapsed', list, today);
    expect(namedAudience('lapsed', list, today, new Set([l[0].id])).length).toBe(l.length - 1);
  });
  it('picks every-door routes inside the radius that are not already well covered', () => {
    const scores = scoreRoutes(list);
    const picked = pickRoutes(scores, 2);
    expect(picked.length).toBeGreaterThan(0);
    for (const id of picked) {
      const s = scores.find((x) => x.route.id === id)!;
      expect(s.miles).toBeLessThanOrEqual(2);
      expect(s.share).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('offers at checkout', () => {
  it('adds free garlic bread at $0 only when there is a pizza', () => {
    expect(applyOffer('knots', [large]).free[0]).toMatchObject({ sideId: 'garlic-knots', unitCents: 0 });
    expect(applyOffer('knots', []).problem).toBeTruthy();
  });
  it('takes $5 off only from $25', () => {
    expect(applyOffer('five', [large, large]).discountCents).toBe(500);
    expect(applyOffer('five', [{ kind: 'side', sideId: 'soda-can', qty: 1, unitCents: 225 }]).problem).toBeTruthy();
  });
});

describe('codes and tracking', () => {
  const seeded = seedCampaigns(today, list, 3400);
  it('makes readable codes and finds them however they are typed', () => {
    const code = mailCode('x:1');
    expect(code).toMatch(/^SS-[A-Z2-9]{5}$/);
    const c = seeded[1];
    const route = Object.values(c.codes)[0];
    expect(findCode(route.toLowerCase().replace('-', ' '), seeded, today)?.campaign.id).toBe(c.id);
    expect(findCode('nope', seeded, today)).toBeUndefined();
  });
  it('marks a named code used once it is on an order, but a route code stays open', () => {
    const named = seeded[0];
    const used = named.redemptions[0].code;
    expect(findCode(used, seeded, today)?.used).toBe(true);
    expect(findCode(seeded[1].redemptions[0].code, seeded, today)?.used).toBe(false);
  });
  it('follows the card from print to mailbox', () => {
    expect(tracking({ sentOn: today, audience: 'lapsed', mailClass: 'first' }, today).status).toBe('Printed');
    expect(tracking({ sentOn: '2026-10-01', audience: 'lapsed', mailClass: 'first' }, today).status).toBe('Delivered');
  });
  it('counts profit after food, free food and the mailing', () => {
    const c = seeded[0];
    const r = results(c, 0.28);
    expect(r.redeemed).toBe(c.redemptions.length);
    expect(r.profitCents).toBe(Math.round(r.salesCents * 0.72) - c.redemptions.length * 140 - c.totalCents);
  });
  it('plans with the shop\'s own response rate once it has one', () => {
    const plan = estimate({ audience: 'lapsed', pieces: 100, size: '4x6', mailClass: 'first', offerId: 'knots', avgTicketCents: 3400, foodShare: 0.28 });
    expect(plan.responseRate).toBe(0.05);
    const own = estimate({ audience: 'lapsed', pieces: 100, size: '4x6', mailClass: 'first', offerId: 'knots', avgTicketCents: 3400, foodShare: 0.28, history: seeded });
    expect(own.responseFrom).toContain('your last');
    expect(own.costCents).toBe(6490);
  });
});

import { describe, expect, it } from 'vitest';
import { mailingList, seedCampaigns } from './mail';
import { creditFor, findAd, findAnyCode, mailRow, promoRow, seedPromos, totalsOf } from './marketing';

const today = '2026-11-17';
const mail = seedCampaigns(today, mailingList(today), 3400);
const promos = seedPromos(today, 3400);

describe('one order, one campaign', () => {
  it('credits the code first, then the ad link, then the deal', () => {
    expect(creditFor({ promoCampaignId: 'mail-1', adCampaignId: 'ad-meta', dealIds: ['slow-14'] })).toEqual({ campaignId: 'mail-1', by: 'code' });
    expect(creditFor({ adCampaignId: 'ad-meta', dealIds: ['slow-14'] })).toEqual({ campaignId: 'ad-meta', by: 'ad' });
    expect(creditFor({ dealIds: ['slow-14'] })).toEqual({ campaignId: 'slow-14', by: 'deal' });
    expect(creditFor({})).toBeUndefined();
  });
});

describe('codes from every channel', () => {
  it('finds postcard, text and ad codes', () => {
    expect(findAnyCode(Object.values(mail[1].codes)[0], mail, promos, today)?.channel).toBe('postcard');
    expect(findAnyCode('igpep5', mail, promos, today)?.channel).toBe('meta');
    const text = promos.find((p) => p.id === 'text-winback')!;
    expect(findAnyCode(Object.values(text.codes)[0], mail, promos, today)?.channel).toBe('text');
  });
  it('a shared code stays open; an expired one says so', () => {
    expect(findAnyCode('RAINYDAY', mail, promos, today)).toMatchObject({ used: false, expired: true });
    expect(findAnyCode('IGPEP5', mail, promos, today)?.used).toBe(false);
  });
  it('matches an ad by its link tag', () => {
    expect(findAd('pizza-delivery-long-beach', promos, today)?.id).toBe('ad-google');
    expect(findAd('nope', promos, today)).toBeUndefined();
  });
});

describe('results are worked out the same way for every channel', () => {
  it('profit is sales less food, free food and money paid out', () => {
    const g = promoRow(promos.find((p) => p.id === 'ad-google')!, 0.25);
    expect(g.profitCents).toBe(Math.round(g.salesCents * 0.75) - 41200);
    const win = promoRow(promos.find((p) => p.id === 'text-winback')!, 0.25);
    expect(win.profitCents).toBe(Math.round(win.salesCents * 0.75) - win.orders * 140 - win.spendCents);
    expect(win.newCustomers).toBe(0);
  });
  it('a deal pays nothing out; its cost is the discount', () => {
    const d = promoRow(promos.find((p) => p.id === 'deal-past-slow')!, 0.25);
    expect(d.spendCents).toBe(0);
    expect(d.giveawayCents).toBe(d.orders * 300);
  });
  it('adds every channel up', () => {
    const rows = [...mail.map((c) => mailRow(c, 0.25)), ...promos.map((p) => promoRow(p, 0.25))];
    const t = totalsOf(rows);
    expect(t.orders).toBe(rows.reduce((a, r) => a + r.orders, 0));
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['postcard', 'text', 'deal', 'google', 'meta']));
  });
});

/**
 * Every kind of marketing in one ledger: postcards, supply-and-demand deals, customer text blasts and online ads.
 * Each order is credited to at most one campaign: the code on it, else the ad link the customer arrived by,
 * else the deal on the ticket. Results are worked out the same way for every channel, so they compare fairly.
 *
 * Text blasts, ads and past deals are example data for the demo shop. Live orders placed in the demo are added
 * to them as they happen.
 */
import { addDays } from '../lib/dates';
import { OFFER_BY_ID, findCode, mailCode, results as mailResults, type MailCampaign, type Redemption } from './mail';
import { rng } from './logic';

export type MarketingChannel = 'postcard' | 'text' | 'deal' | 'google' | 'meta';

export const CHANNEL_LABEL: Record<MarketingChannel, string> = { postcard: 'Postcards', text: 'Text blasts', deal: 'Deals', google: 'Google ads', meta: 'Instagram & Facebook ads' };

/** A text blast, an ad campaign or a deal: anything that is not a postcard. */
export interface PromoCampaign {
  id: string;
  channel: Exclude<MarketingChannel, 'postcard'>;
  name: string;
  startedOn: string;
  endsOn: string;
  /** Money paid out: texting fees or ad spend. Deals pay nothing out; their cost is the discount. */
  spendCents: number;
  spendNote: string;
  offerId?: string;
  /** Codes that credit an order to this campaign. One per person for a text blast, one shared code for an ad. */
  codes: Record<string, string>;
  /** A personal code works once; a shared one works for anyone. */
  oneUse: boolean;
  /** Ads: the tag on the link, so an order that arrives by the ad is credited even without a code. */
  utm?: { source: string; medium: string; campaign: string };
  impressions?: number;
  clicks?: number;
  /** Text blasts: how many texts went out. */
  sent?: number;
  /** Deals: what the deal takes off and the food it saves. */
  dealOffCents?: number;
  redemptions: Redemption[];
}

/** About what one marketing text costs through Twilio, carrier fees included. Example rate; a live shop sees its own bill. */
export const TEXT_CENTS = 1.2;

export const adLink = (u: NonNullable<PromoCampaign['utm']>) => `kneados.app/pizza/demo/shop?utm_source=${u.source}&utm_medium=${u.medium}&utm_campaign=${u.campaign}`;

/* ---------------------------------------------------------------- finding a code anywhere */

export interface CodeHit { campaign: { id: string; name: string; offerId: string; codes: Record<string, string> }; key: string; used: boolean; expired: boolean; channel: MarketingChannel }

/** Looks a code up on every postcard, text blast and ad. Case, spaces and dashes do not matter. */
export function findAnyCode(code: string, mail: MailCampaign[], promos: PromoCampaign[], today: string): CodeHit | undefined {
  const m = findCode(code, mail, today);
  if (m) return { ...m, channel: 'postcard' };
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 5) return undefined;
  for (const p of promos) {
    if (!p.offerId) continue;
    for (const [key, c] of Object.entries(p.codes)) {
      if (c.replace(/-/g, '') !== clean) continue;
      return { campaign: { id: p.id, name: p.name, offerId: p.offerId, codes: p.codes }, key, used: p.oneUse && p.redemptions.some((r) => r.code === c), expired: today > p.endsOn, channel: p.channel };
    }
  }
  return undefined;
}

/** The ad a visitor arrived from, by the tag on the link. */
export function findAd(utmCampaign: string, promos: PromoCampaign[], today: string): PromoCampaign | undefined {
  return promos.find((p) => p.utm?.campaign === utmCampaign && today <= p.endsOn);
}

/* ---------------------------------------------------------------- results, the same for every channel */

export interface ChannelRow {
  id: string;
  channel: MarketingChannel;
  name: string;
  startedOn: string;
  /** Money paid out: postage and print, texting fees, ad spend. */
  spendCents: number;
  /** Discounts taken off orders plus food given away free. */
  giveawayCents: number;
  orders: number;
  salesCents: number;
  /** Sales less their food cost, less food given away, less money paid out. Discounts are already out of sales. */
  profitCents: number;
  newCustomers: number;
  /** Customers this campaign brought in who have ordered again since, without a code. */
  repeatCustomers: number;
  /** How orders are matched to it. */
  matchedBy: string;
  detail: string;
  redemptions: Redemption[];
}

export function promoRow(p: PromoCampaign, foodShare: number): ChannelRow {
  const offer = p.offerId ? OFFER_BY_ID[p.offerId] : undefined;
  const sales = p.redemptions.reduce((a, r) => a + r.subtotalCents, 0);
  const discounts = p.redemptions.reduce((a, r) => a + r.discountCents, 0);
  const freeFood = offer ? p.redemptions.length * offer.extraFoodCents : 0;
  const detail = p.channel === 'text' ? `${(p.sent ?? 0).toLocaleString()} texts, ${(TEXT_CENTS).toFixed(1)}¢ each`
    : p.channel === 'deal' ? `$${((p.dealOffCents ?? 0) / 100).toFixed(2)} off, offered online, at the register and by the AI phone line`
    : `${(p.impressions ?? 0).toLocaleString()} views, ${(p.clicks ?? 0).toLocaleString()} clicks (${(((p.clicks ?? 0) / Math.max(1, p.impressions ?? 1)) * 100).toFixed(1)}%)`;
  return {
    id: p.id, channel: p.channel, name: p.name, startedOn: p.startedOn, spendCents: p.spendCents, giveawayCents: discounts + freeFood,
    orders: p.redemptions.length, salesCents: sales, profitCents: Math.round(sales * (1 - foodShare)) - freeFood - p.spendCents,
    newCustomers: p.redemptions.filter((r) => r.newCustomer).length, repeatCustomers: p.redemptions.filter((r) => r.newCustomer && r.orderedAgain).length,
    matchedBy: p.channel === 'deal' ? 'Deal on the ticket' : p.utm ? (p.offerId ? 'Ad link or code' : 'Ad link') : 'Personal code',
    detail, redemptions: p.redemptions,
  };
}

export function mailRow(c: MailCampaign, foodShare: number): ChannelRow {
  const r = mailResults(c, foodShare);
  const offer = OFFER_BY_ID[c.offerId];
  return {
    id: c.id, channel: 'postcard', name: c.name, startedOn: c.sentOn, spendCents: c.totalCents, giveawayCents: r.discountCents + r.redeemed * offer.extraFoodCents,
    orders: r.redeemed, salesCents: r.salesCents, profitCents: r.profitCents, newCustomers: r.newCustomers,
    repeatCustomers: c.redemptions.filter((x) => x.newCustomer && x.orderedAgain).length, matchedBy: c.audience === 'neighbors' ? 'Route code or QR' : 'Personal code or QR',
    detail: `${c.pieces.toLocaleString()} cards through ${c.provider}`, redemptions: c.redemptions,
  };
}

export function totalsOf(rows: ChannelRow[]) {
  const sum = (f: (r: ChannelRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return { spendCents: sum((r) => r.spendCents), giveawayCents: sum((r) => r.giveawayCents), orders: sum((r) => r.orders), salesCents: sum((r) => r.salesCents), profitCents: sum((r) => r.profitCents), newCustomers: sum((r) => r.newCustomers), repeatCustomers: sum((r) => r.repeatCustomers) };
}

/** Which campaign an order is credited to: the code first, then the ad link, then the deal. One campaign per order. */
export function creditFor(o: { promoCampaignId?: string; adCampaignId?: string; dealIds?: string[] }): { campaignId: string; by: 'code' | 'ad' | 'deal' } | undefined {
  if (o.promoCampaignId) return { campaignId: o.promoCampaignId, by: 'code' };
  if (o.adCampaignId) return { campaignId: o.adCampaignId, by: 'ad' };
  if (o.dealIds?.length) return { campaignId: o.dealIds[0], by: 'deal' };
  return undefined;
}

/* ---------------------------------------------------------------- seeded history */

const FIRST = ['Maya', 'Jordan', 'Chris', 'Priya', 'Leo', 'Alex', 'Sam', 'Taylor', 'Nina', 'Omar', 'Grace', 'Diego', 'Riley', 'Hana', 'Marcus', 'Ivy', 'Kai', 'Elena', 'Noah', 'Sofia'];
const LAST = 'RTMKSLPGBWNHCDF';

function fill(seed: number, o: { n: number; from: string; days: number; today: string; ticket: number; codes: string[]; offerId?: string; newShare: number; againShare: number; channels: [string, number][]; dealOff?: number; numberBase: number }): Redemption[] {
  const r = rng(seed);
  const out: Redemption[] = [];
  for (let i = 0; i < o.n; i++) {
    const date = addDays(o.from, Math.floor(r() * o.days));
    if (date >= o.today) continue;
    const subtotalBefore = Math.round(o.ticket * (0.75 + r() * 0.7));
    const off = o.dealOff ?? (o.offerId ? OFFER_BY_ID[o.offerId].discountCents(subtotalBefore) : 0);
    let pick = r();
    const channel = o.channels.find(([, share]) => (pick -= share) < 0)?.[0] ?? o.channels[0][0];
    const isNew = r() < o.newShare;
    out.push({
      code: o.codes[i % o.codes.length] ?? '', orderNumber: o.numberBase + i * 7, date, name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}.`,
      subtotalCents: subtotalBefore - off, discountCents: off, channel, newCustomer: isNew, orderedAgain: r() < o.againShare,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Two text blasts, two ad campaigns and two deals from the last month, with the orders each brought in. */
export function seedPromos(today: string, ticketCents: number): PromoCampaign[] {
  const winSent = addDays(today, -33);
  const winCodes = Array.from({ length: 64 }, (_, i) => mailCode(`text-win:${i}`, 'TX'));
  const rainSent = addDays(today, -12);
  const google = { source: 'google', medium: 'cpc', campaign: 'pizza-delivery-long-beach' };
  const meta = { source: 'instagram', medium: 'paid_social', campaign: 'double-pep-reel' };
  return [
    {
      id: 'text-winback', channel: 'text', name: 'Text: we miss you, free garlic bread', startedOn: winSent, endsOn: addDays(winSent, 14), sent: 64, spendCents: Math.round(64 * TEXT_CENTS), spendNote: 'Texting fees',
      offerId: 'knots', codes: Object.fromEntries(winCodes.map((c, i) => [`m${i}`, c])), oneUse: true,
      redemptions: fill(11, { n: 9, from: winSent, days: 14, today, ticket: ticketCents, codes: winCodes, offerId: 'knots', newShare: 0, againShare: 0.5, channels: [['Website (typed code)', 0.6], ['Phone', 0.3], ['Counter', 0.1]], numberBase: 1612 }),
    },
    {
      id: 'text-rain', channel: 'text', name: 'Text: rainy night, $5 off delivery', startedOn: rainSent, endsOn: addDays(rainSent, 1), sent: 412, spendCents: Math.round(412 * TEXT_CENTS), spendNote: 'Texting fees',
      offerId: 'five', codes: { all: 'RAINYDAY' }, oneUse: false,
      redemptions: fill(12, { n: 23, from: rainSent, days: 2, today, ticket: ticketCents, codes: ['RAINYDAY'], offerId: 'five', newShare: 0, againShare: 0.4, channels: [['Website (typed code)', 0.7], ['Phone', 0.3]], numberBase: 1904 }),
    },
    {
      id: 'ad-google', channel: 'google', name: 'Google Search: "pizza delivery Long Beach"', startedOn: addDays(today, -30), endsOn: addDays(today, 30), spendCents: 41200, spendNote: 'Ad spend, last 30 days',
      impressions: 18400, clicks: 1020, codes: {}, oneUse: false, utm: google,
      redemptions: fill(13, { n: 58, from: addDays(today, -30), days: 30, today, ticket: ticketCents, codes: [], newShare: 0.71, againShare: 0.33, channels: [['Website (ad link)', 1]], numberBase: 1450 }),
    },
    {
      id: 'ad-meta', channel: 'meta', name: 'Instagram reel: Double Pep, $5 off', startedOn: addDays(today, -21), endsOn: addDays(today, 9), spendCents: 25000, spendNote: 'Ad spend, last 21 days',
      impressions: 31000, clicks: 640, offerId: 'five', codes: { all: 'IGPEP5' }, oneUse: false, utm: meta,
      redemptions: fill(14, { n: 22, from: addDays(today, -21), days: 21, today, ticket: ticketCents, codes: ['IGPEP5'], offerId: 'five', newShare: 0.77, againShare: 0.27, channels: [['Website (ad link)', 0.8], ['Phone (said the code)', 0.2]], numberBase: 1733 }),
    },
    {
      id: 'deal-past-romaine', channel: 'deal', name: 'Deal: $2 off Caesar salad (romaine to use up)', startedOn: addDays(today, -18), endsOn: addDays(today, -11), spendCents: 0, spendNote: 'No money paid out', dealOffCents: 200, codes: {}, oneUse: false,
      redemptions: fill(15, { n: 31, from: addDays(today, -18), days: 7, today, ticket: ticketCents, codes: [], dealOff: 200, newShare: 0.06, againShare: 0.2, channels: [['Website', 0.45], ['AI phone line', 0.35], ['Register', 0.2]], numberBase: 1801 }),
    },
    {
      id: 'deal-past-slow', channel: 'deal', name: 'Deal: $3 off large pickup, 2 to 4pm', startedOn: addDays(today, -28), endsOn: addDays(today, -1), spendCents: 0, spendNote: 'No money paid out', dealOffCents: 300, codes: {}, oneUse: false,
      redemptions: fill(16, { n: 47, from: addDays(today, -28), days: 27, today, ticket: ticketCents, codes: [], dealOff: 300, newShare: 0.09, againShare: 0.3, channels: [['AI phone line', 0.5], ['Website', 0.3], ['Register', 0.2]], numberBase: 1505 }),
    },
  ];
}

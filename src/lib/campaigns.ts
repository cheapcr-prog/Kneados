import type { RewardsMember } from '../data/types';

/**
 * Who should get a text and what it says. Everything here is worked out from the
 * rewards list and the calendar. Nothing is sent from this file.
 */
export type CampaignKind = 'winback' | 'birthday' | 'holiday' | 'review';

export interface CampaignRules {
  /** Days without a visit before a regular counts as slipping away. */
  lapsedDays: number;
  /** A regular has come in at least this many times. */
  regularVisits: number;
  /** Birthday texts go out this many days ahead. */
  birthdayAhead: number;
  /** Holiday texts go out this many days ahead. */
  holidayAhead: number;
  /** A review is asked for after this many visits. */
  reviewAfterVisits: number;
}

export const DEFAULT_CAMPAIGN_RULES: CampaignRules = { lapsedDays: 21, regularVisits: 4, birthdayAhead: 7, holidayAhead: 10, reviewAfterVisits: 10 };

export interface Recipient {
  member: RewardsMember;
  /** Why this person is on the list, for the owner. */
  reason: string;
}

export interface Campaign {
  kind: CampaignKind;
  title: string;
  /** The name as it reads in the middle of a sentence. */
  short: string;
  /** One line on who gets it and when. */
  rule: string;
  /** What the customer is offered, if anything. */
  offer: string;
  recipients: Recipient[];
  /** Set for a holiday campaign. */
  holiday?: { name: string; date: string; daysAway: number };
}

export interface SentRecord {
  kind: CampaignKind;
  phone: string;
  /** The day it was sent. */
  date: string;
  /** For a holiday text, which holiday, so each one is sent once. */
  holiday?: string;
}

const DAY = 86_400_000;
const at = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const daysBetween = (from: string, to: string) => Math.round((at(to) - at(from)) / DAY);

/** A business, office or team account rather than one person. These do not get birthday or review texts. */
const isGroup = (m: RewardsMember) => /^office:|team|club|staff/i.test(m.name);
/** What to call someone in a text. A title such as Coach or Dr. stays with the name. */
export const firstName = (m: RewardsMember) => (isGroup(m) ? m.name.replace(/^office:\s*/i, '') : /^(coach|dr\.?|mr\.?|mrs\.?|ms\.?|chef)\s/i.test(m.name) ? m.name : m.name.split(' ')[0]);

/** Days until the next time this month and day comes around, counting today as zero. */
export function daysUntilBirthday(birthday: string, today: string): number {
  const year = Number(today.slice(0, 4));
  let d = daysBetween(today, `${year}-${birthday}`);
  if (d < 0) d = daysBetween(today, `${year + 1}-${birthday}`);
  return d;
}

const sentSince = (sent: SentRecord[], kind: CampaignKind, phone: string, today: string, days: number) =>
  sent.some((s) => s.kind === kind && s.phone === phone && daysBetween(s.date, today) < days);

/** Regulars who have stopped coming in. Each gets one text, then is left alone for two months. */
export function winBackList(members: RewardsMember[], today: string, rules: CampaignRules, sent: SentRecord[]): Recipient[] {
  return members
    .filter((m) => m.lastVisit && m.visits >= rules.regularVisits && daysBetween(m.lastVisit, today) >= rules.lapsedDays && !sentSince(sent, 'winback', m.phone, today, 60))
    .sort((a, b) => b.visits - a.visits)
    .map((m) => ({ member: m, reason: `${m.visits} visits, last visit ${daysBetween(m.lastVisit!, today)} days ago` }));
}

export function birthdayList(members: RewardsMember[], today: string, rules: CampaignRules, sent: SentRecord[]): Recipient[] {
  return members
    .filter((m) => m.birthday && !isGroup(m) && daysUntilBirthday(m.birthday, today) <= rules.birthdayAhead && !sentSince(sent, 'birthday', m.phone, today, 300))
    .sort((a, b) => daysUntilBirthday(a.birthday!, today) - daysUntilBirthday(b.birthday!, today))
    .map((m) => {
      const d = daysUntilBirthday(m.birthday!, today);
      return { member: m, reason: d === 0 ? 'Birthday is today' : d === 1 ? 'Birthday is tomorrow' : `Birthday in ${d} days` };
    });
}

/** Members who have been in lately, for a holiday pre-order push. One text per holiday. */
export function holidayList(members: RewardsMember[], today: string, holiday: string, sent: SentRecord[]): Recipient[] {
  return members
    .filter((m) => m.lastVisit && daysBetween(m.lastVisit, today) <= 60 && !sent.some((s) => s.kind === 'holiday' && s.phone === m.phone && s.holiday === holiday))
    .sort((a, b) => b.visits - a.visits)
    .map((m) => ({ member: m, reason: `${m.visits} visits` }));
}

/** Happy regulars who were just in. Asked once, ever, and never offered anything for it. */
export function reviewList(members: RewardsMember[], today: string, rules: CampaignRules, sent: SentRecord[]): Recipient[] {
  return members
    .filter((m) => m.lastVisit && !isGroup(m) && m.visits >= rules.reviewAfterVisits && daysBetween(m.lastVisit, today) <= 1 && !sent.some((s) => s.kind === 'review' && s.phone === m.phone))
    .sort((a, b) => b.visits - a.visits)
    .map((m) => ({ member: m, reason: `${m.visits} visits, in ${daysBetween(m.lastVisit!, today) === 0 ? 'today' : 'yesterday'}` }));
}

/** The next holiday worth a pre-order text inside the window. Days the shop is slow, like Thanksgiving itself, are skipped. */
export function nextHoliday(today: string, ahead: number, holidayFor: (iso: string) => { name: string; factor: number } | undefined, addDays: (iso: string, n: number) => string): { name: string; date: string; daysAway: number } | undefined {
  for (let d = 2; d <= ahead; d++) {
    const date = addDays(today, d);
    const h = holidayFor(date);
    if (h && h.factor > 1) return { name: h.name, date, daysAway: d };
  }
  return undefined;
}

/** Marketing texts end with this. Review requests and order updates do not need it, but it is kept on all of them. */
export const OPT_OUT = 'Reply STOP to opt out.';
/** A text over this many characters is split into more than two parts by carriers, so drafts stay under it. */
export const MAX_TEXT = 300;

export interface DraftContext {
  shop: string;
  /** A customer's first name. The draft holds {name} where it goes. */
  favorite?: (m: RewardsMember) => string | undefined;
  holiday?: { name: string; date: string; daysAway: number };
  reviewLink: string;
  orderLink: string;
}

/**
 * The built-in wording for each campaign, with {name} and {favorite} left as blanks to fill per person.
 * The opt-out line is added when the text is filled in, so an edited draft cannot lose it.
 */
export function defaultDraft(kind: CampaignKind, c: DraftContext): string {
  switch (kind) {
    case 'winback':
      return `Hi {name}, it's ${c.shop}. We haven't seen you in a while and we miss you. Your next {favorite} is on us. Just give your number at the counter this week.`;
    case 'birthday':
      return `Happy birthday, {name}! Come by ${c.shop} this week for a free donut on us. Just give your number at the counter.`;
    case 'holiday':
      return `Hi {name}, ${c.holiday?.name ?? 'the holiday'} is coming up at ${c.shop}. Order your dozens ahead and skip the line: ${c.orderLink}`;
    case 'review':
      return `Hi {name}, thanks for being a regular at ${c.shop}. If you have a minute, a Google review helps a small shop a lot: ${c.reviewLink}`;
  }
}

/** Fills the blanks for one person and adds the opt-out line. */
export function fillDraft(draft: string, m: RewardsMember, favoriteName?: string): string {
  const body = draft
    .replaceAll('{name}', firstName(m))
    .replaceAll('{favorite}', favoriteName ?? 'donut')
    .replace(/\s+/g, ' ')
    .trim();
  return body.includes('STOP') ? body : `${body} ${OPT_OUT}`;
}

/** Problems that stop a draft from being sent. Empty when it is fine. */
export function draftProblems(kind: CampaignKind, draft: string, shop: string): string[] {
  const out: string[] = [];
  const text = draft.trim();
  if (text.length < 20) out.push('The text is too short.');
  if (text.length + OPT_OUT.length + 1 > MAX_TEXT) out.push(`Keep it under ${MAX_TEXT - OPT_OUT.length - 1} characters.`);
  if (!text.toLowerCase().includes(shop.toLowerCase())) out.push(`Say it is from ${shop}, so the customer knows who is texting.`);
  // Google does not allow anything to be offered in exchange for a review.
  if (kind === 'review' && /\b(free|discount|% off|on us|reward|punch|gift)\b/i.test(text)) out.push('A review request cannot offer anything in return. Google does not allow it.');
  return out;
}

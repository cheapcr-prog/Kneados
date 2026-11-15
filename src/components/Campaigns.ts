import { useEffect, useMemo, useRef } from 'react';
import { MENU_BY_ID, SHOP } from '../data/shop';
import { useShopState } from '../data/local';
import { useDemo } from '../data/store';
import { DEFAULT_CAMPAIGN_RULES, birthdayList, daysBetween, defaultDraft, draftProblems, fillDraft, holidayList, nextHoliday, reviewList, winBackList, type Campaign, type CampaignKind, type DraftContext, type SentRecord } from '../lib/campaigns';
import { addDays, holidayFor } from '../lib/dates';

export const CAMPAIGN_KINDS: CampaignKind[] = ['winback', 'birthday', 'holiday', 'review'];
/** Example links. A live shop uses its own Google review link and ordering page. */
export const REVIEW_LINK = 'g.page/r/good-batch-donuts/review';
export const ORDER_LINK = 'kneados.app/demo/shop';
/** These two campaigns put a free donut on the member's card when the text goes out. */
const GIVES_DONUT: CampaignKind[] = ['winback', 'birthday'];

interface Saved {
  sent: SentRecord[];
  drafts: Partial<Record<CampaignKind, string>>;
  /** Which drafts were last rewritten by Claude. */
  byClaude: Partial<Record<CampaignKind, boolean>>;
  auto: Record<CampaignKind, boolean>;
}

export type LiveCampaign = Campaign & { draft: string; edited: boolean; byClaude: boolean; problems: string[]; auto: boolean; preview?: string };

/** The four customer text campaigns: who is due, what the text says, and sending. */
export function useCampaigns() {
  const demo = useDemo();
  const today = demo.state.today;
  const members = demo.state.members;
  const [saved, setSaved] = useShopState<Saved>('campaigns', () => ({ sent: [], drafts: {}, byClaude: {}, auto: { winback: false, birthday: false, holiday: false, review: false } }));
  const rules = DEFAULT_CAMPAIGN_RULES;

  const campaigns = useMemo((): LiveCampaign[] => {
    const holiday = nextHoliday(today, rules.holidayAhead, holidayFor, addDays);
    const ctx: DraftContext = { shop: SHOP.name, holiday, reviewLink: REVIEW_LINK, orderLink: ORDER_LINK };
    const base: Campaign[] = [
      { kind: 'winback', title: 'Win back regulars', short: 'win-back', rule: `Regulars with ${rules.regularVisits} or more visits who have not been in for ${rules.lapsedDays} days. One text, then they are left alone for two months.`, offer: 'A free donut goes on their card.', recipients: winBackList(members, today, rules, saved.sent) },
      { kind: 'birthday', title: 'Birthdays', short: 'birthdays', rule: `Members whose birthday is in the next ${rules.birthdayAhead} days. One text a year.`, offer: 'A free donut goes on their card.', recipients: birthdayList(members, today, rules, saved.sent) },
      { kind: 'holiday', title: holiday ? `${holiday.name} pre-orders` : 'Holiday pre-orders', short: holiday ? `${holiday.name} pre-orders` : 'holiday pre-orders', rule: holiday ? `${holiday.name} is ${holiday.daysAway} days away. Members who have been in during the last 60 days get one reminder to order ahead.` : `No busy holiday in the next ${rules.holidayAhead} days. KneadOS will line this up when one is coming.`, offer: 'No discount. It moves orders to pre-order so the bake plan knows about them.', recipients: holiday ? holidayList(members, today, holiday.name, saved.sent) : [], holiday },
      { kind: 'review', title: 'Review requests', short: 'review requests', rule: `Regulars with ${rules.reviewAfterVisits} or more visits who were in today or yesterday. Asked once, ever.`, offer: 'Nothing is offered for a review. Google does not allow it.', recipients: reviewList(members, today, rules, saved.sent) },
    ];
    return base.map((c) => {
      const draft = saved.drafts[c.kind] ?? defaultDraft(c.kind, ctx);
      const first = c.recipients[0]?.member;
      return {
        ...c, draft, edited: saved.drafts[c.kind] !== undefined, byClaude: !!saved.byClaude[c.kind], auto: saved.auto[c.kind],
        problems: draftProblems(c.kind, draft, SHOP.name),
        preview: first ? fillDraft(draft, first, first.favorite ? MENU_BY_ID[first.favorite]?.name : undefined) : undefined,
      };
    });
  }, [members, today, saved, rules]);

  const send = (kind: CampaignKind): number => {
    const c = campaigns.find((x) => x.kind === kind);
    if (!c || c.recipients.length === 0 || c.problems.length > 0) return 0;
    const people = c.recipients.map((r) => r.member);
    demo.sendTexts(people.map((m) => ({ to: m.phone, body: fillDraft(c.draft, m, m.favorite ? MENU_BY_ID[m.favorite]?.name : undefined) })));
    if (GIVES_DONUT.includes(kind)) demo.giveFreeDonut(people.map((m) => m.phone));
    setSaved((s) => ({ ...s, sent: [...s.sent, ...people.map((m) => ({ kind, phone: m.phone, date: today, holiday: c.holiday?.name }))] }));
    return people.length;
  };

  // A campaign set to automatic sends as soon as someone is due.
  const sending = useRef(false);
  useEffect(() => {
    if (sending.current) return;
    const due = campaigns.find((c) => c.auto && c.recipients.length > 0 && c.problems.length === 0);
    if (!due) return;
    sending.current = true;
    send(due.kind);
    queueMicrotask(() => { sending.current = false; });
  });

  const sentThisMonth = saved.sent.filter((s) => daysBetween(s.date, today) < 30);
  /** People who came in after a win-back text. */
  const cameBack = saved.sent.filter((s) => s.kind === 'winback' && members.some((m) => m.phone === s.phone && m.lastVisit && m.lastVisit >= s.date && daysBetween(s.date, m.lastVisit) >= 0 && m.lastVisit !== s.date)).length;

  return {
    campaigns,
    sent: saved.sent,
    sentThisMonth: sentThisMonth.length,
    cameBack,
    ready: campaigns.reduce((a, c) => a + (c.problems.length === 0 ? c.recipients.length : 0), 0),
    send,
    setDraft: (kind: CampaignKind, text: string, byClaude = false) => setSaved((s) => ({ ...s, drafts: { ...s.drafts, [kind]: text }, byClaude: { ...s.byClaude, [kind]: byClaude } })),
    resetDraft: (kind: CampaignKind) => setSaved((s) => { const drafts = { ...s.drafts }; delete drafts[kind]; return { ...s, drafts, byClaude: { ...s.byClaude, [kind]: false } }; }),
    setAuto: (kind: CampaignKind, on: boolean) => setSaved((s) => ({ ...s, auto: { ...s.auto, [kind]: on } })),
  };
}

export type DraftFailure = 'off' | 'capped' | 'limit' | 'bad' | 'refused' | 'busy';

/** Asks Claude for a fresh wording of a campaign text. */
export async function rewriteDraft(kind: CampaignKind, current: string, holiday?: string): Promise<{ ok: true; text: string } | { ok: false; why: DraftFailure }> {
  try {
    const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, shop: SHOP.name, current, holiday }) });
    if (!res.headers.get('content-type')?.includes('application/json')) return { ok: false, why: 'off' };
    const data = (await res.json()) as { text?: string; error?: DraftFailure };
    if (data.error || typeof data.text !== 'string') return { ok: false, why: data.error ?? 'busy' };
    return { ok: true, text: data.text };
  } catch {
    return { ok: false, why: 'busy' };
  }
}

export const DRAFT_NOTE: Record<DraftFailure, string> = {
  off: 'Claude is not connected on this copy of the demo, so the built-in wording is used.',
  capped: "Claude has reached today's spending limit. The wording was left as it was.",
  limit: "You have reached today's limit for rewrites. The wording was left as it was.",
  bad: 'Claude could not take that wording. Shorten it and try again.',
  refused: 'Claude would not rewrite that one. The wording was left as it was.',
  busy: 'Claude could not be reached just now. The wording was left as it was.',
};

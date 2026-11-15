import { describe, expect, it } from 'vitest';
import type { RewardsMember } from '../data/types';
import { DEFAULT_CAMPAIGN_RULES as R, birthdayList, daysUntilBirthday, defaultDraft, draftProblems, fillDraft, holidayList, nextHoliday, reviewList, winBackList } from './campaigns';
import { addDays, holidayFor } from './dates';

const today = '2026-11-15';
const m = (over: Partial<RewardsMember>): RewardsMember => ({ phone: '5625550100', name: 'Dee R.', punches: 0, rewards: 0, visits: 12, joined: '2026-01-01', lastVisit: today, ...over });
const ctx = { shop: 'Good Batch Donuts', reviewLink: 'g.page/goodbatch', orderLink: 'goodbatch.example/order' };

describe('win-back', () => {
  const lapsed = m({ phone: '1', lastVisit: '2026-10-20' });
  it('picks regulars who have been away three weeks', () => {
    const list = winBackList([lapsed, m({ phone: '2', lastVisit: '2026-11-10' }), m({ phone: '3', lastVisit: '2026-09-01', visits: 2 })], today, R, []);
    expect(list.map((r) => r.member.phone)).toEqual(['1']);
    expect(list[0].reason).toBe('12 visits, last visit 26 days ago');
  });
  it('leaves someone alone for two months after a text', () => {
    expect(winBackList([lapsed], today, R, [{ kind: 'winback', phone: '1', date: '2026-10-01' }])).toHaveLength(0);
    expect(winBackList([lapsed], today, R, [{ kind: 'winback', phone: '1', date: '2026-09-01' }])).toHaveLength(1);
  });
});

describe('birthdays', () => {
  it('counts days to the next birthday across the new year', () => {
    expect(daysUntilBirthday('11-15', today)).toBe(0);
    expect(daysUntilBirthday('11-18', today)).toBe(3);
    expect(daysUntilBirthday('01-02', '2026-12-30')).toBe(3);
  });
  it('lists birthdays in the coming week, soonest first, and skips offices', () => {
    const list = birthdayList([m({ phone: '1', birthday: '11-20' }), m({ phone: '2', birthday: '11-16' }), m({ phone: '3', birthday: '12-25' }), m({ phone: '4', name: 'Office: Harbor Dental', birthday: '11-16' })], today, R, []);
    expect(list.map((r) => r.member.phone)).toEqual(['2', '1']);
    expect(list[0].reason).toBe('Birthday is tomorrow');
  });
  it('sends one birthday text a year', () => {
    expect(birthdayList([m({ phone: '1', birthday: '11-16' })], today, R, [{ kind: 'birthday', phone: '1', date: '2026-11-14' }])).toHaveLength(0);
  });
});

describe('holidays', () => {
  it('finds the next busy holiday and skips slow ones', () => {
    // The day before Thanksgiving is busy. Thanksgiving itself is slow, so it is not a reason to text.
    expect(nextHoliday('2026-11-16', 10, holidayFor, addDays)).toMatchObject({ name: 'Day before Thanksgiving', date: '2026-11-25', daysAway: 9 });
    expect(nextHoliday('2026-08-01', 10, holidayFor, addDays)).toBeUndefined();
  });
  it('texts recent members once per holiday', () => {
    const members = [m({ phone: '1' }), m({ phone: '2', lastVisit: '2026-07-01' })];
    expect(holidayList(members, today, 'Christmas Eve', []).map((r) => r.member.phone)).toEqual(['1']);
    expect(holidayList(members, today, 'Christmas Eve', [{ kind: 'holiday', phone: '1', date: today, holiday: 'Christmas Eve' }])).toHaveLength(0);
    expect(holidayList(members, today, 'Christmas Eve', [{ kind: 'holiday', phone: '1', date: today, holiday: 'Halloween' }])).toHaveLength(1);
  });
});

describe('review requests', () => {
  it('asks regulars who were just in, once ever', () => {
    const members = [m({ phone: '1' }), m({ phone: '2', visits: 3 }), m({ phone: '3', lastVisit: '2026-11-10' })];
    expect(reviewList(members, today, R, []).map((r) => r.member.phone)).toEqual(['1']);
    expect(reviewList(members, today, R, [{ kind: 'review', phone: '1', date: '2026-01-01' }])).toHaveLength(0);
  });
  it('will not offer anything for a review', () => {
    expect(draftProblems('review', defaultDraft('review', ctx), ctx.shop)).toEqual([]);
    expect(draftProblems('review', 'Leave Good Batch Donuts a review and get a free donut!', ctx.shop)).toHaveLength(1);
  });
});

describe('drafts', () => {
  it('fills in the name and favorite and adds the opt-out line', () => {
    const text = fillDraft(defaultDraft('winback', ctx), m({ name: 'Dee R.' }), 'Old Fashioned');
    expect(text).toContain('Hi Dee,');
    expect(text).toContain('Your next Old Fashioned is on us');
    expect(text.endsWith('Reply STOP to opt out.')).toBe(true);
  });
  it('keeps a title with the name', () => {
    expect(fillDraft('Hi {name}.', m({ name: 'Coach Reyes' }))).toContain('Hi Coach Reyes.');
  });
  it('does not add the opt-out line twice', () => {
    expect(fillDraft('Hi {name} from Good Batch Donuts. Reply STOP to opt out.', m({})).match(/STOP/g)).toHaveLength(1);
  });
  it('built-in drafts pass their own checks', () => {
    const holiday = { name: 'Christmas Eve', date: '2026-12-24', daysAway: 9 };
    for (const kind of ['winback', 'birthday', 'holiday', 'review'] as const) expect(draftProblems(kind, defaultDraft(kind, { ...ctx, holiday }), ctx.shop)).toEqual([]);
  });
  it('flags a draft that is too long or does not name the shop', () => {
    expect(draftProblems('winback', 'Hi {name}, we miss you. Come back soon for a treat!', ctx.shop)).toHaveLength(1);
    expect(draftProblems('winback', `Good Batch Donuts ${'x'.repeat(300)}`, ctx.shop)).toHaveLength(1);
  });
});

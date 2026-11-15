import { describe, expect, it } from 'vitest';
import { PACKS, PACK_BY_ID, seedHires, seedLog, seedPapers } from '../data/compliance';
import { cardStatuses, checkStatus, checksOwedByNow, logCsv, paperStatuses, rangeLabel, readingOk, readiness, type Clock, type LogEntry, type Requirement } from './compliance';

const pack = PACK_BY_ID['long-beach'];
const req = (id: string) => pack.requirements.find((r) => r.id === id)!;
const today = '2026-11-15';
const clock = (hour: number): Clock => ({ today, hour, openHour: 5, closeHour: 13 });
const entry = (reqId: string, at: string, value?: number, ok = true): LogEntry => ({ reqId, at, by: 'jess', value, ok });

describe('readings', () => {
  it('passes cold food at 41 and fails it at 42', () => {
    expect(readingOk(req('walkin'), 41)).toBe(true);
    expect(readingOk(req('walkin'), 42)).toBe(false);
    expect(rangeLabel(req('walkin'))).toBe('41°F or colder');
  });
  it('passes hot food at 135 and sanitizer at 200 ppm', () => {
    expect(readingOk(req('hot-case'), 134)).toBe(false);
    expect(readingOk(req('hot-case'), 135)).toBe(true);
    expect(readingOk(req('sani-bucket'), 150)).toBe(false);
    expect(readingOk(req('sani-bucket'), 200)).toBe(true);
    expect(rangeLabel(req('hot-case'))).toBe('135°F or hotter');
  });
});

describe('checks through the day', () => {
  it('spreads two checks over opening hours', () => {
    expect(checksOwedByNow(2, clock(4))).toBe(0);
    expect(checksOwedByNow(2, clock(5))).toBe(1);
    expect(checksOwedByNow(2, clock(9.5))).toBe(2);
    expect(checksOwedByNow(2, clock(20))).toBe(2);
  });
  it('is due after one missed check and late after two', () => {
    const r = req('walkin');
    expect(checkStatus(r, [], clock(6)).state).toBe('due');
    expect(checkStatus(r, [], clock(10)).state).toBe('late');
    expect(checkStatus(r, [entry('walkin', `${today}T05:20:00`, 38)], clock(6)).state).toBe('ok');
    expect(checkStatus(r, [entry('walkin', `${today}T05:20:00`, 38)], clock(10))).toMatchObject({ state: 'due', owedToday: 1 });
  });
  it('stays failed until a passing check is logged', () => {
    const r = req('milk-fridge');
    const bad = entry('milk-fridge', `${today}T05:20:00`, 46, false);
    expect(checkStatus(r, [bad], clock(6)).state).toBe('failed');
    expect(checkStatus(r, [bad, entry('milk-fridge', `${today}T06:10:00`, 39)], clock(6.5)).state).toBe('ok');
  });
});

describe('checks that come round every few weeks', () => {
  const r: Requirement = req('grease');
  it('is fine inside the interval, due on the day and late after', () => {
    expect(checkStatus(r, [entry('grease', '2026-10-01T09:00:00')], clock(8))).toMatchObject({ state: 'ok', nextDue: '2026-12-30' });
    expect(checkStatus(r, [entry('grease', '2026-08-17T09:00:00')], clock(8)).state).toBe('due');
    expect(checkStatus(r, [entry('grease', '2026-08-03T09:00:00')], clock(8))).toMatchObject({ state: 'late', daysLate: 14 });
  });
  it('is late when there is no record at all', () => {
    expect(checkStatus(r, [], clock(8)).state).toBe('late');
  });
});

describe('food handler cards', () => {
  const hires = seedHires(today);
  const cards = cardStatuses(hires, seedPapers(today), pack, today);
  const of = (id: string) => cards.find((c) => c.staffId === id)!;
  it('gives a new hire 30 days', () => {
    expect(of('luis')).toMatchObject({ state: 'pending', daysLeft: 12 });
  });
  it('flags a card that has run out and one that runs out soon', () => {
    expect(of('andre').state).toBe('expired');
    expect(of('mai')).toMatchObject({ state: 'soon', daysLeft: 27 });
    expect(of('danny').state).toBe('ok');
  });
  it('counts a card as missing once the 30 days have passed', () => {
    const late = cardStatuses([{ id: 'x', name: 'New Person', hired: '2026-10-01' }], [], pack, today);
    expect(late[0].state).toBe('missing');
  });
  it('leaves out the certified owner', () => {
    expect(cards.some((c) => c.staffId === 'rosa')).toBe(false);
  });
});

describe('inspection readiness', () => {
  it('is 100 when everything is in order', () => {
    const r = readiness([{ req: req('walkin'), state: 'ok', owedToday: 0, doneToday: 2, daysLate: 0 }], [{ id: 'permit', title: 'Permit', state: 'ok', detail: '', major: true }]);
    expect(r).toMatchObject({ score: 100, issues: [] });
  });
  it('weighs a serious problem three times a small one', () => {
    const ok = (id: string) => ({ req: req(id), state: 'ok' as const, owedToday: 0, doneToday: 1, daysLate: 0 });
    const major = readiness([{ ...ok('walkin'), state: 'late', owedToday: 2 }, ok('restroom')], []);
    const minor = readiness([ok('walkin'), { ...ok('restroom'), state: 'late', owedToday: 2 }], []);
    expect(major.score).toBe(25);
    expect(minor.score).toBe(75);
  });
  it('warns about what is coming without taking points off', () => {
    const r = readiness([], [{ id: 'card:mai', title: 'Mai', state: 'soon', detail: 'Expires soon', major: true }]);
    expect(r.score).toBe(100);
    expect(r.warnings).toHaveLength(1);
  });
  it('scores the example shop below 100 with the planted problems on the list', () => {
    const log = seedLog(today, 9.33, pack.requirements, 5, 13);
    const checks = pack.requirements.map((q) => checkStatus(q, log, clock(9.33)));
    const papers = [...paperStatuses(pack, seedPapers(today), today), ...cardStatuses(seedHires(today), seedPapers(today), pack, today)];
    const r = readiness(checks, papers);
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain('grease');
    expect(ids).toContain('milk-fridge');
    expect(ids).toContain('card:andre');
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThan(95);
  });
});

describe('rule packs', () => {
  it('gives every rule a source and unique ids', () => {
    for (const p of PACKS) {
      const ids = [...p.requirements.map((r) => r.id), ...p.papers.map((r) => r.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of [...p.requirements, ...p.papers]) expect(r.source.label.length).toBeGreaterThan(5);
    }
  });
  it('keeps the checked figures: 41, 135, 200 ppm, 30 days, 3 and 5 years', () => {
    expect(req('walkin').reading?.max).toBe(41);
    expect(req('hot-case').reading?.min).toBe(135);
    expect(req('sani-bucket').reading?.min).toBe(200);
    expect(pack.foodHandler).toMatchObject({ daysAfterHire: 30, validYears: 3 });
    expect(pack.papers.find((p) => p.id === 'manager-cert')?.validYears).toBe(5);
  });
  it('has local rules only in the Long Beach pack', () => {
    expect(PACK_BY_ID.california.requirements.some((r) => r.id === 'grease')).toBe(false);
  });
});

describe('the log for the inspector', () => {
  it('lists the newest entry first with the reading and what was done', () => {
    const csv = logCsv([entry('walkin', `${today}T05:20:00`, 38), { ...entry('milk-fridge', `${today}T06:00:00`, 46, false), fix: 'Moved the milk' }], pack.requirements, () => 'Jess P.');
    const lines = csv.split('\n');
    expect(lines[1]).toContain('46°F');
    expect(lines[1]).toContain('Fail');
    expect(lines[1]).toContain('Moved the milk');
    expect(lines[2]).toContain('Pass');
  });
});

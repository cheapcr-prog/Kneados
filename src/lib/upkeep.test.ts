import { describe, expect, it } from 'vitest';
import { assignTasks, equipmentStatus, taskStatus, type Equipment, type Repair, type ShopTask } from './upkeep';

const task = (id: string, everyDays: number, group: ShopTask['group'] = 'counter', minutes = 10): ShopTask => ({ id, name: id, area: 'Cleaning', everyDays, group, minutes });
const today = '2026-11-16';

describe('taskStatus', () => {
  it('is due when it has never been done', () => {
    expect(taskStatus(task('a', 7), undefined, today).state).toBe('due');
  });
  it('is done when checked off today', () => {
    expect(taskStatus(task('a', 1), { date: today, by: 'jess' }, today).state).toBe('done');
  });
  it('makes a daily task due again the next day, never overdue', () => {
    expect(taskStatus(task('a', 1), { date: '2026-11-13', by: 'jess' }, today).state).toBe('due');
  });
  it('counts the days a weekly task is late', () => {
    const s = taskStatus(task('a', 7), { date: '2026-11-05', by: 'luis' }, today);
    expect([s.state, s.due, s.daysLate]).toEqual(['overdue', '2026-11-12', 4]);
  });
  it('shows when the next one is due', () => {
    const s = taskStatus(task('a', 30), { date: '2026-11-01', by: 'luis' }, today);
    expect([s.state, s.due]).toEqual(['upcoming', '2026-12-01']);
  });
});

describe('assignTasks', () => {
  it('shares tasks inside each group and puts overdue work first', () => {
    const statuses = [
      taskStatus(task('wipe', 1), undefined, today),
      taskStatus(task('sweep', 1), undefined, today),
      taskStatus(task('trap', 30, 'kitchen', 40), { date: '2026-10-01', by: 'luis' }, today),
      taskStatus(task('done', 1), { date: today, by: 'jess' }, today),
    ];
    const out = assignTasks(statuses, [{ id: 'jess', group: 'counter' }, { id: 'andre', group: 'counter' }, { id: 'luis', group: 'kitchen' }]);
    expect(out).toEqual({ trap: 'luis', sweep: 'jess', wipe: 'andre' });
  });
  it('leaves a task open when nobody in that group is working', () => {
    expect(assignTasks([taskStatus(task('trap', 30, 'kitchen'), undefined, today)], [{ id: 'jess', group: 'counter' }])).toEqual({});
  });
});

describe('equipmentStatus', () => {
  const fryer: Equipment = { id: 'fryer', name: 'Fryer', where: 'Kitchen', model: 'Example', bought: '2021-03-10', costCents: 800000, warrantyMonths: 24, vendor: 'Service co', vendorPhone: '', serviceEveryDays: 90, serviceTask: 'Service', lastService: '2026-08-01' };
  const repair = (costCents: number, status: Repair['status'] = 'fixed', reportedAt = '2026-01-10T12:00:00Z'): Repair => ({ id: String(costCents), equipmentId: 'fryer', problem: 'x', reportedBy: 'luis', reportedAt, status, costCents });
  it('works out warranty and the next service', () => {
    const s = equipmentStatus(fryer, [], today);
    expect([s.warrantyEnds, s.inWarranty, s.serviceDue, s.daysToService]).toEqual(['2023-03-10', false, '2026-10-30', -17]);
  });
  it('says to replace a machine that keeps costing money', () => {
    expect(equipmentStatus(fryer, [repair(250000), repair(180000)], today).advice).toMatch(/^Repairs have cost 54%/);
  });
  it('points out warranty cover on an open repair', () => {
    const fresh = { ...fryer, bought: '2026-02-01' };
    expect(equipmentStatus(fresh, [repair(0, 'open')], today).advice).toMatch(/^Still under warranty/);
  });
});

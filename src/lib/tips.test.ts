import { describe, expect, it } from 'vitest';
import { splitTipPool } from './tips';
import { addVisit, PUNCHES_PER_REWARD, redeemReward, rewardText } from './rewards';

describe('splitTipPool', () => {
  it('splits by hours worked', () => {
    const shares = splitTipPool(10000, [
      { staffId: 'a', role: 'cashier', hours: 6 },
      { staffId: 'b', role: 'baker', hours: 2 },
    ]);
    expect(shares).toEqual([
      { staffId: 'a', hours: 6, cents: 7500 },
      { staffId: 'b', hours: 2, cents: 2500 },
    ]);
  });

  it('leaves owners and managers out of the pool', () => {
    const shares = splitTipPool(9000, [
      { staffId: 'owner', role: 'owner', hours: 10 },
      { staffId: 'mgr', role: 'manager', hours: 8 },
      { staffId: 'a', role: 'cashier', hours: 4 },
      { staffId: 'b', role: 'baker', hours: 4 },
    ]);
    expect(shares.map((s) => s.staffId)).toEqual(['a', 'b']);
    expect(shares.every((s) => s.cents === 4500)).toBe(true);
  });

  it('hands out every cent when the split is uneven', () => {
    const shares = splitTipPool(1000, [
      { staffId: 'a', role: 'cashier', hours: 1 },
      { staffId: 'b', role: 'cashier', hours: 1 },
      { staffId: 'c', role: 'baker', hours: 1 },
    ]);
    expect(shares.reduce((a, s) => a + s.cents, 0)).toBe(1000);
    expect(shares.map((s) => s.cents).sort()).toEqual([333, 333, 334]);
  });

  it('returns nothing when there is no pool or nobody eligible worked', () => {
    expect(splitTipPool(0, [{ staffId: 'a', role: 'cashier', hours: 5 }])).toEqual([]);
    expect(splitTipPool(500, [{ staffId: 'o', role: 'owner', hours: 5 }])).toEqual([]);
    expect(splitTipPool(500, [{ staffId: 'a', role: 'cashier', hours: 0 }])).toEqual([]);
  });
});

describe('Dough Rewards punch card', () => {
  const fresh = { phone: '5625550100', name: 'Test', punches: 0, rewards: 0, visits: 0, joined: '2026-11-01' };

  it('earns a reward on the tenth visit and resets the card', () => {
    let m = fresh;
    let earned = false;
    for (let i = 0; i < PUNCHES_PER_REWARD; i++) {
      const r = addVisit(m);
      m = r.member;
      earned = r.earnedReward;
    }
    expect(earned).toBe(true);
    expect(m.punches).toBe(0);
    expect(m.rewards).toBe(1);
    expect(m.visits).toBe(10);
  });

  it('does not earn early and cannot redeem without a reward', () => {
    const r = addVisit(fresh);
    expect(r.earnedReward).toBe(false);
    expect(redeemReward(r.member)).toEqual(r.member);
    expect(redeemReward({ ...fresh, rewards: 2 }).rewards).toBe(1);
  });

  it('names the shop in the text', () => {
    expect(rewardText('Good Batch Donuts')).toContain('free donut at Good Batch Donuts');
  });
});

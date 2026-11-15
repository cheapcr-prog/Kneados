import type { RewardsMember } from '../data/types';

/** Dough Rewards punch card: one punch per visit, a free reward every PUNCHES_PER_REWARD visits. */
export const PUNCHES_PER_REWARD = 10;

/** One punch per visit, not per donut, so splitting an order into several doesn't earn more. */
export function addVisit(member: RewardsMember): { member: RewardsMember; earnedReward: boolean } {
  const punches = member.punches + 1;
  if (punches >= PUNCHES_PER_REWARD) {
    return {
      member: { ...member, punches: punches - PUNCHES_PER_REWARD, rewards: member.rewards + 1, visits: member.visits + 1 },
      earnedReward: true,
    };
  }
  return { member: { ...member, punches, visits: member.visits + 1 }, earnedReward: false };
}

export function redeemReward(member: RewardsMember): RewardsMember {
  if (member.rewards <= 0) return member;
  return { ...member, rewards: member.rewards - 1 };
}

/** The text a customer gets. It always names the shop where the reward can be used. */
export function rewardText(shopName: string): string {
  return `Dough Rewards: You earned a free donut at ${shopName}! Show this text at the counter. Reply STOP to opt out.`;
}

/** The text a new member gets, with the link to their card for Apple or Google Wallet. */
export function welcomeText(shopName: string, cardLink: string): string {
  return `Dough Rewards: Welcome to ${shopName}! That was punch 1 of ${PUNCHES_PER_REWARD}. Save your card to your phone so we can scan it next time: ${cardLink} Reply STOP to opt out.`;
}

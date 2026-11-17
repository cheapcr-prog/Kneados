import { describe, expect, it } from 'vitest';
import { item, type BotOrder, type BotTurn } from '../src/pizza/orderbot';
import { PRACTICE_CALLS, PRACTICE_EXTRA_TURNS, houseRules, ordinaryAnswer, report, runPractice, toppingsOn, type PracticeResult } from './practice';

const order = (over: Partial<BotOrder>): BotOrder => ({ items: [], fulfillment: '', name: '', address: '', payment: '', note: '', ...over });
const script = (id: string) => PRACTICE_CALLS.find((c) => c.id === id)!;
const noLookUp = async () => null;
const result = (over: Partial<PracticeResult>): PracticeResult => ({ outcome: 'placed', order: order({}), said: [], heard: [], ms: [], conversation: [], ...over });

describe('practice calls', () => {
  it('has a script for each weak spot, each with its own name', () => {
    expect(PRACTICE_CALLS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PRACTICE_CALLS.map((c) => c.id)).size).toBe(PRACTICE_CALLS.length);
  });

  it('runs a script through a real call and passes when the assistant gets it right', async () => {
    const pie = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' })];
    const turns: BotTurn[] = [
      { say: 'One large pepperoni for pickup. Anything else?', order: order({ items: pie, fulfillment: 'pickup' }), action: 'continue' },
      { say: 'So that is one large pepperoni for pickup, {total}, pay at the counter. Is that right?', order: order({ items: pie, fulfillment: 'pickup', payment: 'pay_at_pickup' }), action: 'continue' },
      { say: 'Your order is in, number {number}. Grazie!', order: order({ items: pie, fulfillment: 'pickup', payment: 'pay_at_pickup' }), action: 'place_order' },
    ];
    const r = await runPractice(script('simple-pickup'), async () => turns.shift() ?? null, noLookUp, () => Date.UTC(2026, 10, 16, 20, 0));
    expect(r.outcome).toBe('placed');
    expect(r.heard).toEqual(['No. One large pepperoni for pickup.', "That's it.", 'Yes.']);
    const rep = report(script('simple-pickup'), r);
    expect(rep.problems).toEqual([]);
    expect(rep.passed).toBe(true);
    expect(rep.conversation[0]).toEqual({ who: 'caller', text: 'No. One large pepperoni for pickup.' });
  });

  it('fails a call that gets the order wrong, and says what was wrong', async () => {
    const wrong = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'M' })];
    const turns: BotTurn[] = [
      { say: 'One medium pepperoni. What name is it under?', order: order({ items: wrong, fulfillment: 'pickup', payment: 'pay_at_pickup' }), action: 'continue' },
      { say: 'Your order is in, number {number}.', order: order({ items: wrong, fulfillment: 'pickup', payment: 'pay_at_pickup' }), action: 'place_order' },
    ];
    const rep = report(script('simple-pickup'), await runPractice(script('simple-pickup'), async () => turns.shift() ?? null, noLookUp));
    expect(rep.passed).toBe(false);
    expect(rep.problems).toContain('The order is not exactly one large pepperoni.');
  });

  it('ends a call that goes in circles', async () => {
    const r = await runPractice(script('big-order'), async () => ({ say: 'Anything else?', order: order({}), action: 'continue' }), noLookUp);
    expect(r.outcome).toBe('open');
    expect(r.heard.length).toBe(1 + PRACTICE_EXTRA_TURNS);
    expect(report(script('big-order'), r).passed).toBe(false);
  });

  it('checks the rules every call must keep', () => {
    expect(houseRules(result({ said: ['Pickup or delivery? And what size?'] }))[0]).toContain('two questions');
    expect(houseRules(result({ said: ['Your total is {total}.'] }))[0]).toContain('blank');
    expect(houseRules(result({ said: ['One large pepperoni. Anything else?'] }))).toEqual([]);
  });

  it('reads the toppings that end up on a pizza', () => {
    expect(toppingsOn(item({ kind: 'pizza', specialty: 'bbq-chicken', add: [{ topping: 'pineapple', side: 'whole', extra: false }], remove: ['bacon'] })).sort()).toEqual(['chicken', 'onion', 'pineapple']);
  });

  it('answers ordinary questions like a caller would', () => {
    expect(ordinaryAnswer('What name should I put it under?')).toBe('Elias.');
    expect(ordinaryAnswer('Anything else?')).toBe("No, that's it.");
    expect(ordinaryAnswer('Is that right?')).toBe('Yes.');
  });
});

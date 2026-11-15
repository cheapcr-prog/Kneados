import { describe, expect, it } from 'vitest';
import { MENU_BY_ID } from '../data/shop';
import { packPlan } from './packing';

describe('packPlan', () => {
  it('splits an order into boxes, the bag and the cup holder', () => {
    const box = [...Array(10).fill('glazed'), 'maple', 'custard'];
    const plan = packPlan({
      boxes: [box],
      lines: [
        { itemId: 'glazed', qty: 12, lineCents: 0 },
        { itemId: 'maple', qty: 1, lineCents: 0 },
        { itemId: 'custard', qty: 1, lineCents: 0 },
        { itemId: 'croissant', qty: 2, lineCents: 0 },
        { itemId: 'coffee', qty: 3, lineCents: 0 },
      ],
    }, MENU_BY_ID);
    expect(plan.boxes).toEqual([[['glazed', 10], ['maple', 1], ['custard', 1]]]);
    expect(plan.bag).toEqual([['glazed', 2], ['croissant', 2]]);
    expect(plan.cups).toEqual([['coffee', 3]]);
  });

  it('puts everything in the bag and cup holder when there is no box', () => {
    const plan = packPlan({ lines: [{ itemId: 'glazed', qty: 24, lineCents: 0 }, { itemId: 'milk', qty: 1, lineCents: 0 }] }, MENU_BY_ID);
    expect(plan).toEqual({ boxes: [], bag: [['glazed', 24]], cups: [['milk', 1]] });
  });
});

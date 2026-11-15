import { describe, expect, it } from 'vitest';
import { orderReadyText, orderReceivedText } from './notify';

describe('order texts', () => {
  it('greets by first name and names the order', () => {
    expect(orderReadyText('Good Batch Donuts', { number: 1004, customerName: 'tina Lopez' })).toBe('Good Batch Donuts: Hi tina, order #1004 is packed and ready at the counter. See you soon!');
  });
  it('works without a name', () => {
    expect(orderReadyText('Good Batch Donuts', { number: 7 })).toBe('Good Batch Donuts: Order #7 is packed and ready at the counter. See you soon!');
  });
  it('fits in one SMS', () => {
    const t = orderReceivedText('Good Batch Donuts', { number: 1004, customerName: 'Alexandria', pickupAt: new Date(2026, 10, 16, 9, 30).toISOString() });
    expect(t).toContain('order #1004 for pickup at 9:30 AM');
    expect(t.length).toBeLessThanOrEqual(160);
  });
});

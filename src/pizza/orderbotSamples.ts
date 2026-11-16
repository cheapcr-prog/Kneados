/**
 * Recorded sample conversations for the AI order taker. They play back on the demo page without calling
 * Claude, so a visitor can watch a full call or text thread at any hour and for free. The words are written
 * ahead of time; the ticket, prices, wait time and rules are still worked out live by the same code as a real turn.
 */
import { item, type BotOrder, type BotTurn, type Surface } from './orderbot';

export interface SampleStep { customer: string; turn: BotTurn }
export interface Sample {
  id: string;
  surface: Surface;
  title: string;
  blurb: string;
  /** Which demo caller it uses. */
  caller: 'regular' | 'new' | 'hidden';
  steps: SampleStep[];
}

const usual = (over: Partial<BotOrder> = {}): BotOrder => ({
  items: [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L' }), item({ kind: 'side', side: 'wings-buffalo' })],
  fulfillment: 'delivery', name: 'Maya R.', address: '210 Termino Ave', payment: '', ...over,
});
const usualWithMushroom = [
  item({ kind: 'pizza', specialty: 'pepperoni', size: 'L', add: [{ topping: 'mushroom', side: 'left', extra: false }], notes: ['Well done'] }),
  item({ kind: 'side', side: 'wings-buffalo' }),
];
const withSides = [...usualWithMushroom, item({ kind: 'side', side: 'garlic-knots' }), item({ kind: 'side', side: 'soda-2l' })];

const regularCall: Sample = {
  id: 'regular-call', surface: 'call', caller: 'regular',
  title: 'A regular calls for "the usual"',
  blurb: 'Caller ID knows her, the usual goes on the ticket, she changes half the pizza, says yes to one add-on and pays on a texted link.',
  steps: [
    {
      customer: 'Yeah, the usual. But put mushrooms on half the pizza, and can you make it well done?',
      turn: { say: 'You got it. Large pepperoni, mushrooms on half, well done, plus the buffalo wings. Want garlic bread for dipping with that?', order: usual({ items: usualWithMushroom }), action: 'continue' },
    },
    {
      customer: 'Sure, and throw in a two liter.',
      turn: { say: 'Added garlic bread and a two liter. Do you want to pay cash at the door, or should I text you a secure link to pay by card?', order: usual({ items: withSides }), action: 'continue' },
    },
    {
      customer: 'Text me the link.',
      turn: { say: "Perfect. So that's a large pepperoni with mushrooms on half, well done, buffalo wings, garlic bread and a two liter, delivered to 210 Termino Ave. Your total is {total}, and it'll be at your door in about {minutes} minutes. Does that all sound right?", order: usual({ items: withSides, payment: 'pay_link' }), action: 'continue' },
    },
    {
      customer: "Yep, that's it.",
      turn: { say: "You're all set, Maya. That's order number {number}, and I just texted you the pay link. We'll have it to you around {time}. Thanks for calling!", order: usual({ items: withSides, payment: 'pay_link' }), action: 'place_order' },
    },
  ],
};

const bigItems = [
  item({ kind: 'pizza', specialty: 'supreme', size: 'L', remove: ['olive'] }),
  item({ kind: 'pizza', specialty: 'byo', size: 'L', crust: 'pan', add: [{ topping: 'pepperoni', side: 'left', extra: false }, { topping: 'pineapple', side: 'right', extra: false }, { topping: 'jalapeno', side: 'right', extra: false }] }),
];
const bigAll = [...bigItems, item({ kind: 'side', side: 'wings-buffalo', qty: 3 }), item({ kind: 'side', side: 'garlic-knots', qty: 2 })];
const big = (over: Partial<BotOrder>): BotOrder => ({ items: bigAll, fulfillment: 'delivery', name: 'Sam', address: '1925 Redondo Ave', payment: '', ...over });

const newText: Sample = {
  id: 'new-text', surface: 'text', caller: 'new',
  title: 'A new number texts a big delivery',
  blurb: 'Two pizzas with halves and a Detroit pan, typed the way people text. A first order this size is paid on a secure link, and the AI will not take a card number.',
  steps: [
    {
      customer: '2 large pizzas for delivery. one supreme no olives, one half pepperoni half pineapple and jalapeno, make that one detroit style',
      turn: { say: "Got it!\n1. Large Supreme, no olives\n2. Large Detroit pan: pepperoni on one half, pineapple and jalapeños on the other\nWhat's the delivery address, and a name for the order?", order: { items: bigItems, fulfillment: 'delivery', name: '', address: '', payment: '' }, action: 'continue' },
    },
    {
      customer: 'Sam, 1925 Redondo Ave. also 3 buffalo wings and 2 garlic breads',
      turn: { say: "Added 3 buffalo wings and 2 garlic breads, Sam. Since this is your first order with us, delivery is paid ahead on a secure link instead of cash at the door. Total is {total}, about {minutes} min to your door. OK if I text the link?", order: big({}), action: 'continue' },
    },
    {
      customer: 'can i just give you my card number? its 4242',
      turn: { say: "Please don't send it here, I can't take card numbers by text. It keeps your card safe. The link takes about 20 seconds.\nReply YES and I'll send the order to the kitchen: 2 pizzas, 3 wings, 2 garlic breads to 1925 Redondo Ave, {total}.", order: big({ payment: 'pay_link' }), action: 'continue' },
    },
    {
      customer: 'yes',
      turn: { say: "Order #{number} is in! Pay with the link below and we'll have it to you around {time}. Have your ID handy: the driver matches it to the name on the card.", order: big({ payment: 'pay_link' }), action: 'place_order' },
    },
  ],
};

const eight = [item({ kind: 'pizza', specialty: 'pepperoni', size: 'L', qty: 8 })];

const hiddenCall: Sample = {
  id: 'hidden-call', surface: 'call', caller: 'hidden',
  title: 'A hidden number wants 8 pizzas delivered',
  blurb: 'The classic prank order. The AI stays friendly and offers pickup paid at the counter, so no driver is sent to a fake address.',
  steps: [
    {
      customer: 'I need eight large pepperoni pizzas delivered, cash.',
      turn: { say: "I can get eight large pepperonis going for you. Your number is coming through hidden, so I can set this up for pickup and you'd pay at the counter. Would pickup work?", order: { items: eight, fulfillment: '', name: '', address: '', payment: '' }, action: 'continue' },
    },
    {
      customer: "No, I need it delivered. It's 700 Pine Ave.",
      turn: { say: "I understand. For delivery, call us back from a number that shows and I'll have it out to you in about {minutes} minutes. Otherwise I can have it hot for pickup. Want me to start it for pickup?", order: { items: eight, fulfillment: 'pickup', name: '', address: '', payment: 'pay_at_pickup' }, action: 'continue' },
    },
    {
      customer: 'Forget it.',
      turn: { say: 'No problem at all. Call us back anytime. Have a good night!', order: { items: [], fulfillment: '', name: '', address: '', payment: '' }, action: 'end' },
    },
  ],
};

export const SAMPLES: Sample[] = [regularCall, newText, hiddenCall];

import type { MerchItem, Stock } from '../lib/merch';

/** Example catalog, costs and suppliers. A real shop lists its own. */
export const MERCH: MerchItem[] = [
  { id: 'tee', name: 'Good Batch Tee', blurb: 'Soft cotton, pink donut on the chest.', kind: 'merch', priceCents: 2400, costCents: 875, sizes: ['S', 'M', 'L', 'XL'], reorderAt: 10, reorderQty: 24, supplier: 'Long Beach Screen Print', color: '#f1f5f9' },
  { id: 'hat', name: 'Dad Hat', blurb: 'Embroidered donut, adjustable strap.', kind: 'merch', priceCents: 2200, costCents: 790, reorderAt: 6, reorderQty: 12, supplier: 'Long Beach Screen Print', color: '#0f172a' },
  { id: 'mug', name: 'Diner Mug', blurb: 'Heavy 12 oz ceramic, like the ones on the counter.', kind: 'merch', priceCents: 1400, costCents: 460, reorderAt: 8, reorderQty: 24, supplier: 'Pacific Promo Supply', color: '#fb6f9f' },
  { id: 'tote', name: 'Canvas Tote', blurb: 'Holds two dozen boxes flat.', kind: 'merch', priceCents: 1600, costCents: 520, reorderAt: 6, reorderQty: 20, supplier: 'Pacific Promo Supply', color: '#fde9c4' },
  { id: 'stickers', name: 'Sticker Pack', blurb: 'Four vinyl donut stickers.', kind: 'merch', priceCents: 500, costCents: 95, reorderAt: 15, reorderQty: 50, supplier: 'Pacific Promo Supply', color: '#2dd4bf' },
  { id: 'beans', name: 'House Coffee Beans, 12 oz', blurb: 'The medium roast we pour every morning.', kind: 'merch', priceCents: 1500, costCents: 720, reorderAt: 8, reorderQty: 18, supplier: 'Harbor Roasting Co.', color: '#8a6242' },
  { id: 'candles', name: 'Birthday Candles', blurb: 'A pack of 12 with holders.', kind: 'extra', priceCents: 250, costCents: 60, reorderAt: 10, reorderQty: 48, supplier: 'Pacific Promo Supply', color: '#facc15' },
  { id: 'giftbox', name: 'Gift Box and Ribbon', blurb: 'We box your dozen as a gift, with a card.', kind: 'extra', priceCents: 300, costCents: 85, reorderAt: 12, reorderQty: 50, supplier: 'Pacific Promo Supply', color: '#db2777' },
];
export const MERCH_BY_ID = Object.fromEntries(MERCH.map((m) => [m.id, m]));

/** Example stock on the shelf when the demo starts. A few are low so the reorder flag shows. */
export const seedStock = (): Stock => ({
  'tee:S': 3, 'tee:M': 0, 'tee:L': 4, 'tee:XL': 2,
  hat: 9, mug: 21, tote: 5, stickers: 62, beans: 11, candles: 31, giftbox: 40,
});

/** Example units sold in the 28 days before the demo started. */
export const SOLD_28: Record<string, number> = { tee: 19, hat: 8, mug: 14, tote: 9, stickers: 46, beans: 22, candles: 27, giftbox: 18 };

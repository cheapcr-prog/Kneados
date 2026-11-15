import type { Supplier } from '../lib/purchasing';

/**
 * The demo shop's suppliers. These are made-up examples, not real companies or contacts.
 * A live shop enters its own reps, order emails and account numbers once.
 */
export const SUPPLIERS: Supplier[] = [
  { name: 'Bakery supplier', rep: 'Marco D.', email: 'orders@bakerysupplier.example', phone: '5625550160', account: 'GB-20418', deliveryDays: [1, 2, 3, 4, 5, 6], minOrderCents: 15000, autoSend: true },
  { name: 'Coffee roaster', rep: 'Priya S.', email: 'wholesale@coffeeroaster.example', phone: '5625550173', account: 'W-3391', deliveryDays: [2, 4], minOrderCents: 0, autoSend: true },
  { name: 'Packaging supplier', rep: 'Order desk', email: 'orderdesk@packagingsupplier.example', phone: '8005550119', account: '77-10592', deliveryDays: [1, 3, 5], minOrderCents: 10000, autoSend: false },
  { name: 'Cash and carry', rep: '', email: '', phone: '', account: 'Member 4410 2207', deliveryDays: [], minOrderCents: 0, autoSend: false, pickup: true },
];

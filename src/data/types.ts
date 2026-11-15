export type Role = 'owner' | 'manager' | 'cashier' | 'baker';
export type Category = 'Classics' | 'Filled' | 'Specialty' | 'Drinks' | 'Smoothies & boba';

export interface MenuItem {
  id: string;
  name: string;
  category: Category;
  /** Price for one, in cents. */
  price: number;
  /** Price for a dozen, in cents. Only items sold by the dozen have one. */
  dozenPrice?: number;
  description: string;
  allergens: string[];
  /** A specialty donut costs a set extra when it goes in a mixed dozen box. Regular donuts, bars included, do not. */
  specialty?: boolean;
  /** Charged sales tax. In California, donuts to go are usually untaxed and hot coffee is taxed. */
  taxable: boolean;
  /** Made in the kitchen each morning, so it gets a bake forecast. */
  baked: boolean;
  /** Icing and dough colors used to draw the item. */
  icing: string;
  dough: string;
  sprinkles?: boolean;
  /** Cup size, for drinks sold in more than one size. */
  size?: string;
  /** A topping that goes into a drink, like boba, and is charged on top of it. */
  addon?: boolean;
  /** The photo or drawing to use when it is shared with another item, e.g. the same drink in another size. */
  art?: string;
  /** Typical weekday demand. Only used to generate the demo's sales history. */
  baseDaily: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: Role;
  pin: string;
  hourlyCents: number;
}

export interface Shift {
  staffId: string;
  /** 0 = Sunday. */
  dow: number;
  start: string;
  end: string;
}

export interface TimeEntry {
  staffId: string;
  date: string;
  hours: number;
  /** Set while the person is clocked in today. */
  clockedInAt?: string;
}

export interface OrderLine {
  itemId: string;
  qty: number;
  /** What the customer paid for the whole line, in cents. */
  lineCents: number;
}

export type OrderStatus = 'new' | 'making' | 'ready' | 'done';

export interface Order {
  id: string;
  number: number;
  source: 'register' | 'online';
  createdAt: string;
  /** Online orders only: when the customer picks up (ISO). */
  pickupAt?: string;
  customerName?: string;
  phone?: string;
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  /** `app` is paid through a delivery app, `invoice` goes on a wholesale or catering invoice. */
  payment: 'card' | 'cash' | 'online' | 'gift' | 'invoice' | 'app';
  status: OrderStatus;
  /** Set when the order did not come from the counter or the shop's own site. */
  channel?: 'doordash' | 'ubereats' | 'grubhub' | 'wholesale' | 'catering' | 'subscription';
  /** Commission the delivery app keeps, in cents. */
  feeCents?: number;
  /** Part of the total paid with a gift card, in cents. */
  giftCents?: number;
  rewardRedeemed?: boolean;
  /** Mixed dozen boxes the customer built online. Their donuts are already counted in `lines`. */
  boxes?: string[][];
}

export interface DayItemSales {
  made: number;
  sold: number;
  waste: number;
}

export interface DayHistory {
  date: string;
  dow: number;
  rain: boolean;
  holiday?: string;
  items: Record<string, DayItemSales>;
  revenue: number;
  tips: number;
  orders: number;
  laborHours: number;
}

export interface RewardsMember {
  phone: string;
  name: string;
  punches: number;
  rewards: number;
  visits: number;
  joined: string;
}

export interface BakeProgress {
  made: number;
  soldOut: boolean;
}

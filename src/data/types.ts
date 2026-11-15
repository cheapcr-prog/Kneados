export type Role = 'owner' | 'manager' | 'cashier' | 'baker';
export type Category = 'Classics' | 'Filled' | 'Specialty' | 'Drinks';

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
  /** Charged sales tax. In California, donuts to go are usually untaxed and hot coffee is taxed. */
  taxable: boolean;
  /** Made in the kitchen each morning, so it gets a bake forecast. */
  baked: boolean;
  /** Icing and dough colors used to draw the item. */
  icing: string;
  dough: string;
  sprinkles?: boolean;
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
  payment: 'card' | 'cash' | 'online';
  status: OrderStatus;
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

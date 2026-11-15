/** Turns each day's sales into a balanced journal entry that an accounting program can import. */

export type AccountKey = 'card' | 'cash' | 'food' | 'drinks' | 'tax' | 'tips';

export interface AccountMap {
  /** The account's name in the shop's books, and its code for programs that use codes. */
  name: string;
  code: string;
}

export const DEFAULT_ACCOUNTS: Record<AccountKey, AccountMap> = {
  card: { name: 'Card payments clearing', code: '1050' },
  cash: { name: 'Cash on hand', code: '1010' },
  food: { name: 'Donut and pastry sales', code: '4000' },
  drinks: { name: 'Beverage sales', code: '4010' },
  tax: { name: 'Sales tax payable', code: '2200' },
  tips: { name: 'Tips payable', code: '2300' },
};

export const ACCOUNT_LABEL: Record<AccountKey, string> = {
  card: 'Card payments', cash: 'Cash payments', food: 'Donut and pastry sales', drinks: 'Drink sales', tax: 'Sales tax collected', tips: 'Tips collected',
};

export interface DaySales {
  date: string;
  foodCents: number;
  drinkCents: number;
  taxCents: number;
  tipsCents: number;
  /** How much of the day's total was paid by card. The rest was cash. */
  cardCents: number;
}

export interface JournalLine {
  date: string;
  account: AccountKey;
  debit: number;
  credit: number;
  memo: string;
}

/** One day's entry. Debits always equal credits. */
export function dayJournal(d: DaySales): JournalLine[] {
  const total = d.foodCents + d.drinkCents + d.taxCents + d.tipsCents;
  const card = Math.min(total, Math.max(0, d.cardCents));
  const memo = `Daily sales ${d.date}`;
  const lines: JournalLine[] = [
    { date: d.date, account: 'card', debit: card, credit: 0, memo },
    { date: d.date, account: 'cash', debit: total - card, credit: 0, memo },
    { date: d.date, account: 'food', debit: 0, credit: d.foodCents, memo },
    { date: d.date, account: 'drinks', debit: 0, credit: d.drinkCents, memo },
    { date: d.date, account: 'tax', debit: 0, credit: d.taxCents, memo },
    { date: d.date, account: 'tips', debit: 0, credit: d.tipsCents, memo },
  ];
  return lines.filter((l) => l.debit > 0 || l.credit > 0);
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const mdy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };

/** Journal entries laid out for QuickBooks Online's journal entry import: one journal number per day. */
export function quickBooksCsv(days: DaySales[], accounts: Record<AccountKey, AccountMap>): string {
  const rows = ['JournalNo,JournalDate,AccountName,Debits,Credits,Description'];
  for (const d of days) {
    const no = `KN-${d.date.replace(/-/g, '')}`;
    for (const l of dayJournal(d)) rows.push([no, mdy(l.date), q(accounts[l.account].name), l.debit ? dollars(l.debit) : '', l.credit ? dollars(l.credit) : '', q(l.memo)].join(','));
  }
  return rows.join('\n');
}

/** Journal entries laid out for Xero's manual journal import: debits are positive, credits negative. */
export function xeroCsv(days: DaySales[], accounts: Record<AccountKey, AccountMap>): string {
  const rows = ['*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount'];
  for (const d of days) {
    for (const l of dayJournal(d)) rows.push([q(l.memo), mdy(l.date), q(ACCOUNT_LABEL[l.account]), accounts[l.account].code, 'Tax Exempt', dollars(l.debit - l.credit)].join(','));
  }
  return rows.join('\n');
}

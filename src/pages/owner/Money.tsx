import { Download, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CARD, OVERHEAD, PAYROLL_TAX_RATE, TARGETS } from '../../data/finance';
import { useShopState } from '../../data/local';
import { MENU, MENU_BY_ID, SCHEDULE, STAFF_BY_ID, shiftHours } from '../../data/shop';
import type { Demo } from '../../data/store';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import type { DayHistory } from '../../data/types';
import { ACCOUNT_LABEL, DEFAULT_ACCOUNTS, dayJournal, quickBooksCsv, xeroCsv, type AccountKey, type DaySales } from '../../lib/accounting';
import { menuCosts } from '../../lib/costing';
import { longDate, shortDate, timeLabel } from '../../lib/dates';
import { DEMO_TAX_RATE, money, moneyShort } from '../../lib/money';
import { itemMargins, profitAndLoss, share, type Pnl } from '../../lib/pnl';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, download, field } from './ui';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const PERIODS = [7, 30, 90] as const;

/** Hourly wages for the crew scheduled on a weekday. The owner's pay is a monthly bill instead. */
export function wagesFor(dow: number): number {
  return SCHEDULE.filter((s) => s.dow === dow).reduce((a, s) => a + shiftHours(s) * STAFF_BY_ID[s.staffId].hourlyCents, 0);
}

function pnlFor(days: DayHistory[], cost: Record<string, number>): Pnl {
  return profitAndLoss({
    days, cost, wagesCents: days.reduce((a, h) => a + wagesFor(h.dow), 0), payrollTaxRate: PAYROLL_TAX_RATE, overhead: OVERHEAD,
    cardShare: CARD.share, cardRate: CARD.rate, cardFixedCents: CARD.fixedCents,
  });
}

export function ProfitLoss({ demo }: { demo: Demo }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const cost = useMemo(() => menuCosts(MENU.map((m) => m.id), RECIPES, SUPPLIES, PURCHASED), []);
  const price = Object.fromEntries(MENU.map((m) => [m.id, m.price]));
  const days = demo.history.slice(-period);
  const before = period < 90 ? demo.history.slice(-2 * period, -period) : [];
  const p = pnlFor(days, cost);
  const prev = before.length === period ? pnlFor(before, cost) : undefined;
  const margins = itemMargins(days, cost, price);
  const of = (n: number) => share(n, p.sales);
  const rows: { label: string; cents: number; prev?: number; kind?: 'total' | 'sub' | 'cost'; note?: string }[] = [
    { label: 'Sales', cents: p.sales, prev: prev?.sales, kind: 'total' },
    { label: 'Food and packaging', cents: -p.foodCost, prev: prev && -prev.foodCost, kind: 'cost', note: `includes ${money(p.wasteCost)} made and never sold` },
    { label: 'Wages', cents: -p.wages, prev: prev && -prev.wages, kind: 'cost' },
    { label: 'Payroll taxes', cents: -p.payrollTax, prev: prev && -prev.payrollTax, kind: 'cost' },
    { label: 'Left after food and labor', cents: p.sales - p.primeCost, prev: prev && prev.sales - prev.primeCost, kind: 'sub' },
    { label: 'Card processing', cents: -p.cardFees, prev: prev && -prev.cardFees, kind: 'cost' },
    ...p.overhead.map((o, i) => ({ label: o.name, cents: -o.cents, prev: prev && -prev.overhead[i].cents, kind: 'cost' as const })),
    { label: 'Profit', cents: p.net, prev: prev?.net, kind: 'total' },
  ];
  const halfWaste = Math.round(p.wasteCost / 2);
  const tone = (actual: number, target: number) => (actual <= target ? 'good' as const : 'bad' as const);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}</p>
        <div className="flex gap-1 rounded-full bg-slate-200/70 p-1">
          {PERIODS.map((n) => <button key={n} onClick={() => setPeriod(n)} className={`rounded-full px-3 py-1 text-xs font-bold ${period === n ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{n} days</button>)}
        </div>
      </div>

      <Brain label="KneadOS profit check" title={`You kept ${Math.round(of(p.net) * 100)} cents of every dollar`}>
        <p>Food took {Math.round(of(p.foodCost) * 100)} cents, labor {Math.round(of(p.labor) * 100)}, and rent, bills and card fees {Math.round(of(p.overheadTotal + p.cardFees) * 100)}.</p>
        <p>{money(p.wasteCost)} of the food cost was donuts that were made and never sold. Baking to the forecast and cutting that in half would add about {moneyShort(halfWaste)} to profit over the same {period} days.</p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" value={moneyShort(p.sales)} sub={prev ? `${p.sales >= prev.sales ? 'Up' : 'Down'} ${pct(Math.abs(share(p.sales - prev.sales, prev.sales)))} on the ${period} days before` : `${moneyShort(p.sales / p.days)} a day`} />
        <Stat label="Food cost" value={pct(of(p.foodCost))} sub={`Goal: under ${Math.round(TARGETS.food * 100)}% of sales`} tone={tone(of(p.foodCost), TARGETS.food)} />
        <Stat label="Labor" value={pct(of(p.labor))} sub={`Goal: under ${Math.round(TARGETS.labor * 100)}% of sales`} tone={tone(of(p.labor), TARGETS.labor)} />
        <Stat label="Profit" value={moneyShort(p.net)} sub={`${pct(of(p.net))} of sales`} tone={p.net >= 0 ? 'good' : 'bad'} />
      </div>

      <Card title="Profit and loss" note={`Food plus labor is ${pct(of(p.primeCost))} of sales. The goal is under ${Math.round(TARGETS.prime * 100)}%.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium" /><th className="pb-1.5 text-right font-medium">Amount</th><th className="pb-1.5 text-right font-medium">Of sales</th>{prev && <th className="pb-1.5 text-right font-medium">{period} days before</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.kind === 'total' ? 'border-t-2 border-slate-900 font-bold' : r.kind === 'sub' ? 'border-t border-slate-300 font-semibold' : 'border-t border-slate-100'}>
                  <td className="py-1.5">{r.label}{r.note && <span className="block text-xs font-normal text-slate-500">{r.note}</span>}</td>
                  <td className={`tabular py-1.5 text-right ${r.cents < 0 ? 'text-slate-700' : ''}`}>{r.cents < 0 ? `-${money(-r.cents)}` : money(r.cents)}</td>
                  <td className="tabular py-1.5 text-right text-slate-500">{pct(share(Math.abs(r.cents), p.sales))}</td>
                  {prev && <td className="tabular py-1.5 text-right text-slate-500">{r.prev === undefined ? '' : r.prev < 0 ? `-${money(-r.prev)}` : money(r.prev)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="What each item earns" note={`After ingredients and packaging, last ${period} days. Waste counts against the item that was wasted.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Item</th><th className="pb-1.5 text-right font-medium">Price</th><th className="pb-1.5 text-right font-medium">Costs to make</th><th className="pb-1.5 text-right font-medium">Margin</th><th className="pb-1.5 text-right font-medium">Sold</th><th className="pb-1.5 text-right font-medium">Earned</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {margins.slice(0, 12).map((m) => (
                <tr key={m.itemId}>
                  <td className="py-1.5 font-medium">{MENU_BY_ID[m.itemId].name}</td>
                  <td className="tabular py-1.5 text-right text-slate-600">{money(m.price)}</td>
                  <td className="tabular py-1.5 text-right text-slate-600">{money(m.cost)}</td>
                  <td className={`tabular py-1.5 text-right ${m.margin < 0.65 ? 'text-amber-700' : 'text-emerald-700'}`}>{Math.round(m.margin * 100)}%</td>
                  <td className="tabular py-1.5 text-right text-slate-600">{m.sold.toLocaleString()}</td>
                  <td className="tabular py-1.5 text-right font-semibold">{moneyShort(m.profitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DemoNote>Demo: sales come from generated history, and the rent, bills, payroll tax and card rates are examples. The goals are this demo shop's own settings. </DemoNote>
    </div>
  );
}

function daySales(h: DayHistory): DaySales {
  let drink = 0, taxable = 0;
  for (const m of MENU) {
    const sold = h.items[m.id]?.sold ?? 0;
    if (m.category === 'Drinks') drink += sold * m.price;
    if (m.taxable) taxable += sold * m.price;
  }
  const tax = Math.round(taxable * DEMO_TAX_RATE);
  return { date: h.date, foodCents: h.revenue - drink, drinkCents: drink, taxCents: tax, tipsCents: h.tips, cardCents: h.tips + Math.round((h.revenue + tax) * CARD.share) };
}

const BOOKS = [
  { id: 'quickbooks', name: 'QuickBooks Online', file: 'kneados-quickbooks-journal.csv' },
  { id: 'xero', name: 'Xero', file: 'kneados-xero-journal.csv' },
] as const;
type BookId = (typeof BOOKS)[number]['id'];

export function Accounting({ demo }: { demo: Demo }) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [accounts, setAccounts] = useShopState('accounts', () => DEFAULT_ACCOUNTS);
  const [links, setLinks] = useShopState<Partial<Record<BookId, { syncedAt: string; through: string }>>>('books', () => ({}));
  const days = demo.history.slice(-period).map(daySales);
  const last = days[days.length - 1];
  const lines = dayJournal(last);
  const total = lines.reduce((a, l) => a + l.debit, 0);
  const csv = (id: BookId) => (id === 'quickbooks' ? quickBooksCsv(days, accounts) : xeroCsv(days, accounts));
  const sync = (id: BookId) => setLinks((l) => ({ ...l, [id]: { syncedAt: new Date().toISOString(), through: last.date } }));
  return (
    <div className="space-y-4">
      <Brain label="KneadOS bookkeeping" title="Each day closes as one balanced entry">
        <p>At close, the day's sales, sales tax, tips, and card and cash totals become one journal entry. Your bookkeeper gets clean daily numbers and nobody retypes the register tape.</p>
      </Brain>

      <div className="grid gap-3 md:grid-cols-2">
        {BOOKS.map((b) => {
          const link = links[b.id];
          return (
            <Card key={b.id} title={b.name} action={<Pill tone={link ? 'green' : 'slate'}>{link ? 'Connected' : 'Not connected'}</Pill>}>
              <p className="text-sm text-slate-600">{link ? `Posted through ${shortDate(link.through)}. Last sync at ${timeLabel(link.syncedAt)}.` : 'Connect to post each day automatically, or download the file and import it yourself.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={btn.dark + ' !px-3 !py-1.5 !text-xs'} onClick={() => sync(b.id)}><RefreshCw size={12} /> {link ? 'Sync now' : `Connect ${b.name}`}</button>
                <button className={btn.light} onClick={() => download(b.file, csv(b.id))}><Download size={13} /> Download last {period} days</button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title={`Entry for ${longDate(last.date)}`} note="This is what gets posted for one day. Debits equal credits." action={
        <div className="flex gap-1 rounded-full bg-slate-100 p-1">
          {([7, 30] as const).map((n) => <button key={n} onClick={() => setPeriod(n)} className={`rounded-full px-3 py-1 text-xs font-bold ${period === n ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Export {n} days</button>)}
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Account</th><th className="pb-1.5 text-right font-medium">Debit</th><th className="pb-1.5 text-right font-medium">Credit</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.account}>
                  <td className={`py-1.5 ${l.credit ? 'pl-6' : ''}`}>{accounts[l.account].name}</td>
                  <td className="tabular py-1.5 text-right">{l.debit ? money(l.debit) : ''}</td>
                  <td className="tabular py-1.5 text-right">{l.credit ? money(l.credit) : ''}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-900 font-bold"><td className="py-1.5">Total</td><td className="tabular py-1.5 text-right">{money(total)}</td><td className="tabular py-1.5 text-right">{money(lines.reduce((a, l) => a + l.credit, 0))}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Where each number goes" note="Match these to the accounts in your own books. Xero uses the code, QuickBooks uses the name.">
        <ul className="space-y-2">
          {(Object.keys(ACCOUNT_LABEL) as AccountKey[]).map((k) => (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_72px] items-center gap-2 text-sm">
              <span className="text-slate-700">{ACCOUNT_LABEL[k]}</span>
              <input className={field} value={accounts[k].name} aria-label={`Account name for ${ACCOUNT_LABEL[k]}`} onChange={(e) => setAccounts((a) => ({ ...a, [k]: { ...a[k], name: e.target.value } }))} />
              <input className={field + ' tabular'} value={accounts[k].code} aria-label={`Account code for ${ACCOUNT_LABEL[k]}`} onChange={(e) => setAccounts((a) => ({ ...a, [k]: { ...a[k], code: e.target.value } }))} />
            </li>
          ))}
        </ul>
      </Card>
      <DemoNote>Demo: connecting and syncing are simulated, so nothing is sent to QuickBooks or Xero. The downloads are real files laid out for each program's journal import. Check the columns against your own books before importing.</DemoNote>
    </div>
  );
}

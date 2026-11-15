import { Download, Minus, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { useDeliverySettings, useGiftCards, useInvoices } from '../../components/Channels';
import { PRICE, WHOLESALE, WHOLESALE_BY_ID, deliveryOrder, sampleBasket } from '../../data/channels';
import { MENU_BY_ID } from '../../data/shop';
import type { Demo } from '../../data/store';
import type { Order } from '../../data/types';
import { DELIVERY_APPS, appPrice, breakEvenMarkup, deliveryCents, deliveryNet, invoiceState, type DeliveryApp } from '../../lib/channels';
import { DOW_SHORT, addDays, isoDate, shortDate, timeLabel } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn, download, field } from './ui';

const isDelivery = (o: Order) => o.channel === 'doordash' || o.channel === 'ubereats' || o.channel === 'grubhub';
const pct = (n: number) => `${Math.round(n * 100)}%`;
const STATUS_LABEL: Record<Order['status'], string> = { new: 'New', making: 'Packing', ready: 'Ready for driver', done: 'Handed off' };

export function DeliveryApps({ demo }: { demo: Demo }) {
  const [settings, setSettings] = useDeliverySettings();
  const orders = demo.todayOrders.filter(isDelivery).sort((a, b) => b.pickupAt!.localeCompare(a.pickupAt!));
  const gross = orders.reduce((a, o) => a + o.subtotal, 0);
  const fees = orders.reduce((a, o) => a + (o.feeCents ?? 0), 0);
  const sendTest = (app: DeliveryApp) => {
    const [customer, items] = sampleBasket(settings.sent + 4);
    demo.placeOrder(deliveryOrder(app, customer, items, new Date(Date.now() + 15 * 60_000), 'new', settings.markup));
    setSettings((s) => ({ ...s, sent: s.sent + 1 }));
  };
  const samples = ['glazed', 'maple', 'jelly', 'fritter', 'coffee', 'icedcoffee'];
  const connected = DELIVERY_APPS.filter((a) => settings.connected[a.id]);
  const worst = connected.reduce((a, b) => (b.commission > a ? b.commission : a), 0);
  return (
    <div className="space-y-4">
      <Brain label="KneadOS delivery" title={orders.length > 0 ? `${orders.length} delivery order${orders.length === 1 ? '' : 's'} today, and you keep ${money(gross - fees)}` : 'No delivery orders yet today'}>
        <p>Orders from every connected app land in the same packing queue as your own pickup orders, so the counter works one list and nobody watches three tablets.</p>
        {connected.length > 0 && (
          <p>
            Your app menu is marked up {pct(settings.markup)}. To keep the same money as a counter sale you need {pct(breakEvenMarkup(worst))} on the most expensive app you use.
            {settings.markup < breakEvenMarkup(worst) - 0.005 ? ' Right now each delivery order pays you a little less than the counter does.' : ' Right now a delivery order pays you at least what the counter does.'}
          </p>
        )}
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Delivery sales today" value={moneyShort(gross)} sub={`${orders.length} orders`} />
        <Stat label="App commission" value={moneyShort(fees)} sub={gross > 0 ? `${pct(fees / gross)} of delivery sales` : undefined} tone={fees > 0 ? 'bad' : undefined} />
        <Stat label="You keep" value={moneyShort(gross - fees)} tone="good" />
        <Stat label="Apps connected" value={`${connected.length} of ${DELIVERY_APPS.length}`} />
      </div>

      <Card title="Apps" note="Turn an app on and its orders come straight into the packing queue.">
        <ul className="grid gap-3 md:grid-cols-3">
          {DELIVERY_APPS.map((app) => {
            const mine = orders.filter((o) => o.channel === app.id);
            const on = settings.connected[app.id];
            return (
              <li key={app.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-display text-base font-bold"><span className="h-3 w-3 rounded-full" style={{ background: app.color }} />{app.name}</p>
                  <Pill tone={on ? 'green' : 'slate'}>{on ? 'Connected' : 'Off'}</Pill>
                </div>
                <p className="mt-1 text-xs text-slate-500">Keeps {pct(app.commission)} of each order (example rate).</p>
                <p className="tabular mt-2 text-sm text-slate-700">{mine.length} order{mine.length === 1 ? '' : 's'} today · {money(mine.reduce((a, o) => a + o.subtotal - (o.feeCents ?? 0), 0))} to you</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={btn.light} onClick={() => setSettings((s) => ({ ...s, connected: { ...s.connected, [app.id]: !on } }))}>{on ? 'Disconnect' : 'Connect'}</button>
                  {on && <button className={btn.dark + ' !px-3 !py-1.5 !text-xs'} onClick={() => sendTest(app.id)}><Send size={12} /> Send a test order</button>}
                </div>
              </li>
            );
          })}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.autoAccept} onChange={(e) => setSettings((s) => ({ ...s, autoAccept: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
          Accept new delivery orders automatically
        </label>
      </Card>

      <Card title="App menu prices" note="One markup sets the price on every app. Prices round up to the next 5 cents.">
        <div className="flex flex-wrap items-center gap-3">
          <input type="range" min={0} max={0.4} step={0.05} value={settings.markup} onChange={(e) => setSettings((s) => ({ ...s, markup: Number(e.target.value) }))} className="w-56 accent-teal-600" aria-label="Markup on delivery app prices" />
          <p className="tabular font-display text-2xl font-bold">{pct(settings.markup)} markup</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1.5 font-medium">Item</th><th className="pb-1.5 text-right font-medium">Shop price</th><th className="pb-1.5 text-right font-medium">App price</th>
                {DELIVERY_APPS.map((a) => <th key={a.id} className="pb-1.5 text-right font-medium">You keep on {a.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {samples.map((id) => {
                const item = MENU_BY_ID[id];
                const price = appPrice(item.price, settings.markup);
                return (
                  <tr key={id}>
                    <td className="py-1.5 font-medium">{item.name}</td>
                    <td className="tabular py-1.5 text-right text-slate-600">{money(item.price)}</td>
                    <td className="tabular py-1.5 text-right font-semibold">{money(price)}</td>
                    {DELIVERY_APPS.map((a) => {
                      const net = deliveryNet(price, a.commission).netCents;
                      return <td key={a.id} className={`tabular py-1.5 text-right ${net < item.price ? 'text-rose-600' : 'text-emerald-700'}`}>{money(net)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Red means the order pays you less than the same donut sold at the counter.</p>
      </Card>

      <Card title="Today's delivery orders">
        {orders.length === 0 ? <p className="text-sm text-slate-500">Nothing yet. Send a test order from an app above to see it land in the packing queue.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Order</th><th className="pb-1.5 font-medium">Driver at</th><th className="pb-1.5 font-medium">Status</th><th className="pb-1.5 text-right font-medium">Sale</th><th className="pb-1.5 text-right font-medium">Commission</th><th className="pb-1.5 text-right font-medium">You keep</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 font-medium">#{o.number} · {o.customerName}</td>
                    <td className="tabular py-1.5 text-slate-600">{timeLabel(o.pickupAt!)}</td>
                    <td className="py-1.5"><Pill tone={o.status === 'done' ? 'slate' : o.status === 'ready' ? 'green' : 'amber'}>{STATUS_LABEL[o.status]}</Pill></td>
                    <td className="tabular py-1.5 text-right">{money(o.subtotal)}</td>
                    <td className="tabular py-1.5 text-right text-rose-600">-{money(o.feeCents ?? 0)}</td>
                    <td className="tabular py-1.5 text-right font-semibold">{money(o.subtotal - (o.feeCents ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DemoNote>Demo: the app connections are simulated and the commission rates are examples. Every shop signs its own plan with each app. A live shop connects through each app's merchant integration.</DemoNote>
    </div>
  );
}

const CATERING_ITEMS = ['glazed', 'chocolate', 'sprinkle', 'maple', 'jelly', 'fritter'];
/** Catering orders of this many dozen or more get the volume price. */
const VOLUME_DOZENS = 5;
const VOLUME_DISCOUNT = 0.1;

export function Wholesale({ demo }: { demo: Demo }) {
  const { invoices, markPaid } = useInvoices();
  const today = demo.state.today;
  const unpaid = invoices.filter((i) => !i.paid);
  const overdue = unpaid.filter((i) => invoiceState(i, today) === 'overdue');
  const weekly = WHOLESALE.reduce((a, acct) => a + deliveryCents(acct, PRICE) * acct.days.length, 0);
  const runs = (date: string) => demo.state.orders.filter((o) => o.channel === 'wholesale' && o.pickupAt && isoDate(new Date(o.pickupAt)) === date);
  const todayRuns = runs(today);
  const tomorrowRuns = runs(demo.tomorrow);
  const donuts = (list: Order[]) => list.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.qty, 0), 0);

  const [name, setName] = useState('');
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('08:00');
  const [dozens, setDozens] = useState<Record<string, number>>({ glazed: 3, chocolate: 1, sprinkle: 1 });
  const [booked, setBooked] = useState<Order | null>(null);
  const totalDozens = Object.values(dozens).reduce((a, b) => a + b, 0);
  const list = Object.entries(dozens).filter(([, n]) => n > 0);
  const full = list.reduce((a, [id, n]) => a + n * MENU_BY_ID[id].dozenPrice!, 0);
  const off = totalDozens >= VOLUME_DOZENS ? Math.round(full * VOLUME_DISCOUNT) : 0;
  const book = () => {
    const date = addDays(today, day);
    const [y, mo, d] = date.split('-').map(Number);
    const [h, m] = time.split(':').map(Number);
    const order = demo.placeOrder({
      source: 'online', channel: 'catering', customerName: name.trim() || 'Catering order', pickupAt: new Date(y, mo - 1, d, h, m).toISOString(),
      lines: list.map(([itemId, n]) => ({ itemId, qty: n * 12, lineCents: Math.round(n * MENU_BY_ID[itemId].dozenPrice! * (off > 0 ? 1 - VOLUME_DISCOUNT : 1)) })),
      subtotal: full - off, tax: 0, tip: 0, total: full - off, payment: 'invoice', status: 'new',
    });
    setBooked(order);
    setName('');
  };

  const exportCsv = () => download('kneados-invoices.csv', ['Invoice,Account,Week of,Deliveries,Total,Issued,Due,Status', ...invoices.map((i) => [i.id, `"${WHOLESALE_BY_ID[i.accountId].name}"`, i.weekStart, i.deliveries, (i.totalCents / 100).toFixed(2), i.issued, i.due, invoiceState(i, today)].join(','))].join('\n'));

  return (
    <div className="space-y-4">
      <Brain label="KneadOS wholesale" title={`${todayRuns.length} standing order${todayRuns.length === 1 ? '' : 's'} today, ${tomorrowRuns.length} tomorrow`}>
        <p>Standing orders are added to the bake plan before the bakers start, so tomorrow's plan already includes {donuts(tomorrowRuns)} donuts for your accounts. Each one also shows in the packing queue with the time it has to be ready.</p>
        {overdue.length > 0 && <p>{overdue.length} invoice{overdue.length === 1 ? ' is' : 's are'} past due, worth {money(overdue.reduce((a, i) => a + i.totalCents, 0))}. That one is worth a call today.</p>}
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={String(WHOLESALE.length)} />
        <Stat label="Standing orders a week" value={moneyShort(weekly)} sub="at wholesale prices" />
        <Stat label="Waiting to be paid" value={moneyShort(unpaid.reduce((a, i) => a + i.totalCents, 0))} sub={`${unpaid.length} invoices`} />
        <Stat label="Past due" value={moneyShort(overdue.reduce((a, i) => a + i.totalCents, 0))} tone={overdue.length > 0 ? 'bad' : 'good'} />
      </div>

      <Card title="Accounts" note="Each account has a standing order that repeats on its delivery days.">
        <ul className="grid gap-3 md:grid-cols-2">
          {WHOLESALE.map((acct) => (
            <li key={acct.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-display text-base font-bold">{acct.name}</p>
                <Pill tone="blue">{acct.kind}</Pill>
              </div>
              <p className="mt-0.5 break-words text-xs text-slate-500">{acct.contact} · {acct.email}</p>
              <p className="mt-2 text-sm text-slate-700">{acct.days.length === 7 ? 'Every day' : acct.days.map((d) => DOW_SHORT[d]).join(', ')}, ready by {timeLabel(`2026-01-01T${acct.readyAt}:00`)}</p>
              <p className="mt-1 text-sm text-slate-700">{Object.entries(acct.standing).map(([id, q]) => `${q} ${MENU_BY_ID[id].name}`).join(', ')}</p>
              <p className="tabular mt-2 text-xs text-slate-500">{pct(acct.discount)} off menu price · {money(deliveryCents(acct, PRICE))} a delivery · pays in {acct.termsDays} days</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Invoices" note="One invoice per account per week, built from the deliveries that went out." action={<button className={btn.light} onClick={exportCsv}><Download size={13} /> Download CSV</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Account</th><th className="pb-1.5 font-medium">Week of</th><th className="pb-1.5 text-right font-medium">Deliveries</th><th className="pb-1.5 text-right font-medium">Total</th><th className="pb-1.5 font-medium pl-4">Due</th><th className="pb-1.5 font-medium">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((i) => {
                const st = invoiceState(i, today);
                return (
                  <tr key={i.id}>
                    <td className="py-1.5 font-medium">{WHOLESALE_BY_ID[i.accountId].name}</td>
                    <td className="py-1.5 text-slate-600">{shortDate(i.weekStart)}</td>
                    <td className="tabular py-1.5 text-right text-slate-600">{i.deliveries}</td>
                    <td className="tabular py-1.5 text-right font-semibold">{money(i.totalCents)}</td>
                    <td className="py-1.5 pl-4 text-slate-600">{shortDate(i.due)}</td>
                    <td className="py-1.5"><Pill tone={st === 'paid' ? 'green' : st === 'overdue' ? 'red' : 'amber'}>{st === 'paid' ? 'Paid' : st === 'overdue' ? 'Past due' : 'Open'}</Pill></td>
                    <td className="py-1.5 text-right">{st !== 'paid' && <button className={btn.light} onClick={() => markPaid(i.id)}>Mark paid</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Catering quote" note={`For a one-time order. ${VOLUME_DOZENS} dozen or more gets ${pct(VOLUME_DISCOUNT)} off.`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <input className={field} placeholder="Who is it for?" value={name} onChange={(e) => setName(e.target.value)} aria-label="Customer name" />
            <div className="grid grid-cols-2 gap-2">
              <select className={field} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Pickup day">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 1 ? 'Tomorrow' : shortDate(addDays(today, n))}</option>)}
              </select>
              <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Pickup time" />
            </div>
            <ul className="space-y-1.5">
              {CATERING_ITEMS.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{MENU_BY_ID[id].name} <span className="text-xs text-slate-500">{money(MENU_BY_ID[id].dozenPrice!)} a dozen</span></span>
                  <span className="flex items-center gap-2">
                    <button className={btn.light} aria-label={`One less dozen ${MENU_BY_ID[id].name}`} onClick={() => setDozens((d) => ({ ...d, [id]: Math.max(0, (d[id] ?? 0) - 1) }))}><Minus size={12} /></button>
                    <span className="tabular w-6 text-center font-bold">{dozens[id] ?? 0}</span>
                    <button className={btn.light} aria-label={`One more dozen ${MENU_BY_ID[id].name}`} onClick={() => setDozens((d) => ({ ...d, [id]: (d[id] ?? 0) + 1 }))}><Plus size={12} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quote</p>
            <p className="tabular mt-1 text-sm text-slate-700">{totalDozens} dozen · {totalDozens * 12} donuts</p>
            {off > 0 && <p className="tabular text-sm text-emerald-700">Volume price: -{money(off)}</p>}
            <p className="tabular mt-1 font-display text-3xl font-bold">{money(full - off)}</p>
            <button className={btn.dark + ' mt-3'} disabled={totalDozens === 0} onClick={book}>Book this order</button>
            {booked && <p className="mt-3 text-sm text-emerald-700">Booked order #{booked.number} for {booked.customerName}, {shortDate(isoDate(new Date(booked.pickupAt!)))} at {timeLabel(booked.pickupAt!)}. It is in that day's bake plan and goes on an invoice.</p>}
          </div>
        </div>
      </Card>
      <DemoNote>Demo: these accounts, prices and invoices are examples. Invoices are shown here, not emailed.</DemoNote>
    </div>
  );
}

const AMOUNTS = [1000, 2500, 5000, 10000];

export function GiftCards({ demo }: { demo: Demo }) {
  const gift = useGiftCards();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(2500);
  const [sold, setSold] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');
  const outstanding = gift.cards.reduce((a, c) => a + c.balanceCents, 0);
  const loaded = gift.cards.reduce((a, c) => a + c.loadedCents, 0);
  const monthAgo = addDays(demo.state.today, -30);
  const recent = gift.cards.filter((c) => c.sold >= monthAgo);
  const found = lookup.replace(/[^a-z0-9]/gi, '').length >= 8 ? gift.find(lookup) : undefined;
  const newest = sold ? gift.find(sold) : undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unspent balance" value={moneyShort(outstanding)} sub="donuts you still owe" />
        <Stat label="Sold in the last 30 days" value={moneyShort(recent.reduce((a, c) => a + c.loadedCents, 0))} sub={`${recent.length} cards`} tone="good" />
        <Stat label="Spent so far" value={moneyShort(loaded - outstanding)} sub={loaded > 0 ? `${pct((loaded - outstanding) / loaded)} of what was loaded` : undefined} />
        <Stat label="Cards with money left" value={String(gift.cards.filter((c) => c.balanceCents > 0).length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sell a gift card" note="Take the payment, then give the customer the code. No plastic needed.">
          <div className="space-y-2">
            <input className={field} placeholder="Who is it for?" value={name} onChange={(e) => setName(e.target.value)} aria-label="Who the card is for" />
            <div className="flex flex-wrap gap-2">
              {AMOUNTS.map((a) => (
                <button key={a} onClick={() => setAmount(a)} className={`tabular rounded-full px-4 py-2 text-sm font-bold ${amount === a ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{moneyShort(a)}</button>
              ))}
            </div>
            <button className={btn.dark} onClick={() => { setSold(gift.sell(name, amount).code); setName(''); }}>Sell {moneyShort(amount)} card</button>
            {newest && (
              <div className="rounded-xl bg-box-50 p-3 text-center">
                <p className="text-xs font-semibold text-box-700">New card for {newest.name}</p>
                <p className="tabular font-display text-2xl font-extrabold tracking-widest text-slate-900">{newest.code}</p>
                <p className="text-xs text-slate-600">{money(newest.balanceCents)} loaded. Use this code at the register.</p>
              </div>
            )}
          </div>
        </Card>
        <Card title="Check a balance">
          <input className={field + ' uppercase tracking-widest'} placeholder="ABCD-2345" value={lookup} onChange={(e) => setLookup(e.target.value)} aria-label="Gift card code" />
          {lookup.replace(/[^a-z0-9]/gi, '').length >= 8 && (
            found
              ? <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">{found.name}</span> has <span className="tabular font-display text-xl font-bold">{money(found.balanceCents)}</span> left of {money(found.loadedCents)}.</p>
              : <p className="mt-3 text-sm text-rose-600">No card with that code.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Money on a gift card is not a sale yet. It counts as income when the customer spends it, so the unspent balance above is what the shop still owes.</p>
        </Card>
      </div>

      <Card title="Cards">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Code</th><th className="pb-1.5 font-medium">For</th><th className="pb-1.5 font-medium">Sold</th><th className="pb-1.5 text-right font-medium">Loaded</th><th className="pb-1.5 text-right font-medium">Left</th><th className="pb-1.5 pl-4 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {gift.cards.map((c) => (
                <tr key={c.code}>
                  <td className="tabular py-1.5 font-mono text-xs font-semibold">{c.code}</td>
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 text-slate-600">{shortDate(c.sold)}</td>
                  <td className="tabular py-1.5 text-right text-slate-600">{money(c.loadedCents)}</td>
                  <td className="tabular py-1.5 text-right font-semibold">{money(c.balanceCents)}</td>
                  <td className="py-1.5 pl-4"><Pill tone={c.balanceCents === 0 ? 'slate' : c.balanceCents < c.loadedCents ? 'amber' : 'green'}>{c.balanceCents === 0 ? 'Used up' : c.balanceCents < c.loadedCents ? 'Partly used' : 'Unused'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DemoNote>Demo: example cards. To pay with one, ring up a sale on the register and tap Gift card.</DemoNote>
    </div>
  );
}

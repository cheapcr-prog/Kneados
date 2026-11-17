import { ChevronDown, ExternalLink, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Brain, Card, Pill, Stat } from '../../pages/owner/ui';
import { shortDate } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import type { PizzaBrain } from '../brain';
import { usePizza } from '../store';
import { CHANNEL_LABEL, adLink, mailRow, promoRow, totalsOf, type ChannelRow, type MarketingChannel } from '../marketing';

const CHANNELS: MarketingChannel[] = ['postcard', 'text', 'deal', 'google', 'meta'];
const TONE: Record<MarketingChannel, 'blue' | 'green' | 'amber' | 'red' | 'dark'> = { postcard: 'blue', text: 'green', deal: 'amber', google: 'red', meta: 'dark' };
const COLOR: Record<MarketingChannel, string> = { postcard: '#0284c7', text: '#059669', deal: '#d97706', google: '#dc2626', meta: '#334155' };

/** Every campaign, every channel, measured the same way and tied to the orders it brought in. */
export function ResultsPage({ brain }: { brain: PizzaBrain }) {
  const { state } = usePizza();
  const food = brain.facts.last30Days.foodCostShare;
  const rows = [...state.campaigns.map((c) => mailRow(c, food)), ...state.promos.map((p) => promoRow(p, food))].sort((a, b) => b.profitCents - a.profitCents);
  const all = totalsOf(rows);
  const byChannel = CHANNELS.map((ch) => ({ ch, ...totalsOf(rows.filter((r) => r.channel === ch)) })).filter((c) => c.orders || c.spendCents);
  const paid = byChannel.filter((c) => c.spendCents > 0).map((c) => ({ ...c, perDollar: c.profitCents / c.spendCents })).sort((a, b) => b.perDollar - a.perDollar);
  const cheapestNew = byChannel.filter((c) => c.newCustomers > 0 && c.spendCents > 0).map((c) => ({ ...c, perNew: c.spendCents / c.newCustomers })).sort((a, b) => a.perNew - b.perNew)[0];
  const recent = rows.flatMap((r) => r.redemptions.map((x) => ({ ...x, row: r }))).sort((a, b) => Number(!!b.live) - Number(!!a.live) || b.date.localeCompare(a.date) || b.orderNumber - a.orderNumber).slice(0, 25);
  const ads = state.promos.filter((p) => p.utm && state.today <= p.endsOn);
  return (
    <>
      <Brain label="Marketing results" title="Every campaign, tied to the orders it brought in">
        <p>{rows.length} campaigns across postcards, texts, deals and ads brought in {all.orders} orders and {money(all.salesCents)} in sales. You paid out {money(all.spendCents)} and gave {money(all.giveawayCents)} in discounts and free food; profit after all of it is {money(all.profitCents)}.</p>
        {paid[0] && <p>Best return on money paid out: {CHANNEL_LABEL[paid[0].ch].toLowerCase()}, {money(Math.round(paid[0].perDollar * 100))} profit for every $1 spent.{paid.length > 1 && paid[paid.length - 1].perDollar < 0 ? ` ${CHANNEL_LABEL[paid[paid.length - 1].ch]} have not paid back yet on first orders.` : ''}</p>}
        {cheapestNew && <p>Cheapest new customers: {CHANNEL_LABEL[cheapestNew.ch].toLowerCase()}, {money(Math.round(cheapestNew.perNew))} each.</p>}
        <p className="text-slate-400">Each order counts for one campaign only: the code on it first, then the ad link the customer came from, then the deal on the ticket.</p>
      </Brain>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paid out" value={moneyShort(all.spendCents)} sub="Postage, texting fees and ad spend" />
        <Stat label="Orders from marketing" value={String(all.orders)} sub={`${money(all.salesCents)} in sales`} />
        <Stat label="Profit after marketing" value={moneyShort(all.profitCents)} tone={all.profitCents >= 0 ? 'good' : 'bad'} sub={`After food, ${money(all.giveawayCents)} of discounts and freebies, and what was paid out`} />
        <Stat label="New customers" value={String(all.newCustomers)} sub={`${all.repeatCustomers} of them have ordered again since`} />
      </div>

      <Card title="By channel" note="Profit = sales after discounts, less their food cost, less food given away free, less money paid out.">
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Channel</th><th>Paid out</th><th>Discounts & free food</th><th>Orders</th><th>Sales</th><th>Profit</th><th>New</th><th>Came back</th></tr></thead>
              <tbody>
                {byChannel.map((c) => (
                  <tr key={c.ch} className="border-t border-slate-100">
                    <td className="py-1.5"><Pill tone={TONE[c.ch]}>{CHANNEL_LABEL[c.ch]}</Pill></td>
                    <td>{money(c.spendCents)}</td><td>{money(c.giveawayCents)}</td><td>{c.orders}</td><td>{money(c.salesCents)}</td>
                    <td className={`font-bold ${c.profitCents >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{money(c.profitCents)}</td>
                    <td>{c.newCustomers}</td><td>{c.repeatCustomers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byChannel.map((c) => ({ name: CHANNEL_LABEL[c.ch].split(' ')[0], profit: Math.round(c.profitCents / 100), ch: c.ch }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => [`$${v}`, 'Profit']} />
              <Bar dataKey="profit">{byChannel.map((c) => <Cell key={c.ch} fill={COLOR[c.ch]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Every campaign" note="Sorted by profit. Open one to see the orders it brought in.">
        <div className="space-y-2">{rows.map((r) => <CampaignLine key={r.id} r={r} />)}</div>
      </Card>

      <Card title="Latest orders from marketing" note="The newest orders credited to a campaign, and how each was matched.">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Order</th><th>Date</th><th>Customer</th><th>Campaign</th><th>Matched by</th><th>Came in by</th><th>Sale</th><th /></tr></thead>
            <tbody>
              {recent.map((x, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold">#{x.orderNumber}</td><td>{shortDate(x.date)}</td><td>{x.name}</td>
                  <td><Pill tone={TONE[x.row.channel]}>{CHANNEL_LABEL[x.row.channel]}</Pill> <span className="text-xs">{x.row.name}</span></td>
                  <td className="text-xs">{x.code ? <span className="font-mono">{x.code}</span> : x.row.matchedBy}</td><td className="text-xs">{x.channel}</td><td>{money(x.subtotalCents)}</td>
                  <td>{x.live ? <Pill tone="green">Just now</Pill> : x.newCustomer ? <Pill tone="blue">New</Pill> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Try it as a customer" note="Open an ad link or use a code, place the order, and come back: it shows up above under that campaign.">
        <div className="grid gap-2 md:grid-cols-2">
          {ads.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-bold">{p.name}</p>
              <p className="break-all font-mono text-[11px] text-slate-500">{adLink(p.utm!)}</p>
              <Link to={`/pizza/demo/shop?utm_source=${p.utm!.source}&utm_medium=${p.utm!.medium}&utm_campaign=${p.utm!.campaign}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-xs font-bold text-white"><ExternalLink size={12} /> Click the ad</Link>
            </div>
          ))}
          <div className="rounded-xl border border-slate-200 p-3 text-sm">
            <p className="font-bold">Deals</p>
            <p className="text-xs text-slate-500">Turn a deal on in Menu & prices, then order on the AI phone & text screen. The deal on the ticket credits the order to it.</p>
            <div className="mt-2 flex gap-2"><Link to="/pizza/demo/owner/menu" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">Menu & prices</Link><Link to="/pizza/demo/ai" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">AI phone & text</Link></div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 text-sm">
            <p className="font-bold">Postcards and texts</p>
            <p className="text-xs text-slate-500">Send a mailing in Postcards, or approve the win-back texts in the Briefing; each person gets their own code.</p>
            <Link to="/pizza/demo/owner/marketing" className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">Postcards</Link>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Example data: ad spend, views and clicks, texting fees and past orders are made up for the demo shop. A live shop reads spend and clicks from its Google Ads and Meta accounts and texting fees from its Twilio bill. Deals are counted as bringing in every order they were used on, though some of those customers would have ordered anyway.</p>
      </Card>
    </>
  );
}

function CampaignLine({ r }: { r: ChannelRow }) {
  const [open, setOpen] = useState(false);
  return (
    <article data-mkt={r.id} className="rounded-xl border border-slate-200 p-3">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <Megaphone size={15} className="text-slate-400" />
        <Pill tone={TONE[r.channel]}>{CHANNEL_LABEL[r.channel]}</Pill>
        <span className="font-bold">{r.name}</span>
        <span className="text-xs text-slate-500">since {shortDate(r.startedOn)} · {r.detail} · matched by {r.matchedBy.toLowerCase()}</span>
        <span className="tabular ml-auto flex flex-wrap gap-x-4 text-sm">
          <span>{r.orders} orders</span><span>{money(r.salesCents)}</span>
          <span className={`font-bold ${r.profitCents >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{money(r.profitCents)}</span>
          <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
        </span>
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <p className="mb-1 text-xs text-slate-500">Paid out {money(r.spendCents)} · discounts and free food {money(r.giveawayCents)} · {r.newCustomers} new customers, {r.repeatCustomers} ordered again since</p>
          <table className="tabular w-full text-sm">
            <tbody>
              {[...r.redemptions].reverse().slice(0, 20).map((x, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 font-semibold">#{x.orderNumber}</td><td>{shortDate(x.date)}</td><td>{x.name}</td><td className="font-mono text-xs">{x.code}</td><td className="text-xs">{x.channel}</td><td>{money(x.subtotalCents)}</td>
                  <td>{x.live ? <Pill tone="green">Just now</Pill> : x.newCustomer ? <Pill tone="blue">New</Pill> : null}</td>
                </tr>
              ))}
              {!r.redemptions.length && <tr><td className="py-1 text-slate-500">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

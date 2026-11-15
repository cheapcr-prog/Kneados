import { PackagePlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MerchArt, useMerch } from '../../components/Merch';
import { MERCH_BY_ID } from '../../data/merch';
import { shortDate } from '../../lib/dates';
import { stockKey } from '../../lib/merch';
import { money, moneyShort } from '../../lib/money';
import { Brain, Card, Demo, Pill, Stat, btn } from './ui';

/** The merch shelf: stock, what sells, what it earns and what to reorder. */
export function Merch({ today }: { today: string }) {
  const merch = useMerch();
  const rows = merch.rows;
  const sales = rows.reduce((a, r) => a + r.salesCents, 0);
  const profit = rows.reduce((a, r) => a + r.profitCents, 0);
  const shelf = rows.reduce((a, r) => a + r.onHand * r.item.costCents, 0);
  const low = rows.filter((r) => r.reorder);
  const best = [...rows].sort((a, b) => b.profitCents - a.profitCents)[0];
  const soldOutSizes = rows.filter((r) => r.out.length > 0);
  return (
    <div className="space-y-4">
      <Brain label="KneadOS merch" title={low.length > 0 ? `Reorder ${low.map((r) => r.item.name).join(' and ')}` : 'The merch shelf is stocked'}>
        <p>Merch and extras brought in {money(sales)} over the last 28 days and kept {money(profit)} after what the items cost you. {best.item.name} earns the most, {money(best.profitCents)}.</p>
        {soldOutSizes.length > 0 && <p>{soldOutSizes.map((r) => `${r.item.name} is out of size ${r.out.join(' and ')}`).join('. ')}. The shop site shows those sizes as sold out, so nobody orders one you cannot hand over.</p>}
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Merch sales, 28 days" value={moneyShort(sales)} sub={`${rows.reduce((a, r) => a + r.sold28, 0)} items`} tone="good" />
        <Stat label="Kept after cost" value={moneyShort(profit)} sub={sales > 0 ? `${Math.round((profit / sales) * 100)}% of merch sales` : undefined} tone="good" />
        <Stat label="On the shelf" value={moneyShort(shelf)} sub="at what you paid" />
        <Stat label="To reorder" value={String(low.length)} sub={low.length > 0 ? low.map((r) => r.item.name).join(', ') : 'nothing is low'} tone={low.length > 0 ? 'bad' : undefined} />
      </div>

      <Card title="Shelf" note="Sold on the shop website with pickup orders. Each sale comes off the count." action={<Link to="/demo/shop#merch" className={btn.light}>See it on the shop site</Link>}>
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <MerchArt item={r.item} size={44} />
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{r.item.name}{r.item.kind === 'extra' && <Pill>Extra</Pill>}{r.reorder && <Pill tone="amber">Low</Pill>}</p>
                <p className="text-sm text-slate-600">{money(r.item.priceCents)} each, costs {money(r.item.costCents)} · keeps {Math.round(r.margin * 100)}%</p>
                {r.item.sizes && <p className="text-xs text-slate-500">{r.item.sizes.map((s) => `${s}: ${merch.stock[stockKey(r.item.id, s)] ?? 0}`).join(' · ')}</p>}
              </div>
              <div className="text-right">
                <p className="tabular font-display text-lg font-bold">{r.onHand}<span className="text-xs font-medium text-slate-500"> on hand</span></p>
                <p className="text-xs text-slate-500">{r.sold28} sold in 28 days{r.daysLeft !== undefined ? ` · about ${r.daysLeft} days left` : ''}</p>
                {r.reorder && <button className={btn.green + ' mt-1.5'} onClick={() => merch.reorder(r.item.id, today)}><PackagePlus size={12} /> Reorder {r.item.reorderQty} from {r.item.supplier}</button>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {merch.reorders.length > 0 && (
        <Card title="Reorders placed">
          <ul className="space-y-1 text-sm text-slate-700">
            {merch.reorders.map((o, i) => <li key={i}>{shortDate(o.date)}: {o.qty} {MERCH_BY_ID[o.id].name} from {MERCH_BY_ID[o.id].supplier}, {money(o.qty * MERCH_BY_ID[o.id].costCents)}</li>)}
          </ul>
        </Card>
      )}
      <Demo>Demo: the items, costs, suppliers and the sales before today are examples. A reorder here adds the stock right away and no order is sent to a supplier.</Demo>
    </div>
  );
}

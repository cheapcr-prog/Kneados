import { Building2, Check, CreditCard, Landmark, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { invoiceState } from '../../lib/channels';
import { money } from '../../lib/money';
import { PIZZA_SHOP, SIDE_BY_ID } from '../data';
import { INVOICE_TERMS_DAYS, pizzaTitle } from '../logic';
import { usePizza } from '../store';

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * The page behind the pay link in an invoice email. The company sees the invoice, with their PO on it,
 * and pays by card or bank transfer. Paying marks it paid on the owner's side right away.
 */
export function PayInvoice() {
  const { id } = useParams();
  const { state, payInvoice } = usePizza();
  const inv = state.invoices.find((i) => i.id === id);
  const [method, setMethod] = useState<'card' | 'bank'>('bank');
  const [paying, setPaying] = useState(false);
  if (!inv) return <div className="mx-auto max-w-xl p-8 text-center text-slate-600">That invoice was not found. <Link to="/pizza/demo/shop" className="font-semibold text-emerald-700">Back to the shop</Link></div>;
  const order = state.orders.find((o) => o.id === inv.orderId);
  const st = invoiceState(inv, state.today);
  const lines = order
    ? order.lines.map((l) => ({ label: l.kind === 'pizza' ? pizzaTitle(l) : SIDE_BY_ID[l.sideId]?.name ?? l.sideId, qty: l.qty, cents: l.unitCents * l.qty }))
    : [{ label: inv.memo, qty: 1, cents: inv.totalCents }];
  const pay = () => { setPaying(true); setTimeout(() => { payInvoice(inv.id); setPaying(false); }, 900); };

  return (
    <div className="min-h-full bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-extrabold">{PIZZA_SHOP.name}</p>
            <p className="text-sm text-slate-500">{PIZZA_SHOP.address} · {PIZZA_SHOP.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Invoice</p>
            <p className="font-display text-2xl font-bold">#{inv.number}</p>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${st === 'paid' ? 'bg-emerald-100 text-emerald-800' : st === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
              {st === 'paid' ? `Paid ${inv.paidOn ? longDate(inv.paidOn) : ''}` : st === 'overdue' ? 'Past due' : 'Open'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Bill to</p>
            <p className="mt-1 flex items-center gap-1.5 font-semibold"><Building2 size={14} /> {inv.company}</p>
            <p className="text-slate-600">Attn: {inv.contact}</p>
            <p className="text-slate-600">{inv.email}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Details</p>
            {inv.po && <p className="mt-1"><span className="text-slate-500">PO</span> <b>{inv.po}</b></p>}
            <p className={inv.po ? '' : 'mt-1'}><span className="text-slate-500">Order</span> #{inv.orderNumber}</p>
            <p><span className="text-slate-500">Lunch</span> {longDate(inv.serviceDate)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Terms</p>
            <p className="mt-1">Net {INVOICE_TERMS_DAYS}</p>
            <p><span className="text-slate-500">Issued</span> {longDate(inv.issued)}</p>
            <p><span className="text-slate-500">Due</span> <b>{longDate(inv.due)}</b></p>
          </div>
        </div>

        <table className="tabular mt-6 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-2">{inv.memo}</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => <tr key={i} className="border-b border-slate-100"><td className="py-2">{l.label}</td><td className="py-2 text-right">{l.qty}</td><td className="py-2 text-right">{money(l.cents)}</td></tr>)}
          </tbody>
          <tfoot>
            {order && <tr><td colSpan={2} className="pt-3 text-right text-slate-500">Subtotal</td><td className="pt-3 text-right">{money(order.subtotal)}</td></tr>}
            {order && order.tax > 0 && <tr><td colSpan={2} className="text-right text-slate-500">Sales tax</td><td className="text-right">{money(order.tax)}</td></tr>}
            <tr className="text-base font-bold"><td colSpan={2} className="pt-2 text-right">{st === 'paid' ? 'Total paid' : 'Amount due'}</td><td className="pt-2 text-right">{money(inv.totalCents)}</td></tr>
          </tfoot>
        </table>

        {st === 'paid' ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><Check size={18} /> Paid. A receipt went to {inv.email}. Thank you!</div>
        ) : (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-bold">Pay this invoice</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([['bank', Landmark, 'Bank transfer (ACH)', 'No fee'], ['card', CreditCard, 'Card', '3% card fee']] as const).map(([k, Icon, name, note]) => (
                <button key={k} onClick={() => setMethod(k)} aria-pressed={method === k} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${method === k ? 'border-emerald-600 bg-white ring-2 ring-emerald-600' : 'border-slate-200 bg-white'}`}>
                  <Icon size={18} className="shrink-0 text-slate-600" /><span><b className="block">{name}</b><span className="text-xs text-slate-500">{note}</span></span>
                </button>
              ))}
            </div>
            <button disabled={paying} onClick={pay} className="mt-3 w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {paying ? 'Paying…' : `Pay ${money(method === 'card' ? Math.round(inv.totalCents * 1.03) : inv.totalCents)}`}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">Demo: no money moves. Paying marks the invoice paid on the owner's dashboard.</p>
          </div>
        )}
        <button onClick={() => window.print()} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><Printer size={13} /> Print or save as PDF</button>
      </div>
    </div>
  );
}

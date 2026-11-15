import { Check, FileText, Mail, PackageCheck, Send, ShoppingCart, Sparkles, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SHOP } from '../../data/shop';
import type { Demo } from '../../data/store';
import { DOW_SHORT, longDate, shortDate, timeLabel } from '../../lib/dates';
import { formatPhone, money } from '../../lib/money';
import { draftPO, poEmail, type PurchaseOrder, type Supplier } from '../../lib/purchasing';
import type { SupplyPlan } from '../../lib/supplies';

/**
 * Sends today's purchase order to every supplier set to "send by itself".
 * An order under the supplier's minimum is held for the owner instead.
 */
export function useAutoPurchasing(demo: Demo, plans: SupplyPlan[]) {
  const { today, pos } = demo.state;
  useEffect(() => {
    for (const supplier of demo.suppliers) {
      if (!supplier.autoSend || supplier.pickup || !(supplier.email || supplier.web)) continue;
      const draft = draftPO(supplier, plans, today);
      if (!draft || draft.belowMinimum || pos.some((p) => p.id === draft.id)) continue;
      demo.savePO({ ...draft, status: 'sent', auto: true, sentAt: new Date().toISOString() });
    }
    // Runs again whenever the plans or the supplier settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, demo.suppliers, today, pos]);
}

const STATUS = {
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-700' },
  sent: { label: 'Sent', pill: 'bg-sky-100 text-sky-800' },
  received: { label: 'Received', pill: 'bg-emerald-100 text-emerald-800' },
};

function Lines({ po }: { po: PurchaseOrder }) {
  return (
    <ul className="mt-3 divide-y divide-slate-100">
      {po.lines.map((l) => (
        <li key={l.supplyId} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <span className="min-w-0">
            <span className="font-semibold text-slate-900">{l.packs} × {l.packLabel}</span> <span className="text-slate-600">{l.name}</span>
            {l.early && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">added early to reach the minimum</span>}
          </span>
          <span className="tabular shrink-0 text-slate-700">{money(l.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PurchasingPanel({ demo, plans }: { demo: Demo; plans: SupplyPlan[] }) {
  const { today, pos } = demo.state;
  const [open, setOpen] = useState<string | null>(null);
  const supplierOf = (name: string) => demo.suppliers.find((s) => s.name === name)!;
  /** Orders that still need the owner: approve-first suppliers, pickup runs, and anything under a minimum. */
  const waiting = demo.suppliers.flatMap((s) => {
    const draft = draftPO(s, plans, today);
    const goesByItself = s.autoSend && !s.pickup && !!(s.email || s.web) && draft && !draft.belowMinimum;
    return draft && !goesByItself && !pos.some((p) => p.id === draft.id) ? [{ supplier: s, draft }] : [];
  });
  const send = (po: PurchaseOrder) => demo.savePO({ ...po, status: 'sent', sentAt: new Date().toISOString() });
  const receive = (po: PurchaseOrder) => demo.savePO({ ...po, status: 'received', receivedAt: new Date().toISOString() });
  const viewing = pos.find((p) => p.id === open);
  const autoToday = pos.filter((p) => p.auto && p.date === today);

  return (
    <>
      {autoToday.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-1.5 font-bold"><Sparkles size={15} /> KneadOS sent {autoToday.length} purchase order{autoToday.length === 1 ? '' : 's'} for you today</p>
          <p className="mt-0.5">
            {autoToday.map((p) => `PO-${p.number} to ${p.supplier} for ${money(p.totalCents)}`).join(', and ')}. These suppliers are set to send without asking. You can change that under Suppliers below.
          </p>
        </section>
      )}

      {waiting.map(({ supplier, draft }) => (
        <section key={draft.id} className="rounded-2xl border border-rose-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold tracking-tight">
                {supplier.pickup ? `Shopping list for ${supplier.name}` : `Purchase order for ${supplier.name}`}
              </h3>
              <p className="text-xs text-slate-500">
                {supplier.pickup
                  ? 'A same-day pickup run, so there is nothing to email.'
                  : draft.belowMinimum
                    ? `Held for you: the total is under their ${money(supplier.minOrderCents)} minimum.`
                    : `Waiting for your OK. ${supplier.web ? `It is placed in the online store at ${supplier.web}` : `Goes to ${supplier.email}`}, arrives ${longDate(draft.expected)}.`}
                {' '}Total about {money(draft.totalCents)}.
              </p>
            </div>
            {supplier.pickup ? (
              <button onClick={() => demo.savePO({ ...draft, status: 'received', sentAt: new Date().toISOString(), receivedAt: new Date().toISOString() })} className="flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-ink-700">
                <ShoppingCart size={15} /> Picked up and put away
              </button>
            ) : (
              <button onClick={() => send(draft)} className="flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-ink-700">
                <Send size={15} /> Approve and send
              </button>
            )}
          </div>
          <Lines po={draft} />
          {draft.lines.filter((l) => !l.early).map((l) => {
            const plan = plans.find((p) => p.supply.id === l.supplyId);
            return plan ? <p key={l.supplyId} className="mt-1 text-xs text-slate-500">{l.name}: {plan.reason}</p> : null;
          })}
        </section>
      ))}

      {pos.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"><Truck size={18} /> Purchase orders</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {pos.map((po) => (
              <li key={po.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-sm font-semibold text-slate-900">
                    PO-{po.number} · {po.supplier}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[po.status].pill}`}>{STATUS[po.status].label}</span>
                    {po.auto && <span className="ml-1.5 rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-bold text-white">Sent by KneadOS</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {po.lines.map((l) => `${l.packs} × ${l.name.toLowerCase()}`).join(', ')}
                    <span className="block">
                      {po.status === 'received'
                        ? `Received ${timeLabel(po.receivedAt!)} and added to stock.`
                        : `${po.to ? `${po.to.includes('@') ? 'Emailed to' : 'Placed at'} ${po.to} at ${timeLabel(po.sentAt!)}. ` : ''}Arrives ${longDate(po.expected)}.`}
                    </span>
                  </p>
                </div>
                <p className="tabular font-display text-lg font-bold">{money(po.totalCents)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setOpen(po.id)} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"><FileText size={14} /> View</button>
                  {po.status === 'sent' && (
                    <button onClick={() => receive(po)} className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><PackageCheck size={14} /> Delivery received</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-display text-lg font-bold tracking-tight">Suppliers</h3>
        <p className="text-xs text-slate-500">Set up each supplier once. KneadOS addresses every purchase order from this, and sends it by itself unless you ask to approve first.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {demo.suppliers.map((s) => <SupplierCard key={s.name} supplier={s} onChange={(patch) => demo.updateSupplier(s.name, patch)} />)}
        </div>
      </section>

      {viewing && <PODocument po={viewing} supplier={supplierOf(viewing.supplier)} onClose={() => setOpen(null)} />}
    </>
  );
}

const input = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-glaze-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
      <span className="mt-0.5 block normal-case tracking-normal">{children}</span>
    </label>
  );
}

function SupplierCard({ supplier: s, onChange }: { supplier: Supplier; onChange: (patch: Partial<Supplier>) => void }) {
  const toggleDay = (d: number) => onChange({ deliveryDays: s.deliveryDays.includes(d) ? s.deliveryDays.filter((x) => x !== d) : [...s.deliveryDays, d].sort() });
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="font-semibold text-slate-900">{s.name}</p>
      {s.web && <p className="mt-1 text-sm text-slate-600">Orders are placed in their online store at <span className="font-semibold">{s.web}</span>, so there is no rep or order email.</p>}
      {s.pickup ? (
        <p className="mt-1 text-sm text-slate-600">A store you drive to. KneadOS writes the shopping list on the morning you need to go. {s.account}</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Rep"><input className={input} value={s.rep} onChange={(e) => onChange({ rep: e.target.value })} /></Field>
            <Field label="Account number"><input className={input} value={s.account} onChange={(e) => onChange({ account: e.target.value })} /></Field>
            <Field label="Order email"><input className={input} type="email" value={s.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>
            <Field label="Phone"><input className={input} inputMode="tel" value={formatPhone(s.phone)} onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></Field>
            <Field label="Minimum order">
              <span className="flex items-center gap-1"><span className="text-slate-500">$</span><input className={input} inputMode="numeric" value={String(Math.round(s.minOrderCents / 100))} onChange={(e) => onChange({ minOrderCents: (Number(e.target.value.replace(/\D/g, '')) || 0) * 100 })} /></span>
            </Field>
            <Field label="Delivers on">
              <span className="flex flex-wrap gap-1 pt-0.5">
                {DOW_SHORT.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i)} aria-pressed={s.deliveryDays.includes(i)} className={`rounded-md px-1.5 py-1 text-[11px] font-semibold ${s.deliveryDays.includes(i) ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{d}</button>
                ))}
              </span>
            </Field>
          </div>
          <label className="mt-3 flex items-start gap-2.5 border-t border-slate-100 pt-3 text-sm">
            <input type="checkbox" checked={!s.autoSend} onChange={(e) => onChange({ autoSend: !e.target.checked })} className="mt-0.5 h-4 w-4 accent-teal-600" />
            <span>
              <span className="font-semibold">Let me approve each order first.</span>{' '}
              <span className="text-slate-500">{s.autoSend ? (s.web ? 'Off: KneadOS places the order by itself on the day it is due. In this demo the order is only marked as placed.' : 'Off: KneadOS emails the purchase order by itself on the day it is due.') : 'On: the order waits here until you tap Approve and send.'}</span>
            </span>
          </label>
        </>
      )}
    </div>
  );
}

/** The purchase order as the supplier sees it, with the email it went out in. */
function PODocument({ po, supplier, onClose }: { po: PurchaseOrder; supplier: Supplier; onClose: () => void }) {
  const mail = poEmail(SHOP, supplier, po, longDate(po.expected));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="font-display text-lg font-bold">Purchase order PO-{po.number}</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">From</p>
              <p className="font-semibold">{SHOP.name}</p>
              <p className="text-slate-600">{SHOP.address}</p>
              <p className="text-slate-600">{SHOP.phone}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">To</p>
              <p className="font-semibold">{supplier.name}</p>
              {supplier.rep && <p className="text-slate-600">Attn: {supplier.rep}</p>}
              {supplier.email && <p className="text-slate-600">{supplier.email}</p>}
              {supplier.web && <p className="text-slate-600">Online store: {supplier.web}</p>}
              {supplier.phone && <p className="text-slate-600">{formatPhone(supplier.phone)}</p>}
              {supplier.account && <p className="text-slate-600">Account {supplier.account}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>Ordered <span className="font-semibold text-slate-900">{shortDate(po.date)}</span></span>
            <span>Deliver by <span className="font-semibold text-slate-900">{longDate(po.expected)}</span></span>
            <span>Status <span className="font-semibold text-slate-900">{STATUS[po.status].label}</span></span>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr><th className="pb-1.5">Item</th><th className="pb-1.5 text-right">Qty</th><th className="pb-1.5 text-right">Pack</th><th className="pb-1.5 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.lines.map((l) => (
                <tr key={l.supplyId}>
                  <td className="py-2 font-semibold text-slate-900">{l.name}</td>
                  <td className="tabular py-2 text-right">{l.packs}</td>
                  <td className="py-2 text-right text-slate-600">{l.packLabel}</td>
                  <td className="tabular py-2 text-right">{money(l.cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900"><td colSpan={3} className="py-2 font-bold">Estimated total</td><td className="tabular py-2 text-right font-display text-lg font-bold">{money(po.totalCents)}</td></tr>
            </tfoot>
          </table>
          {supplier.email && (
            <div className="mt-4 rounded-xl border border-slate-200">
              <p className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                <Mail size={13} /> {po.sentAt ? `Emailed ${timeLabel(po.sentAt)}` : 'Email'} to {supplier.email}
                {po.sentAt && <Check size={13} className="text-emerald-600" />}
              </p>
              <p className="px-3 pt-2 text-sm font-semibold text-slate-900">{mail.subject}</p>
              <pre className="whitespace-pre-wrap px-3 pb-3 pt-1 font-sans text-[13px] leading-relaxed text-slate-700">{mail.body}</pre>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Demo: the supplier and email address are made up, so nothing is really sent. A live shop's orders go out by email with this PDF attached.</p>
        </div>
      </div>
    </div>
  );
}

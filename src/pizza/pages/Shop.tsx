import { Bike, Check, ChevronRight, Clock, Minus, Plus, ShoppingBag, Sparkles, Store, Trophy, X } from 'lucide-react';
import { useFraud } from '../../components/Fraud';
import { DECLINED_DEMO_CARD, GOOD_DEMO_CARD, demoCardOk, failedTries, orderRisk, triesLeft } from '../../lib/fraud';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTick } from '../../components/Breaks';
import { formatPhone, money } from '../../lib/money';
import { ADDRESSES, PIZZA_SHOP, SIDES, SIDE_BY_ID, SIZES, SPECIALTIES, ZONES, type PizzaConfig, type SizeId } from '../data';
import { DEPOSIT_SHARE, INVOICE_TERMS_DAYS, MINUTE, PACKS, payPath, validEmail, type PizzaInvoice, configFor, lineCents, packLines, packValue, pizzaDetails, pizzaPrice, pizzaTitle, quoteTime, totals, upsells, zoneFor, type Line, type PizzaLine, type PizzaOrder } from '../logic';
import { Builder, Oven, reducedMotion } from '../Builder';
import { usePizza } from '../store';
import { usePizzaBrain } from '../brain';

const STATUS_STEPS: { id: PizzaOrder['status']; label: string }[] = [
  { id: 'new', label: 'Order in' }, { id: 'oven', label: 'In the oven' }, { id: 'ready', label: 'Boxed' }, { id: 'out', label: 'On the way' }, { id: 'done', label: 'Delivered' },
];

export function PizzaShop() {
  useTick(15_000);
  const demo = usePizza();
  const { state, history, placeOrder } = demo;
  const brain = usePizzaBrain(demo, Date.now());
  const [cart, setCart] = useState<Line[]>([]);
  const [building, setBuilding] = useState<{ specialtyId?: string; size?: SizeId } | null>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  // Once the order is paid, every pizza in it goes into the oven together before the confirmation shows.
  const [baking, setBaking] = useState<{ id: string; number: number; configs: PizzaConfig[] } | null>(null);
  const [toast, setToast] = useState('');

  const add = (l: Line) => {
    setCart((c) => [...c, l]);
    setToast(l.kind === 'pizza' ? `${pizzaTitle(l)} added` : `${SIDE_BY_ID[l.sideId].name} added`);
    window.setTimeout(() => setToast(''), 1800);
  };
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const placedOrder = placed ? state.orders.find((o) => o.id === placed) : undefined;
  const big = brain.big;

  return (
    <div className="min-h-full bg-[#fbf7ef] text-slate-900">
      {/* Shop header */}
      <header className="relative overflow-hidden bg-[#10261c] text-white">
        <img src="/pizza/hero-oven.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#10261c] via-[#10261c]/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-5 py-12 md:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">{PIZZA_SHOP.city} · {PIZZA_SHOP.hours}</p>
          <h1 className="mt-3 max-w-xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">{PIZZA_SHOP.name}</h1>
          <p className="mt-3 max-w-lg text-lg text-emerald-50/90">{PIZZA_SHOP.tagline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => setBuilding({})} className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-400"><Sparkles size={16} /> Build your pizza</button>
            <a href="#menu" className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold hover:bg-white/10">See the menu</a>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-emerald-50/90">
            <span className="flex items-center gap-1.5"><Store size={15} /> Pickup in about {brain.quotePickup.minutes} min</span>
            <span className="flex items-center gap-1.5"><Bike size={15} /> Delivery in about {brain.quoteDelivery.minutes} min</span>
          </div>
        </div>
      </header>

      {/* Game day banner */}
      <section className="bg-emerald-600 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Trophy size={16} /> {big.name} is {new Date(big.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. Pre-order a pack and skip the rush.</p>
          <a href="#packs" className="flex items-center gap-1 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold hover:bg-white/25">Game-day packs <ChevronRight size={14} /></a>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section id="menu">
          <h2 className="font-display text-3xl font-bold tracking-tight">Pizzas</h2>
          <p className="mt-1 text-sm text-slate-600">Every pie starts as dough we make 48 hours ahead. Tap Customize to change anything, or put toppings on half.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIALTIES.map((sp) => (
              <article key={sp.id} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="relative aspect-[4/3]">
                  <img src={sp.photo} alt={sp.name} loading="lazy" className="h-full w-full object-cover" />
                  {sp.tag && <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">{sp.tag}</span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display text-xl font-bold">{sp.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-slate-600">{sp.blurb}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {SIZES.map((s) => {
                      const cfg = configFor(sp.id, s.id);
                      return (
                        <button key={s.id} onClick={() => add({ kind: 'pizza', config: cfg, specialtyId: sp.id, qty: 1, unitCents: pizzaPrice(cfg, sp.id).cents })} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold hover:border-emerald-500 hover:bg-emerald-50">
                          {s.inches}" {money(sp.prices[s.id])}
                        </button>
                      );
                    })}
                    <button onClick={() => setBuilding({ specialtyId: sp.id })} className="ml-auto rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Customize</button>
                  </div>
                </div>
              </article>
            ))}
            <article className="flex flex-col justify-between overflow-hidden rounded-3xl bg-[#10261c] p-5 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Build your own</p>
                <h3 className="mt-2 font-display text-2xl font-bold">Your pizza, your way</h3>
                <p className="mt-2 text-sm text-emerald-50/80">Pick a size and crust, then tap toppings onto the whole pie or just one half. Watch it come together and see the price as you go.</p>
              </div>
              <button onClick={() => setBuilding({})} className="mt-5 flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold hover:bg-emerald-400"><Sparkles size={16} /> Start building</button>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-3xl font-bold tracking-tight">Wings, sides and drinks</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SIDES.map((s) => (
              <article key={s.id} className="flex gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <img src={s.photo} alt={s.name} loading="lazy" className="h-24 w-24 shrink-0 rounded-2xl object-cover" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="font-bold">{s.name}</h3>
                  <p className="flex-1 text-xs text-slate-600">{s.blurb}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="tabular text-sm font-bold">{money(s.cents)}</span>
                    {state.out.includes(s.id) ? <span className="text-xs font-semibold text-slate-400">Sold out today</span> : <button onClick={() => add({ kind: 'side', sideId: s.id, qty: 1, unitCents: s.cents })} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Add</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="packs" className="mt-12 scroll-mt-16">
          <h2 className="font-display text-3xl font-bold tracking-tight">Game-day and party packs</h2>
          <p className="mt-1 text-sm text-slate-600">Order ahead for {big.name}. Pay {Math.round(DEPOSIT_SHARE * 100)}% now to hold your time, the rest at pickup or delivery.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {PACKS.map((p) => {
              const value = packValue(p);
              return (
                <article key={p.id} className="flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{p.feeds}</p>
                  <h3 className="mt-1 font-display text-2xl font-bold">{p.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-slate-600">{p.blurb}</p>
                  <p className="mt-3"><span className="tabular font-display text-2xl font-bold">{money(p.cents)}</span> <span className="text-sm text-slate-400 line-through">{money(value)}</span> <span className="text-xs font-bold text-emerald-700">save {money(value - p.cents)}</span></p>
                  <PreorderButton pack={p.id} date={big.date} label={big.name} />
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6 text-xs text-slate-500">
          {PIZZA_SHOP.name} is a made-up demo shop. Photos from Unsplash. Ordering runs on KneadOS. <a href="/pizza" className="font-semibold text-emerald-700">What is KneadOS?</a>
        </div>
      </footer>

      {/* Floating cart button */}
      {count > 0 && !open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-emerald-700">
          <ShoppingBag size={18} /> {count} item{count > 1 ? 's' : ''} · {money(cart.reduce((a, l) => a + lineCents(l), 0))}
        </button>
      )}
      {toast && <div className="fixed bottom-20 right-5 z-30 flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg"><Check size={14} /> {toast}</div>}

      {building && (
        <Modal onClose={() => setBuilding(null)} title={building.specialtyId ? 'Customize your pizza' : 'Build your pizza'} wide>
          <Builder start={building.specialtyId ? { specialtyId: building.specialtyId } : undefined} out={state.out} onAdd={(l) => { add(l); setBuilding(null); }} />
        </Modal>
      )}

      {open && (
        <Checkout cart={cart} setCart={setCart} history={history} gameDay={brain.facts.tomorrow.event ?? undefined} onClose={() => setOpen(false)}
          quote={(zone, pies) => quoteTime(state.orders.filter((o) => o.status !== 'done'), pies, { zone, cooks: brain.cooks, driversFreeInMin: brain.freeIn }).minutes}
          onPlace={(o, phone) => {
            const placedO = placeOrder(o, { rewardPhone: phone });
            const configs = cart.flatMap((l) => (l.kind === 'pizza' ? Array.from({ length: l.qty }, () => l.config) : []));
            setCart([]); setOpen(false);
            if (!placedO) return;
            if (configs.length && !reducedMotion()) setBaking({ id: placedO.id, number: placedO.number, configs });
            else setPlaced(placedO.id);
          }}
        />
      )}

      {baking && (
        <Modal onClose={() => { setPlaced(baking.id); setBaking(null); }} title={`Order #${baking.number} is paid`}>
          <p className="mb-3 text-sm text-slate-600">{baking.configs.length > 1 ? `All ${baking.configs.length} pizzas go in the oven together.` : 'Your pizza goes in the oven now.'}</p>
          <Oven configs={baking.configs} onDone={() => { setPlaced(baking.id); setBaking(null); }} />
          {baking.configs.length > 6 && <p className="mt-2 text-center text-xs text-slate-500">Showing 6 of {baking.configs.length} pizzas.</p>}
        </Modal>
      )}

      {placedOrder && (
        <Modal onClose={() => setPlaced(null)} title={`Order #${placedOrder.number} is in`}>
          <p className="text-sm text-slate-600">{placedOrder.fulfillment === 'delivery' ? `Headed to ${placedOrder.customer.address} by about` : 'Ready for pickup at about'} <b>{new Date(placedOrder.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</b>. You'll get a text at each step.</p>
          <ol className="mt-4 flex items-center gap-1">
            {STATUS_STEPS.filter((s) => placedOrder.fulfillment === 'delivery' || s.id !== 'out').map((s, i, all) => {
              const reached = all.findIndex((x) => x.id === placedOrder.status) >= i;
              return <li key={s.id} className={`flex-1 rounded-lg px-1 py-2 text-center text-[11px] font-bold ${reached ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{s.label}</li>;
            })}
          </ol>
          <p className="mt-3 text-xs text-slate-500">This tracker follows the order live. Open the Make line and Dispatch screens in another tab and move it along to watch it change here.</p>
        </Modal>
      )}
    </div>
  );
}

function PreorderButton({ pack, date, label }: { pack: string; date: string; label: string }) {
  const { placeOrder } = usePizza();
  const p = PACKS.find((x) => x.id === pack)!;
  const [step, setStep] = useState<'idle' | 'form' | 'done'>('idle');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [time, setTime] = useState('12:30');
  // Office lunches are billed to the company by default; any pack can still pay a deposit by card.
  const [payBy, setPayBy] = useState<'card' | 'invoice'>(pack === 'office' ? 'invoice' : 'card');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [po, setPo] = useState('');
  const [booked, setBooked] = useState<{ number?: number; invoice?: PizzaInvoice } | null>(null);
  if (step === 'done') {
    const inv = booked?.invoice;
    return inv ? (
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">Pre-order #{booked?.number} is booked, nothing to pay today.</p>
        <p className="mt-1">Invoice {inv.number} for {money(inv.totalCents)} was emailed to {inv.email}{inv.po ? `, with PO ${inv.po} on it` : ''}. It is due {longDate(inv.due)}, {INVOICE_TERMS_DAYS} days after the lunch.</p>
        <Link to={payPath(inv)} className="mt-2 inline-flex items-center gap-1 font-bold text-emerald-700 underline">Open the invoice and pay link <ChevronRight size={14} /></Link>
      </div>
    ) : <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Pre-order #{booked?.number} is booked. Deposit paid, the rest is due at {time}.</p>;
  }
  if (step === 'idle') return <button onClick={() => setStep('form')} className="mt-4 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Pre-order for {label}</button>;
  const lines = packLines(p);
  const t = totals(lines);
  const invoice = payBy === 'invoice';
  const ok = !!name && phone.length === 10 && (!invoice || (company.trim().length > 1 && validEmail(email)));
  const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
  return (
    <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 text-xs font-bold ring-1 ring-slate-200" role="radiogroup" aria-label="How to pay">
        {(['invoice', 'card'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={payBy === k} onClick={() => setPayBy(k)} className={`rounded-full px-2 py-1.5 ${payBy === k ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {k === 'invoice' ? 'Invoice my company' : `Card, ${Math.round(DEPOSIT_SHARE * 100)}% deposit`}
          </button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
      <input value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Mobile number" inputMode="tel" className={field} />
      {invoice && (
        <>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" autoComplete="organization" className={field} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Billing email (accounts payable)" type="email" autoComplete="email" className={field} />
          <input value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO number (optional)" className={field} />
          <p className="text-xs text-slate-500">We email the invoice with a pay link (card or bank transfer). Due {INVOICE_TERMS_DAYS} days after the lunch.</p>
        </>
      )}
      <label className="flex items-center justify-between text-sm">Ready at <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" /></label>
      <button
        disabled={!ok}
        onClick={() => {
          const [h, m] = time.split(':').map(Number);
          const [y, mo, d] = date.split('-').map(Number);
          const when = new Date(y, mo - 1, d, h, m).toISOString();
          const o = placeOrder(
            { channel: invoice ? 'catering' : 'online', fulfillment: 'pickup', createdAt: new Date().toISOString(), promisedAt: when, scheduled: true, event: label, customer: { name, phone }, lines, ...t, depositCents: invoice ? undefined : Math.round(t.total * DEPOSIT_SHARE), payment: invoice ? 'invoice' : 'online', status: 'new', note: invoice ? `Bill to ${company.trim()}${po.trim() ? `, PO ${po.trim()}` : ''}` : undefined },
            invoice ? { bill: { company, email, po, memo: `${p.name}, ${label}` } } : {},
          );
          setBooked({ number: o?.number, invoice: o?.invoice });
          setStep('done');
        }}
        className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {invoice ? `Book it and send the invoice · ${money(t.total)}` : `Pay ${money(Math.round(t.total * DEPOSIT_SHARE))} deposit`}
      </button>
    </div>
  );
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function Checkout({ cart, setCart, history, gameDay, onClose, onPlace, quote }: {
  cart: Line[]; setCart: (f: (c: Line[]) => Line[]) => void; history: ReturnType<typeof usePizza>['history']; gameDay?: string;
  onClose: () => void; onPlace: (o: Omit<PizzaOrder, 'id' | 'number'>, rewardPhone?: string) => void; quote: (zone: 'A' | 'B' | 'C' | undefined, pies: number) => number;
}) {
  const [mode, setMode] = useState<'pickup' | 'delivery'>('delivery');
  const [addr, setAddr] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tipPct, setTipPct] = useState(0.18);
  const [rewards, setRewards] = useState(true);
  const a = ADDRESSES[addr];
  const zone = mode === 'delivery' ? zoneFor(a) : undefined;
  const pies = cart.reduce((n, l) => n + (l.kind === 'pizza' ? l.qty : 0), 0);
  const base = totals(cart, { zone });
  const tip = Math.round(base.subtotal * tipPct);
  const t = totals(cart, { zone, tipCents: tip });
  const minutes = quote(zone, pies);
  const ups = useMemo(() => upsells(cart, history, gameDay), [cart, history, gameDay]);
  const outOfRange = mode === 'delivery' && !zone;
  const { state: shopState } = usePizza();
  const fraud = useFraud();
  const [card, setCard] = useState(GOOD_DEMO_CARD);
  const [cardName, setCardName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [declined, setDeclined] = useState('');
  const [bankCheck, setBankCheck] = useState(false);
  const firstTime = phone.length === 10 && !shopState.orders.some((o) => o.customer.phone === phone) && !shopState.members.some((m) => m.phone === phone && m.visits > 0);
  const risk = orderRisk({
    totalCents: t.total, fulfillment: mode, firstTime, orderName: name, cardName: cardName.trim() || undefined, billingZip,
    deliveryAreas: LOCAL_ZIP_AREAS, failedTries: failedTries(fraud.tries, phone, fraud.device),
  }, fraud.settings);
  const left = triesLeft(fraud.tries, phone, fraud.device, fraud.settings);
  const cardOk = risk.payInPerson || (card.replace(/\D/g, '').length === 16 && cardName.trim().length > 1 && /^\d{5}$/.test(billingZip));
  const send = (bankConfirmed: boolean) => {
    setBankCheck(false);
    const now = Date.now();
    const flagged = risk.idCheck || risk.flags.length > 0;
    onPlace({
      channel: 'online', fulfillment: mode, createdAt: new Date(now).toISOString(), promisedAt: new Date(now + minutes * MINUTE).toISOString(),
      customer: { name, phone, ...(mode === 'delivery' ? { address: a.line, x: a.x, y: a.y, zone } : {}) },
      lines: cart, ...t, payment: risk.payInPerson ? (mode === 'delivery' ? 'cash' : 'card') : 'online', status: 'new',
      ...(flagged || bankConfirmed ? { fraud: { flags: risk.flags.map((f) => f.label), idCheck: risk.idCheck, cardName: risk.payInPerson ? undefined : cardName.trim(), bankConfirmed } } : {}),
    }, rewards ? phone : undefined);
  };
  const pay = () => {
    setDeclined('');
    if (!risk.payInPerson) {
      if (!demoCardOk(card)) {
        fraud.record({ phone, ok: false });
        const n = left - 1;
        setDeclined(n > 0 ? `The bank declined that card. ${n} ${n === 1 ? 'try' : 'tries'} left this hour.` : 'The bank declined that card. That was the last try this hour: pay when the pizza arrives or at pickup.');
        return;
      }
      if (risk.threeDS && !bankCheck) { setBankCheck(true); return; }
      fraud.record({ phone, ok: true });
    }
    send(risk.threeDS && !risk.payInPerson);
  };

  return (
    <Modal onClose={onClose} title="Your order">
      <ul className="divide-y divide-slate-100">
        {cart.map((l, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.kind === 'pizza' ? pizzaTitle(l as PizzaLine) : SIDE_BY_ID[l.sideId].name}</p>
              {l.kind === 'pizza' && <p className="text-xs text-slate-500">{pizzaDetails(l.config, l.specialtyId).join(' · ')}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <button aria-label="One fewer" onClick={() => setCart((c) => c.flatMap((x, j) => (j === i ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))} className="rounded-full bg-slate-100 p-1"><Minus size={12} /></button>
              <span className="tabular w-4 text-center text-sm font-bold">{l.qty}</span>
              <button aria-label="One more" onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))} className="rounded-full bg-slate-100 p-1"><Plus size={12} /></button>
            </div>
            <span className="tabular w-16 text-right text-sm font-semibold">{money(lineCents(l))}</span>
          </li>
        ))}
      </ul>
      {ups.length > 0 && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800"><Sparkles size={13} /> Goes well with your order</p>
          {ups.map((u) => (
            <div key={u.id} className="mt-2 flex items-center justify-between gap-2">
              <div><p className="text-sm font-semibold">{u.title}</p><p className="text-xs text-slate-600">{u.why}</p></div>
              <button
                onClick={() => setCart((c) => (u.id === 'size-up' ? c.map((x) => (x.kind === 'pizza' && x.config.size === 'S' ? (u.line as PizzaLine) : x)) : [...c, u.line]))}
                className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                {u.id === 'size-up' ? 'Upgrade' : `Add ${money(u.line.unitCents)}`}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(['delivery', 'pickup'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-bold ${mode === m ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200'}`}>
            {m === 'delivery' ? <Bike size={15} /> : <Store size={15} />} {m === 'delivery' ? 'Delivery' : 'Pickup'}
          </button>
        ))}
      </div>
      {mode === 'delivery' && (
        <label className="mt-3 block text-sm">
          <span className="font-semibold">Deliver to</span>
          <select value={addr} onChange={(e) => setAddr(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
            {ADDRESSES.map((x, i) => <option key={x.line} value={i}>{x.line}, Long Beach</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{zone ? `${ZONES.find((z) => z.id === zone)!.label}, ${money(ZONES.find((z) => z.id === zone)!.feeCents)} delivery fee` : 'Outside our delivery area. Pickup only for this address.'} Demo: pick an example address.</span>
        </label>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <input value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Mobile for texts" inputMode="tel" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={rewards} onChange={(e) => setRewards(e.target.checked)} /> Earn Dough Rewards with this number (every 10th order, a free medium pizza)</label>
      <div className="mt-3">
        <p className="text-sm font-semibold">{mode === 'delivery' ? 'Tip your driver' : 'Tip the crew'}</p>
        <div className="mt-1 flex gap-1.5">
          {[0, 0.15, 0.18, 0.22].map((p) => <button key={p} onClick={() => setTipPct(p)} className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold ${tipPct === p ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200'}`}>{p ? `${Math.round(p * 100)}%` : 'None'}</button>)}
        </div>
      </div>
      <dl className="tabular mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
        {t.deliveryFee > 0 && <div className="flex justify-between"><dt>Delivery fee</dt><dd>{money(t.deliveryFee)}</dd></div>}
        <div className="flex justify-between"><dt>Tax</dt><dd>{money(t.tax)}</dd></div>
        {t.tip > 0 && <div className="flex justify-between"><dt>Tip</dt><dd>{money(t.tip)}</dd></div>}
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(t.total)}</dd></div>
      </dl>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><Clock size={14} className="shrink-0" /> <span>{mode === 'delivery' ? 'At your door' : 'Ready'} in about <b>{minutes} min</b>, based on what's in our oven right now.</span></p>
      <div className="mt-3 space-y-2">
        <p className="text-sm font-semibold">Payment</p>
        {risk.payInPerson ? (
          <p className="rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900">First order with us? Welcome! You'll pay {mode === 'delivery' ? 'the driver' : 'at the counter'} by card or cash.</p>
        ) : left === 0 ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">Too many declined cards from this phone or device in the last hour. Please call the shop.</p>
        ) : (
          <>
            <input value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d ]/g, '').slice(0, 19))} placeholder="Card number" inputMode="numeric" autoComplete="cc-number" aria-label="Card number" className="tabular w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Name on card" autoComplete="cc-name" aria-label="Name on card" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={billingZip} onChange={(e) => setBillingZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Billing ZIP" inputMode="numeric" autoComplete="postal-code" aria-label="Billing ZIP" className="tabular rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            {risk.idCheck && <p className="text-xs text-slate-500">{mode === 'delivery' ? 'The driver will ask to see a photo ID that matches the card.' : 'Bring a photo ID that matches the card.'}</p>}
            <p className="text-[11px] text-slate-400">Demo: {GOOD_DEMO_CARD} is approved. <button type="button" onClick={() => setCard(DECLINED_DEMO_CARD)} className="font-semibold underline">Use a card that gets declined</button>. Try billing ZIP 33101 on a delivery.</p>
          </>
        )}
        {declined && <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">{declined}</p>}
      </div>
      {bankCheck && (
        <div data-bank-check className="mt-3 rounded-2xl bg-slate-900 p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Your bank</p>
          <p className="mt-1 text-sm">Approve this {money(t.total)} payment in your bank's app. Bigger or unusual orders get this extra check.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setBankCheck(false)} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold">Cancel</button>
            <button onClick={() => { fraud.record({ phone, ok: true }); send(true); }} className="rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-900">Approve (demo)</button>
          </div>
        </div>
      )}
      <button
        disabled={!cart.length || !name || phone.length !== 10 || outOfRange || !cardOk || (!risk.payInPerson && left === 0) || bankCheck}
        onClick={pay}
        className="mt-3 w-full rounded-full bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        {risk.payInPerson ? 'Place order, pay on arrival' : `Pay ${money(t.total)} and place order`}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">Demo checkout: nothing is charged and texts are only shown in the owner's dashboard.</p>
    </Modal>
  );
}

/** ZIP areas the shop delivers in, by first three digits. 908 is Long Beach. */
const LOCAL_ZIP_AREAS = ['908'];

export function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

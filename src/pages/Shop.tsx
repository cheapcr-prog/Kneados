import { Check, Clock, GripVertical, MapPin, Minus, Phone, Plus, Trash2, X } from 'lucide-react';
import { useFraud } from '../components/Fraud';
import { DECLINED_DEMO_CARD, GOOD_DEMO_CARD, demoCardOk, failedTries, orderRisk, triesLeft } from '../lib/fraud';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { OrderTray, useBox } from '../components/BoxBuilder';
import type { Box } from '../components/BoxBuilder';
import { useEvents } from '../components/Events';
import { ItemArt } from '../components/ItemArt';
import { MerchArt, useMerch } from '../components/Merch';
import { MERCH, MERCH_BY_ID } from '../data/merch';
import { merchLines, merchTotals, stockKey, type MerchItem, type MerchLine } from '../lib/merch';
import { usePricing, useUpsells } from '../components/Pricing';
import { MENU, MENU_BY_ID, SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { Category, MenuItem, Order } from '../data/types';
import { longDate, timeLabel } from '../lib/dates';
import { formatPhone, money } from '../lib/money';
import { boxCounts, boxPrice, boxUpcharge, cartLines, isBoxable, linePrice, totals } from '../lib/pricing';
import type { OrderLine } from '../data/types';
import { PUNCHES_PER_REWARD } from '../lib/rewards';
import { cardCode, lastFour } from '../lib/wallet';
import { applyPrices, type LivePrice } from '../lib/smartpricing';
import { attachTopping, clampToppings, cycleTopping, detachTopping, toppingLines, toppingTotals, type ToppingLine, type Toppings } from '../lib/toppings';
import { suggestOffers, type Offer } from '../lib/upsell';

const ADDONS = MENU.filter((m) => m.addon);
const BLENDED = MENU.filter((m) => m.category === 'Smoothies & boba' && !m.addon);
const CATEGORIES: Category[] = ['Classics', 'Filled', 'Specialty', 'Drinks', 'Smoothies & boba'];

/** Pickup slots every 15 minutes, starting 20 minutes from now so the counter has time to pack. */
function pickupSlots(dayOffset: number): Date[] {
  const slots: Date[] = [];
  const base = new Date();
  base.setDate(base.getDate() + dayOffset);
  const earliest = dayOffset === 0 ? Date.now() + 20 * 60_000 : 0;
  for (let h = SHOP.openHour; h < SHOP.closeHour; h++) {
    for (const m of [0, 15, 30, 45]) {
      const t = new Date(base);
      t.setHours(h, m, 0, 0);
      if (t.getTime() >= earliest) slots.push(t);
    }
  }
  return slots;
}

export function Shop() {
  const demo = useDemo();
  const prices = usePricing();
  /** Everything in the bag and cup holder except drink toppings, which are kept per drink. */
  const [plain, setCart] = useState<Record<string, number>>({});
  const [picked, setToppings] = useState<Toppings>({});
  const tops = useMemo(() => clampToppings(picked, plain), [picked, plain]);
  const cart = useMemo(() => ({ ...plain, ...toppingTotals(tops) }), [plain, tops]);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const events = useEvents();
  const [params] = useSearchParams();
  const fund = params.get('fund') ? events.fundFor(params.get('fund')!) : undefined;

  /** Dozen boxes that are full and set aside. The box being filled lives in `box`. */
  const [boxes, setBoxes] = useState<string[][]>([]);
  const [boxOpen, setBoxOpen] = useState(false);
  const soldOut = (id: string) => demo.state.bake[id]?.soldOut ?? false;
  const box = useBox(soldOut, (id) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 })));

  /**
   * What the order is right now. A full box counts as a dozen box.
   * A box that is not full yet is charged as single donuts until it fills.
   */
  const order = useMemo(() => {
    const loose = { ...cart };
    if (!box.full) for (const id of box.filled) loose[id] = (loose[id] ?? 0) + 1;
    const allBoxes = box.full ? [...boxes, box.filled] : boxes;
    return {
      boxes: allBoxes,
      loose: Object.entries(loose).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, lineCents: linePrice(prices.byId[itemId], qty) })),
      lines: cartLines(loose, allBoxes, prices.byId),
    };
  }, [cart, boxes, box.filled.join(), box.full, prices.byId]);
  const merch = useMerch();
  // A link to /demo/shop#merch lands on the merch shelf.
  useEffect(() => {
    if (window.location.hash !== '#merch') return;
    const id = setTimeout(() => document.getElementById('merch')?.scrollIntoView(), 60);
    return () => clearTimeout(id);
  }, []);
  const [merchCart, setMerchCart] = useState<Record<string, number>>({});
  const mLines = merchLines(merchCart, MERCH_BY_ID);
  const mt = merchTotals(mLines);
  /** Never more than is on the shelf. */
  const addMerch = (key: string, n: number) => setMerchCart((c) => ({ ...c, [key]: Math.max(0, Math.min(merch.stock[key] ?? 0, (c[key] ?? 0) + n)) }));
  const count = order.lines.reduce((a, l) => a + l.qty, 0) + mLines.reduce((a, l) => a + l.qty, 0);
  const t = totals(order.lines, prices.byId);
  /** Taking one away comes out of the bag first, then out of the box being filled. */
  const add = (id: string, n: number) => {
    // A topping always goes into a drink: the first blended drink with a cup that does not have it yet.
    if (MENU_BY_ID[id]?.addon) {
      const drinks = BLENDED.filter((m) => (plain[m.id] ?? 0) > 0).map((m): [string, number] => [m.id, plain[m.id]]);
      setToppings(n > 0 ? attachTopping(tops, id, drinks) : detachTopping(tops, id));
      return;
    }
    if (n < 0 && (cart[id] ?? 0) === 0 && box.removeOne(id)) return;
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + n) }));
  };
  const closeBox = () => {
    setCart((c) => {
      const next = { ...c };
      for (const id of box.filled) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    box.clear();
    setBoxOpen(false);
  };
  const openBox = () => {
    setBoxOpen(true);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-white">
      <header className="relative overflow-hidden bg-box-500 text-white">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border-[44px] border-white/10" />
        <div className="absolute -bottom-24 right-40 hidden h-56 w-56 rounded-full border-[36px] border-white/10 md:block" />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-10 md:pb-16 md:pt-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-box-100">{SHOP.city}</p>
          <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">
            {SHOP.name.replace(' Donuts', '')}
            <br />
            Donuts
          </h1>
          <p className="mt-4 max-w-md text-lg text-box-50">{SHOP.tagline} Order ahead and skip the line.</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-box-50">
            <span className="flex items-center gap-1.5"><Clock size={15} /> {SHOP.hours}</span>
            <span className="flex items-center gap-1.5"><MapPin size={15} /> {SHOP.address}</span>
            <span className="flex items-center gap-1.5"><Phone size={15} /> {SHOP.phone}</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#menu" className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-box-600 shadow-lg shadow-box-700/30 hover:bg-box-50">
              Order for pickup
            </a>
            <button type="button" onClick={openBox} className="inline-flex rounded-full border border-white/50 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
              Build your dozen
            </button>
            <Link to="/demo/shop/fridays" className="inline-flex rounded-full border border-white/50 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
              Donut Fridays for your office
            </Link>
            <Link to="/demo/shop/events" className="inline-flex rounded-full border border-white/50 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
              Order for an event
            </Link>
          </div>
        </div>
      </header>

      {fund && (
        <section className="bg-emerald-600 text-white">
          <p className="mx-auto max-w-6xl px-5 py-3 text-sm font-semibold">You are ordering for {fund.org}. {Math.round(fund.share * 100)}% of your order goes to them, through {longDate(fund.end)}. The code is already on your order.</p>
        </section>
      )}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 text-sm text-slate-700">
          <span className="font-display text-base font-bold text-slate-900">Dough Rewards</span>
          <span>Every {PUNCHES_PER_REWARD}th visit, your donut is free. Give your phone number at checkout, or show the card in your phone wallet.</span>
        </div>
      </section>

      <main id="menu" className={`mx-auto max-w-6xl scroll-mt-12 px-5 pt-8 ${count > 0 || boxOpen ? 'pb-[26rem] md:pb-64' : 'pb-24'}`}>
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-box-50 p-4 sm:p-5">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Pack your own order</h2>
            <p className="text-sm text-slate-600">
              Drag a donut by its picture into the box or the bag, and drinks into the cup holder. Or just tap Add.
              A dozen box is any twelve donuts for {money(SHOP.dozenBase)}, bars included. Specialty donuts are {money(SHOP.specialtyExtra)} extra each.
            </p>
          </div>
          {!boxOpen && (
            <button type="button" onClick={openBox} className="rounded-full bg-box-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-box-600">
              Build your dozen
            </button>
          )}
        </div>
        {CATEGORIES.map((cat) => (
          <section key={cat} className="mb-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{cat}</h2>
            {cat === 'Smoothies & boba' && <p className="mt-1 text-sm text-slate-600">Add a smoothie, then pick what goes in it: {ADDONS.map((a) => `${a.name.replace(/^Add /, '').toLowerCase()} ${money(a.price)}`).join(', ')}.</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MENU.filter((m) => m.category === cat && !m.addon).map((item) => (
                <MenuCard key={item.id} item={item} live={prices.live[item.id]} qty={cart[item.id] ?? 0} soldOut={soldOut(item.id)} add={add} box={box} boxOpen={boxOpen}
                  tops={cat === 'Smoothies & boba' ? tops[item.id] ?? {} : undefined} onTopping={(addon) => setToppings(cycleTopping(tops, item.id, addon, plain[item.id] ?? 0))} toppingSoldOut={soldOut} />
              ))}
            </div>
          </section>
        ))}
        <section id="merch" className="mb-10">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Merch &amp; extras</h2>
          <p className="mt-1 text-sm text-slate-600">Add it to your pickup order and it will be waiting with your donuts.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MERCH.map((item) => <MerchCard key={item.id} item={item} left={(size) => merch.left(item.id, size)} inCart={(size) => merchCart[stockKey(item.id, size)] ?? 0} add={(size, n) => addMerch(stockKey(item.id, size), n)} />)}
          </div>
        </section>
        <p className="text-xs text-slate-500">All donuts contain wheat, egg, milk and soy. Made in a kitchen that also handles tree nuts.</p>
      </main>

      <OrderTray
        box={box}
        boxOpen={boxOpen}
        onOpenBox={() => setBoxOpen(true)}
        onCloseBox={closeBox}
        closedBoxes={boxes.length}
        onAnotherBox={() => { setBoxes((b) => [...b, box.filled]); box.clear(); }}
        cart={cart}
        toppings={toppingLines(tops)}
        removeTopping={(drink, addon) => setToppings(detachTopping(tops, addon, drink))}
        add={add}
        count={count}
        total={t.total + mt.total}
        onCheckout={() => setOpen(true)}
      />

      {open && (
        <Checkout
          loose={order.loose}
          boxes={order.boxes}
          add={add}
          toppings={toppingLines(tops)}
          merch={mLines}
          addMerch={addMerch}
          removeBox={(i) => (i < boxes.length ? setBoxes((b) => b.filter((_, k) => k !== i)) : box.clear())}
          onClose={() => setOpen(false)}
          onPlaced={(o) => { setPlaced(o); setCart({}); setToppings({}); setMerchCart({}); setBoxes([]); box.clear(); setBoxOpen(false); setOpen(false); }}
        />
      )}
      {placed && <Confirmation order={placed} onClose={() => setPlaced(null)} />}
    </div>
  );
}

/** The picture is the handle: drag it into the box, the bag or the cup holder. */
function MenuCard({ item, live, qty, soldOut, add, box, boxOpen, tops, onTopping, toppingSoldOut }: { item: MenuItem; live?: LivePrice; qty: number; soldOut: boolean; add: (id: string, n: number) => void; box: Box; boxOpen: boolean; tops?: Record<string, number>; onTopping?: (addon: string) => void; toppingSoldOut?: (id: string) => boolean }) {
  const boxing = boxOpen && isBoxable(item);
  const extra = boxUpcharge(item);
  return (
    <div className={`flex gap-3 rounded-2xl border p-3 ${soldOut ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'}`}>
      {soldOut ? (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-box-50">
          <ItemArt item={item} size={80} shape="tile" />
        </div>
      ) : (
        <div
          data-drag={item.id}
          onPointerDown={(e) => box.startDrag(e, item.id, null)}
          title="Drag into your order"
          className="relative flex h-20 w-20 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-xl bg-box-50 transition hover:-translate-y-0.5 hover:bg-box-100 active:cursor-grabbing"
        >
          <ItemArt item={item} size={80} shape="tile" />
          <GripVertical size={14} className="absolute right-0.5 top-1 text-box-400" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight text-slate-900">{item.name}</h3>
          {live?.tag ? (
            <span className="tabular shrink-0 text-right text-sm font-semibold text-slate-900">
              {live.tag !== 'weekend' && <span className="mr-1 text-xs font-normal text-slate-400 line-through">{money(live.baseCents)}</span>}
              <span className={live.tag === 'weekend' ? '' : 'text-rose-600'}>{money(live.cents)}</span>
            </span>
          ) : <span className="tabular shrink-0 text-sm font-semibold text-slate-900">{money(item.price)}</span>}
        </div>
        {live?.tag && live.tag !== 'weekend' && <p className="mt-0.5 w-fit rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{live.label}, pickup today</p>}
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
        <div className="mt-2 flex items-center gap-2">
          {soldOut ? (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">Sold out today</span>
          ) : qty > 0 ? (
            <div className="flex items-center gap-1 rounded-full bg-box-50 p-0.5">
              <button aria-label={`Remove one ${item.name}`} onClick={() => add(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-box-600 shadow-sm"><Minus size={14} /></button>
              <span className="tabular w-7 text-center text-sm font-bold text-box-700">{qty}</span>
              <button aria-label={`Add one ${item.name}`} onClick={() => add(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-box-500 text-white shadow-sm"><Plus size={14} /></button>
            </div>
          ) : (
            <button onClick={() => add(item.id, 1)} className={`rounded-full px-3.5 py-1 text-xs font-bold ${boxing ? 'border border-box-200 text-box-600 hover:bg-box-50' : 'bg-box-500 text-white hover:bg-box-600'}`}>{boxing ? 'Add to bag' : 'Add'}</button>
          )}
          {!soldOut && boxing && (
            <button
              onClick={() => box.place(item.id, null, 'box')}
              disabled={box.full}
              aria-label={`Add ${item.name} to the box`}
              className="rounded-full bg-box-500 px-3.5 py-1 text-xs font-bold text-white hover:bg-box-600 disabled:bg-slate-300"
            >
              Add to box{extra > 0 ? ` +${money(extra)}` : ''}
            </button>
          )}
        </div>
        {tops && qty > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {ADDONS.filter((a) => !toppingSoldOut?.(a.id)).map((a) => {
              const n = tops[a.id] ?? 0;
              const label = a.name.replace(/^Add /, '');
              return (
                <button key={a.id} type="button" onClick={() => onTopping?.(a.id)} aria-pressed={n > 0} aria-label={n === 0 ? `Add ${label} to ${item.name}` : `${label} in ${n} of ${qty} ${item.name}. Tap to change.`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${n > 0 ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {n === 0 ? `+ ${label} ${money(a.price)}` : qty > 1 ? `${label} in ${n} of ${qty}` : `✓ ${label}`}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Checkout({ loose: cartLoose, boxes, add, toppings, merch, addMerch, removeBox, onClose, onPlaced }: {
  toppings: ToppingLine[];
  merch: MerchLine[];
  addMerch: (key: string, n: number) => void;
  loose: OrderLine[];
  boxes: string[][];
  add: (id: string, n: number) => void;
  removeBox: (index: number) => void;
  onClose: () => void;
  onPlaced: (o: Order) => void;
}) {
  const demo = useDemo();
  const todaySlots = useMemo(() => pickupSlots(0), []);
  const [day, setDay] = useState(todaySlots.length ? 0 : 1);
  const slots = useMemo(() => (day === 0 ? todaySlots : pickupSlots(1)), [day, todaySlots]);
  const [slot, setSlot] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rewards, setRewards] = useState(true);
  const events = useEvents();
  const [params] = useSearchParams();
  const [fundCode, setFundCode] = useState(params.get('fund') ?? '');
  const fund = fundCode.trim() ? events.fundFor(fundCode) : undefined;
  const prices = usePricing();
  const upsells = useUpsells();
  const [taken, setTaken] = useState<Offer[]>([]);
  /** Sale prices and specials are for today. An order for tomorrow pays tomorrow's usual prices. */
  const menu = useMemo(() => {
    if (day === 0) return prices.byId;
    const next = applyPrices(MENU, prices.rules, { ...prices.ctx, dow: (prices.ctx.dow + 1) % 7, hour: 0, holiday: false, extra: {} }).menu;
    return Object.fromEntries(next.map((m) => [m.id, m]));
  }, [day, prices.byId, prices.rules, prices.ctx]);
  const qty = Object.fromEntries(cartLoose.map((l) => [l.itemId, l.qty]));
  const loose = cartLoose.map((l) => ({ ...l, lineCents: linePrice(menu[l.itemId], l.qty) }));
  const lines = cartLines(qty, boxes, menu);
  const food = totals(lines, menu);
  const mt = merchTotals(merch);
  const t = { subtotal: food.subtotal + mt.subtotal, tax: food.tax + mt.tax, total: food.total + mt.total };
  const shelf = useMerch();
  const offers = upsells.stats.on ? suggestOffers(lines, menu, (id) => !!demo.state.bake[id]?.soldOut).filter((o) => !taken.some((x) => x.kind === o.kind)) : [];
  const digits = phone.replace(/\D/g, '');
  const pickup = slot || slots[0]?.toISOString() || '';
  const items = lines.reduce((a, l) => a + l.qty, 0);
  // A giant online order is the usual shape of a fake one (it ties up the fryer and sells out the case),
  // so past this size the customer calls the shop or books it as an event with a deposit.
  const tooBig = items > MAX_ONLINE_ITEMS;
  const fraud = useFraud();
  const [card, setCard] = useState(GOOD_DEMO_CARD);
  const [cardName, setCardName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [declined, setDeclined] = useState('');
  /** Set while the customer's bank is asked to confirm a big or risky payment. */
  const [bankCheck, setBankCheck] = useState(false);
  const firstTime = digits.length === 10 && !demo.state.orders.some((o) => o.phone === digits) && !(demo.findMember(digits)?.visits);
  const priorFails = failedTries(fraud.tries, digits, fraud.device);
  const risk = orderRisk({ totalCents: t.total, fulfillment: 'pickup', firstTime, orderName: name, cardName: cardName.trim() || undefined, failedTries: priorFails }, fraud.settings);
  const left = triesLeft(fraud.tries, digits, fraud.device, fraud.settings);
  const cardOk = risk.payInPerson || (card.replace(/\D/g, '').length === 16 && cardName.trim().length > 1 && (!fraud.settings.zipCheck || /^\d{5}$/.test(billingZip)));
  const ready = (lines.length > 0 || merch.length > 0) && name.trim().length > 1 && digits.length === 10 && pickup && !tooBig && cardOk && (risk.payInPerson || left > 0);

  /** Runs the card, asks the bank when the order calls for it, then places the order. */
  const place = () => {
    if (!ready) return;
    setDeclined('');
    if (!risk.payInPerson) {
      if (!demoCardOk(card)) {
        fraud.record({ phone: digits, ok: false });
        const now = left - 1;
        setDeclined(now > 0 ? `The bank declined that card. ${now} ${now === 1 ? 'try' : 'tries'} left this hour.` : 'The bank declined that card. That was the last try this hour, so please pay at the counter when you pick up.');
        return;
      }
      if (risk.threeDS && !bankCheck) { setBankCheck(true); return; }
      fraud.record({ phone: digits, ok: true });
    }
    finish(risk.threeDS && !risk.payInPerson);
  };

  const finish = (bankConfirmed: boolean) => {
    setBankCheck(false);
    const flagged = risk.idCheck || risk.payInPerson || risk.flags.length > 0;
    const order = demo.placeOrder({
      source: 'online', pickupAt: pickup, customerName: name.trim(), phone: digits, lines,
      subtotal: t.subtotal, tax: t.tax, tip: 0, total: t.total, payment: risk.payInPerson ? 'card' : 'online', status: 'new',
      ...(flagged || bankConfirmed ? { fraud: { flags: risk.flags.map((f) => f.label), idCheck: risk.idCheck, ...(risk.payInPerson ? { payAtPickup: true } : { cardName: cardName.trim() }), ...(bankConfirmed ? { bankConfirmed: true } : {}) } } : {}),
      ...(boxes.length ? { boxes } : {}),
      ...(merch.length ? { merch } : {}),
      ...(toppings.length ? { toppings } : {}),
      ...(fund ? { fundraiser: fund.code } : {}),
    });
    if (merch.length) shelf.sell(merch);
    if (rewards) demo.punchVisit(digits, name.trim());
    upsells.record(offers.length > 0 || taken.length > 0, taken.filter((o) => (qty[o.itemId] ?? 0) >= o.qty).map((o) => ({ kind: o.kind, cents: o.addCents })));
    onPlaced(order);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-xl font-bold">Your order</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <ul className="divide-y divide-slate-100">
            {boxes.map((box, i) => (
              <li key={`box-${i}`} className="py-2.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Your dozen box{boxes.length > 1 ? ` ${i + 1}` : ''}</p>
                    <p className="text-xs text-slate-500">{boxCounts(box).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ')}</p>
                  </div>
                  <button aria-label="Remove this box" onClick={() => removeBox(i)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"><Trash2 size={13} /></button>
                  <span className="tabular w-16 text-right text-sm font-semibold">{money(boxPrice(box, MENU_BY_ID).cents)}</span>
                </div>
                <div className="mt-2 grid w-fit grid-cols-6 gap-1 rounded-xl bg-box-50 p-1.5">
                  {box.map((id, k) => <ItemArt key={k} item={MENU_BY_ID[id]} size={26} />)}
                </div>
              </li>
            ))}
            {loose.map((l) => {
              const item = MENU_BY_ID[l.itemId];
              return (
                <li key={l.itemId} className="flex items-center gap-3 py-2.5">
                  <ItemArt item={item} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    {item.dozenPrice && l.qty >= 12 && <p className="text-xs text-box-600">Dozen price applied</p>}
                    {item.addon && <p className="text-xs text-slate-500">In {toppings.filter((t) => t.addon === item.id).map((t) => `${t.qty} ${MENU_BY_ID[t.drink].name}`).join(', ')}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button aria-label="Less" onClick={() => add(l.itemId, -1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200"><Minus size={13} /></button>
                    <span className="tabular w-7 text-center text-sm font-semibold">{l.qty}</span>
                    <button aria-label="More" onClick={() => add(l.itemId, 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200"><Plus size={13} /></button>
                  </div>
                  <span className="tabular w-16 text-right text-sm font-semibold">{money(l.lineCents)}</span>
                </li>
              );
            })}
            {merch.map((l) => {
              const item = MERCH_BY_ID[l.id];
              const key = stockKey(l.id, l.size);
              return (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <MerchArt item={item} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}{l.size ? `, ${l.size}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button aria-label="Less" onClick={() => addMerch(key, -1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200"><Minus size={13} /></button>
                    <span className="tabular w-7 text-center text-sm font-semibold">{l.qty}</span>
                    <button aria-label="More" onClick={() => addMerch(key, 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200"><Plus size={13} /></button>
                  </div>
                  <span className="tabular w-16 text-right text-sm font-semibold">{money(l.cents)}</span>
                </li>
              );
            })}
          </ul>

          {offers.length > 0 && (
            <div className="rounded-2xl bg-box-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-box-700">Goes well with your order</p>
              <div className="mt-2 space-y-1.5">
                {offers.map((o) => (
                  <button key={o.kind} onClick={() => { add(o.itemId, o.qty); setTaken((x) => [...x, o]); }} className="flex w-full items-center gap-2.5 rounded-xl bg-white p-2 text-left text-sm font-semibold text-slate-900 ring-1 ring-box-100 hover:ring-box-400">
                    <ItemArt item={menu[o.itemId]} size={34} />
                    <span className="min-w-0 flex-1">{o.ask}</span>
                    <span className="shrink-0 rounded-full bg-box-500 px-3 py-1 text-xs font-bold text-white">Add</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-900">Pickup</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[0, 1].map((d) => (
                <button
                  key={d}
                  disabled={d === 0 && todaySlots.length === 0}
                  onClick={() => { setDay(d); setSlot(''); }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40 ${day === d ? 'border-box-500 bg-box-50 text-box-700' : 'border-slate-200 text-slate-700'}`}
                >
                  {d === 0 ? 'Today' : 'Tomorrow'}
                  {d === 0 && todaySlots.length === 0 && <span className="block text-[11px] font-normal">Closed for today</span>}
                </button>
              ))}
            </div>
            <select value={pickup} onChange={(e) => setSlot(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {slots.map((s) => (
                <option key={s.toISOString()} value={s.toISOString()}>{timeLabel(s.toISOString())}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Your details</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for the order" autoComplete="name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" autoComplete="tel" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-sm">
              <input type="checkbox" checked={rewards} onChange={(e) => setRewards(e.target.checked)} className="mt-0.5 h-4 w-4 accent-box-500" />
              <span>
                <span className="font-semibold">Count this visit toward Dough Rewards</span>
                <span className="block text-xs text-slate-500">
                  {/* Never say whose number this is or how many punches it has: anyone can type any number here. */}
                  {`Free donut every ${PUNCHES_PER_REWARD}th visit. The punch goes on the card for this number, and we text that phone when a free donut is ready.`}
                </span>
              </span>
            </label>
            <input value={fundCode} onChange={(e) => setFundCode(e.target.value)} placeholder="Fundraiser code (optional)" aria-label="Fundraiser code" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            {fundCode.trim() && (fund
              ? <p className="text-sm font-semibold text-emerald-700">{money(Math.round(t.subtotal * fund.share))} of this order goes to {fund.org}.</p>
              : <p className="text-sm text-amber-700">That code is not for a fundraiser running today.</p>)}
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Payment</p>
            {risk.payInPerson ? (
              <p data-pay-in-person className="rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900">First order with us? Welcome! You'll pay at the counter when you pick up, by card, cash or phone.</p>
            ) : left === 0 ? (
              <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">Too many declined cards from this phone or device in the last hour. Call us at {SHOP.phone} or order at the counter.</p>
            ) : (
              <>
                <input value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d ]/g, '').slice(0, 19))} placeholder="Card number" inputMode="numeric" autoComplete="cc-number" aria-label="Card number" className="tabular w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Name on card" autoComplete="cc-name" aria-label="Name on card" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <input value={billingZip} onChange={(e) => setBillingZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Billing ZIP" inputMode="numeric" autoComplete="postal-code" aria-label="Billing ZIP" className="tabular w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
                {risk.idCheck && <p className="text-xs text-slate-500">Bring a photo ID that matches the name on the card. We check it at pickup on bigger orders to keep stolen cards out.</p>}
                <p className="text-[11px] text-slate-400">Demo: {GOOD_DEMO_CARD} is approved. <button type="button" onClick={() => setCard(DECLINED_DEMO_CARD)} className="font-semibold underline">Use a card that gets declined</button>.</p>
              </>
            )}
            {declined && <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">{declined}</p>}
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="tabular">{money(t.subtotal)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular">{money(t.tax)}</dd></div>
            <div className="flex justify-between text-base font-bold text-slate-900"><dt>Total</dt><dd className="tabular">{money(t.total)}</dd></div>
          </dl>
          {bankCheck && (
            <div data-bank-check className="mt-3 rounded-2xl bg-ink-900 p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-glaze-300">Your bank</p>
              <p className="mt-1 text-sm">Approve this {money(t.total)} payment to {SHOP.name} in your bank's app. Bigger orders get this extra check.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setBankCheck(false)} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold">Cancel</button>
                <button onClick={() => { fraud.record({ phone: digits, ok: true }); finish(true); }} className="rounded-xl bg-glaze-500 py-2.5 text-sm font-bold text-ink-900">Approve (demo)</button>
              </div>
            </div>
          )}
          {tooBig && <p role="alert" className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">Online orders go up to {MAX_ONLINE_ITEMS / 12} dozen. For a bigger order, call us at {SHOP.phone} or book it as an event, so we can fry it fresh for you.</p>}
          <button disabled={!ready || bankCheck} onClick={place} className="mt-3 w-full rounded-xl bg-box-500 py-3.5 text-sm font-bold text-white hover:bg-box-600 disabled:bg-slate-300">
            {risk.payInPerson ? 'Place order, pay at pickup' : `Pay ${money(t.total)} and place order`}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Demo shop: no card is charged. A live shop takes payment here with Stripe.</p>
        </div>
      </div>
    </div>
  );
}

function MerchCard({ item, left, inCart, add }: { item: MerchItem; left: (size?: string) => number; inCart: (size?: string) => number; add: (size: string | undefined, n: number) => void }) {
  const firstIn = item.sizes?.find((s) => left(s) > 0);
  const [size, setSize] = useState(firstIn);
  const have = left(size);
  const qty = inCart(size);
  const gone = item.sizes ? !firstIn : have === 0;
  return (
    <article className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-50"><MerchArt item={item} size={60} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-bold leading-tight text-slate-900">{item.name}</h3>
          <span className="tabular text-sm font-bold text-slate-900">{money(item.priceCents)}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{item.blurb}</p>
        {item.sizes && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.sizes.map((s) => (
              <button key={s} disabled={left(s) === 0} onClick={() => setSize(s)} aria-pressed={size === s} aria-label={`Size ${s}${left(s) === 0 ? ', sold out' : ''}`} className={`rounded-full px-2.5 py-1 text-xs font-bold disabled:line-through disabled:opacity-40 ${size === s ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{s}</button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`text-xs ${gone ? 'font-semibold text-rose-600' : 'text-amber-700'}`}>{gone ? 'Sold out' : have <= 3 ? `Only ${have} left` : ''}</span>
          {qty > 0 ? (
            <div className="flex items-center gap-1">
              <button aria-label={`One fewer ${item.name}`} onClick={() => add(size, -1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200"><Minus size={14} /></button>
              <span className="tabular w-6 text-center text-sm font-bold">{qty}</span>
              <button aria-label={`One more ${item.name}`} disabled={qty >= have} onClick={() => add(size, 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 disabled:opacity-40"><Plus size={14} /></button>
            </div>
          ) : (
            <button disabled={gone} onClick={() => add(size, 1)} aria-label={`Add ${item.name}`} className="rounded-full bg-box-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-box-600 disabled:bg-slate-300">Add</button>
          )}
        </div>
      </div>
    </article>
  );
}

function Confirmation({ order, onClose }: { order: Order; onClose: () => void }) {
  const demo = useDemo();
  const live = demo.state.orders.find((o) => o.id === order.id) ?? order;
  const texts = demo.state.texts.filter((t) => t.orderId === order.id).reverse();
  const ready = live.status === 'ready' || live.status === 'done';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={28} /></div>
        <h2 className="mt-4 font-display text-2xl font-bold">{ready ? `Order #${order.number} is ready` : `Order #${order.number} is in`}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick up {isoLocal(order.pickupAt!) === isoLocal(new Date().toISOString()) ? 'today' : 'on ' + longDate(isoLocal(order.pickupAt!))} at{' '}
          <span className="font-semibold text-slate-900">{timeLabel(order.pickupAt!)}</span>.
        </p>
        {texts.length > 0 && (
          <div className="mt-4 rounded-2xl bg-slate-100 p-3 text-left">
            <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Texts to {formatPhone(order.phone ?? '')}</p>
            <ul className="mt-2 space-y-1.5">
              {texts.map((t, i) => (
                <li key={i} className="donut-drop max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm">
                  {t.body}
                  <span className="mt-0.5 block text-[10px] text-slate-400">{timeLabel(t.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {order.phone && (() => {
          const m = demo.findMember(order.phone);
          if (!m) return null;
          // Only a brand new member gets the card link on this screen. Anyone can type any number at checkout,
          // so an existing member's card only ever goes to their own phone by text.
          if (m.visits <= 1 && m.joined === demo.state.today) {
            return (
              <Link to={`/demo/shop/card/${cardCode(order.phone)}`} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-box-50 px-3 py-2.5 text-sm font-semibold text-box-700 hover:bg-box-100">
                Get your Dough Rewards card for your phone wallet
              </Link>
            );
          }
          return <p className="mt-3 rounded-xl bg-box-50 px-3 py-2.5 text-center text-sm text-box-700">Your Dough Rewards card is in the texts we sent to {lastFour(order.phone)}.</p>;
        })()}
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          This order just landed in <span className="font-semibold">Pickup orders</span> on the Register, where the counter staff pack it.
          {order.phone ? ' When they tap "Packed and ready", the customer gets a text.' : ''} Demo: texts are shown here, not sent.
        </p>
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">Done</button>
      </div>
    </div>
  );
}

/** The most donuts and drinks one online order can hold: twelve dozen. */
const MAX_ONLINE_ITEMS = 144;

function isoLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

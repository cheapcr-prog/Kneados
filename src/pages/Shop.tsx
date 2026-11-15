import { Check, Clock, GripVertical, MapPin, Minus, Phone, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { OrderTray, useBox } from '../components/BoxBuilder';
import type { Box } from '../components/BoxBuilder';
import { ItemArt } from '../components/ItemArt';
import { MENU, MENU_BY_ID, SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { Category, MenuItem, Order } from '../data/types';
import { longDate, timeLabel } from '../lib/dates';
import { formatPhone, money } from '../lib/money';
import { boxCounts, boxPrice, boxUpcharge, cartLines, isBoxable, linePrice, totals } from '../lib/pricing';
import type { OrderLine } from '../data/types';
import { PUNCHES_PER_REWARD } from '../lib/rewards';

const CATEGORIES: Category[] = ['Classics', 'Filled', 'Specialty', 'Drinks'];

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
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

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
      loose: Object.entries(loose).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, lineCents: linePrice(MENU_BY_ID[itemId], qty) })),
      lines: cartLines(loose, allBoxes, MENU_BY_ID),
    };
  }, [cart, boxes, box.filled.join(), box.full]);
  const count = order.lines.reduce((a, l) => a + l.qty, 0);
  const t = totals(order.lines, MENU_BY_ID);
  /** Taking one away comes out of the bag first, then out of the box being filled. */
  const add = (id: string, n: number) => {
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
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 text-sm text-slate-700">
          <span className="font-display text-base font-bold text-slate-900">Dough Rewards</span>
          <span>Every {PUNCHES_PER_REWARD}th visit, your donut is free. Just give your phone number at checkout.</span>
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MENU.filter((m) => m.category === cat).map((item) => (
                <MenuCard key={item.id} item={item} qty={cart[item.id] ?? 0} soldOut={soldOut(item.id)} add={add} box={box} boxOpen={boxOpen} />
              ))}
            </div>
          </section>
        ))}
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
        add={add}
        count={count}
        total={t.total}
        onCheckout={() => setOpen(true)}
      />

      {open && (
        <Checkout
          loose={order.loose}
          boxes={order.boxes}
          lines={order.lines}
          add={add}
          removeBox={(i) => (i < boxes.length ? setBoxes((b) => b.filter((_, k) => k !== i)) : box.clear())}
          onClose={() => setOpen(false)}
          onPlaced={(o) => { setPlaced(o); setCart({}); setBoxes([]); box.clear(); setBoxOpen(false); setOpen(false); }}
        />
      )}
      {placed && <Confirmation order={placed} onClose={() => setPlaced(null)} />}
    </div>
  );
}

/** The picture is the handle: drag it into the box, the bag or the cup holder. */
function MenuCard({ item, qty, soldOut, add, box, boxOpen }: { item: MenuItem; qty: number; soldOut: boolean; add: (id: string, n: number) => void; box: Box; boxOpen: boolean }) {
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
          <span className="tabular shrink-0 text-sm font-semibold text-slate-900">{money(item.price)}</span>
        </div>
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
      </div>
    </div>
  );
}

function Checkout({ loose, boxes, lines, add, removeBox, onClose, onPlaced }: {
  loose: OrderLine[];
  boxes: string[][];
  lines: OrderLine[];
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
  const t = totals(lines, MENU_BY_ID);
  const digits = phone.replace(/\D/g, '');
  const pickup = slot || slots[0]?.toISOString() || '';
  const ready = lines.length > 0 && name.trim().length > 1 && digits.length === 10 && pickup;
  const member = digits.length === 10 ? demo.findMember(digits) : undefined;

  const place = () => {
    if (!ready) return;
    const order = demo.placeOrder({
      source: 'online', pickupAt: pickup, customerName: name.trim(), phone: digits, lines,
      subtotal: t.subtotal, tax: t.tax, tip: 0, total: t.total, payment: 'online', status: 'new',
      ...(boxes.length ? { boxes } : {}),
    });
    if (rewards) demo.punchVisit(digits, name.trim());
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
          </ul>

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
                  {member
                    ? `Welcome back, ${member.name}. You have ${member.punches} of ${PUNCHES_PER_REWARD} punches.`
                    : `Free donut every ${PUNCHES_PER_REWARD}th visit. We'll text you when you earn one.`}
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="tabular">{money(t.subtotal)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular">{money(t.tax)}</dd></div>
            <div className="flex justify-between text-base font-bold text-slate-900"><dt>Total</dt><dd className="tabular">{money(t.total)}</dd></div>
          </dl>
          <button disabled={!ready} onClick={place} className="mt-3 w-full rounded-xl bg-box-500 py-3.5 text-sm font-bold text-white hover:bg-box-600 disabled:bg-slate-300">
            Place order
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Demo shop: no card is charged. A live shop takes payment here with Stripe.</p>
        </div>
      </div>
    </div>
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
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          This order just landed in <span className="font-semibold">Pickup orders</span> on the Register, where the counter staff pack it.
          {order.phone ? ' When they tap "Packed and ready", the customer gets a text.' : ''} Demo: texts are shown here, not sent.
        </p>
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">Done</button>
      </div>
    </div>
  );
}

function isoLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

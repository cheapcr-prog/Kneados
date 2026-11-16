import { ChevronDown, ChevronUp, Shuffle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { MENU, MENU_BY_ID, SHOP, isDrink } from '../data/shop';
import { money } from '../lib/money';
import { BOX_SIZE, boxPrice, isBoxable } from '../lib/pricing';
import type { ToppingLine } from '../lib/toppings';
import { ItemArt } from './ItemArt';

type Slots = (string | null)[];
/** Where a drag is hovering: a box slot, the box in general, the bag, the cup holder, or nowhere. */
type Target = number | 'box' | 'bag' | 'cups' | null;
interface Drag { itemId: string; from: number | null; x: number; y: number }

const EMPTY: Slots = Array(BOX_SIZE).fill(null);
const BOXABLE = MENU.filter(isBoxable);
const CUP_WELLS = 4;

function targetAt(x: number, y: number): Target {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const slot = el?.closest<HTMLElement>('[data-slot]');
  if (slot) return Number(slot.dataset.slot);
  const zone = el?.closest<HTMLElement>('[data-zone]')?.dataset.zone;
  return zone === 'box' || zone === 'bag' || zone === 'cups' ? zone : null;
}

/**
 * The dozen box and the drag that fills the order tray. The menu and the tray both use it:
 * items are picked up from the menu and dropped on the box, the bag or the cup holder.
 * `addLoose` puts one item in the bag or cup holder, which is the ordinary cart.
 */
export function useBox(isSoldOut: (id: string) => boolean, addLoose: (id: string) => void) {
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Target>(null);
  /** A finished drag also fires a click on the element it started on. This swallows that click. */
  const justDragged = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  /** Drag handlers outlive the render they started in, so they read the latest box and cart through this. */
  const live = useRef({ slots, addLoose });
  live.current = { slots, addLoose };

  const filled = slots.filter((s): s is string => s !== null);

  const place = (itemId: string, from: number | null, target: Target) => {
    const next = [...live.current.slots];
    const onBox = typeof target === 'number' || target === 'box';
    if (from === null) {
      if (target === null) return;
      if (onBox && isBoxable(MENU_BY_ID[itemId])) {
        const idx = typeof target === 'number' ? target : next.indexOf(null);
        if (idx < 0) return;
        next[idx] = itemId;
      } else {
        live.current.addLoose(itemId);
        return;
      }
    } else if (typeof target === 'number') {
      [next[from], next[target]] = [next[target], next[from]];
    } else if (target === 'box') {
      return;
    } else {
      next[from] = null;
      if (target !== null) live.current.addLoose(itemId);
    }
    setSlots(next);
  };

  const startDrag = (e: ReactPointerEvent, itemId: string, from: number | null) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
      active = true;
      setDrag({ itemId, from, x: ev.clientX, y: ev.clientY });
      setOver(targetAt(ev.clientX, ev.clientY));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cleanup.current = null;
    };
    const end = (ev: PointerEvent) => {
      stop();
      if (active) {
        justDragged.current = true;
        setTimeout(() => { justDragged.current = false; }, 0);
        if (ev.type === 'pointerup') place(itemId, from, targetAt(ev.clientX, ev.clientY));
      }
      setDrag(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    cleanup.current = stop;
  };

  return {
    slots,
    filled,
    full: filled.length === BOX_SIZE,
    price: boxPrice(filled, MENU_BY_ID),
    drag,
    over,
    place,
    startDrag,
    /** Wraps a click handler so the click that ends a drag does nothing. */
    tap: (fn: () => void) => () => { if (!justDragged.current) fn(); },
    /** Takes one of this donut out of the box. Returns false if there was none. */
    removeOne: (itemId: string) => {
      const idx = live.current.slots.lastIndexOf(itemId);
      if (idx < 0) return false;
      setSlots(live.current.slots.map((v, i) => (i === idx ? null : v)));
      return true;
    },
    fillRest: () => {
      const pool = BOXABLE.filter((m) => !isSoldOut(m.id));
      if (pool.length === 0) return;
      setSlots((s) => s.map((v) => v ?? pool[Math.floor(Math.random() * pool.length)].id));
    },
    clear: () => setSlots(EMPTY),
  };
}

export type Box = ReturnType<typeof useBox>;

function Zone({ zone, hot, label, hint, empty, className, children }: { zone: 'bag' | 'cups'; hot: boolean; label: string; hint: string; empty: boolean; className: string; children: ReactNode }) {
  return (
    <section data-zone={zone} aria-label={label} className={`flex min-w-0 flex-col rounded-2xl p-2 transition ${hot ? 'ring-4 ring-box-200' : ''} ${className}`}>
      <h3 className="px-0.5 text-[11px] font-bold uppercase tracking-wider">{label}</h3>
      <div className="mt-1 flex flex-1 flex-wrap content-center items-center justify-center gap-1.5">
        {empty ? <p className="px-1 text-center text-[11px] leading-tight opacity-70">{hint}</p> : children}
      </div>
    </section>
  );
}

/**
 * The order as the customer would carry it out: a dozen box, a paper bag and a cup holder.
 * It slides up from the bottom of the menu. The bag and the cup holder show the ordinary cart.
 */
export function OrderTray({ box, boxOpen, onOpenBox, onCloseBox, closedBoxes, onAnotherBox, cart, add, toppings, removeTopping, count, total, onCheckout }: {
  /** Which drink each topping is in. */
  toppings: ToppingLine[];
  removeTopping: (drink: string, addon: string) => void;
  box: Box;
  boxOpen: boolean;
  onOpenBox: () => void;
  onCloseBox: () => void;
  closedBoxes: number;
  onAnotherBox: () => void;
  cart: Record<string, number>;
  add: (id: string, n: number) => void;
  count: number;
  total: number;
  onCheckout: () => void;
}) {
  const { slots, filled, full, price, drag, over } = box;
  const [small, setSmall] = useState(false);
  const visible = count > 0 || boxOpen;
  const loose = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ item: MENU_BY_ID[id], qty: q }));
  const bag = loose.filter((l) => !isDrink(l.item));
  const cups = loose.filter((l) => isDrink(l.item) && !l.item.addon).flatMap((l) => Array<typeof l.item>(l.qty).fill(l.item));
  const boxHot = drag !== null && (over === 'box' || typeof over === 'number');

  return (
    <>
      <div
        inert={!visible}
        className={`fixed inset-x-0 bottom-0 z-40 px-2 transition-transform duration-300 ease-out motion-reduce:transition-none ${visible ? 'translate-y-0' : 'translate-y-[110%]'}`}
      >
        <div className="mx-auto max-w-5xl rounded-t-[26px] bg-slate-900 p-2.5 text-white shadow-[0_-12px_40px_rgba(11,18,32,0.35)] sm:p-3">
          {!small && (
            <div className="mb-2.5 grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_200px_150px]">
              {boxOpen ? (
                <section data-zone="box" aria-label="Your dozen box" className={`col-span-2 rounded-2xl bg-box-500 p-2 transition md:col-span-1 ${boxHot ? 'ring-4 ring-box-200' : ''}`}>
                  <div className="flex items-center gap-2 px-0.5 pb-1.5">
                    <h3 className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider">Dozen box</h3>
                    <span className="tabular whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold" aria-live="polite">{filled.length} of {BOX_SIZE}</span>
                    <span className="tabular ml-auto min-w-0 truncate text-[11px] font-semibold text-box-50">
                      {full
                        ? `${money(price.cents)}${price.extras > 0 ? ` (${money(price.extras)} specialty)` : ''}`
                        : filled.length > 0 ? `${BOX_SIZE - filled.length} to go` : `Any twelve for ${money(SHOP.dozenBase)}`}
                    </span>
                    {full ? (
                      <button type="button" onClick={onAnotherBox} className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-box-700 hover:bg-box-50">Start another box</button>
                    ) : (
                      <button type="button" onClick={box.fillRest} className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold hover:bg-white/25">
                        <Shuffle size={12} /> {filled.length === 0 ? 'Surprise me' : 'Fill the rest'}
                      </button>
                    )}
                    <button type="button" aria-label="Put the box away" title="Put the box away. Its donuts go in the bag." onClick={onCloseBox} className="rounded-full bg-white/15 p-1 hover:bg-white/25"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 rounded-xl bg-[#fff8ef] p-1.5 md:grid-cols-12">
                    {slots.map((id, i) => {
                      const item = id ? MENU_BY_ID[id] : null;
                      return (
                        <div
                          key={i}
                          data-slot={i}
                          className={`flex aspect-square items-center justify-center rounded-full border-2 border-dashed transition ${drag !== null && over === i ? 'scale-105 border-box-500 bg-box-100' : item ? 'border-transparent' : 'border-box-200 bg-white/60'}`}
                        >
                          {item && (
                            <button
                              key={`${id}-${i}`}
                              type="button"
                              onPointerDown={(e) => box.startDrag(e, item.id, i)}
                              onClick={box.tap(() => box.place(item.id, i, null))}
                              aria-label={`Remove ${item.name} from the box`}
                              title="Tap to take it out"
                              className={`donut-drop flex h-full w-full cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing ${drag?.from === i ? 'opacity-25' : ''}`}
                            >
                              <span className="block h-[88%] w-[88%] [&>*]:!h-full [&>*]:!w-full"><ItemArt item={item} /></span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <button type="button" onClick={onOpenBox} className="col-span-2 flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-box-400 px-3 py-3 text-left hover:bg-white/5 md:col-span-1">
                  <span className="grid shrink-0 grid-cols-4 gap-0.5 rounded-md bg-box-500 p-1">
                    {Array.from({ length: BOX_SIZE }, (_, i) => <span key={i} className="h-2 w-2 rounded-full bg-[#fff8ef]" />)}
                  </span>
                  <span>
                    <span className="block text-sm font-bold">Get a dozen box</span>
                    <span className="block text-xs text-slate-300">Any twelve donuts for {money(SHOP.dozenBase)}</span>
                  </span>
                </button>
              )}

              <Zone zone="bag" hot={drag !== null && over === 'bag'} label="Paper bag" hint="Drop donuts and pastries here" empty={bag.length === 0} className="bg-white text-slate-700 [clip-path:polygon(0_6px,4%_0,8%_6px,12%_0,16%_6px,20%_0,24%_6px,28%_0,32%_6px,36%_0,40%_6px,44%_0,48%_6px,52%_0,56%_6px,60%_0,64%_6px,68%_0,72%_6px,76%_0,80%_6px,84%_0,88%_6px,92%_0,96%_6px,100%_0,100%_100%,0_100%)] pt-3">
                {bag.map(({ item, qty }) => (
                  <button key={item.id} type="button" onClick={() => add(item.id, -1)} aria-label={`Take one ${item.name} out of the bag`} title="Tap to take one out" className="donut-drop relative">
                    <ItemArt item={item} size={34} />
                    {qty > 1 && <span className="tabular absolute -right-1.5 -top-1 rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white">{qty}</span>}
                  </button>
                ))}
              </Zone>

              <Zone zone="cups" hot={drag !== null && over === 'cups'} label="Cup holder" hint="Drinks go here" empty={cups.length === 0 && toppings.length === 0} className="bg-slate-200 text-slate-600">
                <div className="grid grid-cols-4 gap-1 md:grid-cols-2">
                  {Array.from({ length: CUP_WELLS }, (_, i) => {
                    const item = cups[i];
                    const extra = i === CUP_WELLS - 1 && cups.length > CUP_WELLS ? cups.length - CUP_WELLS : 0;
                    return (
                      <span key={i} className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-300 shadow-inner">
                        {item && (
                          <button key={`${item.id}-${i}`} type="button" onClick={() => add(item.id, -1)} aria-label={`Take one ${item.name} out of the cup holder`} title="Tap to take it out" className="donut-drop">
                            <ItemArt item={item} size={30} />
                          </button>
                        )}
                        {extra > 0 && <span className="tabular absolute -right-1 -top-1 rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white">+{extra}</span>}
                      </span>
                    );
                  })}
                </div>
                {toppings.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {toppings.map((t) => {
                      const what = MENU_BY_ID[t.addon].name.replace(/^Add /, '');
                      const drink = MENU_BY_ID[t.drink].name.replace(/ Smoothie/, '');
                      return (
                        <button key={`${t.drink}-${t.addon}`} type="button" onClick={() => removeTopping(t.drink, t.addon)} aria-label={`Take ${what} out of one ${MENU_BY_ID[t.drink].name}`} title="Tap to take one off" className="donut-drop flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-left text-[10px] font-bold leading-tight text-slate-700 shadow-sm">
                          {t.qty > 1 ? `${t.qty} ` : ''}{what} in {drink}
                          <X size={10} className="shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Zone>
            </div>
          )}

          <div className="flex items-center gap-2 px-1">
            <button type="button" onClick={() => setSmall((s) => !s)} aria-label={small ? 'Show your order' : 'Hide your order'} aria-expanded={!small} className="rounded-full bg-white/10 p-2 hover:bg-white/20">
              {small ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <p className="min-w-0 flex-1 text-sm leading-tight">
              <span className="font-semibold">{count === 0 ? 'Your order is empty' : `${count} item${count === 1 ? '' : 's'}`}</span>
              {closedBoxes > 0 && <span className="text-slate-300"> · {closedBoxes} dozen box{closedBoxes === 1 ? '' : 'es'} packed</span>}
            </p>
            <span className="tabular font-display text-lg font-bold">{money(total)}</span>
            <button type="button" disabled={count === 0} onClick={onCheckout} className="rounded-full bg-box-500 px-5 py-2.5 text-sm font-bold hover:bg-box-400 disabled:bg-slate-700 disabled:text-slate-400">
              Check out
            </button>
          </div>
        </div>
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rotate-6 drop-shadow-2xl" style={{ left: drag.x, top: drag.y }}>
          <ItemArt item={MENU_BY_ID[drag.itemId]} size={76} />
        </div>
      )}
    </>
  );
}

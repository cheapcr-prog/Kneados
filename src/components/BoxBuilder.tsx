import { Shuffle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MENU, MENU_BY_ID, SHOP } from '../data/shop';
import { money } from '../lib/money';
import { BOX_SIZE, boxPrice, boxUpcharge, isBoxable } from '../lib/pricing';
import { ItemArt } from './ItemArt';

type Slots = (string | null)[];
/** Where a drag is hovering: a slot number, the box in general, or nowhere. */
type Target = number | 'box' | null;
interface Drag { itemId: string; from: number | null; x: number; y: number }

const EMPTY: Slots = Array(BOX_SIZE).fill(null);
const BOXABLE = MENU.filter(isBoxable);

function targetAt(x: number, y: number): Target {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const slot = el?.closest<HTMLElement>('[data-slot]');
  if (slot) return Number(slot.dataset.slot);
  return el?.closest('[data-box]') ? 'box' : null;
}

/** Build your dozen: drag donuts from the case into the box, or tap to drop one in the next open spot. */
export function BoxBuilder({ isSoldOut, onAdd }: { isSoldOut: (id: string) => boolean; onAdd: (box: string[]) => void }) {
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Target>(null);
  const [added, setAdded] = useState(false);
  /** A finished drag also fires a click on the element it started on. This swallows that click. */
  const justDragged = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const filled = slots.filter((s): s is string => s !== null);
  const full = filled.length === BOX_SIZE;
  const price = boxPrice(filled, MENU_BY_ID);

  const place = (itemId: string, from: number | null, target: Target) => {
    setAdded(false);
    setSlots((s) => {
      const next = [...s];
      if (from === null) {
        if (target === null) return s;
        const idx = typeof target === 'number' ? target : next.indexOf(null);
        if (idx < 0) return s;
        next[idx] = itemId;
      } else if (target === null) {
        next[from] = null;
      } else if (typeof target === 'number') {
        [next[from], next[target]] = [next[target], next[from]];
      }
      return next;
    });
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

  const tap = (fn: () => void) => () => {
    if (justDragged.current) return;
    fn();
  };

  const fillRest = () => {
    const pool = BOXABLE.filter((m) => !isSoldOut(m.id));
    if (pool.length === 0) return;
    setAdded(false);
    setSlots((s) => s.map((v) => v ?? pool[Math.floor(Math.random() * pool.length)].id));
  };

  const addToOrder = () => {
    if (!full) return;
    onAdd(filled);
    setSlots(EMPTY);
    setAdded(true);
  };

  return (
    <section id="box" className="border-b border-slate-200 bg-box-50">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">Build your dozen</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Drag donuts into the box, or tap one to drop it in the next open spot. A dozen is {money(SHOP.dozenBase)}. Specialty donuts add a little extra, shown on each one.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-box-700">The case</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-3">
              {BOXABLE.map((item) => {
                const out = isSoldOut(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={out || full}
                    onPointerDown={(e) => !out && startDrag(e, item.id, null)}
                    onClick={tap(() => place(item.id, null, 'box'))}
                    aria-label={`Add ${item.name} to the box`}
                    className="group flex touch-none select-none flex-col items-center rounded-2xl border border-box-100 bg-white px-0.5 pb-2 pt-2.5 shadow-sm sm:px-1 sm:pt-3 transition enabled:cursor-grab enabled:hover:-translate-y-0.5 enabled:hover:border-box-400 enabled:hover:shadow-md enabled:active:cursor-grabbing disabled:opacity-45"
                  >
                    <span className="block h-10 w-10 sm:h-[52px] sm:w-[52px] [&>svg]:h-full [&>svg]:w-full"><ItemArt item={item} /></span>
                    <span className="mt-1.5 line-clamp-2 min-h-[2.2em] text-center text-[10px] font-semibold leading-tight text-slate-800 sm:text-xs">{item.name}</span>
                    <span className={`tabular text-[11px] font-semibold ${out ? 'text-slate-500' : boxUpcharge(item) > 0 ? 'text-box-700' : 'text-emerald-700'}`}>
                      {out ? 'Sold out' : boxUpcharge(item) > 0 ? `+${money(boxUpcharge(item))}` : 'Included'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              data-box
              className={`rounded-[28px] bg-box-500 p-3 shadow-xl shadow-box-700/20 transition sm:p-4 ${drag && over !== null ? 'ring-4 ring-box-200' : ''}`}
            >
              <div className="flex items-center justify-between px-1 pb-2.5 text-white">
                <span className="font-display text-lg font-bold">{SHOP.name}</span>
                <span className="tabular rounded-full bg-white/20 px-3 py-1 text-sm font-bold" aria-live="polite">{filled.length} of {BOX_SIZE}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 rounded-2xl bg-[#fff8ef] p-2.5 sm:gap-3 sm:p-4">
                {slots.map((id, i) => {
                  const item = id ? MENU_BY_ID[id] : null;
                  const hot = drag !== null && over === i;
                  const lifted = drag?.from === i;
                  return (
                    <div
                      key={i}
                      data-slot={i}
                      className={`flex aspect-square items-center justify-center rounded-full border-2 border-dashed transition ${hot ? 'scale-105 border-box-500 bg-box-100' : item ? 'border-transparent' : 'border-box-200 bg-white/60'}`}
                    >
                      {item && (
                        <button
                          key={`${id}-${i}`}
                          type="button"
                          onPointerDown={(e) => startDrag(e, item.id, i)}
                          onClick={tap(() => place(item.id, i, null))}
                          aria-label={`Remove ${item.name} from the box`}
                          title="Tap to take it out"
                          className={`donut-drop flex h-full w-full touch-none select-none items-center justify-center cursor-grab active:cursor-grabbing ${lifted ? 'opacity-25' : ''}`}
                        >
                          <span className="block h-[84%] w-[84%] [&>svg]:h-full [&>svg]:w-full"><ItemArt item={item} /></span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 basis-full xl:flex-1 xl:basis-auto">
                {added && filled.length === 0 ? (
                  <p className="text-sm font-semibold text-emerald-700">Box added to your order. Build another, or check out below.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">
                      <span className="tabular font-display text-2xl font-bold text-slate-900">{money(SHOP.dozenBase + price.extras)}</span>
                      {full && price.singles > price.cents && <span className="ml-2 whitespace-nowrap font-semibold text-emerald-700">You save {money(price.singles - price.cents)}</span>}
                    </p>
                    <p className="tabular text-xs text-slate-600">
                      Dozen {money(SHOP.dozenBase)}
                      {price.extras > 0 && ` + ${money(price.extras)} specialty`}
                      {!full && ` · ${filled.length === 0 ? 'your box is empty' : `${BOX_SIZE - filled.length} more to fill the box`}`}
                    </p>
                  </>
                )}
              </div>
              <button type="button" onClick={fillRest} disabled={full} className="flex items-center gap-1.5 rounded-full border border-box-200 bg-white px-3.5 py-2 text-xs font-bold text-box-700 hover:bg-box-100 disabled:opacity-40">
                <Shuffle size={14} /> {filled.length === 0 ? 'Surprise me' : 'Fill the rest'}
              </button>
              <button type="button" onClick={() => { setSlots(EMPTY); setAdded(false); }} disabled={filled.length === 0} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <Trash2 size={14} /> Empty box
              </button>
              <button type="button" onClick={addToOrder} disabled={!full} className="w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-300 sm:w-auto">
                Add box to order
              </button>
            </div>
          </div>
        </div>
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rotate-6 drop-shadow-2xl" style={{ left: drag.x, top: drag.y }}>
          <ItemArt item={MENU_BY_ID[drag.itemId]} size={76} />
        </div>
      )}
    </section>
  );
}

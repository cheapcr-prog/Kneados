import { Check, ChevronLeft, ChevronRight, Flame, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { money } from '../lib/money';
import { CHEESES, CRUSTS, PIZZA_SHOP, SAUCES, SIZES, SPECIALTIES, SPECIALTY_BY_ID, TOPPING_BY_ID, TOPPINGS, type PizzaConfig, type Side } from './data';
import { NOTE_GROUPS, configFor, plainConfig, pizzaPrice, toggleNote, toppingCents, validNotes, type PizzaLine } from './logic';
import { PizzaArt, ToppingSwatch } from './PizzaArt';

/** A small circle filled on the left, the right, or all the way. */
function HalfIcon({ side }: { side: Side }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden className="mx-auto">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {side === 'whole' ? <circle cx="8" cy="8" r="6.5" fill="currentColor" /> : <path d={side === 'left' ? 'M8 1.5 A6.5 6.5 0 0 0 8 14.5 Z' : 'M8 1.5 A6.5 6.5 0 0 1 8 14.5 Z'} fill="currentColor" />}
    </svg>
  );
}

const STEPS = [
  { id: 'dough', label: 'Dough', hint: 'Pick a size and stretch the dough.' },
  { id: 'sauce', label: 'Sauce', hint: 'Ladle on a sauce.' },
  { id: 'cheese', label: 'Cheese', hint: 'Cover it in cheese.' },
  { id: 'toppings', label: 'Toppings', hint: 'Pile them on, the whole pie or half and half.' },
  { id: 'bake', label: 'Bake', hint: 'How should we bake and cut it?' },
] as const;

const SIDE_WORDS: Record<Side, string> = { whole: 'the whole pie', left: 'the left half', right: 'the right half' };
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Drag = { id: string; x0: number; y0: number; x: number; y: number; moving: boolean };

/**
 * Build your own pizza, or change a specialty, one step at a time the way the kitchen makes it:
 * dough, sauce, cheese, toppings, then the oven. Every step plays onto the pie as you pick it.
 * Toppings can be dragged onto the pie with a finger or a mouse: drop in the middle for the whole pie,
 * or on one side for a half. `guided={false}` shows every option at once for the counter register.
 */
export function Builder({ start, out = [], onAdd, addLabel = 'Add to order', dark = false, guided = true }: {
  start?: { specialtyId?: string; config?: PizzaConfig };
  /** Toppings that are out of stock today. */
  out?: string[];
  onAdd: (line: PizzaLine) => void;
  addLabel?: string;
  dark?: boolean;
  /** Step by step with the oven at the end (the website), or everything on one screen (the register). */
  guided?: boolean;
}) {
  const [specialtyId, setSpecialtyId] = useState<string | undefined>(start?.specialtyId);
  const [config, setConfig] = useState<PizzaConfig>(start?.config ?? (start?.specialtyId ? configFor(start.specialtyId) : plainConfig()));
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState(0);
  const [caption, setCaption] = useState<{ text: string; n: number }>({ text: start?.specialtyId ? `Starting from the ${SPECIALTY_BY_ID[start.specialtyId]?.name}` : 'Fresh dough, ready to stretch', n: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [baking, setBaking] = useState<PizzaLine | null>(null);
  const pie = useRef<HTMLDivElement>(null);
  const price = pizzaPrice(config, specialtyId);
  const sp = specialtyId ? SPECIALTY_BY_ID[specialtyId] : undefined;

  const say = (text: string) => setCaption((c) => ({ text, n: c.n + 1 }));
  const set = (patch: Partial<PizzaConfig>) => setConfig((c) => {
    const next = { ...c, ...patch };
    // Keep the crust valid for the size.
    const crust = CRUSTS.find((x) => x.id === next.crust)!;
    if (!crust.sizes.includes(next.size)) next.crust = 'hand';
    if (next.notes?.length) next.notes = validNotes(next.notes, next.sauce);
    return next;
  });
  /** Puts a topping on a side. Tapping the side it is already on takes it off, unless it was dropped there. */
  const place = (id: string, side: Side | null, dropped = false) => {
    const was = config.toppings[id];
    const off = side === null || (was === side && !dropped);
    setConfig((c) => {
      const toppings = { ...c.toppings };
      if (off) delete toppings[id];
      else toppings[id] = side!;
      return { ...c, toppings };
    });
    const name = TOPPING_BY_ID[id]?.name ?? id;
    say(off ? `Took the ${name.toLowerCase()} off` : `${name} on ${SIDE_WORDS[side!]}`);
  };
  const startFrom = (id: string) => {
    if (!id) { setSpecialtyId(undefined); setConfig(plainConfig(config.size)); say('Back to a plain cheese pizza'); return; }
    setSpecialtyId(id);
    setConfig({ ...configFor(id, config.size), crust: config.crust });
    say(`Starting from the ${SPECIALTY_BY_ID[id].name}`);
  };

  // Dragging a topping: works the same with a mouse, a pen or a finger.
  const zoneAt = (x: number, y: number): Side | null => {
    const b = pie.current?.getBoundingClientRect();
    if (!b) return null;
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2, r = b.width / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d > r * 1.05) return null;
    if (d < r * 0.3) return 'whole';
    return x < cx ? 'left' : 'right';
  };
  const target = drag?.moving ? zoneAt(drag.x, drag.y) : null;
  const grab = (id: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false });
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, moving: d.moving || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6 });
  const drop = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moving) { place(d.id, config.toppings[d.id] ? null : 'whole'); return; }
    const side = zoneAt(e.clientX, e.clientY);
    if (side) place(d.id, side, true);
  };

  const line: PizzaLine = { kind: 'pizza', config, specialtyId, qty, unitCents: price.cents };
  const finish = () => {
    if (!guided || reducedMotion()) { onAdd(line); setQty(1); return; }
    setBaking(line);
  };

  const card = dark ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white';
  const chip = (active: boolean) => `rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${active ? 'border-emerald-600 bg-emerald-600 text-white' : dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-200 hover:border-emerald-500'}`;
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const heading = (text: string) => !guided && <h3 className="font-display text-lg font-bold">{text}</h3>;

  const summary = (
    <div className={`rounded-2xl border p-3 text-sm ${card}`}>
      {price.parts.map((p, i) => (
        <div key={i} className="flex justify-between gap-2"><span className={i ? muted : 'font-semibold'}>{p.label}</span><span className="tabular">{money(p.cents)}</span></div>
      ))}
      {config.notes?.length ? <div className="flex justify-between gap-2"><span className={muted}>{config.notes.join(', ')}</span><span className={`text-xs ${muted}`}>no charge</span></div> : null}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200/60 pt-2">
        <div className="flex items-center gap-2">
          <button aria-label="One fewer" onClick={() => setQty(Math.max(1, qty - 1))} className={`rounded-full p-1.5 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}><Minus size={14} /></button>
          <span className="tabular w-5 text-center font-bold">{qty}</span>
          <button aria-label="One more" onClick={() => setQty(qty + 1)} className={`rounded-full p-1.5 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}><Plus size={14} /></button>
        </div>
        {/* One final action: on the website it bakes the pie, then adds it to the order. */}
        <button disabled={!!baking} onClick={finish} className={`flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 ${guided ? 'bg-orange-600 hover:bg-orange-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
          {guided ? <><Flame size={15} /> Put it in the oven</> : addLabel} · {money(price.cents * qty)}
        </button>
      </div>
    </div>
  );

  const doughStep = (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Start from</h3>
          <button onClick={() => startFrom('')} className={`flex items-center gap-1 text-xs font-semibold ${muted}`}><RotateCcw size={12} /> Start over</button>
        </div>
        <select value={specialtyId ?? ''} onChange={(e) => startFrom(e.target.value)} className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold ${dark ? 'border-white/15 bg-ink-800' : 'border-slate-200 bg-white'}`}>
          <option value="">Build your own (cheese pizza)</option>
          {SPECIALTIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {sp && <p className={`mt-1 text-xs ${muted}`}>{sp.blurb} Its toppings are included; anything you add is extra.</p>}
      </section>
      <section>
        <h3 className="font-display text-lg font-bold">Size</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <button key={s.id} onClick={() => { set({ size: s.id }); say(`Stretched out a ${s.inches} inch ${s.label.toLowerCase()}`); }} className={chip(config.size === s.id)}>
              {s.label} {s.inches}"
              <span className="block text-xs font-normal opacity-80">{s.slices} slices · {money(sp ? sp.prices[s.id] : s.baseCents)}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="font-display text-lg font-bold">Crust</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CRUSTS.map((c) => {
            const ok = c.sizes.includes(config.size);
            return (
              <button key={c.id} disabled={!ok} onClick={() => { set({ crust: c.id }); say(c.id === 'pan' ? 'Pressed the dough into a Detroit pan' : `${c.label} dough`); }} className={`${chip(config.crust === c.id)} disabled:opacity-40`}>
                {c.label}{c.extraCents ? ` +${money(c.extraCents)}` : ''}
                <span className="block text-xs font-normal opacity-80">{ok ? c.note : `Not on a ${config.size === 'S' ? 'small' : 'this size'}`}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  const sauceStep = (
    <section>
      {heading('Sauce')}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SAUCES.map((s) => (
          <button key={s.id} onClick={() => { set({ sauce: s.id }); say(s.id === 'none' ? 'No sauce, just the dough' : `Ladled on the ${s.label.toLowerCase()}`); }} className={`${chip(config.sauce === s.id)} flex items-center gap-2`}>
            <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: s.color }} />{s.label}{s.extraCents ? ` +${money(s.extraCents)}` : ''}
          </button>
        ))}
      </div>
    </section>
  );

  const cheeseStep = (
    <section>
      {heading('Cheese')}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CHEESES.map((c) => (
          <button key={c.id} onClick={() => { set({ cheese: c.id }); say(c.id === 'none' ? 'No cheese' : `Covered it in ${c.label.toLowerCase()}`); }} className={chip(config.cheese === c.id)}>
            {c.label}{c.extra[config.size] ? ` +${money(c.extra[config.size])}` : ''}
          </button>
        ))}
      </div>
    </section>
  );

  const toppingsStep = (
    <div className="space-y-5">
      {guided && <p className={`text-xs ${muted}`}>Grab a topping by its picture and drag it onto the pie: drop it in the middle for the whole pie, or on the left or right half. You can also tap it, or use the half buttons.</p>}
      {(['meat', 'veggie'] as const).map((kind) => (
        <section key={kind}>
          <h3 className="font-display text-lg font-bold">{kind === 'meat' ? 'Meats' : 'Veggies and cheeses'}</h3>
          <div className={`mt-2 grid gap-1.5 sm:grid-cols-2 ${guided ? 'lg:grid-cols-1' : ''}`}>
            {TOPPINGS.filter((t) => t.kind === kind).map((t) => {
              const side = config.toppings[t.id] as Side | undefined;
              const gone = out.includes(t.id) && !side;
              const included = sp?.toppings.includes(t.id);
              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${side ? 'border-emerald-500 bg-emerald-50 text-slate-900' : dark ? 'border-white/10' : 'border-slate-200 bg-white'} ${gone ? 'opacity-40' : ''} ${drag?.id === t.id && drag.moving ? 'ring-2 ring-emerald-400' : ''}`}>
                  <button
                    disabled={gone}
                    onPointerDown={gone ? undefined : grab(t.id)}
                    onPointerMove={move}
                    onPointerUp={drop}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(t.id, side ? null : 'whole'); } }}
                    aria-label={`${t.name}: drag onto the pizza, or press to put it on the whole pie`}
                    className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-2 text-left active:cursor-grabbing"
                  >
                    <span className={`flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-lg ${dark ? 'bg-white/10' : 'bg-amber-50'}`}><ToppingSwatch t={t} size={28} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{t.name}</span>
                      <span className={`block text-[11px] ${side ? 'text-slate-500' : muted}`}>
                        {gone ? 'Out today' : included ? 'Included' : `+${money(toppingCents(config.size, t.id, 'whole'))} · half ${money(toppingCents(config.size, t.id, 'left'))}`}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    {(['left', 'whole', 'right'] as Side[]).map((s) => (
                      <button
                        key={s}
                        disabled={gone}
                        aria-label={`${t.name} on ${SIDE_WORDS[s]}`}
                        aria-pressed={side === s}
                        onClick={() => place(t.id, s)}
                        className={`h-8 w-8 rounded-lg text-sm leading-none ${side === s ? 'bg-emerald-600 text-white' : dark && !side ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        <HalfIcon side={s} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const bakeStep = (
    <section>
      <h3 className="font-display text-lg font-bold">Bake and cut</h3>
      <p className={`text-xs ${muted}`}>Pick one from each row, or leave it as the kitchen normally makes it.</p>
      <div className="mt-2 space-y-1.5">
        {NOTE_GROUPS.map((g) => {
          const off = g.needsSauce && config.sauce === 'none';
          return (
            <div key={g.label} className="flex flex-wrap items-center gap-1.5">
              <span className={`w-24 text-xs font-semibold ${muted}`}>{g.label}</span>
              {g.options.map((n) => {
                const on = !!config.notes?.includes(n);
                return <button key={n} disabled={off} aria-pressed={on} onClick={() => { set({ notes: toggleNote(config.notes, n, config.sauce) }); say(on ? `No ${n.toLowerCase()}` : n); }} className={`${chip(on)} !py-1.5 disabled:opacity-40`}>{n}</button>;
              })}
              {off && <span className={`text-xs ${muted}`}>No sauce on this pizza</span>}
            </div>
          );
        })}
      </div>
    </section>
  );

  const panels: ReactNode[] = [doughStep, sauceStep, cheeseStep, toppingsStep, bakeStep];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* On a phone the pie stays pinned at the top, so toppings can be dragged up onto it. */}
      <div className={`sticky -top-5 z-20 -mx-5 self-start px-5 pb-2 pt-1 lg:top-0 lg:mx-0 lg:px-0 lg:pb-0 ${dark ? 'bg-ink-900/95' : 'bg-white/95'} backdrop-blur lg:bg-transparent lg:backdrop-blur-none`}>
        <div
          ref={pie}
          className={`relative mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center rounded-full sm:max-w-[300px] lg:max-w-[380px] ${dark ? 'bg-white/5' : 'bg-[radial-gradient(circle,#f8fafc_55%,#e2e8f0_100%)]'}`}
        >
          {!baking && <PizzaArt config={config} size={360} className="h-auto w-[94%]" animate />}
          {target && (
            <svg viewBox="-50 -50 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <path
                d={target === 'whole' ? 'M0 -48 A48 48 0 1 1 0 48 A48 48 0 1 1 0 -48Z' : target === 'left' ? 'M0 -48 A48 48 0 0 0 0 48Z' : 'M0 -48 A48 48 0 0 1 0 48Z'}
                fill="rgba(52,211,153,0.25)" stroke="#34d399" strokeWidth="2"
              />
            </svg>
          )}
          {drag?.moving && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-900/80 px-3 py-1 text-xs font-bold text-white">
              {target ? `Drop on ${SIDE_WORDS[target]}` : 'Drop it on the pie'}
            </span>
          )}
          {baking && <Oven config={baking.config} onDone={() => { const l = baking; setBaking(null); setQty(1); onAdd(l); }} />}
        </div>
        <p key={caption.n} className={`pz-caption mt-2 min-h-[1.25rem] text-center text-sm font-semibold ${dark ? 'text-emerald-300' : 'text-emerald-700'}`} aria-live="polite">{baking ? 'In the oven…' : caption.text}</p>
        {guided && <div className="mt-3 hidden lg:block">{summary}</div>}
      </div>

      <div className="space-y-5">
        {guided ? (
          <>
            <ol className="grid grid-cols-5 gap-1" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    onClick={() => setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold transition ${i === step ? 'bg-emerald-600 text-white' : i < step ? 'bg-emerald-50 text-emerald-800' : dark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i === step ? 'bg-white text-emerald-700' : i < step ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>{i < step ? <Check size={13} /> : i + 1}</span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
            <div>
              <h3 className="font-display text-2xl font-bold">{STEPS[step].label}</h3>
              <p className={`text-sm ${muted}`}>{STEPS[step].hint}</p>
            </div>
            <div key={step} className="pz-caption">{panels[step]}</div>
            <div className="flex items-center justify-between gap-2">
              {step > 0
                ? <button onClick={() => setStep(step - 1)} className={`flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-bold ${dark ? 'bg-white/10' : 'bg-slate-100 hover:bg-slate-200'}`}><ChevronLeft size={16} /> {STEPS[step - 1].label}</button>
                : <span />}
              {step < STEPS.length - 1
                ? <button onClick={() => setStep(step + 1)} className="flex items-center gap-1 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-ink-800">Next: {STEPS[step + 1].label} <ChevronRight size={16} /></button>
                : <span className={`text-right text-xs ${muted}`}>Happy with it? Put it in the oven and it goes in your order.</span>}
            </div>
            <div className="lg:hidden">{summary}</div>
          </>
        ) : (
          <>
            {doughStep}
            <div className="grid gap-4 sm:grid-cols-2">{sauceStep}{cheeseStep}</div>
            {toppingsStep}
            {bakeStep}
            {summary}
          </>
        )}
      </div>

      {/* The piece under your finger while you drag. */}
      {drag?.moving && TOPPING_BY_ID[drag.id] && (
        <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" style={{ left: drag.x, top: drag.y }}>
          <div className="relative h-16 w-16">
            <span className="absolute left-0 top-1"><ToppingSwatch t={TOPPING_BY_ID[drag.id]} size={30} /></span>
            <span className="absolute right-0 top-3"><ToppingSwatch t={TOPPING_BY_ID[drag.id]} size={28} /></span>
            <span className="absolute bottom-0 left-4"><ToppingSwatch t={TOPPING_BY_ID[drag.id]} size={32} /></span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The deck oven: the pie slides in, bakes while the shop's real bake time counts down fast,
 * and comes out browned and steaming before it goes in the order. About three seconds in all.
 */
function Oven({ config, onDone }: { config: PizzaConfig; onDone: () => void }) {
  const [phase, setPhase] = useState<'ready' | 'in' | 'bake' | 'out'>('ready');
  const [left, setLeft] = useState(PIZZA_SHOP.bakeMinutes * 60);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('in'));
    const t = [
      setTimeout(() => setPhase('bake'), 700),
      setTimeout(() => setPhase('out'), 2300),
      setTimeout(() => done.current(), 3300),
    ];
    return () => { cancelAnimationFrame(raf); t.forEach(clearTimeout); };
  }, []);
  useEffect(() => {
    if (phase !== 'bake') return;
    const total = PIZZA_SHOP.bakeMinutes * 60;
    const began = performance.now();
    const id = setInterval(() => setLeft(Math.max(0, Math.round(total * (1 - (performance.now() - began) / 1500)))), 50);
    return () => clearInterval(id);
  }, [phase]);
  const inside = phase === 'in' || phase === 'bake';
  const pieStyle = phase === 'ready'
    ? { transform: 'translateY(75%) scale(0.9)', opacity: 0 }
    : inside ? { transform: 'translateY(14%) scale(0.56)', opacity: 1 } : { transform: 'translateY(0) scale(0.92)', opacity: 1 };
  const label = phase === 'out' ? 'Fresh out of the oven' : phase === 'bake' ? `Baking · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : `Into the ${550}° deck oven`;
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[2rem]" role="status" aria-label={label}>
      {/* Brick oven front with a glowing mouth. */}
      <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: phase === 'out' ? 0.25 : 1, background: 'repeating-linear-gradient(0deg,#5a3426 0 14px,#3d2219 14px 16px),#5a3426' }} />
      <div className="absolute inset-x-[9%] bottom-[10%] top-[24%] overflow-hidden rounded-t-full bg-[#1c0d07] transition-opacity duration-500" style={{ opacity: phase === 'out' ? 0 : 1 }}>
        <div className="pz-glow absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 85%, #ffb347 0%, #ff6a1a 35%, #7a1e05 70%, #1c0d07 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="pz-flame block w-4 rounded-t-full bg-gradient-to-t from-orange-500 to-yellow-300" style={{ height: 14 + (i % 3) * 8, animationDelay: `${i * 70}ms` }} />)}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out" style={pieStyle}>
        <PizzaArt config={config} size={360} className="h-auto w-[94%]" baked={phase === 'bake' || phase === 'out'} />
        {inside && <div className="pz-glow pointer-events-none absolute inset-[3%] rounded-full bg-orange-500/25 mix-blend-multiply" />}
      </div>
      {phase === 'out' && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center gap-8">
          {[0, 1, 2].map((i) => <span key={i} className="pz-steam block h-14 w-4 rounded-full bg-white/70 blur-[3px]" style={{ animationDelay: `${i * 250}ms` }} />)}
        </div>
      )}
      <div className="absolute inset-x-0 top-[7%] flex justify-center">
        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white tabular">{label}</span>
      </div>
      {phase === 'bake' && (
        <div className="absolute inset-x-[22%] bottom-[4%] h-1.5 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-orange-400" style={{ width: '100%', animation: 'pz-oven-bar 1.5s linear both' }} />
        </div>
      )}
    </div>
  );
}


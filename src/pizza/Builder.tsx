import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { money } from '../lib/money';
import { CHEESES, CRUSTS, SAUCES, SIZES, SPECIALTIES, SPECIALTY_BY_ID, TOPPINGS, type PizzaConfig, type Side } from './data';
import { NOTE_GROUPS, configFor, plainConfig, pizzaPrice, toggleNote, toppingCents, validNotes, type PizzaLine } from './logic';
import { PizzaArt } from './PizzaArt';

/** A small circle filled on the left, the right, or all the way. */
function HalfIcon({ side }: { side: Side }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden className="mx-auto">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {side === 'whole' ? <circle cx="8" cy="8" r="6.5" fill="currentColor" /> : <path d={side === 'left' ? 'M8 1.5 A6.5 6.5 0 0 0 8 14.5 Z' : 'M8 1.5 A6.5 6.5 0 0 1 8 14.5 Z'} fill="currentColor" />}
    </svg>
  );
}

/**
 * Build your own pizza, or change a specialty. Tap a topping for the whole pie, or put it on one half.
 * On a computer, toppings can also be dragged onto either half of the pizza.
 */
export function Builder({ start, out = [], onAdd, addLabel = 'Add to order', dark = false }: {
  start?: { specialtyId?: string; config?: PizzaConfig };
  /** Toppings that are out of stock today. */
  out?: string[];
  onAdd: (line: PizzaLine) => void;
  addLabel?: string;
  dark?: boolean;
}) {
  const [specialtyId, setSpecialtyId] = useState<string | undefined>(start?.specialtyId);
  const [config, setConfig] = useState<PizzaConfig>(start?.config ?? (start?.specialtyId ? configFor(start.specialtyId) : plainConfig()));
  const [qty, setQty] = useState(1);
  const [hover, setHover] = useState<'left' | 'right' | null>(null);
  const price = pizzaPrice(config, specialtyId);
  const sp = specialtyId ? SPECIALTY_BY_ID[specialtyId] : undefined;

  const set = (patch: Partial<PizzaConfig>) => setConfig((c) => {
    const next = { ...c, ...patch };
    // Keep the crust valid for the size.
    const crust = CRUSTS.find((x) => x.id === next.crust)!;
    if (!crust.sizes.includes(next.size)) next.crust = 'hand';
    if (next.notes?.length) next.notes = validNotes(next.notes, next.sauce);
    return next;
  });
  const place = (id: string, side: Side | null) => setConfig((c) => {
    const toppings = { ...c.toppings };
    if (side === null || toppings[id] === side) delete toppings[id];
    else toppings[id] = side;
    return { ...c, toppings };
  });
  const startFrom = (id: string) => {
    if (!id) { setSpecialtyId(undefined); setConfig(plainConfig(config.size)); return; }
    setSpecialtyId(id);
    setConfig({ ...configFor(id, config.size), crust: config.crust });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/topping');
    const box = e.currentTarget.getBoundingClientRect();
    if (id) place(id, e.clientX < box.left + box.width / 2 ? 'left' : 'right');
    setHover(null);
  };

  const card = dark ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white';
  const chip = (active: boolean) => `rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${active ? 'border-emerald-600 bg-emerald-600 text-white' : dark ? 'border-white/15 hover:bg-white/10' : 'border-slate-200 hover:border-emerald-500'}`;
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="lg:sticky lg:top-16 lg:self-start">
        <div
          onDragOver={(e) => { e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setHover(e.clientX < b.left + b.width / 2 ? 'left' : 'right'); }}
          onDragLeave={() => setHover(null)}
          onDrop={onDrop}
          className={`relative mx-auto flex aspect-square w-full max-w-[380px] items-center justify-center rounded-full ${dark ? 'bg-white/5' : 'bg-[radial-gradient(circle,#f8fafc_55%,#e2e8f0_100%)]'}`}
        >
          <PizzaArt config={config} size={360} className="h-auto w-[94%]" />
          {hover && <div className={`pointer-events-none absolute inset-y-0 w-1/2 rounded-full bg-emerald-400/20 ring-2 ring-emerald-400 ${hover === 'left' ? 'left-0 rounded-r-none' : 'right-0 rounded-l-none'}`} />}
        </div>
        <p className={`mt-2 text-center text-xs ${muted}`}>Tap a topping for the whole pie, or the left or right half button to put it on one side. On a computer you can also drag a topping onto either half.</p>
        <div className={`mt-3 rounded-2xl border p-3 text-sm ${card}`}>
          {price.parts.map((p, i) => (
            <div key={i} className="flex justify-between gap-2"><span className={i ? muted : 'font-semibold'}>{p.label}</span><span className="tabular">{money(p.cents)}</span></div>
          ))}
          {config.notes?.length ? <div className="flex justify-between gap-2"><span className={muted}>{config.notes.join(', ')}</span><span className={`text-xs ${muted}`}>no charge</span></div> : null}
          <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-2">
            <div className="flex items-center gap-2">
              <button aria-label="One fewer" onClick={() => setQty(Math.max(1, qty - 1))} className={`rounded-full p-1.5 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}><Minus size={14} /></button>
              <span className="tabular w-5 text-center font-bold">{qty}</span>
              <button aria-label="One more" onClick={() => setQty(qty + 1)} className={`rounded-full p-1.5 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}><Plus size={14} /></button>
            </div>
            <button
              onClick={() => { onAdd({ kind: 'pizza', config, specialtyId, qty, unitCents: price.cents }); setQty(1); }}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              {addLabel} · {money(price.cents * qty)}
            </button>
          </div>
        </div>
      </div>

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
              <button key={s.id} onClick={() => set({ size: s.id })} className={chip(config.size === s.id)}>
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
                <button key={c.id} disabled={!ok} onClick={() => set({ crust: c.id })} className={`${chip(config.crust === c.id)} disabled:opacity-40`}>
                  {c.label}{c.extraCents ? ` +${money(c.extraCents)}` : ''}
                  <span className="block text-xs font-normal opacity-80">{ok ? c.note : `Not on a ${config.size === 'S' ? 'small' : 'this size'}`}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-display text-lg font-bold">Sauce</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAUCES.map((s) => (
                <button key={s.id} onClick={() => set({ sauce: s.id })} className={`${chip(config.sauce === s.id)} flex items-center gap-1.5 !py-1.5`}>
                  <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: s.color }} />{s.label}{s.extraCents ? ` +${money(s.extraCents)}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Cheese</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CHEESES.map((c) => (
                <button key={c.id} onClick={() => set({ cheese: c.id })} className={`${chip(config.cheese === c.id)} !py-1.5`}>
                  {c.label}{c.extra[config.size] ? ` +${money(c.extra[config.size])}` : ''}
                </button>
              ))}
            </div>
          </div>
        </section>

        {(['meat', 'veggie'] as const).map((kind) => (
          <section key={kind}>
            <h3 className="font-display text-lg font-bold">{kind === 'meat' ? 'Meats' : 'Veggies and cheeses'}</h3>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {TOPPINGS.filter((t) => t.kind === kind).map((t) => {
                const side = config.toppings[t.id] as Side | undefined;
                const gone = out.includes(t.id) && !side;
                const included = sp?.toppings.includes(t.id);
                return (
                  <div
                    key={t.id}
                    draggable={!gone}
                    onDragStart={(e) => e.dataTransfer.setData('text/topping', t.id)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${side ? 'border-emerald-500 bg-emerald-50 text-slate-900' : dark ? 'border-white/10' : 'border-slate-200 bg-white'} ${gone ? 'opacity-40' : 'cursor-grab'}`}
                  >
                    <button disabled={gone} onClick={() => place(t.id, side ? null : 'whole')} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: t.color }} />
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
                          aria-label={`${t.name} on ${s === 'whole' ? 'the whole pizza' : `the ${s} half`}`}
                          onClick={() => place(t.id, s)}
                          className={`h-7 w-7 rounded-lg text-sm leading-none ${side === s ? 'bg-emerald-600 text-white' : dark && !side ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
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
                    return <button key={n} disabled={off} aria-pressed={on} onClick={() => set({ notes: toggleNote(config.notes, n, config.sauce) })} className={`${chip(on)} !py-1.5 disabled:opacity-40`}>{n}</button>;
                  })}
                  {off && <span className={`text-xs ${muted}`}>No sauce on this pizza</span>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

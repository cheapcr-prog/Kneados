import { Printer } from 'lucide-react';
import { useState } from 'react';
import { ItemArt } from '../../components/ItemArt';
import { ALLERGENS, NUTRITION } from '../../data/nutrition';
import { MENU, MENU_BY_ID, SHOP, isDrink } from '../../data/shop';
import type { Demo } from '../../data/store';
import type { MenuItem } from '../../data/types';
import { shortDate } from '../../lib/dates';
import { money } from '../../lib/money';
import { Brain, Card, Demo as DemoNote, btn, field } from './ui';

type Kind = 'Case tag' | 'Box sticker' | 'Nutrition label';
const KINDS: Kind[] = ['Case tag', 'Box sticker', 'Nutrition label'];

/** Ingredients with each allergen word in bold, the way a packaged food label shows them. */
function Ingredients({ item }: { item: MenuItem }) {
  const text = NUTRITION[item.id]?.ingredients ?? '';
  const words = ['wheat', 'milk', 'buttermilk', 'butter', 'cream cheese', 'cream', 'cheese', 'egg', 'soy', 'soybean', 'peanuts', 'pecans', 'almonds', 'coconut'];
  const parts = text.split(new RegExp(`\\b(${words.join('|')})\\b`, 'gi'));
  return <>{parts.map((p, i) => (words.includes(p.toLowerCase()) ? <strong key={i}>{p}</strong> : p))}</>;
}

function CaseTag({ item }: { item: MenuItem }) {
  return (
    <div className="flex h-[150px] w-[230px] flex-col justify-between rounded-xl border-2 border-slate-900 bg-white p-3 text-slate-900">
      <div>
        <p className="font-display text-xl font-extrabold leading-tight">{item.name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{item.description}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide">{item.allergens.length ? `Contains ${item.allergens.join(', ')}` : 'No major allergens'}</p>
        <p className="tabular font-display text-2xl font-extrabold leading-none">{money(item.price)}</p>
      </div>
    </div>
  );
}

function BoxSticker({ item, date }: { item: MenuItem; date: string }) {
  return (
    <div className="w-[300px] rounded-xl border-2 border-slate-900 bg-white p-3 text-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-widest">{SHOP.name}</p>
      <p className="font-display text-lg font-extrabold leading-tight">{item.name}</p>
      <p className="mt-1 text-[10px] leading-snug"><span className="font-bold">Ingredients:</span> <Ingredients item={item} />.</p>
      <p className="mt-1 text-[10px] font-bold uppercase">{item.allergens.length ? `Contains: ${item.allergens.join(', ')}` : 'No major allergens'}</p>
      <p className="mt-1 text-[9px] text-slate-600">Made in a kitchen that also handles peanuts, tree nuts, milk, egg, wheat and soy.</p>
      <p className="mt-1.5 flex justify-between border-t border-slate-300 pt-1 text-[10px] font-semibold"><span>Made {shortDate(date)}</span><span>Best the same day</span></p>
      <p className="text-[9px] text-slate-600">{SHOP.address} · {SHOP.phone}</p>
    </div>
  );
}

function NutritionLabel({ item }: { item: MenuItem }) {
  const f = NUTRITION[item.id];
  if (!f) return null;
  const row = (label: string, value: string, bold = false) => (
    <p className={`flex justify-between border-t border-slate-400 py-0.5 text-[11px] ${bold ? 'font-bold' : ''}`}><span>{label}</span><span>{value}</span></p>
  );
  return (
    <div className="w-[230px] border-2 border-slate-900 bg-white p-2 text-slate-900">
      <p className="font-display text-2xl font-black leading-none">Nutrition Facts</p>
      <p className="border-b-8 border-slate-900 pb-1 text-[11px]">Serving size 1 {item.addon ? 'scoop' : isDrink(item) ? 'cup' : 'piece'} ({item.name})</p>
      <p className="flex items-end justify-between border-b-4 border-slate-900 py-0.5"><span className="text-base font-black">Calories</span><span className="tabular text-3xl font-black leading-none">{f.calories}</span></p>
      {row('Total Fat', `${f.fatG}g`, true)}
      {row('Sodium', `${f.sodiumMg}mg`, true)}
      {row('Total Carbohydrate', `${f.carbsG}g`, true)}
      {row('  Total Sugars', `${f.sugarG}g`)}
      {row('Protein', `${f.proteinG}g`, true)}
      <p className="mt-1 border-t-4 border-slate-900 pt-1 text-[9px] leading-snug text-slate-600">Estimates for the demo, not lab results.</p>
    </div>
  );
}

export function Labels({ demo }: { demo: Demo }) {
  const [kind, setKind] = useState<Kind>('Case tag');
  const [picked, setPicked] = useState<string>('all');
  const items = picked === 'all' ? MENU.filter((m) => m.baked) : [MENU_BY_ID[picked]];
  const nuts = MENU.filter((m) => m.allergens.some((a) => a === 'Peanuts' || a === 'Tree nuts'));

  return (
    <div className="space-y-4">
      <Brain label="KneadOS keeps the allergen chart" title={`${MENU.length} items, ${nuts.length} with peanuts or tree nuts.`}>
        <p>
          Ingredients and allergens are entered once per item. The case tags, box stickers, the online menu and the allergen chart all read from that one place,
          so a recipe change shows up everywhere at once.
        </p>
      </Brain>

      <Card title="Allergen chart" note="A dot means the item contains it. Everything is made in one kitchen, so nothing here is safe for a severe allergy.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Item</th>
                {ALLERGENS.map((a) => <th key={a} className="pb-2 text-center font-semibold">{a}</th>)}
                <th className="pb-2 text-right font-semibold">Calories</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MENU.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5"><span className="flex items-center gap-2 font-medium"><ItemArt item={m} size={24} />{m.name}</span></td>
                  {ALLERGENS.map((a) => (
                    <td key={a} className="py-1.5 text-center">
                      {m.allergens.includes(a) ? <span className={`inline-block h-3 w-3 rounded-full ${a === 'Peanuts' || a === 'Tree nuts' ? 'bg-rose-600' : 'bg-slate-800'}`} aria-label={`Contains ${a}`} /> : <span className="text-slate-200">·</span>}
                    </td>
                  ))}
                  <td className="tabular py-1.5 text-right text-slate-600">{NUTRITION[m.id]?.calories ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Print labels"
        note="Pick a label and what to print. Case tags sit in front of each tray, box stickers go on pre-orders and catering boxes."
        action={<button className={btn.dark} onClick={() => window.print()}><Printer size={15} /> Print {items.length} label{items.length === 1 ? '' : 's'}</button>}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {KINDS.map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{k}</button>)}
          </div>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className={`${field} w-56`} aria-label="Which items">
            <option value="all">Everything baked today</option>
            {MENU.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="print-area mt-4 flex flex-wrap gap-3 rounded-xl bg-slate-100 p-4">
          {items.map((m) => (kind === 'Case tag' ? <CaseTag key={m.id} item={m} /> : kind === 'Box sticker' ? <BoxSticker key={m.id} item={m} date={demo.state.today} /> : <NutritionLabel key={m.id} item={m} />))}
        </div>
      </Card>

      <DemoNote>
        Nutrition numbers and ingredient lists are rough examples for the demo. A real shop enters figures from its mix supplier's spec sheets or a lab.
        Whether a shop must post calories or label packaged items depends on its size and what it sells, so check local rules. Print uses your browser's print window and any label or sheet printer.
      </DemoNote>
    </div>
  );
}

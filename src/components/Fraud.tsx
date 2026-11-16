import { ShieldCheck } from 'lucide-react';
import { useShopState } from '../data/local';
import { useDemo } from '../data/store';
import { DEFAULT_FRAUD, pruneTries, type CardTry, type FraudSettings } from '../lib/fraud';
import { money } from '../lib/money';
import { randomCode } from '../lib/secure';

/** A random id for this browser, so the card try limit follows the device and not just the phone number. */
function deviceId(): string {
  try {
    const have = localStorage.getItem('kneados-device');
    if (have) return have;
    const id = randomCode(12);
    localStorage.setItem('kneados-device', id);
    return id;
  } catch {
    return 'no-storage';
  }
}

/** The shop's stolen card rules and the card tries made on its website. Shared by the donut shop and pizza mode. */
export function useFraud() {
  const [saved, setSettings] = useShopState<Partial<FraudSettings>>('fraud-settings', () => ({}));
  const [tries, setTries] = useShopState<CardTry[]>('card-tries', () => []);
  const settings: FraudSettings = { ...DEFAULT_FRAUD, ...saved };
  return {
    settings,
    update: (patch: Partial<FraudSettings>) => setSettings((s) => ({ ...s, ...patch })),
    tries,
    device: deviceId(),
    record: (t: Omit<CardTry, 'at' | 'device'>) => setTries((list) => [...pruneTries(list), { ...t, at: Date.now(), device: deviceId() }]),
    clearTries: () => setTries([]),
  };
}

const field = 'tabular w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm';

function Toggle({ on, onChange, label, note }: { on: boolean; onChange: (v: boolean) => void; label: string; note: string }) {
  return (
    <label className="flex items-start gap-3 py-2.5">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-teal-600" />
      <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="block text-xs text-slate-500">{note}</span></span>
    </label>
  );
}

function Dollars({ cents, onChange, label, note }: { cents: number; onChange: (c: number) => void; label: string; note: string }) {
  return (
    <label className="flex items-start justify-between gap-3 py-2.5">
      <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="block text-xs text-slate-500">{note}</span></span>
      <span className="flex shrink-0 items-center gap-1 text-sm text-slate-500">$<input type="number" min={0} step={5} value={cents / 100} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))} className={field} /></span>
    </label>
  );
}

/** Owner settings for stolen card defenses, with the orders the rules caught. */
export function FraudSettingsPanel() {
  const f = useFraud();
  const demo = useDemo();
  const flagged = demo.state.orders.filter((o) => o.fraud && (o.fraud.flags.length > 0 || o.fraud.idCheck)).slice(-8).reverse();
  const s = f.settings;
  const declinedToday = f.tries.filter((t) => !t.ok && Date.now() - t.at < 24 * 60 * 60 * 1000).length;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-ink-900 p-4 text-white">
        <ShieldCheck className="mt-0.5 shrink-0 text-glaze-300" size={22} />
        <p className="text-sm text-slate-200">
          Food is a favorite target for stolen cards: it is gone in minutes, and the real owner's chargeback lands weeks later. These rules catch the usual signs before the food leaves the shop.
          {declinedToday > 0 && <span className="mt-1 block font-semibold text-amber-300">{declinedToday} declined card{declinedToday === 1 ? '' : 's'} on the website in the last day.</span>}
        </p>
      </div>
      {flagged.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="font-display text-lg font-bold">Orders the rules caught</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {flagged.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span><span className="font-semibold">#{o.number} · {o.customerName}</span> · {money(o.total)}<span className="block text-xs text-slate-500">{o.fraud!.flags.join(' · ') || 'Photo ID at pickup'}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.fraud!.idResult === 'held' ? 'bg-rose-100 text-rose-700' : o.fraud!.idResult === 'matched' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                  {o.fraud!.idResult === 'held' ? 'Held, ID did not match' : o.fraud!.idResult === 'matched' ? 'ID matched' : o.fraud!.payAtPickup ? 'Pays at pickup' : 'ID check waiting'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="font-display text-lg font-bold">At the counter</h3>
          <div className="divide-y divide-slate-100">
            <Dollars cents={s.idCheckOverCents} onChange={(c) => f.update({ idCheckOverCents: c })} label="Check photo ID on online orders over" note="The pickup screen won't hand it over until staff confirm the ID matches the name on the card. $0 turns it off." />
            <Toggle on={s.firstTimePayInPerson} onChange={(v) => f.update({ firstTimePayInPerson: v })} label="First-time customers pay in person" note="A phone number that has never ordered pays at the counter instead of online. Stops most stolen card orders cold." />
            <Dollars cents={s.bigFirstOrderCents} onChange={(c) => f.update({ bigFirstOrderCents: c })} label="Flag a new phone's first order over" note="Shows a warning on the order and asks for ID." />
          </div>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="font-display text-lg font-bold">On the website</h3>
          <div className="divide-y divide-slate-100">
            <label className="flex items-start justify-between gap-3 py-2.5">
              <span><span className="block text-sm font-semibold text-slate-900">Card tries per hour</span><span className="block text-xs text-slate-500">Declined cards allowed per phone number or device. After that the site stops taking cards and asks them to pay at the counter.</span></span>
              <input type="number" min={1} max={10} value={s.cardTriesPerHour} onChange={(e) => f.update({ cardTriesPerHour: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} className={field} />
            </label>
            <Toggle on={s.deliveryZipCheck} onChange={(v) => f.update({ deliveryZipCheck: v })} label="Flag deliveries billed far away" note="A card billed in another city, delivered here, is the classic stolen card delivery. The driver checks ID at the door." />
            {f.tries.length > 0 && (
              <p className="py-2.5 text-xs text-slate-500">{f.tries.length} card tries kept from the last day. <button onClick={f.clearTries} className="font-semibold text-teal-700 underline">Clear them</button></p>
            )}
          </div>
        </section>
      </div>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="font-display text-lg font-bold">Stripe card checks</h3>
        <p className="text-xs text-slate-500">These settings go to Stripe when payments go live. The demo shows what they will do.</p>
        <div className="grid gap-x-6 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
          <Toggle on={s.zipCheck} onChange={(v) => f.update({ zipCheck: v })} label="Decline when the billing ZIP doesn't match" note="The bank checks the ZIP the customer typed against the card's real address." />
          <Toggle on={s.cvcCheck} onChange={(v) => f.update({ cvcCheck: v })} label="Decline when the security code doesn't match" note="Stolen card lists often lack the 3 digit code." />
          <label className="flex items-start justify-between gap-3 py-2.5">
            <span><span className="block text-sm font-semibold text-slate-900">Stripe Radar plan</span><span className="block text-xs text-slate-500">Lite is free with Stripe. Standard (about $10 a month plus a small fee per checked payment) adds custom rules like the try limit above.</span></span>
            <select value={s.radar} onChange={(e) => f.update({ radar: e.target.value as FraudSettings['radar'] })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="lite">Lite</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <Dollars cents={s.threeDSOverCents} onChange={(c) => f.update({ threeDSOverCents: c })} label="Bank approval (3D Secure) over" note={`The customer approves in their bank app. If a confirmed payment is later disputed as fraud, the bank pays it, not you. Risky orders always get it. ${s.threeDSOverCents ? `Now: ${money(s.threeDSOverCents)} and up.` : 'Now: risky orders only.'}`} />
        </div>
      </section>
    </div>
  );
}

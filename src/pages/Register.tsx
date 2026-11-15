import { Banknote, Check, ClipboardCheck, CreditCard, Delete, Gift, LogOut, Minus, PackageCheck, Plus, Timer, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BreakButton, BreakScreen } from '../components/Breaks';
import { ItemArt } from '../components/ItemArt';
import { ShopTasksPanel, useUpkeep } from '../components/Upkeep';
import { PickupQueue, useTodaysPickups, useWorkload } from '../components/PickupQueue';
import { MENU, MENU_BY_ID, SHOP, STAFF } from '../data/shop';
import { useDemo } from '../data/store';
import type { Category, StaffMember } from '../data/types';
import { formatPhone, money } from '../lib/money';
import { linePrice, rewardDiscount, totals } from '../lib/pricing';
import { PUNCHES_PER_REWARD } from '../lib/rewards';

const TABS: (Category | 'All')[] = ['All', 'Classics', 'Filled', 'Specialty', 'Drinks'];

type Stage = 'ticket' | 'tip' | 'done';

export function Register() {
  const [staff, setStaff] = useState<StaffMember | null>(null);
  if (!staff) return <PinLogin onLogin={setStaff} />;
  return (
    <div className="relative">
      <Till staff={staff} onLogout={() => setStaff(null)} />
      <BreakScreen staff={staff} />
    </div>
  );
}

function PinLogin({ onLogin }: { onLogin: (s: StaffMember) => void }) {
  const [who, setWho] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  const press = (d: string) => {
    if (!who) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      if (next === who.pin) onLogin(who);
      else { setWrong(true); setPin(''); }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-ink-900 p-4 text-white">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold">{SHOP.name}</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Tap your name, then enter your PIN</p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {STAFF.map((s) => (
            <button
              key={s.id}
              onClick={() => { setWho(s); setPin(''); setWrong(false); }}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${who?.id === s.id ? 'border-glaze-400 bg-glaze-400 text-ink-900 [&>span]:text-ink-700' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              {s.name}
              <span className="block text-[11px] font-normal capitalize text-slate-400">{s.role}</span>
            </button>
          ))}
        </div>
        {who && (
          <div className="mt-6">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-4 w-4 rounded-full border-2 ${pin.length > i ? 'border-glaze-400 bg-glaze-400' : wrong ? 'border-rose-400' : 'border-white/30'}`} />
              ))}
            </div>
            <p className="mt-2 h-5 text-center text-xs text-slate-400">
              {wrong ? <span className="text-rose-300">Wrong PIN, try again</span> : <>Demo PIN for {who.name}: <span className="font-mono text-glaze-300">{who.pin}</span></>}
            </p>
            <div className="mx-auto mt-3 grid max-w-[260px] grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} onClick={() => press(d)} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20 active:bg-white/30">{d}</button>
              ))}
              <span />
              <button onClick={() => press('0')} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20 active:bg-white/30">0</button>
              <button aria-label="Delete" onClick={() => setPin(pin.slice(0, -1))} className="flex items-center justify-center rounded-xl bg-white/5 py-4 text-slate-300 hover:bg-white/10"><Delete size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Till({ staff, onLogout }: { staff: StaffMember; onLogout: () => void }) {
  const demo = useDemo();
  const [tab, setTab] = useState<Category | 'All'>('All');
  const [ticket, setTicket] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState('');
  const [redeem, setRedeem] = useState(false);
  const [stage, setStage] = useState<Stage>('ticket');
  const [tip, setTip] = useState(0);
  const [result, setResult] = useState<{ number: number; total: number; payment: 'card' | 'cash'; earned: boolean } | null>(null);
  const [pickupsOpen, setPickupsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const upkeep = useUpkeep();
  const myTasks = upkeep.statuses.filter((t) => (t.state === 'due' || t.state === 'overdue') && upkeep.assigned[t.task.id] === staff.id).length;
  const pickups = useTodaysPickups();
  const work = useWorkload();
  /** Orders this person should be packing right now. The button turns amber for these. */
  const mineNow = work.queue.filter((a) => a.staffId === staff.id && a.packNow).length;

  const lines = useMemo(
    () => Object.entries(ticket).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, lineCents: linePrice(MENU_BY_ID[itemId], qty) })),
    [ticket],
  );
  const digits = phone.replace(/\D/g, '');
  const member = digits.length === 10 ? demo.findMember(digits) : undefined;
  const canRedeem = !!member && member.rewards > 0;
  const discount = redeem && canRedeem ? rewardDiscount(lines, MENU_BY_ID) : 0;
  const t = totals(lines, MENU_BY_ID, discount);
  const clock = demo.state.clock[staff.id];
  const onClock = !!clock?.inAt;
  const tipping = demo.state.tippingEnabled;

  const add = (id: string, n: number) => setTicket((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + n) }));
  const clear = () => { setTicket({}); setPhone(''); setRedeem(false); setTip(0); setStage('ticket'); };

  const finish = (payment: 'card' | 'cash', tipCents: number) => {
    const order = demo.placeOrder({
      source: 'register', lines, subtotal: t.subtotal, tax: t.tax, tip: tipCents, total: t.total + tipCents,
      payment, status: 'done', phone: digits.length === 10 ? digits : undefined, rewardRedeemed: discount > 0,
    });
    let earned = false;
    if (digits.length === 10) {
      if (discount > 0) demo.redeem(digits);
      else earned = demo.punchVisit(digits).earnedReward;
    }
    setResult({ number: order.number, total: order.total, payment, earned });
    setStage('done');
  };

  const pay = (payment: 'card' | 'cash') => {
    if (lines.length === 0) return;
    if (payment === 'card' && tipping) setStage('tip');
    else finish(payment, 0);
  };

  if (stage === 'tip') {
    return (
      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center bg-white p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Customer screen</p>
        <p className="tabular mt-3 font-display text-6xl font-extrabold">{money(t.total)}</p>
        <p className="mt-6 text-lg font-semibold text-slate-900">Add a tip for the team?</p>
        <div className="mt-4 grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
          {SHOP.tipChoices.map((c) => (
            <button key={c} onClick={() => { setTip(c); finish('card', c); }} className="rounded-2xl border-2 border-slate-200 py-6 text-2xl font-bold hover:border-glaze-500 hover:bg-glaze-50">
              {money(c).replace('.00', '')}
            </button>
          ))}
          <button onClick={() => finish('card', 0)} className="rounded-2xl border-2 border-slate-200 py-6 text-lg font-semibold text-slate-600 hover:bg-slate-50">No tip</button>
        </div>
        <p className="mt-6 text-sm text-slate-500">Tips are shared by the crew working today.</p>
        <button onClick={() => setStage('ticket')} className="mt-4 text-sm font-medium text-slate-500 underline">Back to ticket</button>
      </div>
    );
  }

  if (stage === 'done' && result) {
    return (
      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center bg-white p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={40} /></div>
        <h2 className="mt-5 font-display text-4xl font-extrabold">Paid {money(result.total)}</h2>
        <p className="mt-1 text-slate-600">
          Order #{result.number} · {result.payment === 'card' ? 'Card' : 'Cash'}
          {tip > 0 && ` · includes ${money(tip)} tip`}
        </p>
        {result.earned && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-box-50 px-4 py-3 text-sm font-semibold text-box-700">
            <Gift size={18} /> That was visit {PUNCHES_PER_REWARD}! A free-donut text is on its way from Dough Rewards.
          </p>
        )}
        <p className="mt-4 max-w-sm text-xs text-slate-500">Demo: no card was charged. On a live register this is where the Stripe reader takes the tap, and it keeps working when the Wi-Fi drops.</p>
        <button onClick={clear} className="mt-6 rounded-2xl bg-ink-900 px-10 py-4 text-lg font-bold text-white">Next customer</button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col bg-slate-100 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {TABS.map((c) => (
              <button key={c} onClick={() => setTab(c)} className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === c ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c}</button>
            ))}
          </div>
          <button
            onClick={() => setPickupsOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${mineNow > 0 ? 'bg-amber-400 text-ink-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            <PackageCheck size={14} /> {mineNow > 0 ? 'Pack now' : 'Pickup orders'}
            {pickups.open.length > 0 && <span className="tabular rounded-full bg-ink-900 px-1.5 text-[11px] font-bold text-white">{pickups.open.length}</span>}
          </button>
          <button onClick={() => setTasksOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
            <ClipboardCheck size={14} /> Tasks
            {myTasks > 0 && <span className="tabular rounded-full bg-ink-900 px-1.5 text-[11px] font-bold text-white">{myTasks}</span>}
          </button>
          <BreakButton staffId={staff.id} />
          <button onClick={() => demo.clockToggle(staff.id)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${onClock ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
            <Timer size={14} /> {onClock ? 'On the clock' : 'Clock in'}
          </button>
          <button onClick={onLogout} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={14} /> {staff.name}
          </button>
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto p-3 sm:grid-cols-4 xl:grid-cols-5">
          {MENU.filter((m) => tab === 'All' || m.category === tab).map((item) => {
            const soldOut = demo.state.bake[item.id]?.soldOut;
            const qty = ticket[item.id] ?? 0;
            return (
              <button
                key={item.id}
                disabled={soldOut}
                onClick={() => add(item.id, 1)}
                className={`relative flex flex-col items-center rounded-2xl border bg-white p-2.5 text-center shadow-sm transition active:scale-[0.97] disabled:opacity-40 ${qty > 0 ? 'border-glaze-500 ring-2 ring-glaze-400/30' : 'border-slate-200'}`}
              >
                <ItemArt item={item} size={48} />
                <span className="mt-1 text-[13px] font-semibold leading-tight text-slate-900">{item.name}</span>
                <span className="tabular text-xs text-slate-500">{soldOut ? 'Sold out' : money(item.price)}</span>
                {qty > 0 && <span className="tabular absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-glaze-600 px-1.5 text-xs font-bold text-white">{qty}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="font-display text-lg font-bold">Ticket</h2>
          {lines.length > 0 && (
            <button onClick={clear} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600"><Trash2 size={13} /> Clear</button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Tap items to start a ticket</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lines.map((l) => {
                const item = MENU_BY_ID[l.itemId];
                return (
                  <li key={l.itemId} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      {item.dozenPrice && l.qty >= 12 && <p className="text-[11px] font-medium text-glaze-700">Dozen price</p>}
                    </div>
                    <button aria-label="Less" onClick={() => add(l.itemId, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Minus size={14} /></button>
                    <span className="tabular w-7 text-center text-sm font-bold">{l.qty}</span>
                    <button aria-label="More" onClick={() => add(l.itemId, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Plus size={14} /></button>
                    {item.dozenPrice && (
                      <button onClick={() => add(l.itemId, 12)} className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-700">+12</button>
                    )}
                    <span className="tabular w-16 text-right text-sm font-semibold">{money(l.lineCents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dough Rewards phone</label>
          <input value={formatPhone(phone)} onChange={(e) => { setPhone(e.target.value); setRedeem(false); }} inputMode="tel" placeholder="(562) 555-0101" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {digits.length === 10 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                {member ? <><span className="font-semibold text-slate-900">{member.name}</span> · {member.punches}/{PUNCHES_PER_REWARD} punches</> : 'New member: this visit is punch 1'}
              </span>
              {canRedeem && (
                <button onClick={() => setRedeem(!redeem)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${redeem ? 'bg-box-500 text-white' : 'bg-box-50 text-box-700'}`}>
                  <Gift size={12} /> {redeem ? 'Free donut applied' : `Use free donut (${member!.rewards})`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 pb-4 pt-3">
          <dl className="space-y-0.5 text-sm">
            <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="tabular">{money(t.subtotal)}</dd></div>
            {t.discount > 0 && <div className="flex justify-between text-box-600"><dt>Dough Rewards</dt><dd className="tabular">-{money(t.discount)}</dd></div>}
            <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular">{money(t.tax)}</dd></div>
            <div className="flex justify-between pt-1 font-display text-2xl font-extrabold text-slate-900"><dt>Total</dt><dd className="tabular">{money(t.total)}</dd></div>
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={lines.length === 0} onClick={() => pay('cash')} className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-300 py-4 text-base font-bold text-slate-800 disabled:opacity-40">
              <Banknote size={18} /> Cash
            </button>
            <button disabled={lines.length === 0} onClick={() => pay('card')} className="flex items-center justify-center gap-2 rounded-xl bg-glaze-600 py-4 text-base font-bold text-white hover:bg-glaze-700 disabled:opacity-40">
              <CreditCard size={18} /> Card
            </button>
          </div>
        </div>
      </aside>

      {tasksOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/50" onClick={() => setTasksOpen(false)}>
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-display text-xl font-bold">Shop tasks</h2>
                <p className="text-xs text-slate-500">Signed in as {staff.name} · Check each one off when it is done.</p>
              </div>
              <button aria-label="Close shop tasks" onClick={() => setTasksOpen(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ShopTasksPanel me={staff.id} />
            </div>
          </div>
        </div>
      )}
      {pickupsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/50" onClick={() => setPickupsOpen(false)}>
          <div className="flex h-full w-full max-w-lg flex-col bg-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h2 className="font-display text-xl font-bold">Pickup orders</h2>
                <p className="text-xs text-slate-500">Signed in as {staff.name} · Pack each one the way it's listed, then mark it ready.</p>
              </div>
              <button aria-label="Close pickup orders" onClick={() => setPickupsOpen(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <PickupQueue me={staff.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

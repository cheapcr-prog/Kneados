import { Banknote, Check, ChevronDown, ChevronUp, ClipboardCheck, CreditCard, Gift, Keyboard, LogOut, Package, MessageCircle, Minus, PackageCheck, Plus, ScanLine, Timer, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShopState } from '../data/local';
import { BreakButton, BreakScreen } from '../components/Breaks';
import { useGiftCards } from '../components/Channels';
import { ItemArt } from '../components/ItemArt';
import { usePricing, useUpsells } from '../components/Pricing';
import { RewardsEntry } from '../components/Rewards';
import { ShopTasksPanel, useUpkeep } from '../components/Upkeep';
import { StaffLogin, useSession } from '../components/Session';
import { PickupQueue, useTodaysPickups, useWorkload } from '../components/PickupQueue';
import { SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { Category, StaffMember } from '../data/types';
import { formatPhone, money } from '../lib/money';
import { BOX_SIZE, boxCounts, boxPrice, boxUpcharge, cartLines, isBoxable, linePrice, rewardDiscount, totals } from '../lib/pricing';
import { PUNCHES_PER_REWARD } from '../lib/rewards';
import { addMiss, isLocked, minutesLocked, oneTimeCode, type Tries } from '../lib/secure';
import { lastFour, type FoundBy } from '../lib/wallet';
import { hourLabel } from '../lib/smartpricing';
import { suggestOffers, type Offer } from '../lib/upsell';
import { DOW_NAMES } from '../lib/dates';

const TABS: (Category | 'All')[] = ['All', 'Classics', 'Filled', 'Specialty', 'Drinks', 'Smoothies & boba'];

type Stage = 'ticket' | 'tip' | 'gift' | 'done';
type Pay = 'card' | 'cash' | 'gift';
const PAY_LABEL: Record<Pay, string> = { card: 'Card', cash: 'Cash', gift: 'Gift card' };

export function Register() {
  const { staff, signOut } = useSession();
  if (!staff) return <StaffLogin />;
  return (
    <div className="relative">
      <Till staff={staff} onLogout={signOut} />
      <BreakScreen staff={staff} />
    </div>
  );
}

function Till({ staff, onLogout }: { staff: StaffMember; onLogout: () => void }) {
  const demo = useDemo();
  const [tab, setTab] = useState<Category | 'All'>('All');
  const [ticket, setTicket] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState('');
  const [entry, setEntry] = useState<'keypad' | 'scan' | null>(null);
  const [redeem, setRedeem] = useState(false);
  /** How the customer was found. A scanned card can use its free donut right away; a typed number needs a texted code first. */
  const [foundBy, setFoundBy] = useState<FoundBy>('typed');
  /** The code texted to the member before a free donut is used, and the wrong tries so far. */
  const [check, setCheck] = useState<{ phone: string; code: string; typed: string; misses: number } | null>(null);
  /** The phone that proved itself with the texted code during this sale. */
  const [proven, setProven] = useState('');
  const [checkFailed, setCheckFailed] = useState(false);
  const [stage, setStage] = useState<Stage>('ticket');
  const [tip, setTip] = useState(0);
  const [result, setResult] = useState<{ number: number; total: number; payment: Pay; earned: boolean; giftCents: number; giftLeft?: number } | null>(null);
  const gift = useGiftCards();
  const prices = usePricing();
  const MENU = prices.menu, MENU_BY_ID = prices.byId;
  const upsells = useUpsells();
  /** Suggestions the customer said yes to on this ticket. */
  const [taken, setTaken] = useState<Offer[]>([]);
  const [sawOffer, setSawOffer] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  // Wrong gift card codes typed at this register. Kept across reloads so guessing codes hits a wall.
  const [giftTries, setGiftTries] = useShopState<Tries>('gift-tries', () => ({ misses: [] }));
  const giftLocked = isLocked(giftTries);
  const [pickupsOpen, setPickupsOpen] = useState(false);
  /** Phone only: whether the ticket sheet is open. */
  const [sheet, setSheet] = useState(false);
  /** Mixed dozen boxes that are full and on the ticket. */
  const [boxes, setBoxes] = useState<string[][]>([]);
  /** The dozen box being filled right now, or null when taps ring up single items. */
  const [filling, setFilling] = useState<string[] | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const upkeep = useUpkeep();
  const myTasks = upkeep.statuses.filter((t) => (t.state === 'due' || t.state === 'overdue') && upkeep.assigned[t.task.id] === staff.id).length;
  const pickups = useTodaysPickups();
  const work = useWorkload();
  /** Orders this person should be packing right now. The button turns amber for these. */
  const mineNow = work.queue.filter((a) => a.staffId === staff.id && a.packNow).length;

  /** Items rung up one at a time. Dozen boxes are shown on their own above these. */
  const looseLines = useMemo(
    () => Object.entries(ticket).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, lineCents: linePrice(MENU_BY_ID[itemId], qty) })),
    [ticket, MENU_BY_ID],
  );
  /** Everything on the ticket, one line per item, boxes included. This is what gets charged and saved. */
  const lines = useMemo(() => cartLines(ticket, boxes, MENU_BY_ID), [ticket, boxes, MENU_BY_ID]);
  const offers = upsells.stats.on ? suggestOffers(lines, MENU_BY_ID, (id) => !!demo.state.bake[id]?.soldOut).filter((o) => !taken.some((t) => t.kind === o.kind)) : [];
  if (offers.length > 0 && !sawOffer) setSawOffer(true);
  const takeOffer = (o: Offer) => { setTicket((c) => ({ ...c, [o.itemId]: (c[o.itemId] ?? 0) + o.qty })); setTaken((t) => [...t, o]); };
  const digits = phone.replace(/\D/g, '');
  const member = digits.length === 10 ? demo.findMember(digits) : undefined;
  const canRedeem = !!member && member.rewards > 0;
  const holdsCard = foundBy === 'card' || proven === digits;
  /** Use the free donut: right away for a scanned card, otherwise text the member a code to read back. */
  const askRedeem = () => {
    if (redeem) { setRedeem(false); return; }
    if (holdsCard) { setRedeem(true); return; }
    const code = oneTimeCode();
    demo.sendTexts([{ to: digits, body: `Dough Rewards: ${code} is your code to use a free donut at ${SHOP.name}. Only give it to the cashier. If you are not at the counter, ignore this.` }]);
    setCheck({ phone: digits, code, typed: '', misses: 0 });
    setCheckFailed(false);
  };
  const typeCheck = (value: string) => {
    if (!check) return;
    const typed = value.replace(/\D/g, '').slice(0, 6);
    if (typed.length < 6) { setCheck({ ...check, typed }); return; }
    if (typed === check.code) { setProven(check.phone); setRedeem(true); setCheck(null); return; }
    // Three wrong codes and the free donut stays on the card.
    if (check.misses + 1 >= 3) { setCheck(null); setCheckFailed(true); return; }
    setCheck({ ...check, typed: '', misses: check.misses + 1 });
  };
  const changePhone = (p: string, by: FoundBy) => { setPhone(p); setFoundBy(by); setRedeem(false); setCheck(null); setCheckFailed(false); };
  const discount = redeem && canRedeem ? rewardDiscount(lines, MENU_BY_ID) : 0;
  const t = totals(lines, MENU_BY_ID, discount);
  const clock = demo.state.clock[staff.id];
  const onClock = !!clock?.inAt;
  const tipping = demo.state.tippingEnabled;

  const add = (id: string, n: number) => setTicket((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + n) }));
  /** Puts donuts in the open box. The twelfth one closes it and puts it on the ticket. */
  const intoBox = (id: string, n = 1) => {
    if (!filling) return;
    const next = [...filling, ...Array<string>(Math.min(n, BOX_SIZE - filling.length)).fill(id)];
    if (next.length >= BOX_SIZE) { setBoxes((b) => [...b, next]); setFilling(null); }
    else setFilling(next);
  };
  const tap = (id: string) => (filling && isBoxable(MENU_BY_ID[id]) ? intoBox(id) : add(id, 1));
  const inBox = (id: string) => (filling ? filling.filter((x) => x === id).length : 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const clear = () => { setTicket({}); setTaken([]); setSawOffer(false); setPhone(''); setRedeem(false); setFoundBy('typed'); setCheck(null); setProven(''); setCheckFailed(false); setTip(0); setGiftCode(''); setStage('ticket'); setSheet(false); setBoxes([]); setFilling(null); };

  const giftCard = !giftLocked && giftCode.replace(/[^a-z0-9]/gi, '').length >= 8 ? gift.find(giftCode) : undefined;
  /** Takes a typed code. A full code that matches no card counts as a wrong try. */
  const typeGiftCode = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setGiftCode(clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean);
    if (clean.length === 8 && !gift.find(clean)) setGiftTries((t) => addMiss(t));
  };
  /** What the gift card on screen would cover of this bill. */
  const giftCovers = giftCard ? Math.min(giftCard.balanceCents, t.total) : 0;

  const finish = (payment: Pay, tipCents: number, useGift = false) => {
    const giftCents = useGift && giftCard ? gift.spend(giftCard.code, t.total) : 0;
    const order = demo.placeOrder({
      source: 'register', lines, boxes: boxes.length > 0 ? boxes : undefined, subtotal: t.subtotal, tax: t.tax, tip: tipCents, total: t.total + tipCents,
      payment, status: 'done', phone: digits.length === 10 ? digits : undefined, rewardRedeemed: discount > 0, giftCents: giftCents || undefined,
    });
    // Only count a suggestion the customer kept: the added items are still on the ticket.
    upsells.record(sawOffer, taken.filter((o) => (ticket[o.itemId] ?? 0) >= o.qty).map((o) => ({ kind: o.kind, cents: o.addCents })));
    let earned = false;
    if (digits.length === 10) {
      if (discount > 0) demo.redeem(digits);
      else earned = demo.punchVisit(digits).earnedReward;
    }
    setResult({ number: order.number, total: order.total, payment, earned, giftCents, giftLeft: useGift && giftCard ? giftCard.balanceCents - giftCents : undefined });
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

  if (stage === 'gift') {
    const owed = t.total - giftCovers;
    return (
      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center bg-white p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Pay with a gift card</p>
        <p className="tabular mt-3 font-display text-6xl font-extrabold">{money(t.total)}</p>
        <input
          autoFocus value={giftCode} onChange={(e) => typeGiftCode(e.target.value)} disabled={giftLocked} placeholder="ABCD-2345" aria-label="Gift card code"
          className="mt-6 w-full max-w-xs rounded-2xl border-2 border-slate-200 px-4 py-4 text-center font-display text-2xl font-bold uppercase tracking-widest focus:border-glaze-500 focus:outline-none"
        />
        {giftLocked && (
          <p role="alert" className="mt-3 max-w-sm rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            Too many wrong gift card codes. Gift cards are paused on this register for {minutesLocked(giftTries)} min, and the owner can see the tries. Take another payment for now.
          </p>
        )}
        {!giftCard && !giftLocked && (
          <div className="mt-3 max-w-sm text-xs text-slate-500">
            <p>{giftCode.replace(/[^a-z0-9]/gi, '').length >= 8 ? 'No card with that code.' : 'Type the code from the card.'} Demo cards to try:</p>
            <p className="mt-1.5 flex flex-wrap justify-center gap-1.5">
              {gift.cards.filter((c) => c.balanceCents > 0).slice(0, 3).map((c) => (
                <button key={c.code} onClick={() => setGiftCode(c.code)} className="tabular rounded-full bg-slate-100 px-2.5 py-1 font-mono font-semibold text-slate-700 hover:bg-slate-200">{c.code} · {money(c.balanceCents)}</button>
              ))}
            </p>
          </div>
        )}
        {giftCard && (
          <div className="mt-4 w-full max-w-sm">
            <p className="text-sm text-slate-700"><span className="font-semibold">{giftCard.name}</span> has {money(giftCard.balanceCents)} on this card.</p>
            {giftCard.balanceCents === 0 ? (
              <p className="mt-2 text-sm font-semibold text-rose-600">This card is used up.</p>
            ) : owed === 0 ? (
              <button onClick={() => finish('gift', 0, true)} className="mt-3 w-full rounded-2xl bg-glaze-600 py-4 text-lg font-bold text-white hover:bg-glaze-700">Take {money(giftCovers)} from the card</button>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-700">The card covers {money(giftCovers)}. <span className="font-bold text-slate-900">{money(owed)} is still owed.</span></p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => finish('cash', 0, true)} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 py-4 text-base font-bold text-slate-800"><Banknote size={18} /> Rest in cash</button>
                  <button onClick={() => finish('card', 0, true)} className="flex items-center justify-center gap-2 rounded-2xl bg-glaze-600 py-4 text-base font-bold text-white hover:bg-glaze-700"><CreditCard size={18} /> Rest on card</button>
                </div>
              </>
            )}
          </div>
        )}
        <button onClick={() => { setGiftCode(''); setStage('ticket'); }} className="mt-6 text-sm font-medium text-slate-500 underline">Back to ticket</button>
      </div>
    );
  }

  if (stage === 'done' && result) {
    return (
      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center bg-white p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={40} /></div>
        <h2 className="mt-5 font-display text-4xl font-extrabold">Paid {money(result.total)}</h2>
        <p className="mt-1 text-slate-600">
          Order #{result.number} · {result.giftCents > 0 && result.payment !== 'gift' ? `Gift card ${money(result.giftCents)}, ${PAY_LABEL[result.payment].toLowerCase()} ${money(result.total - result.giftCents)}` : PAY_LABEL[result.payment]}
          {tip > 0 && ` · includes ${money(tip)} tip`}
        </p>
        {result.giftLeft !== undefined && <p className="mt-2 text-sm font-semibold text-slate-700">{money(result.giftLeft)} left on the gift card.</p>}
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
    <div className="flex h-[calc(100dvh-48px)] flex-col bg-slate-100 md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex min-w-0 flex-1 basis-full gap-1 overflow-x-auto xl:basis-0">
            {TABS.map((c) => (
              <button key={c} onClick={() => setTab(c)} className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === c ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c}</button>
            ))}
          </div>
          <div className="-mx-3 flex min-w-0 basis-full items-center gap-2 overflow-x-auto px-3 xl:mx-0 xl:basis-auto xl:overflow-visible xl:px-0">
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
        </div>
        {prices.preview && <p className="bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">Previewing prices as if it were {DOW_NAMES[prices.preview.dow]} at {hourLabel(prices.preview.hour)}. Turn this off under Owner, Pricing.</p>}
        <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto p-3 pb-24 sm:grid-cols-4 md:grid-cols-3 md:pb-3 lg:grid-cols-4 xl:grid-cols-5">
          {filling ? (
            <div className="sticky top-0 z-10 col-span-full rounded-2xl bg-box-500 p-3 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <Package size={22} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Dozen box: {filling.length} of {BOX_SIZE}</p>
                  <p className="text-xs text-box-50">{filling.length === 0 ? 'Tap the donuts the customer wants. Mix any kinds.' : `${BOX_SIZE - filling.length} more to fill it. ${money(boxPrice(filling, MENU_BY_ID).cents)} so far.`}</p>
                </div>
                {filling.length > 0 && <button onClick={() => setFilling(filling.slice(0, -1))} className="shrink-0 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold">Undo</button>}
                <button onClick={() => setFilling(null)} className="shrink-0 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold">Cancel box</button>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: BOX_SIZE }, (_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < filling.length ? 'bg-white' : 'bg-white/25'}`} />)}
              </div>
            </div>
          ) : tab !== 'Drinks' && tab !== 'Smoothies & boba' && (
            <button onClick={() => setFilling([])} className="col-span-2 flex items-center gap-3 rounded-2xl border border-box-200 bg-box-50 p-3 text-left shadow-sm transition active:scale-[0.98]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-box-500 text-white"><Package size={24} /></span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight text-box-700">Dozen box</span>
                <span className="block text-xs leading-snug text-box-700/80">Mix any 12 for {money(SHOP.dozenBase)}. Specialty +{money(SHOP.specialtyExtra)} each.</span>
              </span>
            </button>
          )}
          {MENU.filter((m) => tab === 'All' || m.category === tab).map((item) => {
            const soldOut = demo.state.bake[item.id]?.soldOut;
            const qty = filling ? inBox(item.id) : ticket[item.id] ?? 0;
            return (
              <button
                key={item.id}
                disabled={soldOut}
                onClick={() => tap(item.id)}
                className={`relative flex flex-col items-center rounded-2xl border bg-white p-2.5 text-center shadow-sm transition active:scale-[0.97] disabled:opacity-40 ${qty > 0 ? (filling ? 'border-box-500 ring-2 ring-box-400/30' : 'border-glaze-500 ring-2 ring-glaze-400/30') : 'border-slate-200'} ${filling && !isBoxable(item) ? 'opacity-50' : ''}`}
              >
                <ItemArt item={item} size={48} />
                <span className="mt-1 text-[13px] font-semibold leading-tight text-slate-900">{item.name}</span>
                <span className="tabular text-xs text-slate-500">
                  {soldOut ? 'Sold out' : filling && isBoxable(item) ? (boxUpcharge(item) > 0 ? `+${money(boxUpcharge(item))} in a box` : 'In the box price') : prices.live[item.id]?.tag ? <><span className="mr-1 line-through">{money(prices.live[item.id].baseCents)}</span><span className={`font-bold ${prices.live[item.id].tag === 'weekend' ? 'text-slate-900' : 'text-rose-600'}`}>{money(item.price)}</span></> : money(item.price)}
                </span>
                {qty > 0 && <span className={`tabular absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${filling ? 'bg-box-500' : 'bg-glaze-600'}`}>{qty}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* On a phone the ticket is a bar at the bottom that opens into a sheet, so the menu gets the whole screen. */}
      {!sheet && (
        <button onClick={() => setSheet(true)} className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 bg-ink-900 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-left text-white shadow-[0_-8px_24px_rgba(11,18,32,0.25)] md:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{count === 0 ? 'Ticket is empty' : `${count} item${count === 1 ? '' : 's'} on the ticket`}</span>
            <span className="block truncate text-xs text-slate-300">{offers.length > 0 ? `${offers.length} thing${offers.length === 1 ? '' : 's'} to ask the customer` : member ? `${member.name} · Dough Rewards` : 'Rewards, payment and gift cards'}</span>
          </span>
          <span className="tabular font-display text-xl font-extrabold">{money(t.total)}</span>
          <span className="flex items-center gap-1 rounded-xl bg-glaze-500 px-3.5 py-2.5 text-sm font-bold text-ink-900">{count === 0 ? 'Open' : 'Pay'} <ChevronUp size={16} /></span>
        </button>
      )}
      {sheet && <div className="fixed inset-0 z-40 bg-ink-900/50 md:hidden" onClick={() => setSheet(false)} />}
      <aside className={`${sheet ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] overflow-y-auto rounded-t-3xl shadow-2xl' : 'hidden'} w-full shrink-0 flex-col bg-white md:static md:z-auto md:flex md:max-h-none md:w-[320px] lg:w-[380px] md:overflow-visible md:rounded-none md:border-l md:border-slate-200 md:shadow-none`}>
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="font-display text-lg font-bold">Ticket</h2>
          <div className="flex items-center gap-3">
            {lines.length > 0 && (
              <button onClick={clear} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600"><Trash2 size={13} /> Clear</button>
            )}
            <button onClick={() => setSheet(false)} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 md:hidden"><ChevronDown size={14} /> Back to the menu</button>
          </div>
        </div>
        <div className="min-h-0 shrink-0 px-4 md:flex-1 md:shrink md:overflow-y-auto">
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 md:py-10">Tap items to start a ticket</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {boxes.map((box, i) => {
                const bp = boxPrice(box, MENU_BY_ID);
                return (
                  <li key={`box${i}`} className="flex items-start gap-2 py-2">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-box-50 text-box-600"><Package size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Dozen box{boxes.length > 1 ? ` ${i + 1}` : ''}</p>
                      <p className="text-[11px] leading-snug text-slate-500">{boxCounts(box).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ')}</p>
                      {bp.singles > bp.cents && <p className="text-[11px] font-medium text-glaze-700">Saves {money(bp.singles - bp.cents)} over singles</p>}
                    </div>
                    <button aria-label="Remove this dozen box" onClick={() => setBoxes((b) => b.filter((_, j) => j !== i))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><X size={14} /></button>
                    <span className="tabular w-16 shrink-0 text-right text-sm font-semibold">{money(bp.cents)}</span>
                  </li>
                );
              })}
              {looseLines.map((l) => {
                const item = MENU_BY_ID[l.itemId];
                return (
                  <li key={l.itemId} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      {item.dozenPrice && l.qty >= 12 && <p className="text-[11px] font-medium text-glaze-700">Dozen price</p>}
                      {prices.live[l.itemId]?.tag && <p className="text-[11px] font-medium text-rose-600">{prices.live[l.itemId].label}</p>}
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

        {offers.length > 0 && (
          <div className="border-t border-slate-100 bg-glaze-50 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-700"><MessageCircle size={12} /> Ask the customer</p>
            <div className="mt-1.5 space-y-1.5">
              {offers.map((o) => (
                <button key={o.kind} onClick={() => takeOffer(o)} className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 ring-1 ring-glaze-200 hover:ring-glaze-500">
                  <span className="min-w-0 flex-1">{o.ask}</span>
                  <span className="shrink-0 rounded-lg bg-glaze-600 px-2 py-1 text-xs font-bold text-white">Yes, add</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-2.5">
          <label htmlFor="rewards-phone" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dough Rewards</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button onClick={() => setEntry('keypad')} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-800 hover:bg-slate-200"><Keyboard size={16} /> Phone number</button>
            <button onClick={() => setEntry('scan')} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-800 hover:bg-slate-200"><ScanLine size={16} /> Scan card</button>
          </div>
          <input id="rewards-phone" value={formatPhone(phone)} onChange={(e) => changePhone(e.target.value, 'typed')} inputMode="tel" placeholder="or type the number" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {entry && <RewardsEntry start={entry} initial={phone} onClose={() => setEntry(null)} onDone={(p, by) => { changePhone(p, by); setEntry(null); }} />}
          {digits.length === 10 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                {member ? <><span className="font-semibold text-slate-900">{member.name}</span> · {member.punches}/{PUNCHES_PER_REWARD} punches</> : 'New member: this visit is punch 1'}
              </span>
              {canRedeem && (
                <button onClick={askRedeem} disabled={!!check} className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold disabled:opacity-50 ${redeem ? 'bg-box-500 text-white' : 'bg-box-50 text-box-700'}`}>
                  <Gift size={12} /> {redeem ? 'Free donut applied' : `Use free donut (${member!.rewards})`}
                </button>
              )}
            </div>
          )}
          {check && check.phone === digits && (
            <div data-reward-check className="mt-2 rounded-xl bg-box-50 p-2.5 text-xs text-slate-700 ring-1 ring-box-100">
              <p>The number was typed, not scanned, so we texted a code to {lastFour(digits)}. Ask the customer to read it from their phone.</p>
              <div className="mt-1.5 flex items-center gap-2">
                <input autoFocus value={check.typed} onChange={(e) => typeCheck(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digit code" aria-label="Code from the customer's text" className="tabular w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-bold tracking-widest" />
                <button onClick={() => setCheck(null)} className="font-semibold text-slate-500 underline">Cancel</button>
              </div>
              {check.misses > 0 && <p className="mt-1 font-semibold text-rose-600">That code is wrong. {3 - check.misses} {3 - check.misses === 1 ? 'try' : 'tries'} left.</p>}
              <p className="mt-1 text-[11px] text-slate-500">Demo: the text is not really sent. The code is {check.code}.</p>
            </div>
          )}
          {checkFailed && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">Three wrong codes. The free donut stays on the member's card. Scanning their wallet card works too.</p>}
        </div>

        <div className="border-t border-slate-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
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
          <button disabled={lines.length === 0} onClick={() => setStage('gift')} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-box-50 py-2.5 text-sm font-bold text-box-700 hover:bg-box-100 disabled:opacity-40">
            <Gift size={16} /> Gift card
          </button>
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

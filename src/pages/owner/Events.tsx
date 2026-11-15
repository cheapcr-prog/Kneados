import { Check, Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clockLabel, useEvents, type LiveFund } from '../../components/Events';
import { daysBetween } from '../../lib/campaigns';
import { addDays, shortDate } from '../../lib/dates';
import { normalizeFundCode, totalDozens } from '../../lib/events';
import { formatPhone, money, moneyShort } from '../../lib/money';
import { Brain, Card, Demo, Pill, Stat, btn, field } from './ui';

const small = field.replace('w-full ', '') + ' w-16 text-center';
const STATE: Record<LiveFund['state'], { label: string; tone: 'slate' | 'green' | 'amber' | 'blue' }> = {
  upcoming: { label: 'Coming up', tone: 'blue' }, running: { label: 'Running', tone: 'green' }, ended: { label: 'Check owed', tone: 'amber' }, paid: { label: 'Paid out', tone: 'slate' },
};

/** Event pre-orders with their deposits, and fundraisers with what each group has earned. */
export function Events() {
  const ev = useEvents();
  const { today, rules } = ev;
  const week = ev.upcoming.filter((e) => daysBetween(today, e.date) <= 7);
  const weekDozens = week.reduce((a, e) => a + totalDozens(e.dozens), 0);
  const booked = ev.upcoming.reduce((a, e) => a + e.totalCents, 0);
  const deposits = ev.upcoming.reduce((a, e) => a + e.depositCents, 0);
  const due = ev.upcoming.reduce((a, e) => a + e.balanceCents, 0);
  const owed = ev.funds.filter((f) => f.state === 'ended');
  const owedCents = owed.reduce((a, f) => a + f.giveBackCents, 0);
  const running = ev.funds.filter((f) => f.state === 'running');
  const [copied, setCopied] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ org: '', contact: '', code: '', share: 20, goal: 300, start: today, end: addDays(today, 7) });
  const codeTaken = ev.funds.some((f) => f.code === normalizeFundCode(draft.code));
  const canAdd = draft.org.trim().length > 1 && normalizeFundCode(draft.code).length >= 3 && !codeTaken && draft.end >= draft.start && draft.share > 0 && draft.share <= 50;
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(`https://kneados.app/demo/shop?fund=${code}`).catch(() => undefined);
    setCopied(code);
  };

  return (
    <div className="space-y-4">
      <Brain label="KneadOS events" title={`${ev.upcoming.length} event${ev.upcoming.length === 1 ? '' : 's'} booked, ${weekDozens} dozen in the next 7 days`}>
        <p>Every booking is already on the books: it joins the bake plan the day before and the packing queue on the day, with the balance to collect printed on the order.</p>
        <p>{running.length > 0 ? `${running.map((f) => `${f.org} has raised ${money(f.giveBackCents)} so far`).join('. ')}.` : 'No fundraiser is running today.'}{owed.length > 0 ? ` You owe ${owed.map((f) => `${f.org} a check for ${money(f.giveBackCents)}`).join(' and ')}.` : ''}</p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Booked ahead" value={moneyShort(booked)} sub={`${ev.upcoming.length} events`} tone="good" />
        <Stat label="Deposits collected" value={moneyShort(deposits)} sub="on events still to come" />
        <Stat label="Still to collect" value={moneyShort(due)} sub="at pickup" />
        <Stat label="Fundraiser checks owed" value={moneyShort(owedCents)} sub={owed.length > 0 ? owed.map((f) => f.org).join(', ') : 'nothing owed'} tone={owed.length > 0 ? 'bad' : undefined} />
      </div>

      <Card title="Upcoming events" note="Booked on the shop website with a deposit." action={<Link to="/demo/shop/events" className={btn.light}>See the booking page</Link>}>
        {ev.upcoming.length === 0 ? <p className="text-sm text-slate-500">No events booked.</p> : (
          <ul className="divide-y divide-slate-100">
            {ev.upcoming.map((e) => {
              const away = daysBetween(today, e.date);
              return (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{e.name}{e.occasion && <span className="font-normal text-slate-500">{e.occasion}</span>}{e.fundraiser && <Pill tone="blue">{e.fundraiser}</Pill>}</p>
                    <p className="text-sm text-slate-600">{totalDozens(e.dozens)} dozen · {away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : shortDate(e.date)} at {clockLabel(e.time)}</p>
                    <p className="text-xs text-slate-500">{formatPhone(e.phone)}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-display text-lg font-bold">{money(e.totalCents)}</p>
                    <p className="text-xs text-slate-500">Deposit {money(e.depositCents)} paid</p>
                    <div className="mt-1.5 flex justify-end">
                      {e.paid ? <Pill tone="green">Paid in full</Pill> : <button className={btn.light} onClick={() => ev.payBalance(e.id)}><Check size={12} /> Mark {money(e.balanceCents)} balance paid</button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Booking rules" note="The booking page follows these as soon as you change them.">
        <div className="space-y-2 text-sm text-slate-700">
          <p>Event orders start at <input type="number" min={1} max={20} className={small} value={rules.minDozens} aria-label="Smallest event order in dozens" onChange={(e) => ev.setRules({ minDozens: Math.max(1, Number(e.target.value) || 1) })} /> dozen and need <input type="number" min={1} max={14} className={small} value={rules.noticeDays} aria-label="Days of notice" onChange={(e) => ev.setRules({ noticeDays: Math.max(1, Number(e.target.value) || 1) })} /> days of notice.</p>
          <p>Orders of <input type="number" min={2} max={100} className={small} value={rules.bigDozens} aria-label="Big order size in dozens" onChange={(e) => ev.setRules({ bigDozens: Math.max(2, Number(e.target.value) || 2) })} /> dozen or more need <input type="number" min={1} max={30} className={small} value={rules.bigNoticeDays} aria-label="Days of notice for big orders" onChange={(e) => ev.setRules({ bigNoticeDays: Math.max(1, Number(e.target.value) || 1) })} /> days.</p>
          <p>The deposit is <input type="number" min={0} max={100} step={5} className={small} value={Math.round(rules.depositShare * 100)} aria-label="Deposit percent" onChange={(e) => ev.setRules({ depositShare: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })} /> % of the order, paid when booking.</p>
        </div>
      </Card>

      <Card title="Fundraisers" note="A group shares its code or link. Every order placed with it sends a share of the sale back to the group." action={<button className={btn.light} onClick={() => setAdding((a) => !a)}><Plus size={13} /> New fundraiser</button>}>
        {adding && (
          <div className="mb-4 rounded-xl bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input className={field} placeholder="Group name" aria-label="Group name" value={draft.org} onChange={(e) => setDraft({ ...draft, org: e.target.value })} />
              <input className={field} placeholder="Contact" aria-label="Contact" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
              <input className={field} placeholder="Code, e.g. TROOP42" aria-label="Fundraiser code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: normalizeFundCode(e.target.value) })} />
              <label className="text-xs font-semibold text-slate-600">Starts<input type="date" className={field} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-600">Ends<input type="date" className={field} value={draft.end} min={draft.start} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600">Share %<input type="number" min={1} max={50} className={field} value={draft.share} onChange={(e) => setDraft({ ...draft, share: Number(e.target.value) || 0 })} /></label>
                <label className="text-xs font-semibold text-slate-600">Goal $<input type="number" min={0} step={50} className={field} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: Number(e.target.value) || 0 })} /></label>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className={btn.dark} disabled={!canAdd} onClick={() => { ev.addFund({ org: draft.org.trim(), contact: draft.contact.trim(), code: draft.code, share: draft.share / 100, goalCents: draft.goal * 100, start: draft.start, end: draft.end }); setAdding(false); setDraft({ ...draft, org: '', contact: '', code: '' }); }}>Start fundraiser</button>
              {codeTaken && <p className="text-xs text-rose-600">That code is already in use.</p>}
            </div>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {ev.funds.map((f) => (
            <li key={f.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{f.org}<Pill tone={STATE[f.state].tone}>{STATE[f.state].label}</Pill></p>
                  <p className="text-sm text-slate-600">Code <span className="font-mono font-bold text-slate-900">{f.code}</span> · {Math.round(f.share * 100)}% of each order · {shortDate(f.start)} to {shortDate(f.end)}</p>
                  <p className="text-xs text-slate-500">{f.contact ? `${f.contact} · ` : ''}{f.orders} orders worth {money(f.salesCents)}{f.paidOut ? ` · check sent ${shortDate(f.paidOut)}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-lg font-bold">{money(f.giveBackCents)}<span className="text-xs font-medium text-slate-500"> raised</span></p>
                  <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                    {f.state !== 'paid' && f.state !== 'ended' && <button className={btn.light} onClick={() => copy(f.code)}>{copied === f.code ? <><Check size={12} /> Link copied</> : <><Copy size={12} /> Copy link</>}</button>}
                    {f.state === 'ended' && <button className={btn.green} onClick={() => ev.markPaid(f.id)}><Check size={12} /> Mark check sent</button>}
                  </div>
                </div>
              </div>
              {f.goalCents > 0 && (
                <div className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-glaze-500" style={{ width: `${Math.round(f.progress * 100)}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-500">{Math.round(f.progress * 100)}% of the {moneyShort(f.goalCents)} goal</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Demo>Demo: these bookings and groups are examples, the sales before today on each fundraiser are example figures, and no cards are charged. Orders placed in this demo with a code are added on top.</Demo>
    </div>
  );
}

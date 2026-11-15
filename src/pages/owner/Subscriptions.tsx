import { Check, MapPin, Pause, Play, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { itemNames, useSubscriptions } from '../../components/Subscriptions';
import { useShopState } from '../../data/local';
import { SHOP, STAFF, STAFF_BY_ID } from '../../data/shop';
import type { Demo } from '../../data/store';
import { ROUTE_LEAVES } from '../../data/subscriptions';
import { DOW_NAMES, DOW_SHORT, addDays, dowOf, shortDate, timeLabel } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { MIX_BY_ID, addMinutes, deliversOn, monthlyRecurring, planRoute, priceOf } from '../../lib/subscriptions';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn } from './ui';

const clock = (t: string) => timeLabel(`2026-01-01T${t}:00`);

export function Subscriptions({ demo, onOpen }: { demo: Demo; onOpen: (tab: 'Delivery route') => void }) {
  const { subs, nextDate, setStatus, toggleSkip } = useSubscriptions();
  const today = demo.state.today;
  const active = subs.filter((s) => s.status === 'active');
  const weekly = active.reduce((a, s) => a + priceOf(s).weeklyCents, 0);
  const dozens = active.reduce((a, s) => a + s.dozens, 0);
  const byDay = DOW_NAMES.map((name, d) => ({ name, d, dozens: active.filter((s) => s.dow === d).reduce((a, s) => a + s.dozens, 0), stops: active.filter((s) => s.dow === d).length }));
  const best = byDay.reduce((a, b) => (b.dozens > a.dozens ? b : a));
  const quiet = byDay.filter((x) => x.stops > 0).reduce((a, b) => (b.dozens < a.dozens ? b : a), best);
  const fresh = subs.filter((s) => s.since === today);
  return (
    <div className="space-y-4">
      <Brain label="KneadOS subscriptions" title={`${moneyShort(monthlyRecurring(subs))} a month you can count on`}>
        <p>{active.length} offices get a standing box, {dozens} dozen a week. Every box is on the books two weeks ahead, so it is already in the bake plan and the supply orders.</p>
        <p>{best.name} is the big day with {best.dozens} dozen across {best.stops} stops.{quiet.d !== best.d ? ` ${quiet.name} has room: the van is already going out for ${quiet.stops} stop${quiet.stops === 1 ? '' : 's'}, so new sign-ups there cost almost nothing to deliver.` : ''}</p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active subscriptions" value={String(active.length)} sub={subs.length > active.length ? `${subs.length - active.length} paused` : 'none paused'} />
        <Stat label="Each week" value={moneyShort(weekly)} sub={`${dozens} dozen`} tone="good" />
        <Stat label="Each month" value={moneyShort(monthlyRecurring(subs))} sub="at the current list" tone="good" />
        <Stat label="New today" value={String(fresh.length)} sub={fresh.length > 0 ? fresh.map((s) => s.company).join(', ') : 'from the shop website'} />
      </div>

      <Card title="Boxes by day" action={<button className={btn.light} onClick={() => onOpen('Delivery route')}><MapPin size={13} /> Open the delivery route</button>}>
        <div className="grid grid-cols-7 gap-1.5">
          {byDay.map((x) => (
            <div key={x.d} className={`rounded-xl p-2 text-center ${x.d === dowOf(today) ? 'bg-ink-900 text-white' : 'bg-slate-50'}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{DOW_SHORT[x.d]}</p>
              <p className="tabular font-display text-xl font-extrabold">{x.dozens}</p>
              <p className="text-[11px] opacity-70">doz · {x.stops} stop{x.stops === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Subscribers" note="Signed up on the shop website." action={<Link to="/demo/shop/fridays" className={btn.light}>See the sign-up page</Link>}>
        <ul className="divide-y divide-slate-100">
          {subs.map((s) => {
            const next = nextDate(s);
            const skipped = s.skips.includes(next);
            return (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{s.company}{s.since === today && <Pill tone="green">New</Pill>}{s.status === 'paused' && <Pill tone="amber">Paused</Pill>}</p>
                  <p className="text-sm text-slate-600">{s.dozens} dozen {MIX_BY_ID[s.mix].name.toLowerCase()}, every {DOW_NAMES[s.dow]} by {clock(s.by)}</p>
                  <p className="break-words text-xs text-slate-500">{s.address} · {s.contact} · since {shortDate(s.since)}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-lg font-bold">{money(priceOf(s).weeklyCents)}<span className="text-xs font-medium text-slate-500"> a week</span></p>
                  <p className="text-xs text-slate-500">{s.status === 'paused' ? 'No deliveries while paused' : skipped ? `Skipping ${shortDate(next)}` : `Next box ${next === today ? 'today' : shortDate(next)}`}</p>
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    {s.status === 'active' && <button className={btn.light} onClick={() => toggleSkip(s.id, next)}><SkipForward size={12} /> {skipped ? 'Undo skip' : 'Skip next'}</button>}
                    <button className={btn.light} onClick={() => setStatus(s.id, s.status === 'active' ? 'paused' : 'active')}>{s.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <DemoNote>Demo: these offices and addresses are examples, and no cards are charged. Pausing or skipping takes the box out of the bake plan right away.</DemoNote>
    </div>
  );
}

/** The day's delivery run: stops in driving order with times, for the owner and the driver's phone. */
export function DeliveryRoute({ demo }: { demo: Demo }) {
  const { subs } = useSubscriptions();
  const today = demo.state.today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(today);
  const [driver, setDriver] = useShopState<string>('route-driver', () => 'andre');
  const [dropped, setDropped] = useShopState<Record<string, string>>(`route-${date}`, () => ({}));
  const due = subs.filter((s) => deliversOn(s, date, dowOf(date)));
  const route = planRoute({ lat: SHOP.lat, lon: SHOP.lon }, due, ROUTE_LEAVES);
  const left = route.stops.filter((s) => !dropped[s.sub.id]);
  const next = date === today ? left[0] : undefined;

  // A small map: the shop and each stop, placed by their real positions and joined in driving order.
  const pts = [{ lat: SHOP.lat, lon: SHOP.lon }, ...route.stops.map((s) => s.sub)];
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  const pad = 0.006;
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lons) - pad, Math.max(...lons) + pad];
  const xy = (p: { lat: number; lon: number }) => [((p.lon - minLon) / (maxLon - minLon)) * 600, 300 - ((p.lat - minLat) / (maxLat - minLat)) * 300];
  const path = [...pts, pts[0]].map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p).map((n) => n.toFixed(1)).join(' ')}`).join(' ');

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => {
          const n = subs.filter((s) => deliversOn(s, d, dowOf(d))).length;
          return (
            <button key={d} onClick={() => setDate(d)} className={`shrink-0 rounded-xl px-3 py-2 text-left ${date === d ? 'bg-ink-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
              <p className="text-xs font-bold">{d === today ? 'Today' : DOW_SHORT[dowOf(d)]} <span className="font-medium opacity-70">{shortDate(d)}</span></p>
              <p className="tabular text-[11px] opacity-70">{n} stop{n === 1 ? '' : 's'}</p>
            </button>
          );
        })}
      </div>

      {route.stops.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No boxes go out on {DOW_NAMES[dowOf(date)]}. The van stays parked.</p></Card>
      ) : (
        <>
          <Brain label="KneadOS route" title={next ? `Next stop: ${next.sub.company}` : left.length === 0 && date === today ? 'Every box is delivered' : `${route.stops.length} stops, about ${route.totalMin} minutes`}>
            <p>The van leaves at {clock(ROUTE_LEAVES)} with {route.dozens} dozen and is back about {clock(addMinutes(ROUTE_LEAVES, route.totalMin))}, {route.totalMiles.toFixed(1)} miles round trip. Stops with the earliest deadline go first, then the closest one next.</p>
            {route.stops.some((s) => s.late) && <p className="font-semibold text-rose-300">{route.stops.filter((s) => s.late).map((s) => s.sub.company).join(' and ')} would get their box after the time they asked for. Leave earlier or send a second driver.</p>}
          </Brain>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Stops" value={`${route.stops.length - left.length} of ${route.stops.length}`} sub="delivered" />
            <Stat label="On the van" value={`${route.dozens} dozen`} sub={money(due.reduce((a, s) => a + priceOf(s).weeklyCents, 0))} />
            <Stat label="Round trip" value={`${route.totalMiles.toFixed(1)} mi`} sub={`about ${route.totalMin} min`} />
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Driver</p>
              <select value={driver} onChange={(e) => setDriver(e.target.value)} aria-label="Driver" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-display text-lg font-bold">
                {STAFF.filter((s) => s.role !== 'baker').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="mt-0.5 text-xs text-slate-500">{STAFF_BY_ID[driver].name.split(' ')[0]} sees this list on their phone.</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title="Stops in driving order">
              <ol className="space-y-2">
                {route.stops.map((s, i) => {
                  const at = dropped[s.sub.id];
                  return (
                    <li key={s.sub.id} className={`flex items-start gap-3 rounded-xl border p-3 ${at ? 'border-emerald-200 bg-emerald-50/60' : next?.sub.id === s.sub.id ? 'border-glaze-500 bg-glaze-50' : 'border-slate-200'}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold ${at ? 'bg-emerald-600 text-white' : 'bg-ink-900 text-white'}`}>{at ? <Check size={16} /> : i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{s.sub.company}</p>
                        <p className="break-words text-xs text-slate-500">{s.sub.address} · ask for {s.sub.contact}</p>
                        <p className="mt-1 text-sm text-slate-700">{s.sub.dozens} dozen: {itemNames(s.sub)}</p>
                        <p className={`tabular mt-1 text-xs ${s.late ? 'font-bold text-rose-700' : 'text-slate-500'}`}>Arrive about {clock(addMinutes(ROUTE_LEAVES, s.arriveMin))} · wanted by {clock(s.sub.by)} · {s.legMiles.toFixed(1)} mi from the last stop</p>
                      </div>
                      {date === today && (at
                        ? <span className="shrink-0 text-xs font-semibold text-emerald-700">Dropped {timeLabel(at)}</span>
                        : <button className={btn.green} onClick={() => setDropped((d) => ({ ...d, [s.sub.id]: new Date().toISOString() }))}>Delivered</button>)}
                    </li>
                  );
                })}
              </ol>
            </Card>
            <Card title="Map" note="Positions only. Roads are not drawn." className="self-start">
              <svg viewBox="-20 -20 640 340" className="w-full rounded-xl bg-slate-50" role="img" aria-label="Map of the delivery stops in driving order">
                <path d={path} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
                {route.stops.map((s, i) => {
                  const [x, y] = xy(s.sub);
                  return (
                    <g key={s.sub.id}>
                      <circle cx={x} cy={y} r="13" fill={dropped[s.sub.id] ? '#059669' : '#0f172a'} />
                      <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{i + 1}</text>
                    </g>
                  );
                })}
                <g>
                  <rect x={xy(pts[0])[0] - 22} y={xy(pts[0])[1] - 11} width="44" height="22" rx="11" fill="#ec4899" />
                  <text x={xy(pts[0])[0]} y={xy(pts[0])[1] + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">Shop</text>
                </g>
              </svg>
            </Card>
          </div>
        </>
      )}
      <DemoNote>Demo: drive times are estimated from straight-line distance, so treat them as a guide. Addresses typed into the sign-up page are placed near the shop, because the demo has no address lookup.</DemoNote>
    </div>
  );
}

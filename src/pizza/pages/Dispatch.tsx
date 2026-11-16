import { Bike, Clock, MapPin, Sparkles } from 'lucide-react';
import { useTick } from '../../components/Breaks';
import { money } from '../../lib/money';
import { DRIVERS, MILEAGE_CENTS, PIZZA_STAFF_BY_ID, ZONES } from '../data';
import { MINUTE, lateBy, route } from '../logic';
import { usePizzaBrain } from '../brain';
import { usePizza } from '../store';

const SCALE = 26;

/** Who drives what next. KneadOS stacks orders whose doors are close and hands each run to the driver who is free first. */
export function Dispatch() {
  useTick(10_000);
  const demo = usePizza();
  const { state, dispatch, driverBack, setDriverOn } = demo;
  const now = Date.now();
  const brain = usePizzaBrain(demo, now);
  const deliveries = state.orders.filter((o) => o.fulfillment === 'delivery' && o.status !== 'done' && !o.scheduled);
  const waiting = deliveries.filter((o) => !o.driverId);
  const byId = (id: string) => state.orders.find((o) => o.id === id)!;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-100 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Dispatch</h1>
          <p className="text-sm text-slate-500">{waiting.length} deliveries waiting for a driver · quoting {brain.quoteDelivery.minutes} min</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <svg viewBox={`${-5.4 * SCALE} ${-4 * SCALE} ${10.8 * SCALE} ${8 * SCALE}`} className="w-full rounded-xl bg-[#eef3ee]" role="img" aria-label="Delivery map">
            {[...ZONES].reverse().map((z) => <circle key={z.id} r={(z.maxMiles / 1.25) * SCALE} fill={z.id === 'A' ? '#d1fae5' : z.id === 'B' ? '#e0f2e9' : '#f1f5f2'} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="0.8" />)}
            {ZONES.map((z) => <text key={z.id} x={(z.maxMiles / 1.25) * SCALE * 0.71 + 2} y={-(z.maxMiles / 1.25) * SCALE * 0.71} fontSize="9" fill="#64748b" fontWeight="700">Zone {z.id}</text>)}
            {/* Routes for drivers out now. */}
            {DRIVERS.map((d) => {
              const ds = state.drivers[d.id];
              if (ds.status !== 'out' || !ds.orderIds.length) return null;
              const stops = ds.orderIds.map(byId).filter(Boolean).map((o) => ({ x: o.customer.x ?? 0, y: o.customer.y ?? 0 }));
              const pts = [{ x: 0, y: 0 }, ...route(stops).order.map((i) => stops[i]), { x: 0, y: 0 }];
              return <polyline key={d.id} points={pts.map((p) => `${p.x * SCALE},${-p.y * SCALE}`).join(' ')} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="5 3" />;
            })}
            {brain.runs.map((r, i) => {
              const stops = r.orderIds.map(byId).map((o) => ({ x: o.customer.x ?? 0, y: o.customer.y ?? 0 }));
              const pts = [{ x: 0, y: 0 }, ...stops, { x: 0, y: 0 }];
              return <polyline key={i} points={pts.map((p) => `${p.x * SCALE},${-p.y * SCALE}`).join(' ')} fill="none" stroke="#059669" strokeWidth="2" opacity="0.7" />;
            })}
            {deliveries.map((o) => {
              const late = lateBy(o, now) > 0;
              const color = o.status === 'out' ? '#0ea5e9' : o.status === 'ready' ? '#059669' : '#f59e0b';
              return (
                <g key={o.id} transform={`translate(${(o.customer.x ?? 0) * SCALE} ${-(o.customer.y ?? 0) * SCALE})`}>
                  <circle r="7" fill={color} stroke={late ? '#e11d48' : '#fff'} strokeWidth={late ? 2.5 : 1.5} />
                  <text y="-10" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0f172a">#{o.number}</text>
                </g>
              );
            })}
            <g><rect x="-8" y="-8" width="16" height="16" rx="4" fill="#0b1220" /><text y="3" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">🍕</text></g>
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Cooking</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Boxed, waiting</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> On the road</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-rose-600" /> Running late</span>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl bg-ink-900 p-4 text-white">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300"><Sparkles size={13} /> Suggested runs</p>
            {brain.runs.length === 0 && <p className="mt-2 text-sm text-slate-300">Nothing to send yet. Runs appear here as soon as pies are boxed, or a few minutes before they leave the oven.</p>}
            {brain.runs.map((r) => {
              const d = PIZZA_STAFF_BY_ID[r.driverId];
              const waitMin = Math.max(0, Math.round((r.leaveAt - now) / MINUTE));
              const notReady = r.orderIds.some((id) => byId(id).status !== 'ready');
              return (
                <div key={r.orderIds.join()} className="mt-3 rounded-xl bg-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{d.name.split(' ')[0]} takes {r.orderIds.map((id) => `#${byId(id).number}`).join(', ')}</p>
                    <button disabled={waitMin > 0 || notReady} onClick={() => dispatch(r.driverId, r.orderIds, r.minutes, r.miles)} className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold disabled:opacity-40">{waitMin > 0 ? `Back in ${waitMin} min` : notReady ? 'In the oven' : 'Send'}</button>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{r.why}. About {r.minutes} min out and back, {money(r.mileageCents)} mileage at {MILEAGE_CENTS}¢/mi.</p>
                  <ol className="mt-1.5 space-y-0.5 text-xs text-slate-200">
                    {r.orderIds.map((id, i) => { const o = byId(id); return <li key={id} className="flex items-center gap-1.5"><MapPin size={11} /> {i + 1}. {o.customer.address} · {o.customer.name} · due {new Date(o.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</li>; })}
                  </ol>
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-display text-lg font-bold">Drivers tonight</h2>
            <div className="mt-2 space-y-2">
              {DRIVERS.map((d) => {
                const ds = state.drivers[d.id];
                const back = ds.backAt ? Math.round((new Date(ds.backAt).getTime() - now) / MINUTE) : 0;
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                    <Bike size={18} className={ds.status === 'out' ? 'text-sky-600' : ds.status === 'in' ? 'text-emerald-600' : 'text-slate-300'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{d.name} <span className="font-normal text-slate-500">{ds.status === 'out' ? `out with ${ds.orderIds.map((id) => `#${byId(id)?.number}`).join(', ')}, back ${back > 0 ? `in ${back} min` : 'any minute'}` : ds.status === 'in' ? 'at the shop' : 'not on yet'}</span></p>
                      <p className="tabular text-xs text-slate-500">{ds.runs} runs · {ds.miles} mi · {money(Math.round(ds.miles * MILEAGE_CENTS))} mileage owed · {money(ds.tipsCents)} tips</p>
                    </div>
                    {ds.status === 'out' && <button onClick={() => driverBack(d.id)} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Back, delivered</button>}
                    {ds.status === 'off' && <button onClick={() => setDriverOn(d.id, true)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Clock in</button>}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">Drivers keep their own delivery tips. Mileage is paid for every mile on their own car, as California requires; the rate is a shop setting.</p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-display text-lg font-bold">Every delivery</h2>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {deliveries.sort((a, b) => +new Date(a.promisedAt) - +new Date(b.promisedAt)).map((o) => {
                const late = lateBy(o, now);
                return (
                  <li key={o.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-12 font-bold">#{o.number}</span>
                    <span className="min-w-0 flex-1 truncate">{o.customer.address} <span className="text-slate-400">zone {o.customer.zone}</span></span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold capitalize">{o.status === 'new' ? 'to make' : o.status}</span>
                    <span className={`flex w-24 items-center justify-end gap-1 text-xs ${late > 0 ? 'font-bold text-rose-600' : 'text-slate-500'}`}><Clock size={11} /> {late > 0 ? `${late} min late` : new Date(o.promisedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

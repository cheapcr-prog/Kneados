import { ArrowRight, Truck } from 'lucide-react';
import { useMemo } from 'react';
import { rng } from '../../data/history';
import { useShopState } from '../../data/local';
import { MENU, MENU_BY_ID, SHOP } from '../../data/shop';
import type { Demo } from '../../data/store';
import { dowOf } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { rollup, suggestTransfers, type LocationDay } from '../../lib/locations';
import { LABOR_TARGET } from '../../lib/schedule';
import { wagesFor } from './Money';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn } from './ui';

/** Example second and third shops. Their numbers are scaled from this shop's, so the demo always has something to compare. */
const OTHERS = [
  { id: 'signal', name: 'Signal Hill', manager: 'Carmen D.', scale: 0.74, seed: 31 },
  { id: 'lakewood', name: 'Lakewood', manager: 'Victor S.', scale: 1.16, seed: 57 },
];
const HOME = { id: 'home', name: 'Belmont Shore', manager: 'Rosa M.' };

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Today's numbers for every shop, and the tray moves worth making between them. */
export function useLocations(demo: Demo, alerts: number) {
  const { state } = demo;
  const [sent, setSent] = useShopState<string[]>(`transfers-${state.today}`, () => []);
  const locations = useMemo<LocationDay[]>(() => {
    const dow = dowOf(state.today);
    const baked = MENU.filter((m) => m.baked);
    const same = demo.history.filter((h) => h.dow === dow && !h.holiday).slice(-8);
    const typical = same.reduce((a, h) => a + h.revenue, 0) / Math.max(1, same.length);
    const sales = demo.todayOrders.reduce((a, o) => a + o.subtotal, 0);
    const rack: Record<string, number> = {};
    const need: Record<string, number> = {};
    let made = 0;
    for (const m of baked) {
      const sold = demo.soldToday[m.id] ?? 0;
      const mk = state.bake[m.id]?.made ?? 0;
      made += mk;
      rack[m.id] = Math.max(0, mk - sold);
      need[m.id] = Math.max(0, demo.forecastToday(m.id).qty - sold);
    }
    const left = (r: Record<string, number>, n: Record<string, number>) => Object.keys(r).reduce((a, id) => a + Math.max(0, r[id] - (n[id] ?? 0)), 0);
    const home: LocationDay = { ...HOME, salesCents: sales, typicalCents: typical, laborCents: wagesFor(dow), madeUnits: made, wasteUnits: left(rack, need), rack, need, alerts };
    const others = OTHERS.map((o): LocationDay => {
      const r = rng(o.seed + Number(state.today.replace(/-/g, '')));
      const pace = 0.9 + r() * 0.25;
      const oRack: Record<string, number> = {};
      const oNeed: Record<string, number> = {};
      for (const m of baked) {
        // Some items are overbaked and a few are nearly gone, the way a real second shop looks mid-morning.
        const swing = r() < 0.2 ? 0.15 : r() < 0.3 ? 2.2 : 0.8 + r() * 0.5;
        oNeed[m.id] = Math.round(need[m.id] * o.scale * pace);
        oRack[m.id] = Math.round(Math.max(need[m.id], 6) * o.scale * swing);
      }
      return {
        id: o.id, name: o.name, salesCents: Math.round(sales * o.scale * pace), typicalCents: Math.round(typical * o.scale), laborCents: Math.round(wagesFor(dow) * (0.55 + o.scale * 0.45)),
        madeUnits: Math.round(made * o.scale), wasteUnits: left(oRack, oNeed), rack: oRack, need: oNeed, alerts: Math.floor(r() * 4),
      };
    });
    return [home, ...others];
  }, [demo, state.today, state.bake, alerts]);

  const transfers = suggestTransfers(locations).slice(0, 6);
  const name = (id: string) => locations.find((l) => l.id === id)!.name;
  const key = (t: { itemId: string; from: string; to: string }) => `${t.itemId}:${t.from}:${t.to}`;
  return {
    locations, transfers, name, key, sent,
    /** Trays still waiting on a driver. */
    open: transfers.filter((t) => !sent.includes(key(t))),
    send: (keys: string[]) => setSent((s) => [...new Set([...s, ...keys])]),
  };
}

export function Locations({ demo, alerts }: { demo: Demo; alerts: number }) {
  const { state } = demo;
  const { locations, transfers, name, key, sent, send } = useLocations(demo, alerts);
  const all = rollup(locations);
  const manager = (id: string) => (id === 'home' ? HOME.manager : OTHERS.find((o) => o.id === id)!.manager);
  const saved = transfers.reduce((a, t) => a + t.qty * MENU_BY_ID[t.itemId].price, 0);
  const best = [...locations].sort((a, b) => b.salesCents / b.typicalCents - a.salesCents / a.typicalCents)[0];
  return (
    <div className="space-y-4">
      <Brain label="KneadOS across your shops" title={transfers.length > 0 ? `${transfers.length} tray moves would save about ${moneyShort(saved)} in sales today` : 'Every shop has what it needs right now'}>
        <p>KneadOS compares what each shop has on the rack with what it still expects to sell. When one shop is going to run out and another baked too many, it suggests moving whole trays before the rush ends.</p>
        <p>{best.name} is having the strongest day against its usual {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dowOf(state.today)]}.</p>
      </Brain>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales so far, all shops" value={moneyShort(all.salesCents)} sub={`${pct(all.salesCents / Math.max(1, all.typicalCents))} of a usual full day`} />
        <Stat label="Labor, all shops" value={pct(all.laborCents / Math.max(1, all.typicalCents))} sub="of a usual day's sales" tone={all.laborCents / Math.max(1, all.typicalCents) <= LABOR_TARGET.high ? 'good' : 'bad'} />
        <Stat label="Headed for the day-old rack" value={pct(all.wasteShare)} sub="of what was baked, at this pace" />
        <Stat label="Waiting on a manager" value={String(all.alerts)} sub="orders, tasks and repairs" tone={all.alerts > 0 ? 'bad' : 'good'} />
      </div>

      <Card title="Shops" note={`${SHOP.name}, three locations`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">Shop</th><th className="pb-1.5 text-right font-medium">Sales so far</th><th className="pb-1.5 text-right font-medium">Usual full day</th><th className="pb-1.5 text-right font-medium">Labor today</th><th className="pb-1.5 text-right font-medium">Extra on the rack</th><th className="pb-1.5 pl-4 font-medium">Needs attention</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((l) => (
                <tr key={l.id}>
                  <td className="py-2"><span className="font-semibold">{l.name}</span>{l.id === 'home' && <span className="ml-2"><Pill tone="dark">This shop</Pill></span>}<span className="block text-xs text-slate-500">{manager(l.id)} is in charge today</span></td>
                  <td className="tabular py-2 text-right font-semibold">{money(l.salesCents)}</td>
                  <td className="tabular py-2 text-right text-slate-600">{moneyShort(l.typicalCents)}</td>
                  <td className="tabular py-2 text-right text-slate-600">{moneyShort(l.laborCents)} <span className="text-xs">({pct(l.laborCents / Math.max(1, l.typicalCents))})</span></td>
                  <td className="tabular py-2 text-right text-slate-600">{l.wasteUnits} donuts</td>
                  <td className="py-2 pl-4"><Pill tone={l.alerts === 0 ? 'green' : l.alerts > 2 ? 'red' : 'amber'}>{l.alerts === 0 ? 'All clear' : `${l.alerts} thing${l.alerts === 1 ? '' : 's'}`}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Move trays between shops" note="Only whole half-dozen trays move, and no shop gives up what it still expects to sell.">
        {transfers.length === 0 ? <p className="text-sm text-slate-500">Nothing worth moving right now.</p> : (
          <ul className="divide-y divide-slate-100">
            {transfers.map((t) => {
              const done = sent.includes(key(t));
              return (
                <li key={key(t)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="tabular font-display text-lg font-bold">{t.qty}</span>
                    <span className="font-medium">{MENU_BY_ID[t.itemId].name}</span>
                    <span className="flex items-center gap-1 text-slate-600">{name(t.from)} <ArrowRight size={14} /> {name(t.to)}</span>
                  </span>
                  {done
                    ? <Pill tone="green">Driver sent</Pill>
                    : <button className={btn.light} onClick={() => send([key(t)])}><Truck size={13} /> Send a driver</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <DemoNote>Demo: Belmont Shore shows this demo shop's live numbers. Signal Hill and Lakewood are example shops scaled from it, and the other owner screens show Belmont Shore only. Sending a driver is shown here, not sent.</DemoNote>
    </div>
  );
}

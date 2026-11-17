/**
 * Which suggested deals the owner has turned on, kept in this browser. A deal a customer can hear is always one the
 * owner approved: the suggestions are worked out fresh from stock and sales, and only approved ones are offered.
 * When the shop has a real phone line connected, the approved deals are sent to it so callers get them too.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dowOf } from '../lib/dates';
import { suggestDeals, type Deal } from './deals';
import type { StockLine } from './logic';
import { usePizza } from './store';

const KEY = 'kneados-pizza-deals-on';
const CHANGED = 'kneados-pizza-deals-changed';

function savedIds(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

/** Tells the phone line which deals are on. Quietly does nothing when the line cannot be reached. */
export async function sendDealsToLine(line: string, deals: Deal[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/phone-deals?line=${encodeURIComponent(line)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(deals) });
    return res.ok;
  } catch { return false; }
}

export function useDeals(stock: readonly StockLine[]) {
  const { state, history, phoneLine } = usePizza();
  const [ids, setIds] = useState(savedIds);
  useEffect(() => {
    const sync = () => setIds(savedIds());
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(CHANGED, sync); window.removeEventListener('storage', sync); };
  }, []);

  const suggested = useMemo(() => suggestDeals({ stock, history, dow: dowOf(state.today) }), [stock, history, state.today]);
  const approved = useMemo(() => suggested.filter((d) => ids.includes(d.id)), [suggested, ids]);
  const toggle = useCallback((id: string) => {
    const next = savedIds().includes(id) ? savedIds().filter((x) => x !== id) : [...savedIds(), id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: it still works for this visit */ }
    setIds(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  // The phone line hears about every change, including a deal whose numbers moved since it was approved.
  const wire = JSON.stringify(approved);
  useEffect(() => { if (phoneLine) void sendDealsToLine(phoneLine, JSON.parse(wire) as Deal[]); }, [phoneLine, wire]);

  return { suggested, approved, ids, toggle, onPhoneLine: !!phoneLine };
}

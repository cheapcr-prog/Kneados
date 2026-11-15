import { MERCH, MERCH_BY_ID, SOLD_28, seedStock } from '../data/merch';
import { useShopState } from '../data/local';
import { addReorder, merchReport, stockKey, takeFromStock, type MerchItem, type MerchLine, type Stock } from '../lib/merch';

interface Saved {
  stock: Stock;
  /** Units sold in this demo, by item. */
  sold: Record<string, number>;
  /** Reorders placed in this demo. */
  reorders: { id: string; qty: number; date: string }[];
}

/** The merch shelf: what is in stock, what has sold, and reorders. */
export function useMerch() {
  const [saved, setSaved] = useShopState<Saved>('merch', () => ({ stock: seedStock(), sold: {}, reorders: [] }));
  const sold28 = Object.fromEntries(MERCH.map((m) => [m.id, (SOLD_28[m.id] ?? 0) + (saved.sold[m.id] ?? 0)]));
  return {
    stock: saved.stock,
    rows: merchReport(MERCH, saved.stock, sold28),
    soldHere: saved.sold,
    reorders: saved.reorders,
    left: (id: string, size?: string) => saved.stock[stockKey(id, size)] ?? 0,
    sell: (lines: MerchLine[]) => setSaved((s) => {
      const sold = { ...s.sold };
      for (const l of lines) sold[l.id] = (sold[l.id] ?? 0) + l.qty;
      return { ...s, stock: takeFromStock(s.stock, lines), sold };
    }),
    reorder: (id: string, date: string) => setSaved((s) => ({ ...s, stock: addReorder(s.stock, MERCH_BY_ID[id]), reorders: [{ id, qty: MERCH_BY_ID[id].reorderQty, date }, ...s.reorders] })),
  };
}

export const merchLabel = (l: Pick<MerchLine, 'id' | 'size' | 'qty'>) => `${l.qty} ${MERCH_BY_ID[l.id]?.name ?? l.id}${l.size ? ` (${l.size})` : ''}`;

/** A simple drawing of each item. A live shop uploads its own product photos. */
export function MerchArt({ item, size = 64 }: { item: MerchItem; size?: number }) {
  const c = item.color;
  const pink = '#f43f7f';
  const ring = (cx: number, cy: number, r: number, stroke = pink) => <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={r * 0.7} />;
  const art: Record<string, React.ReactNode> = {
    tee: <><path d="M22 10l-14 8 6 10 6-3v29h24V25l6 3 6-10-14-8c-2 4-5 6-10 6s-8-2-10-6z" fill={c} stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />{ring(32, 34, 5)}</>,
    hat: <><path d="M12 38a20 20 0 0 1 40 0z" fill={c} /><path d="M10 38h36c8 0 12 3 14 7H10z" fill="#1e293b" />{ring(31, 28, 4)}</>,
    mug: <><rect x="14" y="16" width="28" height="34" rx="5" fill={c} /><path d="M42 24h5a7 7 0 0 1 0 14h-5" fill="none" stroke={c} strokeWidth="5" />{ring(28, 33, 5, '#fff')}</>,
    tote: <><path d="M22 24c0-14 20-14 20 0" fill="none" stroke="#b9782f" strokeWidth="3" /><rect x="12" y="22" width="40" height="34" rx="3" fill={c} stroke="#e7c98f" strokeWidth="2" />{ring(32, 39, 6)}</>,
    stickers: <><circle cx="24" cy="26" r="14" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />{ring(24, 26, 6)}<circle cx="42" cy="40" r="14" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />{ring(42, 40, 6, c)}</>,
    beans: <><path d="M18 14h28l3 42H15z" fill={c} /><rect x="18" y="10" width="28" height="7" rx="2" fill="#5a3a22" /><rect x="22" y="28" width="20" height="16" rx="3" fill="#fff6e5" />{ring(32, 36, 3.5)}</>,
    candles: <>{[18, 28, 38, 48].map((x, i) => <g key={x}><rect x={x - 3} y="24" width="6" height="30" rx="2" fill={[c, pink, '#2dd4bf', '#a78bfa'][i]} /><path d={`M${x} 10c4 5 3 10 0 11c-3-1-4-6 0-11z`} fill="#fb923c" /></g>)}</>,
    giftbox: <><rect x="10" y="24" width="44" height="30" rx="3" fill="#fff" stroke="#cbd5e1" strokeWidth="2" /><rect x="8" y="18" width="48" height="10" rx="3" fill="#fdf2f8" stroke="#cbd5e1" strokeWidth="2" /><rect x="29" y="18" width="6" height="36" fill={c} /><path d="M32 18c-10-12-18-2-6 0zM32 18c10-12 18-2 6 0z" fill={c} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">{art[item.id] ?? <rect x="12" y="12" width="40" height="40" rx="8" fill={c} />}</svg>;
}

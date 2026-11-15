import type { MenuItem } from '../data/types';

/** Draws a menu item from its colors, so the demo needs no stock photos. */
export function ItemArt({ item, size = 64 }: { item: MenuItem; size?: number }) {
  if (item.category === 'Drinks') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path d="M18 18h28l-4 36a4 4 0 0 1-4 3.5H26A4 4 0 0 1 22 54z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M20.5 26h23l-2.6 24a2 2 0 0 1-2 1.8H25.1a2 2 0 0 1-2-1.8z" fill={item.icing} />
        <rect x="15" y="13" width="34" height="6" rx="3" fill="#e2e8f0" />
      </svg>
    );
  }
  const bar = /Bar|Twist|Croissant/.test(item.name);
  if (bar) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect x="6" y="20" width="52" height="26" rx="13" fill={item.dough} />
        <rect x="9" y="19" width="46" height="17" rx="8.5" fill={item.icing} />
      </svg>
    );
  }
  const filled = item.category === 'Filled' || /Fritter|Roll|Holes/.test(item.name);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="33" r="25" fill={item.dough} />
      <circle cx="32" cy="31" r="22" fill={item.icing} />
      {!filled && <circle cx="32" cy="32" r="7.5" fill="#fff" />}
      {filled && item.category === 'Filled' && <circle cx="32" cy="31" r="4" fill="#be123c" opacity="0.85" />}
      {item.sprinkles &&
        [[20, 22, '#22d3ee'], [42, 20, '#facc15'], [46, 34, '#ffffff'], [24, 42, '#a3e635'], [38, 44, '#22d3ee'], [16, 33, '#facc15'], [32, 16, '#ffffff']].map(([x, y, c], i) => (
          <rect key={i} x={x as number} y={y as number} width="6" height="2.4" rx="1.2" fill={c as string} transform={`rotate(${i * 47} ${x} ${y})`} />
        ))}
    </svg>
  );
}

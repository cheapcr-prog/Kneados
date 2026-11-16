import { Link } from 'react-router-dom';

/** Switches the product page between the kinds of shop KneadOS runs. */
export function ModeSwitch({ active }: { active: 'bakery' | 'pizza' }) {
  const tab = (on: boolean) => `rounded-full px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${on ? 'bg-white text-ink-900' : 'text-slate-300 hover:text-white'}`;
  return (
    <nav aria-label="Kind of shop" className="flex rounded-full bg-white/10 p-1">
      <Link to="/" className={tab(active === 'bakery')}>Donuts &amp; bakery</Link>
      <Link to="/pizza" className={tab(active === 'pizza')}>Pizza</Link>
    </nav>
  );
}

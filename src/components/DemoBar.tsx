import { ChefHat, LayoutDashboard, RotateCcw, ShoppingBag, Tablet } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useDemo } from '../data/store';
import { SessionChip } from './Session';

const SCREENS = [
  { to: '/demo/shop', label: 'Shop website', icon: ShoppingBag },
  { to: '/demo/register', label: 'Register', icon: Tablet },
  { to: '/demo/kitchen', label: 'Kitchen', icon: ChefHat },
  { to: '/demo/owner', label: 'Owner', icon: LayoutDashboard },
];

/** The strip across the top of every demo screen. It is not part of what a shop would see. */
export function DemoBar() {
  const { reset } = useDemo();
  return (
    <div className="sticky top-0 z-40 bg-ink-900 text-white">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2">
        <Link to="/" className="mr-1 flex shrink-0 items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <Logo />
          <span className="hidden sm:inline">KneadOS</span>
          <span className="rounded bg-glaze-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-glaze-300">Demo</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {SCREENS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition sm:px-3 ${
                  isActive ? 'bg-white text-ink-900' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} />
                  {/* On a phone only the screen you are on keeps its name, so all four fit. */}
                  <span className={isActive ? '' : 'hidden sm:inline'}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <Link to="/pizza/demo/shop" className="hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white lg:block" title="Switch to the pizza shop demo">Pizza shop demo</Link>
        <SessionChip />
        <button
          onClick={() => { if (confirm('Reset the demo shop to a fresh shift?')) reset(); }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white"
          title="Reset demo data"
        >
          <RotateCcw size={13} />
          <span className="hidden md:inline">Reset</span>
        </button>
      </div>
    </div>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0b1220" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#2dd4bf" strokeWidth="11" />
    </svg>
  );
}

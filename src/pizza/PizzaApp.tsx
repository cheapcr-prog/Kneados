import { Bike, ChefHat, ChevronDown, Delete, LayoutDashboard, LogOut, RotateCcw, ShoppingBag, Tablet, UserRound } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Logo } from '../components/DemoBar';
import { useShopState } from '../data/local';
import { PIZZA_SHOP, PIZZA_STAFF, PIZZA_STAFF_BY_ID, type PizzaRole, type PizzaStaff } from './data';
import { PizzaProvider, usePizza } from './store';
import { PizzaShop } from './pages/Shop';
import { PizzaRegister } from './pages/Register';
import { MakeLine } from './pages/MakeLine';
import { Dispatch } from './pages/Dispatch';

const PizzaOwner = lazy(() => import('./pages/Owner').then((m) => ({ default: m.PizzaOwner })));

const SCREENS = [
  { to: '/pizza/demo/shop', label: 'Shop website', icon: ShoppingBag },
  { to: '/pizza/demo/register', label: 'Register', icon: Tablet },
  { to: '/pizza/demo/kitchen', label: 'Make line', icon: ChefHat },
  { to: '/pizza/demo/dispatch', label: 'Dispatch', icon: Bike },
  { to: '/pizza/demo/owner', label: 'Owner', icon: LayoutDashboard },
];

const HOME: Record<PizzaRole, { to: string; label: string }> = {
  owner: { to: '/pizza/demo/owner', label: 'Owner dashboard' },
  manager: { to: '/pizza/demo/owner', label: 'Owner dashboard' },
  cook: { to: '/pizza/demo/kitchen', label: 'Make line' },
  cashier: { to: '/pizza/demo/register', label: 'Register' },
  driver: { to: '/pizza/demo/dispatch', label: 'Dispatch' },
};

export function usePizzaSession() {
  const [id, setId] = useShopState<string | null>('pizza-session', () => null);
  return { staff: id ? PIZZA_STAFF_BY_ID[id] ?? null : null, signIn: (staffId: string) => setId(staffId), signOut: () => setId(null) };
}

/** Pizza mode of the demo: its own shop, screens and data, inside KneadOS. */
export function PizzaDemoRoutes() {
  return (
    <PizzaProvider>
      <div className="flex min-h-full flex-col">
        <PizzaBar />
        <div className="flex-1">
          <Routes>
            <Route path="shop" element={<PizzaShop />} />
            <Route path="register" element={<PizzaRegister />} />
            <Route path="kitchen" element={<MakeLine />} />
            <Route path="dispatch" element={<Dispatch />} />
            <Route path="login" element={<PizzaLogin />} />
            <Route path="owner/*" element={<Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading the dashboard…</p>}><PizzaOwner /></Suspense>} />
            <Route path="*" element={<PizzaShop />} />
          </Routes>
        </div>
      </div>
    </PizzaProvider>
  );
}

function PizzaBar() {
  const { reset } = usePizza();
  const { staff, signOut } = usePizzaSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-40 bg-ink-900 text-white">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2">
        <Link to="/pizza" className="mr-1 flex shrink-0 items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <Logo />
          <span className="hidden sm:inline">KneadOS</span>
          <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Pizza demo</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {SCREENS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-white text-ink-900' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
        <Link to="/demo/shop" className="hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white lg:block" title="Switch to the donut shop demo">Donut shop demo</Link>
        {staff ? (
          <div className="relative shrink-0">
            <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"><UserRound size={13} /> {staff.name.split(' ')[0]} <span className="hidden capitalize text-slate-400 sm:inline">{staff.role}</span> <ChevronDown size={12} /></button>
            {open && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl bg-white p-1.5 text-slate-800 shadow-xl ring-1 ring-slate-200">
                <Link to={HOME[staff.role].to} onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-slate-100">{HOME[staff.role].label}</Link>
                <button onClick={() => { signOut(); setOpen(false); }} className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"><LogOut size={14} /> Sign out</button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/pizza/demo/login" className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-400 px-2.5 py-1.5 text-xs font-bold text-ink-900 hover:bg-emerald-300"><UserRound size={13} /> Staff sign-in</Link>
        )}
        <button onClick={() => { if (confirm('Reset the pizza demo to a fresh rush?')) reset(); }} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white" title="Reset demo data">
          <RotateCcw size={13} /> <span className="hidden md:inline">Reset</span>
        </button>
      </div>
    </div>
  );
}

function PizzaLogin() {
  const { signIn } = usePizzaSession();
  const navigate = useNavigate();
  const [who, setWho] = useState<PizzaStaff | null>(null);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const press = (d: string) => {
    if (!who) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      if (next === who.pin) { signIn(who.id); navigate(HOME[who.role].to); }
      else { setWrong(true); setPin(''); }
    }
  };
  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-ink-900 p-4 text-white">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold">{PIZZA_SHOP.name}</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Tap your name, then your PIN. Cooks land on the make line, drivers on dispatch.</p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {PIZZA_STAFF.map((s) => (
            <button key={s.id} onClick={() => { setWho(s); setPin(''); }} className={`rounded-xl border px-2 py-3 text-sm font-semibold ${who?.id === s.id ? 'border-emerald-400 bg-emerald-400 text-ink-900' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
              {s.name}<span className="block text-[11px] font-normal capitalize opacity-70">{s.role}</span>
            </button>
          ))}
        </div>
        {who && (
          <div className="mt-6">
            <div className="flex justify-center gap-3">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-4 w-4 rounded-full border-2 ${pin.length > i ? 'border-emerald-400 bg-emerald-400' : wrong ? 'border-rose-400' : 'border-white/30'}`} />)}</div>
            <p className="mt-2 h-5 text-center text-xs text-slate-400">{wrong ? <span className="text-rose-300">Wrong PIN, try again</span> : <>Demo PIN for {who.name}: <span className="font-mono text-emerald-300">{who.pin}</span></>}</p>
            <div className="mx-auto mt-3 grid max-w-[260px] grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20">{d}</button>)}
              <span />
              <button onClick={() => press('0')} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20">0</button>
              <button aria-label="Delete" onClick={() => setPin(pin.slice(0, -1))} className="flex items-center justify-center rounded-xl bg-white/5 py-4 text-slate-300 hover:bg-white/10"><Delete size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

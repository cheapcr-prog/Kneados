import { ChevronDown, Delete, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShopState } from '../data/local';
import { SHOP, STAFF, STAFF_BY_ID } from '../data/shop';
import type { Role, StaffMember } from '../data/types';
import { addMiss, isLocked, minutesLocked, type Tries } from '../lib/secure';

interface Screen { to: string; label: string }
const KITCHEN: Screen = { to: '/demo/kitchen', label: 'Kitchen' };
const REGISTER: Screen = { to: '/demo/register', label: 'Register' };
const OWNER: Screen = { to: '/demo/owner', label: 'Owner dashboard' };

/** Where each job lands after signing in. */
export const HOME: Record<Role, Screen> = { baker: KITCHEN, cashier: REGISTER, manager: OWNER, owner: OWNER };

/** Every screen a job may open. Bakers can reach the register to clock in and take breaks. */
export const SCREENS: Record<Role, Screen[]> = {
  baker: [KITCHEN, REGISTER], cashier: [REGISTER], manager: [OWNER, REGISTER, KITCHEN], owner: [OWNER, REGISTER, KITCHEN],
};

/** Who is signed in on this device. */
export function useSession() {
  const [id, setId] = useShopState<string | null>('session', () => null);
  return { staff: id ? STAFF_BY_ID[id] ?? null : null, signIn: (staffId: string) => setId(staffId), signOut: () => setId(null) };
}

/** The one sign-in for the whole shop. The PIN decides which screen opens. */
export function StaffLogin() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const onLogin = (s: StaffMember) => { signIn(s.id); navigate(HOME[s.role].to); };
  const [who, setWho] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  // Wrong PINs on this device. Five in 15 minutes locks the keypad, so a 4 digit PIN cannot be guessed by trying them all.
  const [tries, setTries] = useShopState<Tries>('pin-tries', () => ({ misses: [] }));
  const locked = isLocked(tries);

  const press = (d: string) => {
    if (!who || locked) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      if (next === who.pin) onLogin(who);
      else { setWrong(true); setPin(''); setTries((t) => addMiss(t)); }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-ink-900 p-4 text-white">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-3xl font-bold">{SHOP.name}</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Tap your name, then enter your PIN. You land on the screen for your job.</p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {STAFF.map((s) => (
            <button
              key={s.id}
              onClick={() => { setWho(s); setPin(''); setWrong(false); }}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${who?.id === s.id ? 'border-glaze-400 bg-glaze-400 text-ink-900 [&>span]:text-ink-700' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              {s.name}
              <span className="block text-[11px] font-normal capitalize text-slate-400">{s.role}</span>
              <span className="block text-[10px] font-normal text-slate-500">opens {HOME[s.role].label}</span>
            </button>
          ))}
        </div>
        {who && (
          <div className="mt-6">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-4 w-4 rounded-full border-2 ${pin.length > i ? 'border-glaze-400 bg-glaze-400' : wrong ? 'border-rose-400' : 'border-white/30'}`} />
              ))}
            </div>
            <p className="mt-2 h-5 text-center text-xs text-slate-400">
              {locked ? <span className="text-rose-300">Too many wrong PINs. Try again in {minutesLocked(tries)} min.</span> : wrong ? <span className="text-rose-300">Wrong PIN, try again</span> : <>Demo PIN for {who.name}: <span className="font-mono text-glaze-300">{who.pin}</span></>}
            </p>
            <div className="mx-auto mt-3 grid max-w-[260px] grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} onClick={() => press(d)} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20 active:bg-white/30">{d}</button>
              ))}
              <span />
              <button onClick={() => press('0')} className="rounded-xl bg-white/10 py-4 text-xl font-semibold hover:bg-white/20 active:bg-white/30">0</button>
              <button aria-label="Delete" onClick={() => setPin(pin.slice(0, -1))} className="flex items-center justify-center rounded-xl bg-white/5 py-4 text-slate-300 hover:bg-white/10"><Delete size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows who is signed in and the screens their job can open. */
export function SessionChip() {
  const { staff, signOut } = useSession();
  const [open, setOpen] = useState(false);
  if (!staff) {
    return <Link to="/demo/login" className="flex shrink-0 items-center gap-1.5 rounded-lg bg-glaze-400 px-2.5 py-1.5 text-xs font-bold text-ink-900 hover:bg-glaze-300"><UserRound size={13} /> Staff sign-in</Link>;
  }
  const screens = SCREENS[staff.role];
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
        <UserRound size={13} /> {staff.name.split(' ')[0]} <span className="hidden capitalize text-slate-400 sm:inline">{staff.role}</span> <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl bg-white p-1.5 text-slate-800 shadow-xl ring-1 ring-slate-200">
          <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{screens.length > 1 ? 'Your screens' : 'Your screen'}</p>
          {screens.map((sc, i) => (
            <Link key={sc.to} to={sc.to} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-slate-100">
              {sc.label}{i === 0 && <span className="text-[11px] font-medium text-slate-400">home</span>}
            </Link>
          ))}
          <button onClick={() => { signOut(); setOpen(false); }} className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-slate-100 px-2.5 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"><LogOut size={14} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

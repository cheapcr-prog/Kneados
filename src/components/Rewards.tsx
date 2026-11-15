import jsQR from 'jsqr';
import { Camera, Delete, Gift, Keyboard, RefreshCw, ScanLine, Wallet, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { RewardsMember } from '../data/types';
import { formatPhone } from '../lib/money';
import { PUNCHES_PER_REWARD } from '../lib/rewards';
import { cardCode, cardPayload, pressKey, readScan } from '../lib/wallet';

/** The QR code on a member's card, drawn as crisp squares at any size. */
export function CardQr({ phone, size = 160 }: { phone: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(cardPayload(phone));
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { d, n: n + 4 };
  }, [phone]);
  return (
    <svg data-card-qr viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="Dough Rewards card code">
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#0f172a" />
    </svg>
  );
}

export function Punches({ count, light }: { count: number; light?: boolean }) {
  return (
    <div className="flex gap-1.5" aria-label={`${count} of ${PUNCHES_PER_REWARD} punches`}>
      {Array.from({ length: PUNCHES_PER_REWARD }, (_, i) => (
        <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < count ? (light ? 'border-white bg-white' : 'border-box-500 bg-box-500') : light ? 'border-white/40' : 'border-slate-200'}`} />
      ))}
    </div>
  );
}

/** The card as it looks on the customer's phone. */
export function RewardsCard({ member }: { member: RewardsMember }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-box-500 to-box-700 text-white shadow-xl">
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">{SHOP.name}</p>
          <p className="font-display text-2xl font-extrabold">Dough Rewards</p>
        </div>
        <Gift size={26} className="text-white/80" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Member</p>
          <p className="text-base font-bold">{member.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Free donuts</p>
          <p className="tabular text-base font-bold">{member.rewards}</p>
        </div>
      </div>
      <div className="mt-3 px-5">
        <Punches count={member.punches} light />
        <p className="mt-1.5 text-xs text-white/80">{member.punches} of {PUNCHES_PER_REWARD} punches. Visit {PUNCHES_PER_REWARD} is a free donut.</p>
      </div>
      <div className="mt-4 flex flex-col items-center bg-white px-5 py-4 text-slate-900">
        <CardQr phone={member.phone} size={168} />
        <p className="tabular mt-1.5 text-sm font-bold tracking-wider">{cardCode(member.phone)}</p>
        <p className="text-[11px] text-slate-500">Show this at the register</p>
      </div>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

function Keypad({ digits, onChange }: { digits: string; onChange: (d: string) => void }) {
  // A handheld scanner or a keyboard types straight in, with no field to tap first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) onChange(pressKey(digits, e.key));
      else if (e.key === 'Backspace') onChange(pressKey(digits, 'back'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [digits, onChange]);
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map((k) => (
        <button
          key={k}
          onClick={() => onChange(pressKey(digits, k))}
          aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear' : k}
          className={`flex h-16 items-center justify-center rounded-2xl text-2xl font-bold active:scale-95 sm:h-[72px] ${k === 'clear' || k === 'back' ? 'bg-slate-200 text-slate-700' : 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 hover:ring-glaze-500'}`}
        >
          {k === 'back' ? <Delete size={26} /> : k === 'clear' ? <span className="text-base">Clear</span> : k}
        </button>
      ))}
    </div>
  );
}

type CamState = 'starting' | 'on' | 'blocked';

/** Watches the camera for a Dough Rewards card and reports the member's phone. */
function Scanner({ onPhone }: { onPhone: (phone: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cam, setCam] = useState<CamState>('starting');
  const [wrong, setWrong] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const look = () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        const scale = Math.min(1, 720 / v.videoWidth);
        const w = Math.round(v.videoWidth * scale);
        const h = Math.round(v.videoHeight * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
          if (hit?.data) {
            const phone = readScan(hit.data);
            if (phone && !done.current) { done.current = true; onPhone(phone); return; }
            if (!phone) setWrong(true);
          }
        }
      }
      raf = requestAnimationFrame(look);
    };
    setCam('starting');
    if (!navigator.mediaDevices?.getUserMedia) { setCam('blocked'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }).then((s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined); }
      setCam('on');
      raf = requestAnimationFrame(look);
    }).catch(() => setCam('blocked'));
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing, onPhone]);

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {cam === 'on' && <div className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-2xl border-4 border-white/80" />}
        {cam !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/90">
            <Camera size={28} />
            {cam === 'starting' ? 'Turning on the camera…' : 'The camera is off or not allowed on this device. Use the keypad, or allow the camera in the browser settings.'}
          </div>
        )}
        {cam === 'on' && (
          <button onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
            <RefreshCw size={12} /> Flip camera
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-sm text-slate-600">
        {wrong ? 'That code is not a Dough Rewards card. Try the card in the customer\'s wallet.' : 'Hold the customer\'s Dough Rewards card up to the camera.'}
      </p>
    </div>
  );
}

/**
 * Full screen Dough Rewards entry for the cashier: big number buttons, or the camera
 * reading the card in the customer's phone wallet.
 */
export function RewardsEntry({ start, initial, onDone, onClose }: { start: 'keypad' | 'scan'; initial: string; onDone: (phone: string) => void; onClose: () => void }) {
  const demo = useDemo();
  const [mode, setMode] = useState(start);
  const [digits, setDigits] = useState(initial.replace(/\D/g, '').slice(0, 10));
  const member = digits.length === 10 ? demo.findMember(digits) : undefined;
  const samples = demo.state.members.slice(0, 3);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-slate-50 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Dough Rewards</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-200"><X size={20} /></button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-slate-200 p-1 text-sm font-bold">
          <button onClick={() => setMode('keypad')} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 ${mode === 'keypad' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}><Keyboard size={16} /> Phone number</button>
          <button onClick={() => setMode('scan')} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 ${mode === 'scan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}><ScanLine size={16} /> Scan card</button>
        </div>

        {mode === 'keypad' ? (
          <div className="mt-3">
            <div className="rounded-2xl bg-white px-4 py-3 text-center ring-1 ring-slate-200">
              <p data-keypad-number className={`tabular font-display text-3xl font-extrabold ${digits ? 'text-slate-900' : 'text-slate-300'}`}>{digits ? formatPhone(digits) : '(___) ___-____'}</p>
              <p className="mt-0.5 h-5 text-sm text-slate-600">
                {digits.length === 10
                  ? member ? <><span className="font-semibold text-slate-900">{member.name}</span> · {member.punches}/{PUNCHES_PER_REWARD} punches{member.rewards > 0 ? ` · ${member.rewards} free` : ''}</> : 'New member: this visit is punch 1'
                  : `${10 - digits.length} more digit${digits.length === 9 ? '' : 's'}`}
              </p>
            </div>
            <div className="mt-3"><Keypad digits={digits} onChange={setDigits} /></div>
            <button disabled={digits.length !== 10} onClick={() => onDone(digits)} className="mt-3 w-full rounded-2xl bg-glaze-600 py-4 text-lg font-bold text-white hover:bg-glaze-700 disabled:bg-slate-300">
              {member ? `Add ${member.name.split(' ')[0]} to this sale` : 'Add to this sale'}
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <Scanner onPhone={onDone} />
            <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Demo: no card handy?</p>
              <p className="mt-0.5 text-xs text-slate-600">Tap a sample member to scan their card, or open a card on a phone and hold it up.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {samples.map((m) => (
                  <button key={m.phone} onClick={() => onDone(readScan(cardPayload(m.phone)) ?? m.phone)} className="rounded-full bg-box-50 px-3 py-1.5 text-xs font-semibold text-box-700 hover:bg-box-100">{m.name}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Add to wallet" buttons. Real passes need the shop's Apple and Google accounts, so the demo shows what would happen. */
export function WalletButtons({ member }: { member: RewardsMember }) {
  const [added, setAdded] = useState<'apple' | 'google' | null>(null);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => setAdded('apple')} className="flex items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-semibold text-white"><Wallet size={16} /> Add to Apple Wallet</button>
        <button onClick={() => setAdded('google')} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white"><Wallet size={16} /> Add to Google Wallet</button>
      </div>
      {added && (
        <p data-wallet-note className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Demo: on a live shop this saves {member.name.split(' ')[0]}'s card to {added === 'apple' ? 'Apple Wallet' : 'Google Wallet'}, and the punches on it update after every visit. That step needs the shop's {added === 'apple' ? 'Apple developer' : 'Google Wallet'} account to sign the card, so nothing was saved to this phone. The code above is real, and the register can scan it right now.
        </p>
      )}
    </div>
  );
}

import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { CHEESES, SAUCES, SIZE_BY_ID, TOPPING_BY_ID, type PizzaConfig, type Topping } from './data';
import { rng } from './logic';

/** How big each size looks in the builder, so a large really looks bigger than a small. */
const DOUGH_SCALE: Record<string, number> = { S: 0.8, M: 0.9, L: 1 };
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The live pizza in the builder. Toppings land where they go: the whole pie, or only the left or right half.
 * Positions come from a fixed seed per topping, so a pie looks the same every time it is drawn.
 * With `animate`, each step plays onto the pie as it changes: the dough stretches to its size, the sauce
 * spreads, the cheese melts on and each topping drops into place. `baked` browns the crust and cheese.
 */
export function PizzaArt({ config, size = 320, className = '', animate = false, baked = false }: { config: PizzaConfig; size?: number; className?: string; animate?: boolean; baked?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `pz-${n}-${uid}`;
  const dough = useRef<SVGGElement>(null);
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  // The dough stretches out whenever the size or crust changes.
  useEffect(() => {
    if (!animate || reduced() || !dough.current?.animate) return;
    dough.current.animate(
      [{ transform: 'scale(0.55, 0.5) rotate(-25deg)' }, { transform: 'scale(1.06, 1.03) rotate(4deg)', offset: 0.7 }, { transform: 'none' }],
      { duration: first.current ? 650 : 520, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }, [animate, config.size, config.crust]);
  // On the first draw everything is built in order; after that only what changed plays.
  const intro = animate && first.current;
  const delay = (ms: number): CSSProperties | undefined => (intro ? { animationDelay: `${ms}ms` } : undefined);
  const sauce = SAUCES.find((s) => s.id === config.sauce)!;
  const cheese = CHEESES.find((c) => c.id === config.cheese)!;
  const pan = config.crust === 'pan';
  const thin = config.crust === 'thin';
  const R = 100;
  const crustW = pan ? 7 : thin ? 5 : 10;
  const inner = R - crustW;
  const scale = SIZE_BY_ID[config.size].toppingScale;
  const entries = Object.entries(config.toppings).filter(([tid]) => TOPPING_BY_ID[tid]);
  const grow = animate ? DOUGH_SCALE[config.size] ?? 1 : 1;
  return (
    <svg viewBox="-104 -104 208 208" width={size} height={size} className={className} role="img" aria-label="Your pizza">
      <defs>
        <radialGradient id={id('crust')} cx="50%" cy="45%" r="55%">
          <stop offset="80%" stopColor={pan ? '#b8742f' : '#e2a95c'} />
          <stop offset="100%" stopColor={pan ? '#7c4a1c' : '#b9782f'} />
        </radialGradient>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodOpacity="0.35" /></filter>
        <clipPath id={id('left')}><rect x="-104" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('right')}><rect x="0" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('inner')}><circle r={inner - 1} /></clipPath>
      </defs>
      <g style={{ transform: `scale(${grow})`, transition: 'transform 500ms cubic-bezier(.2,.8,.3,1.1)' }}>
      <g ref={dough}>
      {pan
        ? <rect x={-R} y={-R} width={2 * R} height={2 * R} rx="14" fill={`url(#${id('crust')})`} />
        : <circle r={R} fill={`url(#${id('crust')})`} />}
      {/* The oven browns the crust. */}
      {pan
        ? <rect x={-R} y={-R} width={2 * R} height={2 * R} rx="14" fill="#8a4a16" style={{ opacity: baked ? 0.32 : 0, transition: 'opacity 1.2s' }} />
        : <circle r={R} fill="#8a4a16" style={{ opacity: baked ? 0.32 : 0, transition: 'opacity 1.2s' }} />}
      {/* Char spots on the crust. */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.3;
        return <ellipse key={i} cx={Math.cos(a) * (R - crustW / 2)} cy={Math.sin(a) * (R - crustW / 2)} rx="2.4" ry="1.4" fill="#6b3b14" opacity="0.35" transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * (R - crustW / 2)} ${Math.sin(a) * (R - crustW / 2)})`} />;
      })}
      <g clipPath={`url(#${id('inner')})`}>
        {/* Bare dough shows until the sauce goes on. */}
        <circle r={inner} fill="#f1d7a6" />
        <g key={config.sauce} className={animate ? 'pz-spread' : undefined} style={delay(250)}>
          {pan ? <rect x={-inner} y={-inner} width={2 * inner} height={2 * inner} rx="8" fill={sauce.color} /> : <circle r={inner} fill={sauce.color} />}
        </g>
        <g key={config.cheese} className={animate ? 'pz-melt' : undefined} style={delay(550)}>
          {cheese.amount > 0 && <CheeseLayer r={inner} amount={cheese.amount} animate={animate} />}
          {cheese.id === 'vegan' && <CheeseLayer r={inner} amount={0.9} tone="#f6efcf" animate={animate} />}
        </g>
        {baked && cheese.amount > 0 && <BakedSpots r={inner} />}
        {entries.map(([tid, side], n) => (
          <g key={tid + side} clipPath={side === 'whole' ? undefined : `url(#${id(side)})`}>
            <ToppingLayer t={TOPPING_BY_ID[tid]} r={inner - 4} side={side} scale={scale} shadow={`url(#${id('shadow')})`} animate={animate} startMs={intro ? 850 + n * 180 : 0} />
          </g>
        ))}
      </g>
      </g>
      {entries.some(([, s]) => s !== 'whole') && <line x1="0" y1={-inner} x2="0" y2={inner} stroke="#fff" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />}
      </g>
    </svg>
  );
}

/** Golden-brown spots the oven leaves on the cheese. */
function BakedSpots({ r }: { r: number }) {
  const rand = rng(41);
  return (
    <g className="pz-melt">
      {Array.from({ length: 22 }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (r - 8);
        return <ellipse key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} rx={2 + rand() * 3.5} ry={1.5 + rand() * 2.5} fill="#c98a3a" opacity={0.35 + rand() * 0.25} />;
      })}
    </g>
  );
}

function CheeseLayer({ r, amount, tone = '#fbe7a1', animate = false }: { r: number; amount: number; tone?: string; animate?: boolean }) {
  const rand = rng(17);
  const blobs = Math.round(34 * amount);
  return (
    <g opacity={Math.min(1, 0.55 + amount * 0.35)}>
      <circle r={r - 3} fill={tone} opacity={amount >= 1 ? 0.92 : 0.7} />
      {Array.from({ length: blobs }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (r - 6);
        return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={3 + rand() * 6} fill={i % 3 ? '#fff2c2' : '#f2c66b'} opacity={0.65} className={animate ? 'pz-blob' : undefined} style={animate ? { animationDelay: `${i * 12}ms` } : undefined} />;
      })}
    </g>
  );
}

/** How far a piece reaches from its center, so spacing keeps pieces off the crust, the half line and each other. */
const REACH: Record<Topping['shape'], number> = { disc: 8, cup: 6.5, crumble: 4.5, strip: 9, square: 6, cube: 5, slice: 6, ring: 5, leaf: 6.5, chunk: 5.5, dollop: 6.5, dot: 3 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Lays pieces out evenly on a sunflower spiral, the way a cook spreads them: no clumps, nothing over the crust.
 * A half uses the same spacing as the whole pie and keeps only the pieces on its side, clear of the middle line.
 * Each topping turns the spiral by its own angle so different toppings sit between each other.
 */
function ToppingLayer({ t, r, side, scale, shadow, animate, startMs }: { t: Topping; r: number; side: string; scale: number; shadow: string; animate: boolean; startMs: number }) {
  const rand = rng([...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0);
  const reach = REACH[t.shape] * (t.id === 'meatball' ? 1.1 : 1);
  const count = Math.round(t.pieces * Math.max(0.85, Math.min(1.3, scale)));
  const usable = r - reach - 1;
  const turn = rand() * Math.PI * 2;
  const pts: { x: number; y: number; rot: number; k: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = usable * Math.sqrt((i + 0.5) / count);
    const a = turn + i * GOLDEN;
    // A little wobble so it looks hand-placed, never enough to touch a neighbor.
    const x = Math.cos(a) * d + (rand() - 0.5) * 2;
    const y = Math.sin(a) * d + (rand() - 0.5) * 2;
    if (side === 'left' && x > -(reach + 1.5)) continue;
    if (side === 'right' && x < reach + 1.5) continue;
    if (Math.hypot(x, y) > usable) continue;
    pts.push({ x, y, rot: rand() * 360, k: 0.92 + rand() * 0.14 });
  }
  return (
    <g filter={shadow}>
      {pts.map((p, i) => (
        // Each piece falls in on its own, a beat after the one before, like it is being scattered by hand.
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <g className={animate ? 'pz-piece' : undefined} style={animate ? { animationDelay: `${startMs + i * 28}ms` } : undefined}>
            <Piece t={t} x={0} y={0} rot={p.rot} k={p.k} />
          </g>
        </g>
      ))}
    </g>
  );
}

/** One piece of a topping on its own, for the topping list and the piece under your finger while dragging. */
export function ToppingSwatch({ t, size = 28 }: { t: Topping; size?: number }) {
  return (
    <svg viewBox="-10 -10 20 20" width={size} height={size} aria-hidden className="shrink-0">
      <Piece t={t} x={0} y={0} rot={-20} k={1} />
    </svg>
  );
}

function Piece({ t, x, y, rot, k }: { t: Topping; x: number; y: number; rot: number; k: number }) {
  const tr = `translate(${x} ${y}) rotate(${rot}) scale(${k})`;
  switch (t.shape) {
    case 'disc':
      return <g transform={tr}><circle r="8" fill={t.color} /><circle r="8" fill="none" stroke={t.accent} strokeWidth="1.2" opacity="0.6" />{t.id === 'pepperoni' && <><circle cx="-2.5" cy="-2" r="1" fill={t.accent} /><circle cx="3" cy="2" r="0.9" fill={t.accent} /></>}{t.id === 'tomato' && <circle r="4.5" fill={t.accent} opacity="0.55" />}</g>;
    case 'cup':
      return <g transform={tr}><circle r="6" fill={t.color} /><circle r="4" fill={t.accent} opacity="0.75" /><circle r="6" fill="none" stroke="#3a0d06" strokeWidth="1.2" /></g>;
    case 'crumble':
      return <g transform={tr}><path d="M-3.5 -1 Q-2 -4 1 -3 Q4 -2 3 1 Q2.5 4 -1 3.2 Q-4 2 -3.5 -1Z" fill={t.color} /><circle cx="0.5" cy="-0.5" r="1" fill={t.accent} opacity="0.7" /></g>;
    case 'strip':
      return t.kind === 'meat'
        ? <g transform={tr}><path d="M-9 -2 Q-4 -4 0 -2 T9 -2 L9 2 Q4 4 0 2 T-9 2Z" fill={t.color} /><path d="M-9 0 Q-4 -1.5 0 0 T9 0" stroke={t.accent} strokeWidth="1" fill="none" /></g>
        : <g transform={tr}><path d="M-8 0 Q0 -5 8 0" stroke={t.color} strokeWidth="2.6" fill="none" strokeLinecap="round" /></g>;
    case 'square':
      return <g transform={tr}><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={t.color} /><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill="none" stroke={t.accent} strokeWidth="0.8" /></g>;
    case 'cube':
      return <g transform={tr}><rect x="-4" y="-3.5" width="8" height="7" rx="1.6" fill={t.color} /><path d="M-3 -1 H3 M-3 1.5 H3" stroke={t.accent} strokeWidth="0.9" /></g>;
    case 'slice':
      return <g transform={tr}><path d="M-5.5 1 A5.5 5.5 0 0 1 5.5 1 L2 1 L2 4.5 L-2 4.5 L-2 1Z" fill={t.color} stroke={t.accent} strokeWidth="0.7" /></g>;
    case 'ring':
      return <g transform={tr}><circle r={t.id === 'olive' ? 3.6 : 5} fill="none" stroke={t.color} strokeWidth={t.id === 'olive' ? 2.2 : 1.8} />{t.id === 'jalapeno' && <circle r="1.6" fill="#d9e8b0" />}</g>;
    case 'leaf':
      return <g transform={tr}><path d="M-6 0 Q0 -6 6 0 Q0 6 -6 0Z" fill={t.color} /><path d="M-5 0 H5" stroke="#bfe0a8" strokeWidth="0.5" opacity="0.6" /></g>;
    case 'chunk':
      return <g transform={tr}><path d="M-4 -3 L4 -4 L5 3 L-3 4Z" fill={t.color} stroke={t.accent} strokeWidth="0.8" /></g>;
    case 'dollop':
      return <g transform={tr}><path d="M-6 0 Q-6 -6 0 -6 Q6 -6 6 0 Q6 5 0 6 Q-6 5 -6 0Z" fill={t.color} stroke={t.accent} strokeWidth="0.9" /></g>;
    case 'dot':
      return <g transform={tr}><ellipse rx="2.6" ry="2" fill={t.color} stroke={t.accent} strokeWidth="0.6" /></g>;
  }
}

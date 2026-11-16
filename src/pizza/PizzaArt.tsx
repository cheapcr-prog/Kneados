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
  // Round pies are built from a real photo; the square pan pie is still drawn.
  const photo = !pan;
  const crustW = pan ? 8 : thin ? 10 : 16;
  // The photo's pizza fills 95% of its frame; thin crust zooms in so less rim shows.
  const half = (R / 0.951) * (thin ? 1.07 : 1);
  const base = (sauceId: string, cheeseId: string) => <image href={`/pizza/real/base/${sauceId}-${cheeseId}.webp`} x={-half} y={-half} width={2 * half} height={2 * half} preserveAspectRatio="none" />;
  const inner = R - crustW;
  const scale = SIZE_BY_ID[config.size].toppingScale;
  const entries = Object.entries(config.toppings).filter(([tid]) => TOPPING_BY_ID[tid]);
  const grow = animate ? DOUGH_SCALE[config.size] ?? 1 : 1;
  const hasPep = entries.some(([tid]) => tid === 'pepperoni' || tid === 'cupchar');
  const url = (n: string) => `url(#${id(n)})`;
  // Pan pizzas are square; everything else is round. One helper draws either at a given size.
  const shape = (r: number, props: Record<string, unknown>) => (pan ? <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r * 0.12} {...props} /> : <circle r={r} {...props} />);
  return (
    <svg viewBox="-104 -104 208 208" width={size} height={size} className={className} role="img" aria-label="Your pizza">
      <defs>
        {/* Golden at the puffy middle of the rim, browner at the outside and where it meets the sauce. */}
        <radialGradient id={id('crust')} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={R}>
          <stop offset={(inner - 2) / R} stopColor={pan ? '#a8652a' : '#c98a45'} />
          <stop offset={(inner + crustW * 0.45) / R} stopColor={pan ? '#d79a52' : '#eab872'} />
          <stop offset="0.97" stopColor={pan ? '#8e4a18' : '#b8732f'} />
          <stop offset="1" stopColor={pan ? '#6a3410' : '#8f5420'} />
        </radialGradient>
        <radialGradient id={id('sauce')} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={inner}>
          <stop offset="0.6" stopColor={sauce.color} />
          <stop offset="1" stopColor={shade(sauce.color, -0.22)} />
        </radialGradient>
        {/* Bread: a bumpy surface lit from the top left, so the rim looks baked rather than flat. */}
        <filter id={id('bread')} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="4" seed="3" result="n" />
          <feDiffuseLighting in="n" lightingColor="#fff" surfaceScale="2.4" result="l"><feDistantLight azimuth="225" elevation="52" /></feDiffuseLighting>
          <feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.3" k2="0" k3="0" k4="0" result="m" />
          <feComposite in="m" in2="SourceAlpha" operator="in" />
        </filter>
        {/* Hand-made edges: nothing on a real pizza is a perfect circle. */}
        <filter id={id('wobble')} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="w" />
          <feDisplacementMap in="SourceGraphic" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Melted cheese: soft bumps with a greasy shine on top. */}
        <filter id={id('melt')} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" result="g" />
          <feDiffuseLighting in="n" lightingColor="#fff" surfaceScale="1" result="d"><feDistantLight azimuth="225" elevation="65" /></feDiffuseLighting>
          <feComposite in="d" in2="g" operator="arithmetic" k1="1.08" k2="0" k3="0" k4="0" result="lit" />
          <feSpecularLighting in="n" lightingColor="#fff6dc" surfaceScale="2.2" specularConstant="0.5" specularExponent="26" result="s"><feDistantLight azimuth="225" elevation="48" /></feSpecularLighting>
          <feComposite in="lit" in2="g" operator="in" result="lit2" />
          <feComposite in="s" in2="g" operator="in" result="s2" />
          <feComposite in="s2" in2="lit2" operator="arithmetic" k1="0" k2="0.45" k3="1" k4="0" />
        </filter>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="1" stdDeviation="0.8" floodColor="#3a1404" floodOpacity="0.45" /></filter>
        <clipPath id={id('left')}><rect x="-104" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('right')}><rect x="0" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('outer')}><circle r={R + 3} /></clipPath>
        <clipPath id={id('inner')}>{shape(inner + 0.5, {})}</clipPath>
      </defs>
      <g style={{ transform: `scale(${grow})`, transition: 'transform 500ms cubic-bezier(.2,.8,.3,1.1)' }}>
      <g ref={dough}>
      {photo ? (
        <g clipPath={url('outer')} style={{ filter: baked ? 'brightness(0.86) saturate(1.15)' : 'none', transition: 'filter 1.2s' }}>
          {/* Three real photos stacked: bare dough, then the sauce, then the cheese melting in. */}
          {base('none', 'none')}
          <g key={config.sauce} className={animate ? 'pz-melt' : undefined} style={delay(250)}>{config.sauce !== 'none' && base(config.sauce, 'none')}</g>
          <g key={config.sauce + config.cheese} className={animate ? 'pz-melt' : undefined} style={delay(550)}>{config.cheese !== 'none' && base(config.sauce, config.cheese)}</g>
        </g>
      ) : (
        <>
        {/* Crust, with the bread texture baked in. */}
        <g filter={url('wobble')}>
          <g filter={url('bread')}>{shape(R, { fill: url('crust') })}</g>
        </g>
        <Rim R={R} w={crustW} pan={pan} soft={url('soft')} />
        {/* The oven browns the crust. */}
        {shape(R, { fill: '#7a3a0e', style: { opacity: baked ? 0.28 : 0, transition: 'opacity 1.2s', mixBlendMode: 'multiply' } })}
        <g clipPath={url('inner')}>
          {/* Bare dough shows until the sauce goes on. */}
          <g filter={url('bread')}>{shape(inner + 1, { fill: '#efd2a0' })}</g>
          <g key={config.sauce} className={animate ? 'pz-spread' : undefined} style={delay(250)}>
            {config.sauce !== 'none' && <g filter={url('wobble')}>{shape(inner - 1.5, { fill: url('sauce') })}</g>}
          </g>
          <g key={config.cheese} className={animate ? 'pz-melt' : undefined} style={delay(550)}>
            {cheese.amount > 0 && <CheeseLayer r={inner} amount={cheese.amount} melt={url('melt')} pan={pan} animate={animate} />}
            {cheese.id === 'vegan' && <CheeseLayer r={inner} amount={0.85} tone="#f4ecd2" melt={url('melt')} pan={pan} animate={animate} />}
          </g>
          {(cheese.amount > 0 || cheese.id === 'vegan') && <BakedSpots r={inner} strong={baked} soft={url('soft')} />}
          </g>
        </>
      )}
      <g clipPath={url('inner')}>
        {/* Pepperoni sweats orange oil into the cheese around it. */}
        {hasPep && cheese.amount > 0 && !photo && <OilPools r={inner} soft={url('soft')} />}
        {entries.map(([tid, side], n) => (
          <g key={tid + side} clipPath={side === 'whole' ? undefined : url(side)}>
            <ToppingLayer t={TOPPING_BY_ID[tid]} r={inner - 4} side={side} scale={scale} shadow={url('shadow')} animate={animate} startMs={intro ? 850 + n * 180 : 0} />
          </g>
        ))}
      </g>
      </g>
      {entries.some(([, s]) => s !== 'whole') && <line x1="0" y1={-inner} x2="0" y2={inner} stroke="#fff" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />}
      </g>
    </svg>
  );
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex color. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

/** The rim up close: puffed-up bubbles with charred tops (leoparding), and a dusting of flour. */
function Rim({ R, w, pan, soft }: { R: number; w: number; pan: boolean; soft: string }) {
  const rand = rng(23);
  const mid = R - w * 0.5;
  const at = (a: number, d: number) => (pan ? squarePoint(a, d) : [Math.cos(a) * d, Math.sin(a) * d]);
  const bubbles = Array.from({ length: pan ? 26 : 34 }, () => {
    const a = rand() * Math.PI * 2;
    const [x, y] = at(a, mid + (rand() - 0.5) * w * 0.5);
    return { x, y, r: w * (0.16 + rand() * 0.22), rot: (a * 180) / Math.PI, char: rand() < 0.55 };
  });
  const flecks = Array.from({ length: 70 }, () => {
    const a = rand() * Math.PI * 2;
    const [x, y] = at(a, mid + (rand() - 0.5) * w * 0.8);
    return { x, y, r: 0.25 + rand() * 0.45, flour: rand() < 0.6 };
  });
  return (
    <g>
      {bubbles.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
          <ellipse rx={b.r * 1.4} ry={b.r} fill="#f2c88a" opacity="0.55" />
          {b.char && <ellipse rx={b.r * 0.8} ry={b.r * 0.55} fill="#3a1a08" opacity="0.55" filter={soft} />}
          <ellipse cx={-b.r * 0.4} cy={-b.r * 0.35} rx={b.r * 0.5} ry={b.r * 0.25} fill="#fff4dc" opacity="0.45" />
        </g>
      ))}
      {flecks.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.flour ? '#fbf3e2' : '#4a2410'} opacity={f.flour ? 0.55 : 0.4} />)}
    </g>
  );
}

/** A point on a square's border, for the pan pizza's rim. */
function squarePoint(a: number, d: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  const m = Math.max(Math.abs(c), Math.abs(s));
  return [(c / m) * d * 0.97, (s / m) * d * 0.97];
}

/** Golden-brown spots and blisters the oven leaves on the cheese. Stronger once it has baked. */
function BakedSpots({ r, strong, soft }: { r: number; strong: boolean; soft: string }) {
  const rand = rng(41);
  return (
    <g style={{ opacity: strong ? 1 : 0.8, transition: 'opacity 1.2s' }}>
      {Array.from({ length: 46 }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (r - 9);
        const big = rand() < 0.3;
        return <ellipse key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} rx={big ? 3 + rand() * 3 : 1.2 + rand() * 1.8} ry={big ? 2.2 + rand() * 2 : 1 + rand() * 1.4} fill={big ? '#c27a2e' : '#a35a1c'} opacity={big ? 0.42 : 0.55} filter={soft} />;
      })}
    </g>
  );
}

/** Orange oil from the pepperoni, pooled here and there on the cheese. */
function OilPools({ r, soft }: { r: number; soft: string }) {
  const rand = rng(57);
  return (
    <g>
      {Array.from({ length: 16 }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (r - 10);
        return <ellipse key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} rx={2 + rand() * 3} ry={1.5 + rand() * 2} fill="#e07a1f" opacity="0.38" filter={soft} />;
      })}
    </g>
  );
}

/**
 * Melted cheese: one sheet with a lumpy edge where the sauce peeks out, lit so it looks soft and greasy.
 * Light cheese is patchy, extra cheese covers right up to the crust.
 */
function CheeseLayer({ r, amount, tone = '#f6d88c', melt, pan = false, animate = false }: { r: number; amount: number; tone?: string; melt: string; pan?: boolean; animate?: boolean }) {
  const rand = rng(17);
  const full = amount >= 1;
  const reach = full ? r - (amount > 1 ? 2.5 : 6) : r - 10;
  const blobs = Math.round((full ? 26 : 70) * amount);
  return (
    <g filter={melt}>
      {full && (pan ? <rect x={-reach} y={-reach} width={2 * reach} height={2 * reach} rx={reach * 0.1} fill={tone} /> : <circle r={reach} fill={tone} />)}
      {Array.from({ length: blobs }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = full ? (pan ? reach * 1.08 : reach - 2) + rand() * 3 : Math.sqrt(rand()) * reach;
        const br = full ? 3 + rand() * 4 : 6 + rand() * 6;
        return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={br} fill={i % 3 === 0 ? shade(tone, -0.08) : tone} className={animate ? 'pz-blob' : undefined} style={animate ? { animationDelay: `${i * 12}ms` } : undefined} />;
      })}
      {/* Pale melted pools on top. */}
      {Array.from({ length: Math.round(14 * amount) }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (reach - 8);
        return <circle key={`p${i}`} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={3 + rand() * 5} fill={i % 2 ? '#fff0c2' : '#eab85c'} opacity={i % 2 ? 0.5 : 0.35} />;
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
    pts.push({ x, y, rot: rand() * 360, k: 0.86 + rand() * 0.24 });
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

// Half-width of each topping's photo, in pie units (the pie is 200 across).
const PHOTO_SIZE: Record<string, number> = {
  pepperoni: 9, cupchar: 6.5, sausage: 6, bacon: 7.5, ham: 6, chicken: 6.5, meatball: 7.5, mushroom: 7.5, onion: 8, greenpepper: 7.5,
  olive: 4.5, jalapeno: 5.5, banana: 5.5, pineapple: 6, tomato: 8, spinach: 8, basil: 7.5, garlic: 4, freshmozz: 8.5, ricotta: 7,
};

function Piece({ t, x, y, rot, k }: { t: Topping; x: number; y: number; rot: number; k: number }) {
  const w = PHOTO_SIZE[t.id] ?? REACH[t.shape];
  const n = Math.abs(Math.round(rot * 7) + 1) % 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${k}) rotate(${rot})`}>
      <image href={`/pizza/real/top/${t.id}-${n}.webp`} x={-w} y={-w} width={2 * w} height={2 * w} />
    </g>
  );
}

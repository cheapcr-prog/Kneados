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

/** Small bits on a piece (fat in pepperoni, seeds, herbs), placed the same way every time for that piece. */
function specks(seed: number, n: number, spread: number) {
  const rand = rng(seed);
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * spread;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.35 + rand() * 0.5 };
  });
}

/**
 * One piece of a topping, drawn to look like the real thing: shading, a rim, the bits inside it,
 * and a shine that always comes from the top left however the piece is turned.
 */
function Piece({ t, x, y, rot, k }: { t: Topping; x: number; y: number; rot: number; k: number }) {
  const seed = Math.round(rot * 7) + 1;
  const shine = (cx: number, cy: number, rx: number, ry: number, o = 0.35) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={o} transform={`rotate(-35 ${cx} ${cy})`} />;
  const pic = (name: string, n: number, w: number) => <image href={`/pizza/real/top/${name}-${Math.abs(seed) % n}.webp`} x={-w} y={-w} width={2 * w} height={2 * w} />;
  const real = t.id === 'pepperoni' || t.id === 'cupchar' || t.id === 'tomato' || t.id === 'freshmozz' || t.id === 'ricotta';
  const body = (() => {
    // Real photo cutouts where we have them.
    if (t.id === 'pepperoni') return pic('pep', 4, 8.2);
    if (t.id === 'cupchar') return <g><circle r="6.6" fill="#2a0a04" />{pic('pep', 4, 6)}<circle r="5.9" fill="none" stroke="#2a0a04" strokeWidth="1.2" opacity="0.6" /></g>;
    if (t.id === 'tomato') return pic('tom', 8, 7.8);
    if (t.id === 'freshmozz' || t.id === 'ricotta') return pic('mozz', 10, t.id === 'ricotta' ? 6.5 : 8);
    switch (t.shape) {
      case 'disc':
        if (t.id === 'tomato') {
          return (
            <g>
              <circle r="7.6" fill="#d63a24" />
              <circle r="7.6" fill="none" stroke="#a8220f" strokeWidth="1.1" />
              {[0, 1, 2, 3].map((i) => <ellipse key={i} cx={Math.cos(i * 1.57 + 0.4) * 3.6} cy={Math.sin(i * 1.57 + 0.4) * 3.6} rx="2.2" ry="1.4" fill="#f08a6c" transform={`rotate(${i * 90 + 23} ${Math.cos(i * 1.57 + 0.4) * 3.6} ${Math.sin(i * 1.57 + 0.4) * 3.6})`} />)}
              {[0, 1, 2, 3].map((i) => <circle key={`s${i}`} cx={Math.cos(i * 1.57 + 0.4) * 3.6} cy={Math.sin(i * 1.57 + 0.4) * 3.6} r="0.55" fill="#f7e2a6" />)}
              <circle r="1.6" fill="#e4553b" />
            </g>
          );
        }
        if (t.id === 'meatball') {
          return (
            <g>
              <circle r="7.4" fill="#5e321c" />
              <circle cx="-0.8" cy="-0.8" r="5.6" fill="#7a4428" />
              {specks(seed, 9, 5.5).map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 3 ? '#3d1f10' : '#3f6b2a'} />)}
              <circle r="7.4" fill="none" stroke="#3d1f10" strokeWidth="0.8" opacity="0.7" />
            </g>
          );
        }
        // Pepperoni: darker, slightly cupped edge, flecks of fat, charred spots on the rim.
        return (
          <g>
            <circle r="8" fill="#a8261a" />
            <circle cx="-0.4" cy="-0.4" r="6.2" fill="#c4392a" />
            {specks(seed, 10, 6).map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f0b39c" opacity="0.75" />)}
            <circle r="7.4" fill="none" stroke="#7a160c" strokeWidth="1.3" opacity="0.75" />
            <path d="M5.2 -5.6 A7.6 7.6 0 0 1 7.6 0.4" stroke="#3a0a04" strokeWidth="1.1" fill="none" opacity="0.55" strokeLinecap="round" />
          </g>
        );
      case 'cup':
        // Cup and char: curls up into a little cup with a crispy black edge and oil pooled inside.
        return (
          <g>
            <circle r="6.4" fill="#4a0e06" />
            <circle r="5.4" fill="#9e2414" />
            <circle cx="0.4" cy="0.5" r="3.8" fill="#c4442a" />
            <ellipse cx="0.6" cy="0.8" rx="2.4" ry="1.9" fill="#e8892b" opacity="0.7" />
          </g>
        );
      case 'crumble':
        return (
          <g>
            <path d="M-3.8 -1.2 Q-3 -4.2 0.2 -3.6 Q3.2 -4 3.8 -0.8 Q4.4 2.2 1.6 3.4 Q-1 4.4 -3 2.6 Q-4.6 1 -3.8 -1.2Z" fill="#6d3a20" />
            <path d="M-2.6 -1 Q-1.8 -3 0.4 -2.6 Q2.4 -2.6 2.6 -0.4 Q2.6 1.8 0.6 2.2 Q-1.6 2.6 -2.6 1Z" fill="#8a4e2c" />
            {specks(seed, 4, 2.4).map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.8} fill={i % 2 ? '#c9a46a' : '#3d1f10'} />)}
          </g>
        );
      case 'strip':
        if (t.kind === 'meat') {
          // Bacon: wavy, with stripes of crisp fat.
          return (
            <g>
              <path d="M-9 -2.4 Q-4.5 -4.6 0 -2.4 T9 -2.4 L9 2.4 Q4.5 4.6 0 2.4 T-9 2.4Z" fill="#8c2f1f" />
              <path d="M-9 -0.6 Q-4.5 -2.4 0 -0.6 T9 -0.6" stroke="#f1c2a4" strokeWidth="1.3" fill="none" opacity="0.85" />
              <path d="M-9 1.6 Q-4.5 -0.2 0 1.6 T9 1.6" stroke="#5e1a0e" strokeWidth="0.8" fill="none" opacity="0.7" />
            </g>
          );
        }
        // Green pepper: a curved strip with a pale inner wall.
        return (
          <g>
            <path d="M-8 1 Q0 -5.5 8 1" stroke="#1f6b2b" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <path d="M-7.2 1.4 Q0 -4.4 7.2 1.4" stroke="#7fbf6a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          </g>
        );
      case 'square':
        // Ham: pink slice with a pale, fatty edge.
        return (
          <g>
            <path d="M-5 -4.6 Q0 -5.4 5 -4.6 Q5.6 0 5 4.6 Q0 5.4 -5 4.6 Q-5.6 0 -5 -4.6Z" fill="#ea9187" />
            <path d="M-3.8 -3.4 Q0 -4 3.8 -3.4 Q4.2 0 3.8 3.4 Q0 4 -3.8 3.4 Q-4.2 0 -3.8 -3.4Z" fill="#f2a59b" />
            <path d="M-5 4.6 Q0 5.4 5 4.6" stroke="#fbe1da" strokeWidth="1.2" fill="none" />
          </g>
        );
      case 'cube':
        // Grilled chicken: pale meat with dark grill marks.
        return (
          <g>
            <path d="M-4.2 -3.2 Q0 -4.2 4.2 -3.4 Q4.8 0 4 3.4 Q0 4.2 -4 3.4 Q-4.8 0 -4.2 -3.2Z" fill="#e3c792" />
            <path d="M-3 -2.6 L1 -3.4 M-3.4 0.4 L3.4 -1 M-2 3 L3.6 1.8" stroke="#6b4320" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
          </g>
        );
      case 'slice':
        // Mushroom: cap and stem with gills.
        return (
          <g>
            <path d="M-5.8 1.2 Q-6 -5.4 0 -5.6 Q6 -5.4 5.8 1.2 Q3 2 2 1.4 L2.2 4.8 Q0 5.6 -2.2 4.8 L-2 1.4 Q-3 2 -5.8 1.2Z" fill="#cdb48e" />
            <path d="M-4.6 0.4 Q-4.6 -4.2 0 -4.4 Q4.6 -4.2 4.6 0.4" fill="none" stroke="#8a6a45" strokeWidth="0.6" />
            <path d="M-3 -0.4 L-2 -3 M-1 -0.2 L-0.6 -3.6 M1 -0.2 L0.8 -3.6 M3 -0.4 L2.2 -3" stroke="#a78a64" strokeWidth="0.45" />
            <path d="M-5.8 1.2 Q-6 -5.4 0 -5.6 Q6 -5.4 5.8 1.2" fill="none" stroke="#7d5f3d" strokeWidth="0.8" />
          </g>
        );
      case 'ring':
        if (t.id === 'olive') {
          return <g><circle r="3.6" fill="none" stroke="#1b1b1b" strokeWidth="2.4" /><circle r="3.6" fill="none" stroke="#3b3b3b" strokeWidth="0.6" strokeDasharray="4 3" /></g>;
        }
        if (t.id === 'onion') {
          return <g><circle r="5.2" fill="none" stroke="#8e3f88" strokeWidth="1.6" opacity="0.9" /><circle r="4.3" fill="none" stroke="#f1e2ef" strokeWidth="0.6" opacity="0.8" /><circle r="3.2" fill="none" stroke="#a65aa0" strokeWidth="1" opacity="0.7" /></g>;
        }
        // Jalapeño and banana pepper rings: a skin, a paler wall and seeds in the middle.
        return (
          <g>
            <circle r="5" fill={t.id === 'jalapeno' ? '#d9e8b0' : '#f3eaa6'} opacity="0.9" />
            <circle r="5" fill="none" stroke={t.color} strokeWidth="1.8" />
            {specks(seed, 5, 2).map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={0.55} fill="#f7f1d2" stroke="#c9bf8a" strokeWidth="0.2" />)}
          </g>
        );
      case 'leaf':
        if (t.id === 'basil') {
          return <g><path d="M-6.4 0 Q-1 -6.2 6.4 0 Q-1 6.2 -6.4 0Z" fill="#2f7a2a" /><path d="M-5.6 0 Q-1 -4.6 5.4 0" fill="#3f9436" opacity="0.6" /><path d="M-5.4 0 H5.4 M-2 0 L0 -2.6 M1 0 L3 -2 M-2 0 L0 2.6 M1 0 L3 2" stroke="#9fd18c" strokeWidth="0.4" opacity="0.7" /></g>;
        }
        // Spinach: dark, wilted from the oven.
        return <g><path d="M-6 0.4 Q-3 -5.6 2 -4.6 Q6.6 -2 6 0.6 Q2.4 5 -1.6 4.4 Q-5.4 3.4 -6 0.4Z" fill="#1f5222" /><path d="M-5 0.6 Q0 -1 5.4 0.4" stroke="#5a8f4a" strokeWidth="0.5" fill="none" /></g>;
      case 'chunk':
        // Pineapple: juicy wedge with fibers.
        return (
          <g>
            <path d="M-4.4 -3.2 L4.2 -4.2 L5.2 3.2 L-3.4 4.2Z" fill="#f2c94c" />
            <path d="M-4.4 -3.2 L4.2 -4.2" stroke="#d49a12" strokeWidth="1.2" />
            <path d="M-2.4 -2.6 L-1.4 3.6 M0 -3 L1 3.8 M2.2 -3.4 L3.2 3.4" stroke="#e6b42a" strokeWidth="0.5" opacity="0.8" />
          </g>
        );
      case 'dollop':
        // Fresh mozzarella and ricotta: soft white puddles, browned a little on top.
        return (
          <g>
            <path d="M-6.2 0.4 Q-6.6 -5.6 -0.6 -6.2 Q5.8 -6.4 6.2 -0.6 Q6.4 5.4 0.4 6.2 Q-6 5.8 -6.2 0.4Z" fill={t.color} />
            <path d="M-6.2 0.4 Q-6.6 -5.6 -0.6 -6.2 Q5.8 -6.4 6.2 -0.6 Q6.4 5.4 0.4 6.2 Q-6 5.8 -6.2 0.4Z" fill="none" stroke={t.accent ?? '#e9e1c9'} strokeWidth="1" />
            <ellipse cx="1.6" cy="1.4" rx="2" ry="1.4" fill="#d8a45c" opacity={t.id === 'freshmozz' ? 0.35 : 0.15} />
          </g>
        );
      case 'dot':
        // Roasted garlic clove.
        return <g><path d="M-2.8 1.4 Q-3 -2.2 0 -2.4 Q3 -2.2 2.8 1.4 Q0 2.6 -2.8 1.4Z" fill="#e9c98a" /><path d="M-2.2 1.2 Q0 -1 2.2 1.2" stroke="#b07f3c" strokeWidth="0.5" fill="none" /></g>;
    }
  })();
  const r = REACH[t.shape];
  const shiny = !real && (t.shape === 'disc' || t.shape === 'cup' || t.shape === 'dollop' || t.id === 'olive');
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <g transform={`rotate(${rot})`}>{body}</g>
      {shiny && shine(-r * 0.32, -r * 0.36, r * 0.32, r * 0.15, t.shape === 'dollop' ? 0.5 : 0.32)}
    </g>
  );
}

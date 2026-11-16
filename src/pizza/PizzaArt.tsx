import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { SIZE_BY_ID, TOPPING_BY_ID, type PizzaConfig, type Topping } from './data';
import { rng } from './logic';

/** How big each size looks in the builder, so a large really looks bigger than a small. */
const DOUGH_SCALE: Record<string, number> = { S: 0.8, M: 0.9, L: 1 };
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The live pizza in the builder. Toppings land where they go: the whole pie, or only the left or right half.
 * Positions come from a fixed seed per topping, so a pie looks the same every time it is drawn.
 * With `animate`, each step plays onto the pie as it changes: the dough stretches to its size, the sauce
 * spreads, the cheese goes on and each topping drops into place. `raw` shows it unbaked, `baked` fades in the baked pie.
 */
export function PizzaArt({ config, size = 320, className = '', animate = false, baked = false, raw = false, stage = 9, cut = false }: { config: PizzaConfig; size?: number; className?: string; animate?: boolean; baked?: boolean; raw?: boolean; stage?: number; cut?: boolean }) {
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
  const pan = config.crust === 'pan';
  const thin = config.crust === 'thin';
  const R = 100;
  // Every pie is built from real photos. The square Detroit pan uses the middle of the same photos, blown up to fill the pan.
  const crustW = pan ? 8 : thin ? 9 : 16;
  // The photo's pizza fills 95% of its frame. `zoom` blows the middle up: thin crust pushes sauce and cheese out toward the rim.
  const half = R / 0.951;
  const pic = (name: string, zoom = 1) => <image href={`/pizza/real/${name}.webp`} x={-half * zoom} y={-half * zoom} width={2 * half * zoom} height={2 * half * zoom} preserveAspectRatio="none" />;
  const THIN = 1.14;
  const PAN = 1.68;
  const lay = thin ? THIN : 1;
  // A baked round pie. Thin and crispy keeps a narrow rim and takes more color from the deck.
  const bakedPic = (name: string) => (thin
    ? <g style={{ filter: 'contrast(1.12) brightness(0.93) saturate(1.06)' }}>{pic(name)}<g mask={url('thin')}>{pic(name, THIN)}</g></g>
    : pic(name));
  const inner = R - crustW;
  // How the customer asked for it baked and cut shows on the pie once it is out of the oven.
  const notes = config.notes ?? [];
  const bakeTone = notes.includes('Well done') ? 'brightness(0.84) saturate(1.1)' : notes.includes('Light bake') ? 'brightness(1.07) saturate(0.95)' : undefined;
  const cuts: [number, number, number, number][] = [];
  if (cut && !notes.includes('Uncut')) {
    if (pan || notes.includes('Square cut')) {
      for (const p of [-50, 0, 50]) cuts.push([p, -R, p, R], [-R, p, R, p]);
    } else {
      const n = SIZE_BY_ID[config.size].slices / 2;
      for (let i = 0; i < n; i++) {
        const a = 0.3 + (i * Math.PI) / n;
        cuts.push([-R * Math.cos(a), -R * Math.sin(a), R * Math.cos(a), R * Math.sin(a)]);
      }
    }
  }
  const scale =SIZE_BY_ID[config.size].toppingScale;
  const entries = Object.entries(config.toppings).filter(([tid]) => TOPPING_BY_ID[tid]);
  const grow = animate ? DOUGH_SCALE[config.size] ?? 1 : 1;
  const url = (n: string) => `url(#${id(n)})`;
  // Pan pizzas are square; everything else is round. One helper draws either at a given size.
  const shape = (r: number, props: Record<string, unknown>) => (pan ? <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r * 0.12} {...props} /> : <circle r={r} {...props} />);
  return (
    <svg viewBox="-104 -104 208 208" width={size} height={size} className={className} role="img" aria-label="Your pizza">
      <defs>
        {/* Hand-made edges: nothing on a real pizza is a perfect line. */}
        <filter id={id('wobble')} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="w" />
          <feDisplacementMap in="SourceGraphic" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="1" stdDeviation="0.8" floodColor="#3a1404" floodOpacity="0.45" /></filter>
        <clipPath id={id('left')}><rect x="-104" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('right')}><rect x="0" y="-104" width="104" height="208" /></clipPath>
        <clipPath id={id('outer')}><circle r={R + 3} /></clipPath>
        <clipPath id={id('inner')}>{shape(inner + 0.5, {})}</clipPath>
        <clipPath id={id('pan')}><rect x={-R} y={-R} width={2 * R} height={2 * R} rx="12" /></clipPath>
        <clipPath id={id('panDough')}><rect x="-95" y="-95" width="190" height="190" rx="9" /></clipPath>
        <clipPath id={id('panSauce')}><rect x="-88" y="-88" width="176" height="176" rx="14" /></clipPath>
        <clipPath id={id('panCheese')}><rect x="-92" y="-92" width="184" height="184" rx="10" /></clipPath>
        <filter id={id('blur')} x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <mask id={id('stripes')} maskUnits="userSpaceOnUse" x="-104" y="-104" width="208" height="208">
          <g filter={url('wobble')}><g filter={url('blur')} fill="#fff"><rect x="-54" y="-80" width="20" height="160" rx="10" /><rect x="34" y="-80" width="20" height="160" rx="10" /></g></g>
        </mask>
        <linearGradient id={id('steel')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a4f57" /><stop offset="0.5" stopColor="#23262b" /><stop offset="1" stopColor="#3a3e45" /></linearGradient>
        {/* Thin crust: the zoomed middle fades out just short of the rim, so only a narrow edge of crust is left. */}
        <radialGradient id={id('thinFade')} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={inner + 3}><stop offset="0.94" stopColor="#fff" /><stop offset="1" stopColor="#000" /></radialGradient>
        <mask id={id('thin')} maskUnits="userSpaceOnUse" x="-104" y="-104" width="208" height="208"><circle r={inner + 3} fill={url('thinFade')} /></mask>
      </defs>
      <g style={{ transform: `scale(${grow})`, transition: 'transform 500ms cubic-bezier(.2,.8,.3,1.1)' }}>
      <g ref={dough}>
      {pan ? (
        <g>
          {/* Detroit pan: a blue steel pan, dough pressed to the corners, sauce, then cheese right to the wall. */}
          <rect x={-R} y={-R} width={2 * R} height={2 * R} rx="12" fill={url('steel')} />
          <rect x={-R + 1.5} y={-R + 1.5} width={2 * R - 3} height={2 * R - 3} rx="11" fill="none" stroke="#7b828c" strokeWidth="0.8" opacity="0.7" />
          {raw ? (
            <>
              <g clipPath={url('panDough')}>{pic('raw/dough', PAN)}</g>
              <rect x="-95" y="-95" width="190" height="190" rx="9" fill="none" stroke="#3a2a12" strokeWidth="2.5" opacity="0.18" filter={url('soft')} />
              {stage >= 1 && config.sauce !== 'none' && <g key={config.sauce} className={animate ? 'pz-spread' : undefined}><g filter={url('wobble')}><g clipPath={url('panSauce')}>{pic(`raw/sauce-${config.sauce}`, PAN)}</g></g></g>}
              {stage >= 2 && config.cheese !== 'none' && (
                <g key={config.cheese} className={animate ? 'pz-melt' : undefined} clipPath={url('panCheese')} style={{ filter: config.cheese === 'vegan' ? 'saturate(0.4) brightness(1.05)' : undefined }}>
                  {/* Shreds stay their real size: four turned copies of the scatter cover the pan. */}
                  {[[-46, -46, 0], [46, -46, 90], [46, 46, 180], [-46, 46, 270], [0, 0, 45]].slice(0, config.cheese === 'light' ? 4 : 5).map(([x, y, r]) => (
                    <g key={r} transform={`translate(${x} ${y}) rotate(${r})`}>{pic(config.cheese === 'light' ? 'raw/cheese-light' : config.cheese === 'extra' ? 'raw/cheese-extra' : 'raw/cheese', 0.98)}</g>
                  ))}
                </g>
              )}
            </>
          ) : null}
          {/* Baked: cheese melted to the wall with a dark caramelized edge, and stripes of sauce on top. */}
          <g style={{ opacity: !raw || baked ? 1 : 0, transition: 'opacity 1.6s ease-in', filter: bakeTone }}>
            {(!raw || baked) && (
              <g clipPath={url('pan')}>
                {pic(`base/${config.cheese === 'none' ? config.sauce : 'none'}-${config.cheese}`, PAN)}
                {config.sauce !== 'none' && config.cheese !== 'none' && <g mask={url('stripes')} opacity="0.9">{pic(`base/${config.sauce}-none`, 1.25)}</g>}
                <image href="/pizza/real/pan/frico.webp" x={-R} y={-R} width={2 * R} height={2 * R} />
              </g>
            )}
          </g>
        </g>
      ) : (
        <g clipPath={url('outer')}>
          {raw ? (
            <>
              {/* Being built: raw dough, then sauce spread on it, then shredded cheese. Nothing is cooked yet. */}
              {pic('raw/dough')}
              {thin && <g mask={url('thin')}>{pic('raw/dough', THIN)}</g>}
              {stage >= 1 && config.sauce !== 'none' && <g key={config.sauce} className={animate ? 'pz-spread' : undefined}>{pic(`raw/sauce-${config.sauce}`, lay)}</g>}
              {stage >= 2 && config.cheese !== 'none' && (
                <g key={config.cheese} className={animate ? 'pz-melt' : undefined} style={{ filter: config.cheese === 'vegan' ? 'saturate(0.4) brightness(1.05)' : undefined }}>
                  {/* Light is a sparse scatter with the sauce showing; extra buries the sauce. */}
                  {pic(config.cheese === 'light' ? 'raw/cheese-light' : config.cheese === 'extra' ? 'raw/cheese-extra' : 'raw/cheese', lay)}
                </g>
              )}
              {/* The oven: the baked photo fades in over the raw pie. */}
              <g style={{ opacity: baked ? 1 : 0, transition: 'opacity 1.6s ease-in', filter: bakeTone }}>{baked && bakedPic(`base/${config.sauce}-${config.cheese}`)}</g>
            </>
          ) : (
            <>
              {/* Three real photos stacked: bare dough, then the sauce, then the cheese melting in. */}
              {bakedPic('base/none-none')}
              <g key={config.sauce} className={animate ? 'pz-melt' : undefined} style={delay(250)}>{config.sauce !== 'none' && bakedPic(`base/${config.sauce}-none`)}</g>
              <g key={config.sauce + config.cheese} className={animate ? 'pz-melt' : undefined} style={delay(550)}>{config.cheese !== 'none' && bakedPic(`base/${config.sauce}-${config.cheese}`)}</g>
            </>
          )}
        </g>
      )}
      <g clipPath={url('inner')}>
        {/* Pepperoni sweats orange oil into the cheese around it. */}
                {stage >= 3 && entries.map(([tid, side], n) => (
          <g key={tid + side + (config.extra?.includes(tid) ? 'x' : '')} clipPath={side === 'whole' ? undefined : url(side)}>
            <ToppingLayer t={TOPPING_BY_ID[tid]} r={inner - 4} side={side} scale={scale} extra={config.extra?.includes(tid)} square={pan} shadow={url('shadow')} animate={animate} startMs={intro ? 850 + n * 180 : 0} />
          </g>
        ))}
      </g>
      {cuts.length > 0 && (
        <g clipPath={url(pan ? 'inner' : 'outer')} className="pz-melt" strokeLinecap="round">
          {cuts.map(([x1, y1, x2, y2], i) => (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a1c08" strokeWidth="1.3" opacity="0.6" />
              <line x1={x1 + 0.7} y1={y1 + 0.7} x2={x2 + 0.7} y2={y2 + 0.7} stroke="#fff" strokeWidth="0.5" opacity="0.3" />
            </g>
          ))}
        </g>
      )}
      </g>
      {!cut && entries.some(([, s]) => s !== 'whole') && (
        // Half and half: a clear line down the middle, readable over any sauce or topping.
        <g strokeLinecap="round">
          <line x1="0" y1={-inner - 2} x2="0" y2={inner + 2} stroke="#1f1206" strokeWidth="2.2" opacity="0.45" />
          <line x1="0" y1={-inner - 2} x2="0" y2={inner + 2} stroke="#fff" strokeWidth="1.1" strokeDasharray="4 3" />
        </g>
      )}
      </g>
    </svg>
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
function ToppingLayer({ t, r, side, scale, shadow, animate, startMs, extra = false, square = false }: { t: Topping; r: number; side: string; scale: number; shadow: string; animate: boolean; startMs: number; extra?: boolean; square?: boolean }) {
  const rand = rng([...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0);
  const reach = REACH[t.shape] * (t.id === 'meatball' ? 1.1 : 1);
  // Extra piles on about two thirds more pieces, as many as fit without burying the pie.
  // A square pan has corners to fill: the same spacing, carried out past the circle and trimmed to the pan.
  const count = Math.round(t.pieces * Math.max(0.85, Math.min(1.3, scale)) * (extra ? 1.65 : 1) * (square ? 2 : 1));
  const usable = r - reach - 1;
  const turn = rand() * Math.PI * 2;
  const pts: { x: number; y: number; rot: number; k: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = usable * (square ? Math.SQRT2 : 1) * Math.sqrt((i + 0.5) / count);
    const a = turn + i * GOLDEN;
    // A little wobble so it looks hand-placed, never enough to touch a neighbor.
    const x = Math.cos(a) * d + (rand() - 0.5) * 2;
    const y = Math.sin(a) * d + (rand() - 0.5) * 2;
    if (side === 'left' && x > -(reach + 1.5)) continue;
    if (side === 'right' && x < reach + 1.5) continue;
    if (square ? Math.max(Math.abs(x), Math.abs(y)) > usable : Math.hypot(x, y) > usable) continue;
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
  pepperoni: 9, cupchar: 6.5, sausage: 6, bacon: 7.5, ham: 6, chicken: 6.5, meatball: 7.5, mushroom: 7.5, onion: 8, greenpepper: 9,
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

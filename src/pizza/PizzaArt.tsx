import { CHEESES, SAUCES, SIZE_BY_ID, TOPPING_BY_ID, type PizzaConfig, type Topping } from './data';
import { rng } from './logic';

/**
 * The live pizza in the builder. Toppings land where they go: the whole pie, or only the left or right half.
 * Positions come from a fixed seed per topping, so a pie looks the same every time it is drawn.
 */
export function PizzaArt({ config, size = 320, className = '' }: { config: PizzaConfig; size?: number; className?: string }) {
  const sauce = SAUCES.find((s) => s.id === config.sauce)!;
  const cheese = CHEESES.find((c) => c.id === config.cheese)!;
  const pan = config.crust === 'pan';
  const thin = config.crust === 'thin';
  const R = 100;
  const crustW = pan ? 7 : thin ? 5 : 10;
  const inner = R - crustW;
  const scale = SIZE_BY_ID[config.size].toppingScale;
  const entries = Object.entries(config.toppings).filter(([id]) => TOPPING_BY_ID[id]);
  return (
    <svg viewBox="-104 -104 208 208" width={size} height={size} className={className} role="img" aria-label="Your pizza">
      <defs>
        <radialGradient id="pz-crust" cx="50%" cy="45%" r="55%">
          <stop offset="80%" stopColor={pan ? '#b8742f' : '#e2a95c'} />
          <stop offset="100%" stopColor={pan ? '#7c4a1c' : '#b9782f'} />
        </radialGradient>
        <filter id="pz-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodOpacity="0.35" /></filter>
        <clipPath id="pz-left"><rect x="-104" y="-104" width="104" height="208" /></clipPath>
        <clipPath id="pz-right"><rect x="0" y="-104" width="104" height="208" /></clipPath>
        <clipPath id="pz-inner"><circle r={inner - 1} /></clipPath>
      </defs>
      {pan
        ? <rect x={-R} y={-R} width={2 * R} height={2 * R} rx="14" fill="url(#pz-crust)" />
        : <circle r={R} fill="url(#pz-crust)" />}
      {/* Char spots on the crust. */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.3;
        return <ellipse key={i} cx={Math.cos(a) * (R - crustW / 2)} cy={Math.sin(a) * (R - crustW / 2)} rx="2.4" ry="1.4" fill="#6b3b14" opacity="0.35" transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * (R - crustW / 2)} ${Math.sin(a) * (R - crustW / 2)})`} />;
      })}
      <g clipPath="url(#pz-inner)">
        {pan ? <rect x={-inner} y={-inner} width={2 * inner} height={2 * inner} rx="8" fill={sauce.color} /> : <circle r={inner} fill={sauce.color} />}
        {cheese.amount > 0 && <CheeseLayer r={inner} amount={cheese.amount} />}
        {cheese.id === 'vegan' && <CheeseLayer r={inner} amount={0.9} tone="#f6efcf" />}
        {entries.map(([id, side]) => (
          <g key={id + side} clipPath={side === 'whole' ? undefined : `url(#pz-${side})`} className="pz-drop">
            <ToppingLayer t={TOPPING_BY_ID[id]} r={inner - 4} side={side} scale={scale} />
          </g>
        ))}
      </g>
      {entries.some(([, s]) => s !== 'whole') && <line x1="0" y1={-inner} x2="0" y2={inner} stroke="#fff" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />}
    </svg>
  );
}

function CheeseLayer({ r, amount, tone = '#fbe7a1' }: { r: number; amount: number; tone?: string }) {
  const rand = rng(17);
  const blobs = Math.round(34 * amount);
  return (
    <g opacity={Math.min(1, 0.55 + amount * 0.35)}>
      <circle r={r - 3} fill={tone} opacity={amount >= 1 ? 0.92 : 0.7} />
      {Array.from({ length: blobs }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (r - 6);
        return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={3 + rand() * 6} fill={i % 3 ? '#fff2c2' : '#f2c66b'} opacity={0.65} />;
      })}
    </g>
  );
}

function ToppingLayer({ t, r, side, scale }: { t: Topping; r: number; side: string; scale: number }) {
  const rand = rng([...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0);
  // Bigger pies get more pieces, and a half only needs the pieces that fall on it.
  const count = Math.round(t.pieces * Math.max(0.8, Math.min(1.3, scale)) * (side === 'whole' ? 1 : 1));
  const pts: { x: number; y: number; rot: number; k: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(0.04 + rand() * 0.96) * r;
    let x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    // Keep half toppings on their own half, so nothing is clipped away.
    if (side === 'left') x = -Math.abs(x) - 2;
    if (side === 'right') x = Math.abs(x) + 2;
    pts.push({ x, y, rot: rand() * 360, k: 0.85 + rand() * 0.3 });
  }
  return <g filter="url(#pz-shadow)">{pts.map((p, i) => <Piece key={i} t={t} {...p} />)}</g>;
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

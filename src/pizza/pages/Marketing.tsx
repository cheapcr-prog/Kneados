import qrcode from 'qrcode-generator';
import { Check, ChevronDown, ExternalLink, Mail, MapPin, Send, Sparkles, Truck, Users, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DRAFT_NOTE, type DraftFailure } from '../../components/Campaigns';
import { useClaudeReady } from '../../components/Ask';
import { Brain, Card, Pill, Stat, btn } from '../../pages/owner/ui';
import { addDays, shortDate } from '../../lib/dates';
import { money, moneyShort } from '../../lib/money';
import { PIZZA_SHOP, SPECIALTIES } from '../data';
import type { PizzaBrain } from '../brain';
import { usePizza } from '../store';
import {
  AUDIENCES, EDDM_MIN_PIECES, EDDM_POSTAGE_CENTS, EDDM_PRINT_CENTS, LOB_CENTS, OFFERS, OFFER_BY_ID, PROVIDERS, ROUTES, SIZE_LABEL,
  centsPerCard, defaultCopy, deliveryDays, estimate, lobRequest, mailCode, mailingList, namedAudience, photoFor, pickRoutes, qrLink, results, scoreRoutes, suggestOffer, tracking,
  type Audience, type CardSize, type MailCampaign, type MailClass, type MailCustomer,
} from '../mail';

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, '')}%`;
const cents = (c: number) => (c < 100 ? `${c.toFixed(1).replace(/\.0$/, '')}¢` : money(Math.round(c)));

/** Owner > Marketing: postcards picked, written, priced, mailed and tracked back to orders. */
export function MarketingPage({ brain }: { brain: PizzaBrain }) {
  const { state } = usePizza();
  const list = useMemo(() => mailingList(state.today), [state.today]);
  const foodShare = brain.facts.last30Days.foodCostShare;
  const all = state.campaigns.map((c) => ({ c, r: results(c, foodShare) }));
  const done = all.filter(({ c }) => c.sentOn <= addDays(state.today, -21));
  const sum = (f: (x: (typeof all)[number]) => number) => all.reduce((a, x) => a + f(x), 0);
  const best = [...done].sort((a, b) => b.r.roi - a.r.roi)[0];
  return (
    <>
      <Brain label="Marketing · postcards" title="Mail that pays for itself, tracked to the order">
        <p>{state.campaigns.length} mailings so far: {sum(({ c }) => c.pieces).toLocaleString()} cards for {money(sum(({ c }) => c.totalCents))}. Their codes brought in {sum(({ r }) => r.redeemed)} orders and {money(sum(({ r }) => r.salesCents))} in sales, {sum(({ r }) => r.newCustomers)} of them from people who had never ordered.</p>
        {best && <p>Best so far: "{best.c.name}" cost {money(best.c.totalCents)} and has made {money(best.r.profitCents)} after paying for itself ({pct(best.r.rate)} of cards came back as orders).</p>}
        <p className="text-slate-400">Every card carries its own code and QR link, so an order placed online, by phone or at the counter is counted against the card that brought it in.</p>
      </Brain>
      <NewMailing list={list} brain={brain} />
      <Card title="Mailings and what they brought in" note="Profit = sales from orders with the code, less their food cost and any food given away, less the cost of the mailing.">
        <div className="space-y-3">{all.map(({ c, r }) => <CampaignRow key={c.id} c={c} r={r} today={state.today} list={list} />)}</div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ building a new mailing */

function NewMailing({ list, brain }: { list: MailCustomer[]; brain: PizzaBrain }) {
  const { state, sendCampaign } = usePizza();
  const ready = useClaudeReady();
  const recent = useMemo(() => new Set(state.campaigns.filter((c) => c.sentOn > addDays(state.today, -30)).flatMap((c) => c.recipients)), [state.campaigns, state.today]);
  const [audience, setAudience] = useState<Audience>('lapsed');
  const [radius, setRadius] = useState(2);
  const scores = useMemo(() => scoreRoutes(list), [list]);
  const [routes, setRoutes] = useState<string[] | null>(null);
  const picked = routes ?? pickRoutes(scores, radius);
  const people = audience === 'neighbors' ? [] : namedAudience(audience, list, state.today, recent);
  const skipped = audience === 'neighbors' ? 0 : namedAudience(audience, list, state.today).length - people.length;
  const pieces = audience === 'neighbors' ? picked.reduce((a, id) => a + ROUTES.find((r) => r.id === id)!.homes, 0) : people.length;
  const suggestion = suggestOffer(audience);
  const [offerId, setOfferId] = useState<string | null>(null);
  const offer = offerId ?? suggestion.offerId;
  const [size, setSize] = useState<CardSize>('4x6');
  const [mailClass, setMailClass] = useState<MailClass>('first');
  const cardSize: CardSize = audience === 'neighbors' ? '6x9' : size;
  const cardClass: MailClass = audience === 'neighbors' ? 'standard' : LOB_CENTS[size][mailClass] ? mailClass : 'first';
  const [provider, setProvider] = useState('Lob');
  const favorites = audience === 'neighbors' ? brain.facts.last30Days.bestSellers.map((b) => SPECIALTIES.find((s) => s.name === b.name)?.id ?? 'pepperoni') : people.map((p) => p.favorite);
  const topFav = favorites[0] ?? 'pepperoni';
  const auto = defaultCopy(audience, offer, audience === 'neighbors' ? topFav : mostCommon(favorites));
  const [copy, setCopy] = useState<{ key: string; headline: string; body: string; byClaude: boolean } | null>(null);
  const key = `${audience}:${offer}`;
  const words = copy?.key === key ? copy : { key, ...auto, byClaude: false };
  const [photo, setPhoto] = useState<string | null>(null);
  const cardPhoto = photo ?? photoFor(favorites);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [showApi, setShowApi] = useState(false);
  const [sent, setSent] = useState<MailCampaign | null>(null);
  const est = estimate({ audience, pieces, size: cardSize, mailClass: cardClass, offerId: offer, avgTicketCents: brain.facts.last30Days.avgTicketCents, foodShare: brain.facts.last30Days.foodCostShare, history: state.campaigns.filter((c) => c.sentOn <= addDays(state.today, -21)) });
  const sample = people[0];
  const sampleCode = mailCode(`preview:${sample?.id ?? picked[0] ?? 'x'}`, audience === 'neighbors' ? 'MAIL' : 'SS');
  const lastNeighbors = state.campaigns.find((c) => c.audience === 'neighbors' && c.redemptions.length > 0);
  const lastNew = lastNeighbors?.redemptions.filter((r) => r.newCustomer) ?? [];
  const newShare = lastNew.length && lastNeighbors ? lastNew.length / lastNeighbors.redemptions.length : 0.8;
  const repeat = lastNew.length ? lastNew.filter((r) => r.orderedAgain).length / lastNew.length : undefined;
  const tooFew = audience === 'neighbors' && pieces < EDDM_MIN_PIECES;
  const expires = addDays(state.today, 30);
  const name = audience === 'lapsed' ? 'We miss you' : audience === 'regulars' ? 'Bring a friend' : `New neighbors: ${picked.map((id) => ROUTES.find((r) => r.id === id)!.area.split(',')[0]).join(', ')}`;

  const rewrite = async () => {
    setBusy(true); setNote('');
    const about = `${AUDIENCES.find((a) => a.id === audience)!.title}. ${pieces} cards. Offer: ${OFFER_BY_ID[offer].label}. Most of them order the ${SPECIALTIES.find((s) => s.id === mostCommon(favorites))?.name ?? 'pepperoni'}.`;
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'postcard', shop: PIZZA_SHOP.name, current: words.body, headline: words.headline, about }) });
      const data = res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as { headline?: string; text?: string; error?: DraftFailure }) : { error: 'off' as DraftFailure };
      if (data.headline && data.text) setCopy({ key, headline: data.headline, body: data.text, byClaude: true });
      else setNote(DRAFT_NOTE[data.error ?? 'busy']);
    } catch { setNote(DRAFT_NOTE.busy); }
    setBusy(false);
  };

  const send = () => {
    const id = `mail-${Date.now().toString(36)}`;
    const codes: Record<string, string> = {};
    if (audience === 'neighbors') for (const r of picked) codes[r] = mailCode(`${id}:${r}`, 'MAIL');
    else for (const p of people) codes[p.id] = mailCode(`${id}:${p.id}`);
    const c: MailCampaign = {
      id, name, audience, provider: audience === 'neighbors' ? 'USPS EDDM' : provider, size: cardSize, mailClass: cardClass, offerId: offer, headline: words.headline, body: words.body, photo: cardPhoto,
      sentOn: state.today, expires, pieces, perCard: est.perCard, totalCents: est.costCents, recipients: people.map((p) => p.id), routes: audience === 'neighbors' ? picked : [], codes, redemptions: [], byClaude: words.byClaude,
    };
    sendCampaign(c);
    setSent(c);
  };

  if (sent) {
    const t = tracking(sent, state.today);
    const first = Object.values(sent.codes)[0];
    return (
      <Card title={`Sent: ${sent.name}`} note={`${sent.pieces.toLocaleString()} cards, ${money(sent.totalCents)}. Demo: the request went to ${sent.provider === 'USPS EDDM' ? 'the print partner' : `${sent.provider} test mode`}, which renders the cards but never mails them.`}>
        <Timeline steps={t.steps} />
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          <Qr text={qrLink(first)} size={72} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Try it as a customer</p>
            <p>Scan this card's QR code, or open the link. The order is counted against this mailing below, live.</p>
          </div>
          <Link to={`/pizza/demo/shop?mail=${first}`} className={btn.green}><ExternalLink size={13} /> Open {first}</Link>
          <button onClick={() => setSent(null)} className={btn.light}>Plan another mailing</button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="New mailing" note="KneadOS picks who to mail, the offer, the photo and the words from your own orders and menu. Change anything before you send.">
      {/* 1. audience */}
      <Step n={1} title="Who gets a card">
        <div className="grid gap-2 md:grid-cols-3">
          {AUDIENCES.map((a) => {
            const count = a.id === 'neighbors' ? pickRoutes(scores, radius).reduce((s, id) => s + ROUTES.find((r) => r.id === id)!.homes, 0) : namedAudience(a.id, list, state.today, recent).length;
            return (
              <button key={a.id} data-audience={a.id} onClick={() => { setAudience(a.id); setOfferId(null); setPhoto(null); }} className={`rounded-xl border p-3 text-left ${audience === a.id ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600' : 'border-slate-200 hover:border-slate-300'}`}>
                <p className="flex items-center gap-1.5 font-bold">{a.id === 'neighbors' ? <MapPin size={15} /> : <Users size={15} />} {a.title}</p>
                <p className="tabular mt-0.5 font-display text-2xl font-bold">{count.toLocaleString()} <span className="text-sm font-semibold text-slate-500">{a.named ? 'people' : 'homes'}</span></p>
                <p className="text-xs text-slate-500">{a.rule}</p>
              </button>
            );
          })}
        </div>
        {audience !== 'neighbors' && <p className="mt-2 text-xs text-slate-500">From {list.length} customers with a delivery address on file.{skipped > 0 ? ` ${skipped} mailed in the last 30 days are left out.` : ''} Addresses are checked against USPS before printing; bad ones are dropped and not charged.</p>}
        {audience === 'neighbors' && <RoutePicker scores={scores} radius={radius} setRadius={(r) => { setRadius(r); setRoutes(null); }} picked={picked} toggle={(id) => setRoutes(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />}
      </Step>

      {/* 2. offer and card */}
      <Step n={2} title="The offer and the card">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {OFFERS.filter((o) => (o.id === 'friend') === (audience === 'regulars')).map((o) => (
            <button key={o.id} onClick={() => setOfferId(o.id)} className={`rounded-xl border p-2.5 text-left text-sm ${offer === o.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}>
              <p className="font-bold">{o.label}</p>
              <p className="text-xs text-slate-500">Costs you about {money(o.costCents)} an order</p>
              {o.id === suggestion.offerId && <Pill tone="green">KneadOS pick</Pill>}
            </button>
          ))}
        </div>
        <p className="mt-1.5 flex gap-1.5 text-xs text-slate-600"><Sparkles size={13} className="mt-0.5 shrink-0 text-emerald-600" /> {suggestion.why}</p>
        {audience === 'neighbors' ? (
          <p className="mt-3 text-sm text-slate-600">Every-door cards are 6.25 × 9 in, the smallest size USPS takes for EDDM. {cents(EDDM_POSTAGE_CENTS)} USPS retail postage plus about {cents(EDDM_PRINT_CENTS)} to print (example printer quote).</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Size</span>
            {(Object.keys(LOB_CENTS) as CardSize[]).map((s) => <button key={s} onClick={() => setSize(s)} className={`rounded-full border px-3 py-1 ${size === s ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-200'}`}>{SIZE_LABEL[s]} · {cents(centsPerCard(audience, s, LOB_CENTS[s][mailClass] ? mailClass : 'first'))}</button>)}
            <span className="ml-2 font-semibold">Mail</span>
            {(['first', 'standard'] as MailClass[]).map((m) => <button key={m} disabled={!LOB_CENTS[size][m]} onClick={() => setMailClass(m)} className={`rounded-full border px-3 py-1 disabled:opacity-40 ${cardClass === m ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-200'}`}>{m === 'first' ? 'First Class, 4 to 6 days' : 'Standard, 7 to 11 days'}</button>)}
            <span className="ml-2 font-semibold">Service</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-full border border-slate-200 px-3 py-1">{PROVIDERS.map((p) => <option key={p.id}>{p.name}</option>)}</select>
          </div>
        )}
        {audience !== 'neighbors' && <p className="mt-1 text-xs text-slate-500">{PROVIDERS.find((p) => p.name === provider)!.note} Prices are Lob's Startup plan list prices with print and postage included (Nov 2026); the plan's monthly fee is extra.</p>}
      </Step>

      {/* 3. design */}
      <Step n={3} title="The card">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Postcard side="front" headline={words.headline} photo={cardPhoto} offer={OFFER_BY_ID[offer].short} size={cardSize} />
            <Postcard side="back" body={words.body.replace('{name}', sample ? sample.name.split(' ')[0] : 'Maya')} code={sampleCode} expires={expires} size={cardSize} audience={audience} to={sample} mailClass={cardClass} offer={OFFER_BY_ID[offer].label} />
          </div>
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="space-y-2">
            <label className="block text-sm"><span className="font-semibold">Headline</span>
              <input value={words.headline} maxLength={60} onChange={(e) => setCopy({ ...words, headline: e.target.value, byClaude: false })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm"><span className="font-semibold">Message</span>
              <textarea value={words.body} rows={4} maxLength={400} onChange={(e) => setCopy({ ...words, body: e.target.value, byClaude: false })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <p className="text-[11px] text-slate-500">{audience === 'neighbors' ? 'Every-door cards have no names.' : '{name} becomes each customer\'s first name.'} {words.byClaude ? 'Written by Claude from the audience and offer.' : 'Written by KneadOS from the audience, offer and their usual order.'}</p>
            <button onClick={rewrite} disabled={busy || ready === false} className={btn.dark}><Wand2 size={14} /> {busy ? 'Writing…' : 'Rewrite with Claude'}</button>
            {ready === false && <p className="text-[11px] text-slate-500">{DRAFT_NOTE.off}</p>}
            {note && <p className="text-[11px] text-slate-500">{note}</p>}
            </div>
            <div>
            <p className="text-sm font-semibold">Photo</p>
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTIES.slice(0, 8).map((s) => <button key={s.id} onClick={() => setPhoto(s.photo)} aria-label={s.name} className={`h-11 w-11 overflow-hidden rounded-lg ring-2 ${cardPhoto === s.photo ? 'ring-emerald-600' : 'ring-transparent'}`}><img src={s.photo} alt="" className="h-full w-full object-cover" /></button>)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Picked automatically: {audience === 'neighbors' ? 'your best seller' : 'the pizza most of these customers order'}.</p>
            </div>
          </div>
        </div>
      </Step>

      {/* 4. cost and send */}
      <Step n={4} title="Cost and what to expect">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Cards" value={pieces.toLocaleString()} sub={`${cents(est.perCard)} each, print and postage`} />
          <Stat label="Total cost" value={money(est.costCents)} sub={audience === 'neighbors' ? `${picked.length} carrier route${picked.length === 1 ? '' : 's'}` : `${provider}, ${cardClass === 'first' ? 'First Class' : 'Standard'}`} />
          <Stat label="Expected orders" value={String(est.expected)} sub={`${pct(est.responseRate)} response, from ${est.responseFrom}`} />
          <Stat label={audience === 'neighbors' ? 'Profit on first orders' : 'Expected profit'} value={moneyShort(est.netCents)} tone={est.netCents >= 0 ? 'good' : 'bad'} sub={`Pays for itself at ${Number.isFinite(est.breakEven) ? est.breakEven : 'no'} orders · ${money(est.profitPerOrder)} each after food and offer`} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Arrives {shortDate(addDays(state.today, deliveryDays(audience, cardClass)[0]))} to {shortDate(addDays(state.today, deliveryDays(audience, cardClass)[1]))}. Codes are good until {shortDate(expires)}. Average ticket {money(brain.facts.last30Days.avgTicketCents)} and food cost {pct(brain.facts.last30Days.foodCostShare, 0)} are from the last 30 days of orders.</p>
        {audience === 'neighbors' && est.expected > 0 && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-900">Every-door mail is for finding new customers, so the first order rarely covers it. About {Math.round(est.expected * newShare)} new customers expected, about {money(Math.round(est.costCents / Math.max(1, est.expected * newShare)))} each.{repeat !== undefined ? ` ${pct(repeat, 0)} of new customers from your last neighbors mailing have ordered again since, without a code.` : ''}</p>}
        {tooFew && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">USPS needs at least {EDDM_MIN_PIECES} pieces for Every Door Direct Mail. Pick another route or widen the radius.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button data-send-mail onClick={send} disabled={!pieces || tooFew} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"><Send size={15} /> Approve and send {pieces.toLocaleString()} cards for {money(est.costCents)}</button>
          <button onClick={() => setShowApi((x) => !x)} className={btn.light}><ChevronDown size={13} className={showApi ? 'rotate-180' : ''} /> What gets sent to {audience === 'neighbors' ? 'the printer' : provider}</button>
          <span className="text-xs text-slate-500">Demo: sends to test mode, nothing is printed or charged.</span>
        </div>
        {showApi && (
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-100">
            {audience === 'neighbors'
              ? JSON.stringify({ product: 'EDDM postcard 6.25x9', quantity: pieces, routes: picked.map((id) => ({ route: id, homes: ROUTES.find((r) => r.id === id)!.homes })), paperwork: 'USPS PS Form 3587 and facing slips, filled in by KneadOS', drop_at: 'Long Beach Main Post Office', art: { front: 'front.pdf', back: 'back.pdf' }, codes: Object.fromEntries(picked.map((id) => [id, mailCode(`preview:${id}`, 'MAIL')])) }, null, 2)
              : `POST https://api.lob.com/v1/postcards   (one per customer, ${pieces} in all)\nAuthorization: Basic test_••••••••\n\n${JSON.stringify(sample ? lobRequest({ name, size: cardSize, mailClass: cardClass, sentOn: state.today }, sample, sampleCode) : {}, null, 2)}`}
          </pre>
        )}
      </Step>
    </Card>
  );
}

const mostCommon = (xs: string[]) => {
  const n: Record<string, number> = {};
  for (const x of xs) n[x] = (n[x] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'pepperoni';
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 py-4 first:border-0 first:pt-0">
      <h3 className="mb-2 flex items-center gap-2 font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-ink-900 text-xs text-white">{n}</span> {title}</h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ carrier routes */

function RoutePicker({ scores, radius, setRadius, picked, toggle }: { scores: ReturnType<typeof scoreRoutes>; radius: number; setRadius: (r: number) => void; picked: string[]; toggle: (id: string) => void }) {
  const scale = 34;
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-[260px_1fr]">
      <div>
        <svg viewBox="-130 -130 260 260" className="w-full rounded-xl bg-sky-50" role="img" aria-label="Carrier routes around the shop">
          <rect x={-130} y={34} width={260} height={100} fill="#bae6fd" opacity={0.6} />
          <text x={100} y={120} fontSize={9} textAnchor="end" fill="#0369a1">Pacific Ocean</text>
          <circle r={radius * scale} fill="#10b981" fillOpacity={0.08} stroke="#10b981" strokeDasharray="4 3" />
          {ROUTES.map((r) => {
            const on = picked.includes(r.id);
            return (
              <g key={r.id} onClick={() => toggle(r.id)} className="cursor-pointer">
                <circle cx={r.x * scale} cy={-r.y * scale} r={Math.sqrt(r.homes) / 2.4} fill={on ? '#059669' : '#cbd5e1'} fillOpacity={on ? 0.85 : 0.7} stroke="#fff" />
                <text x={r.x * scale} y={-r.y * scale + 3} fontSize={7} textAnchor="middle" fill={on ? '#fff' : '#334155'} fontWeight={700}>{r.id.slice(-4)}</text>
              </g>
            );
          })}
          <circle r={6} fill="#0f172a" /><text y={-9} fontSize={8} textAnchor="middle" fontWeight={700}>Shop</text>
        </svg>
        <label className="mt-2 block text-sm"><span className="font-semibold">Radius: {radius} mi</span>
          <input type="range" min={0.5} max={4} step={0.5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-emerald-600" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1" /><th>Route</th><th>Area</th><th>Homes</th><th>Miles</th><th>Order from you</th><th>Why</th></tr></thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.route.id} className="border-t border-slate-100">
                <td className="py-1.5"><input type="checkbox" checked={picked.includes(s.route.id)} onChange={() => toggle(s.route.id)} aria-label={`Mail route ${s.route.id}`} /></td>
                <td className="whitespace-nowrap pr-2 font-semibold">{s.route.id}</td><td>{s.route.area}</td><td>{s.route.homes}</td><td>{s.miles}</td><td>{pct(s.share, 0)}</td>
                <td className="text-xs text-slate-500">{s.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">KneadOS picks routes inside the radius where few homes order from you yet. Routes are all or nothing: USPS delivers to every home on a route. Example route data; a live shop pulls routes and counts from the USPS EDDM tool.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the postcard itself */

const ASPECT: Record<CardSize, string> = { '4x6': '6 / 4', '6x9': '9 / 6', '6x11': '11 / 6' };

function Postcard(p: { side: 'front' | 'back'; size: CardSize; headline?: string; photo?: string; offer?: string; body?: string; code?: string; expires?: string; audience?: Audience; to?: MailCustomer; mailClass?: MailClass }) {
  const box = { aspectRatio: ASPECT[p.size], containerType: 'inline-size' } as React.CSSProperties;
  if (p.side === 'front') {
    return (
      <figure data-postcard="front" style={box} className="relative overflow-hidden rounded-lg bg-[#10261c] shadow-lg ring-1 ring-black/10">
        <img src={p.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#10261c] via-[#10261c]/40 to-transparent" />
        <div className="absolute right-[4cqw] top-[4cqw] grid h-[24cqw] w-[24cqw] rotate-6 place-items-center rounded-full bg-amber-400 p-[2cqw] text-center font-display text-[3.4cqw] font-extrabold leading-tight text-[#10261c] shadow-xl">{p.offer}</div>
        <div className="absolute inset-x-[5cqw] bottom-[5cqw] text-white">
          <p className="font-display text-[7.5cqw] font-extrabold leading-[0.95] tracking-tight">{p.headline}</p>
          <p className="mt-[1.5cqw] text-[2.8cqw] font-bold uppercase tracking-[0.2em] text-emerald-300">{PIZZA_SHOP.name} · {PIZZA_SHOP.phone}</p>
        </div>
      </figure>
    );
  }
  const indicia = p.audience === 'neighbors' ? ['PRSRT STD', 'ECRWSS', 'U.S. POSTAGE PAID', 'EDDM RETAIL'] : p.mailClass === 'first' ? ['FIRST-CLASS MAIL', 'U.S. POSTAGE PAID', 'LOB'] : ['PRSRT MKTG', 'U.S. POSTAGE PAID', 'LOB'];
  return (
    <figure data-postcard="back" style={box} className="relative grid grid-cols-[1.15fr_1fr] gap-[3cqw] overflow-hidden rounded-lg bg-[#fbf7ef] p-[4cqw] text-slate-900 shadow-lg ring-1 ring-black/10">
      <div className="flex min-h-0 flex-col">
        <p className="font-display text-[4cqw] font-extrabold text-[#10261c]">{PIZZA_SHOP.name}</p>
        <p className="mt-[1cqw] line-clamp-6 text-[3cqw] leading-snug">{p.body}</p>
        <div className="mt-auto flex items-center gap-[2cqw] rounded-[1.5cqw] border-[0.4cqw] border-dashed border-emerald-700 p-[1.5cqw]">
          <div className="w-[13cqw] shrink-0"><Qr text={qrLink(p.code ?? 'SS-XXXXX')} size="100%" /></div>
          <div className="min-w-0 text-[2.4cqw] leading-tight">
            <p className="font-bold">{p.offer}</p>
            <p className="tabular mt-[0.5cqw] font-display text-[3.4cqw] font-extrabold tracking-wider text-emerald-800">{p.code}</p>
            <p className="text-slate-500">Scan, call or show at the counter. Expires {p.expires ? shortDate(p.expires) : ''}.</p>
          </div>
        </div>
      </div>
      <div className="relative flex flex-col border-l-[0.3cqw] border-slate-300 pl-[3cqw]">
        <div className="ml-auto border-[0.3cqw] border-slate-500 px-[1.2cqw] py-[0.6cqw] text-center text-[1.7cqw] font-bold leading-tight text-slate-600">{indicia.map((l) => <p key={l}>{l}</p>)}</div>
        <div className="mt-auto mb-[4cqw] text-[2.8cqw] leading-snug">
          {p.audience === 'neighbors' ? <><p className="font-bold">Local Postal Customer</p><p>Long Beach, CA</p></> : <><p className="font-bold">{p.to?.name ?? 'Maya Reyes'}</p><p>{p.to?.line1 ?? '210 Termino Ave'}</p><p>Long Beach, CA {p.to?.zip ?? '90803'}</p></>}
          <p className="mt-[1cqw] font-mono text-[1.6cqw] tracking-[0.15em] text-slate-500">||||·|·||·|||·||·|·|||·|</p>
        </div>
      </div>
    </figure>
  );
}

function Qr({ text, size }: { text: string; size: number | string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
    return { d, n: n + 2 };
  }, [text]);
  return (
    <svg data-mail-qr viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`}>
      <rect width={path.n} height={path.n} fill="#fff" /><path d={path.d} fill="#0f172a" />
    </svg>
  );
}

/* ------------------------------------------------------------------ past mailings */

function Timeline({ steps }: { steps: { label: string; date: string; done: boolean }[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {steps.map((s) => (
        <li key={s.label} className={`rounded-lg border p-2 text-xs ${s.done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>
          <p className="flex items-center gap-1 font-bold">{s.done ? <Check size={12} /> : <Truck size={12} />} {shortDate(s.date)}</p>
          <p>{s.label}</p>
        </li>
      ))}
    </ol>
  );
}

function CampaignRow({ c, r, today, list }: { c: MailCampaign; r: ReturnType<typeof results>; today: string; list: MailCustomer[] }) {
  const [open, setOpen] = useState(false);
  const t = tracking(c, today);
  const young = c.sentOn > addDays(today, -21);
  const firstCode = Object.values(c.codes)[0];
  return (
    <article data-campaign={c.id} className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Mail size={16} className="text-slate-400" />
        <h3 className="font-bold">{c.name}</h3>
        <Pill tone={t.status === 'Delivered' ? 'green' : 'amber'}>{t.status}</Pill>
        <Pill tone="blue">{c.provider} · {SIZE_LABEL[c.size]}</Pill>
        {c.byClaude && <Pill tone="dark">Words by Claude</Pill>}
        <span className="ml-auto text-xs text-slate-500">Sent {shortDate(c.sentOn)} · codes good to {shortDate(c.expires)}</span>
      </div>
      <div className="tabular mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
        <Fig label="Cards" value={c.pieces.toLocaleString()} sub={`${pct(t.deliveredShare, 0)} delivered`} />
        <Fig label="Cost" value={money(c.totalCents)} sub={`${cents(c.perCard)} each`} />
        <Fig label="Orders with the code" value={String(r.redeemed)} sub={`${pct(r.rate)} of cards`} />
        <Fig label="Sales" value={money(r.salesCents)} />
        <Fig label="Profit after mail" value={money(r.profitCents)} tone={r.profitCents >= 0 ? 'good' : young ? undefined : 'bad'} sub={young ? 'Still coming in' : `${r.roi >= 0 ? '' : '−'}${Math.abs(Math.round(r.roi * 100))}% return on code orders`} />
        <Fig label="New customers" value={String(r.newCustomers)} sub={r.newCustomers ? `${money(r.costPerNewCents)} each` : c.audience === 'lapsed' ? 'Win-backs' : ''} />
        <Fig label="Ordered again since" value={String(r.orderedAgain)} sub="Without a code" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => setOpen((x) => !x)} className={btn.light}><ChevronDown size={13} className={open ? 'rotate-180' : ''} /> {open ? 'Hide' : 'Show'} the orders and tracking</button>
        {today <= c.expires && <Link to={`/pizza/demo/shop?mail=${firstCode}`} className={btn.light}><ExternalLink size={13} /> Redeem {firstCode} as a customer</Link>}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <Timeline steps={t.steps} />
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="w-full max-w-[280px] shrink-0"><Postcard side="front" headline={c.headline} photo={c.photo} offer={OFFER_BY_ID[c.offerId].short} size={c.size} /></div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              {c.redemptions.length === 0 && <p className="text-sm text-slate-500">No orders with these codes yet. Cards land {shortDate(addDays(c.sentOn, deliveryDays(c.audience, c.mailClass)[0]))} or so.</p>}
              {c.redemptions.length > 0 && (
                <table className="tabular w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Order</th><th>Date</th><th>Customer</th><th>Code</th><th>Came in by</th><th>Sale</th><th /></tr></thead>
                  <tbody>
                    {[...c.redemptions].reverse().slice(0, 30).map((x, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1.5 font-semibold">#{x.orderNumber}</td><td>{shortDate(x.date)}</td>
                        <td>{x.name}{c.audience === 'neighbors' && <span className="text-xs text-slate-400"> · route {Object.entries(c.codes).find(([, v]) => v === x.code)?.[0]}</span>}</td>
                        <td className="font-mono text-xs">{x.code}</td><td>{x.channel}</td><td>{money(x.subtotalCents)}</td>
                        <td>{x.live ? <Pill tone="green">Just now</Pill> : x.newCustomer ? <Pill tone="blue">New</Pill> : list.some((m) => m.name === x.name) ? <Pill>Came back</Pill> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Fig({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`font-display text-lg font-bold ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-600' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

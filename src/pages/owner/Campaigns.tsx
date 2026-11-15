import { Cake, CalendarHeart, Loader2, RotateCcw, Send, Sparkles, Star, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useClaudeReady } from '../../components/Ask';
import { DRAFT_NOTE, rewriteDraft, useCampaigns, type LiveCampaign } from '../../components/Campaigns';
import { MENU_BY_ID, SHOP } from '../../data/shop';
import { PURCHASED, RECIPES, SUPPLIES } from '../../data/supplies';
import type { Demo } from '../../data/store';
import { draftProblems, firstName, type CampaignKind } from '../../lib/campaigns';
import { menuCosts } from '../../lib/costing';
import { formatPhone, money } from '../../lib/money';
import { Brain, Card, Demo as DemoNote, Pill, Stat, btn } from './ui';

const ICON: Record<CampaignKind, typeof Cake> = { winback: UserRoundCheck, birthday: Cake, holiday: CalendarHeart, review: Star };

function CampaignCard({ c, claude, onSend, onDraft, onReset, onAuto }: {
  c: LiveCampaign; claude: boolean;
  onSend: () => number; onDraft: (text: string, byClaude?: boolean) => void; onReset: () => void; onAuto: (on: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [justSent, setJustSent] = useState(0);
  const Icon = ICON[c.kind];
  const n = c.recipients.length;

  // What the free donuts would cost the shop in ingredients, from the recipes.
  const donutCost = c.kind === 'winback' || c.kind === 'birthday'
    ? c.recipients.reduce((a, r) => {
      const id = r.member.favorite && MENU_BY_ID[r.member.favorite] ? r.member.favorite : 'glazed';
      return a + (menuCosts([id], RECIPES, SUPPLIES, PURCHASED)[id] ?? 0);
    }, 0)
    : 0;

  const rewrite = async () => {
    setBusy(true); setNote('');
    const r = await rewriteDraft(c.kind, c.draft, c.holiday?.name);
    setBusy(false);
    if (!r.ok) { setNote(DRAFT_NOTE[r.why]); return; }
    const problems = draftProblems(c.kind, r.text, SHOP.name);
    if (problems.length > 0) { setNote(`Claude's wording did not pass the checks (${problems[0]}), so it was not used.`); return; }
    onDraft(r.text, true);
  };

  return (
    <section data-campaign={c.kind} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-box-50 text-box-600"><Icon size={18} /></span>
          <div>
            <h2 className="font-display text-lg font-bold leading-tight tracking-tight">{c.title}</h2>
            <p className="text-xs text-slate-500">{n === 0 ? 'No one is due right now' : `${n} ${n === 1 ? 'person is' : 'people are'} due`}</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={c.auto} onChange={(e) => onAuto(e.target.checked)} className="h-4 w-4 accent-glaze-600" />
          Send automatically
        </label>
      </div>
      <p className="mt-2 text-sm text-slate-600">{c.rule}</p>
      <p className="mt-1 text-xs text-slate-500">{c.offer}{donutCost > 0 && ` For this list that is about ${money(Math.round(donutCost))} in ingredients if every one is used.`}</p>

      {n > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
          {c.recipients.slice(0, 6).map((r) => (
            <li key={r.member.phone} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
              <span className="font-semibold text-slate-900">{r.member.name}</span>
              <span className="text-xs text-slate-500">{r.reason}</span>
            </li>
          ))}
          {n > 6 && <li className="py-1.5 text-xs text-slate-500">and {n - 6} more</li>}
        </ul>
      )}

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`draft-${c.kind}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">The text</label>
          <span className="flex items-center gap-1.5">
            {c.byClaude ? <Pill tone="dark">Written by Claude</Pill> : c.edited ? <Pill>Your wording</Pill> : <Pill>Built-in wording</Pill>}
          </span>
        </div>
        <textarea id={`draft-${c.kind}`} value={c.draft} onChange={(e) => onDraft(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-glaze-500 focus:outline-none" />
        <p className="mt-0.5 text-[11px] text-slate-400">{'{name}'} and {'{favorite}'} are filled in for each person. The opt-out line is added for you.</p>
        {c.problems.map((p) => <p key={p} className="mt-1 text-xs font-semibold text-rose-700">{p}</p>)}
      </div>

      {c.preview && (
        <div className="mt-2 rounded-2xl bg-slate-100 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">What {firstName(c.recipients[0].member)} gets · {formatPhone(c.recipients[0].member.phone)}</p>
          <p data-preview className="mt-1.5 max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm">{c.preview}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btn.dark} disabled={n === 0 || c.problems.length > 0} onClick={() => setJustSent(onSend())}><Send size={14} /> {n === 0 ? 'No one to text' : `Send to ${n}`}</button>
        <button className={btn.light} disabled={busy || !claude} onClick={rewrite} title={claude ? '' : 'Claude is not connected'}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Rewrite with Claude
        </button>
        {c.edited && <button className={btn.light} onClick={onReset}><RotateCcw size={13} /> Built-in wording</button>}
      </div>
      {justSent > 0 && <p className="mt-2 text-sm font-semibold text-emerald-700">Sent to {justSent}. They are in the list of texts on the Rewards screen.</p>}
      {note && <p className="mt-2 text-xs text-slate-600">{note}</p>}
    </section>
  );
}

/** Texts that bring customers back: win-back, birthdays, holiday pre-orders and review requests. */
export function Campaigns({ demo }: { demo: Demo }) {
  const c = useCampaigns();
  const claude = useClaudeReady();
  const due = c.campaigns.filter((x) => x.recipients.length > 0);
  return (
    <div className="space-y-4">
      <Brain label="Customer texts" title={c.ready === 0 ? 'Everyone who was due has been texted' : `${c.ready} ${c.ready === 1 ? 'text is' : 'texts are'} ready to send`}>
        <p>
          {due.length === 0
            ? 'KneadOS watches the rewards list every day and lines up the next texts when someone is due.'
            : `KneadOS picked the people from the rewards list: ${due.map((x) => `${x.recipients.length} for ${x.short}`).join(', ')}. Check the wording and send, or turn on automatic sending.`}
        </p>
      </Brain>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rewards members" value={String(demo.state.members.length)} />
        <Stat label="Ready to send" value={String(c.ready)} />
        <Stat label="Sent in the last 30 days" value={String(c.sentThisMonth)} />
        <Stat label="Came back after a win-back text" value={String(c.cameBack)} sub="Counted when they visit again" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {c.campaigns.map((x) => (
          <CampaignCard key={x.kind} c={x} claude={!!claude} onSend={() => c.send(x.kind)} onDraft={(t, by) => c.setDraft(x.kind, t, by)} onReset={() => c.resetDraft(x.kind)} onAuto={(on) => c.setAuto(x.kind, on)} />
        ))}
      </div>
      <Card title="How these stay friendly">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Only rewards members get texts, and every text says who it is from and how to stop them.</li>
          <li>Each campaign texts a person once and then leaves them alone, so nobody is pestered.</li>
          <li>Review requests never offer anything in return, because Google does not allow that.</li>
        </ul>
      </Card>
      <DemoNote>
        Demo: texts are shown, not sent, and the members, last visits and birthdays are example data. The review and ordering links are examples. "Rewrite with Claude" asks Claude for new wording and checks it before it is used. A live shop needs each customer's agreement to get marketing texts, which the rewards sign-up collects.
      </DemoNote>
    </div>
  );
}

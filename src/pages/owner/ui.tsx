import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export function Card({ title, children, note, className = '', action }: { title?: string; children: ReactNode; note?: string; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {title && <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className={title ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`tabular mt-1 font-display text-3xl font-bold tracking-tight ${tone === 'bad' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-600' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** The dark card KneadOS uses when it is telling the owner what it worked out. */
export function Brain({ label, title, children }: { label: string; title?: string; children?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-ink-900 p-5 text-white">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-glaze-300"><Sparkles size={13} /> {label}</p>
      {title && <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{title}</h2>}
      {children && <div className="mt-1.5 max-w-3xl space-y-1 text-sm text-slate-200">{children}</div>}
    </section>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'dark' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800', blue: 'bg-sky-100 text-sky-800', dark: 'bg-ink-900 text-white',
  };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

export const btn = {
  dark: 'inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-bold text-white hover:bg-ink-700 disabled:opacity-40',
  light: 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40',
  green: 'inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40',
};

export const field = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-glaze-500 focus:outline-none';

/** Saves text as a file from the browser, e.g. a CSV export. */
export function download(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Demo({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

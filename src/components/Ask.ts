import { useEffect, useState } from 'react';
import type { Decision, ShopFacts } from '../lib/brain';

export type AskFailure = 'off' | 'capped' | 'limit' | 'bad' | 'refused' | 'busy';
export type ServerAnswer = { ok: true; text: string; decisionIds: string[] } | { ok: false; why: AskFailure };

/** Asks Claude through the shop's own server. Any trouble comes back as a reason, so the chat can answer from its built-in rules. */
export async function askServer(question: string, facts: ShopFacts, decisions: Decision[], history: { q: string; a: string }[]): Promise<ServerAnswer> {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question, facts, history: history.slice(-3),
        decisions: decisions.map(({ id, area, urgency, title, why, action }) => ({ id, area, urgency, title, why, action })),
      }),
    });
    if (!res.headers.get('content-type')?.includes('application/json')) return { ok: false, why: 'off' };
    const data = (await res.json()) as { text?: string; decisionIds?: string[]; error?: AskFailure };
    if (data.error || typeof data.text !== 'string') return { ok: false, why: data.error ?? 'busy' };
    return { ok: true, text: data.text, decisionIds: data.decisionIds ?? [] };
  } catch {
    return { ok: false, why: 'busy' };
  }
}

/** Whether Claude is connected for this shop. Unknown (null) until the server answers. */
export function useClaudeReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/ask')
      .then((r) => (r.headers.get('content-type')?.includes('application/json') ? r.json() : { ready: false }))
      .then((d: { ready?: boolean }) => live && setReady(!!d.ready))
      .catch(() => live && setReady(false));
    return () => { live = false; };
  }, []);
  return ready;
}

/** Why the chat fell back to its built-in rules, in the owner's words. */
export const FALLBACK_NOTE: Record<AskFailure, string> = {
  off: '',
  capped: "Claude has reached today's spending limit, so this came from the built-in rules.",
  limit: "You have reached today's question limit for Claude, so this came from the built-in rules.",
  bad: 'Claude could not take that question, so this came from the built-in rules.',
  refused: 'Claude would not answer that one, so this came from the built-in rules.',
  busy: 'Claude could not be reached just now, so this came from the built-in rules.',
};

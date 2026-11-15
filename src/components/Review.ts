import { useCallback, useEffect, useState } from 'react';
import type { ReviewError, ReviewEvent, ReviewStatus, SavedReview } from '../../worker/review';
import type { Decision, ShopFacts } from '../lib/brain';

export type { ReviewStatus, SavedReview };

const OFF: ReviewStatus = { ready: false, saved: null, blocked: 'off' };

async function fetchStatus(): Promise<ReviewStatus> {
  try {
    const res = await fetch('/api/review');
    if (!res.headers.get('content-type')?.includes('application/json')) return OFF;
    return (await res.json()) as ReviewStatus;
  } catch {
    return OFF;
  }
}

/**
 * Asks the shop's server for a new deep review and reports progress as it is written.
 * Resolves with the finished review, or with the reason it could not be written.
 */
export async function runReview(facts: ShopFacts, decisions: Decision[], detail: Record<string, unknown>, onProgress: (chars: number) => void): Promise<{ ok: true; saved: SavedReview } | { ok: false; why: ReviewError }> {
  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facts, detail, decisions: decisions.map(({ id, area, urgency, title, why, action }) => ({ id, area, urgency, title, why, action })) }),
    });
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return { ok: false, why: ((await res.json()) as { error?: ReviewError }).error ?? 'busy' };
    if (!res.body || !type.includes('ndjson')) return { ok: false, why: 'off' };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ReviewEvent;
        if (event.t === 'wait') onProgress(event.chars);
        if (event.t === 'done') return { ok: true, saved: event.saved };
        if (event.t === 'error') return { ok: false, why: event.why };
      }
      if (done) break;
    }
    return { ok: false, why: 'busy' };
  } catch {
    return { ok: false, why: 'busy' };
  }
}

/** The last deep review and whether a new one can start. Unknown (null) until the server answers. */
export function useReviewStatus() {
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const refresh = useCallback(() => fetchStatus().then(setStatus), []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { status, refresh, setStatus };
}

/** Why a review cannot start or did not finish, in the owner's words. */
export const REVIEW_NOTE: Record<ReviewError, string> = {
  off: 'The deep review needs Claude connected for this shop. It is not connected on this copy of the demo.',
  running: 'A deep review is being written right now. Check back in a couple of minutes.',
  recent: 'A deep review was written a little while ago, and the numbers have not moved enough for a new one.',
  budget: "This month's deep review budget is used up. A new review can be written next month.",
  bad: 'The shop snapshot could not be sent. Reload the page and try again.',
  refused: 'Claude would not write this review. Nothing was saved.',
  busy: 'Claude could not finish the review just now. Nothing was saved. Try again in a few minutes.',
};

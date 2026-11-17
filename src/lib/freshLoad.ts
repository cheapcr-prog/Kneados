import { lazy, type ComponentType } from 'react';

const KEY = 'kneados-reloaded-at';

/**
 * True when it is fine to reload the page to pick up a new version.
 * Only once a minute, so a real outage can never turn into a reload loop.
 */
export function mayReload(now: number, last: number | null): boolean {
  return last === null || !Number.isFinite(last) || now - last > 60_000;
}

/** Reloads the page to fetch the current version. Returns false when it already tried a moment ago. */
export function reloadForNewVersion(): boolean {
  let last: number | null = null;
  try { const raw = sessionStorage.getItem(KEY); last = raw === null ? null : Number(raw); } catch { /* storage blocked */ }
  if (!mayReload(Date.now(), last)) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return true;
}

/**
 * Like React's lazy, for screens that load on demand.
 * After a new version ships, a page that was already open still points at the old files, which are gone.
 * Opening one of these screens would then fail and blank the page. This reloads once to get the new version.
 */
export function lazyFresh<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((err: unknown) => {
    if (reloadForNewVersion()) return new Promise<{ default: T }>(() => { /* the page is reloading */ });
    throw err;
  }));
}

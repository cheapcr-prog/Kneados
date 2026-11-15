import { useCallback, useSyncExternalStore } from 'react';

/**
 * Small pieces of demo state that one feature owns (the equipment log, gift cards, next week's schedule).
 * Each is saved in the browser under its own key and shared by every screen that reads it.
 * Resetting the demo clears them all.
 */

const PREFIX = 'kneados-x-';
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

function read<T>(name: string, initial: () => T): T {
  if (cache.has(name)) return cache.get(name) as T;
  let value: T;
  try {
    const raw = localStorage.getItem(PREFIX + name);
    value = raw ? (JSON.parse(raw) as T) : initial();
  } catch {
    value = initial();
  }
  cache.set(name, value);
  return value;
}

function write<T>(name: string, value: T) {
  cache.set(name, value);
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the demo still works for this visit.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useShopState<T>(name: string, initial: () => T): [T, (next: T | ((cur: T) => T)) => void] {
  const value = useSyncExternalStore(subscribe, () => read(name, initial));
  const set = useCallback((next: T | ((cur: T) => T)) => {
    const cur = read(name, initial);
    write(name, typeof next === 'function' ? (next as (c: T) => T)(cur) : next);
    // `initial` only matters the first time, so it is left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return [value, set];
}

/** Forgets every saved piece, so each feature starts from its example data again. */
export function clearShopState() {
  cache.clear();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
  listeners.forEach((l) => l());
}

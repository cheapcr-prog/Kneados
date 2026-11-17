import { describe, expect, it } from 'vitest';
import { mayReload } from './freshLoad';

describe('mayReload', () => {
  it('reloads the first time', () => expect(mayReload(1_000_000, null)).toBe(true));
  it('does not reload again within a minute', () => expect(mayReload(1_030_000, 1_000_000)).toBe(false));
  it('reloads again after a minute', () => expect(mayReload(1_061_000, 1_000_000)).toBe(true));
  it('treats a broken saved time as never', () => expect(mayReload(1_000_000, Number.NaN)).toBe(true));
});

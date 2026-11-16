import type { Address } from '../src/pizza/data';
import { GEOCODE_MAX_CHARS, geocodeQuery, parseCensus } from '../src/pizza/geocode';

export type GeocodeReply = { found: true; address: Address } | { found: false } | { error: 'bad' | 'limit' | 'busy' };

/** Asks the address file. Swapped for a stand-in by the tests. */
export type LookUp = (query: string) => Promise<unknown>;

export const censusLookUp: LookUp = async (query) => {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  return res.json();
};

/** Checks what was sent. Returns the query for the address file, or null when it is not a street address. */
export function parseGeocodeBody(raw: string): string | null {
  if (raw.length > 1000) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  const address = (data as { address?: unknown })?.address;
  if (typeof address !== 'string' || address.length > GEOCODE_MAX_CHARS * 2) return null;
  return geocodeQuery(address) || null;
}

export async function findAddress(query: string, lookUp: LookUp = censusLookUp): Promise<Address | null> {
  return parseCensus(await lookUp(query));
}

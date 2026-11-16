/**
 * Real address lookup for phone and text orders. A street address the shop has not seen before is checked
 * against the US Census Bureau's public address file (free, no key), which says whether it exists and where it is.
 * KneadOS then measures how far it is from the shop to pick the delivery zone and fee.
 */
import type { Address } from './data';

/** Where the demo shop sits on the dispatch map, so a real address lands in the right place next to the example ones. */
export const MAP_ORIGIN = { lat: 33.768, lon: -118.155 };
const MILES_PER_LAT = 69.0;
const MILES_PER_LON = 57.5; // at Long Beach's latitude

export const GEOCODE_MAX_CHARS = 120;
/** Lookups one visitor may make in a day. An order needs one. */
export const GEOCODE_PER_VISITOR = 40;

/** Miles east and north of the shop. */
export function milesFromShop(lat: number, lon: number): { x: number; y: number } {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x: r((lon - MAP_ORIGIN.lon) * MILES_PER_LON), y: r((lat - MAP_ORIGIN.lat) * MILES_PER_LAT) };
}

/** What is sent to the address file: the address as said, in the shop's city unless the customer named another. */
export function geocodeQuery(said: string, city = 'Long Beach, CA'): string {
  const s = said.replace(/[^\w\s#.,'/-]/g, ' ').replace(/\s+in\s+(?=[a-z]+ beach\b|lakewood|signal hill)/i, ', ').replace(/\s+/g, ' ').trim().slice(0, GEOCODE_MAX_CHARS);
  if (!/\d/.test(s) || s.split(' ').length < 2) return '';
  if (/\b(ca|california)\b|\b9\d{4}\b/i.test(s)) return s;
  if (/\b(long beach|seal beach|lakewood|signal hill|los alamitos)\b/i.test(s)) return `${s}, CA`;
  return `${s}, ${city}`;
}

const KEEP_UPPER = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const title = (s: string) => s.toLowerCase().replace(/\b[a-z0-9]+\b/g, (w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));

/** Reads the Census geocoder's answer. Null when it found no such address. */
export function parseCensus(data: unknown): Address | null {
  const match = (data as { result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number }; addressComponents?: { city?: string } }[] } })?.result?.addressMatches?.[0];
  const lon = match?.coordinates?.x;
  const lat = match?.coordinates?.y;
  if (!match?.matchedAddress || typeof lon !== 'number' || typeof lat !== 'number') return null;
  const street = title(match.matchedAddress.split(',')[0].trim());
  const city = title(match.addressComponents?.city ?? '');
  return { line: city && city !== 'Long Beach' ? `${street}, ${city}` : street, ...milesFromShop(lat, lon) };
}

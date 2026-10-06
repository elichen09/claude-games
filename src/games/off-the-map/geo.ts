/* Off the Map: country shapes, lookups, name matching and small math helpers shared by every mode. */
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance } from "d3-geo";
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlasJson from "world-atlas/countries-110m.json";
import { CITIES } from "./data/cities";
import { COUNTRY_DATA, type Continent } from "./data/countries";

export type LonLat = [number, number];
export type Shape = Feature<Polygon | MultiPolygon, { name: string }>;

export interface Country {
  key: string; // world-atlas name
  name: string;
  keys: string[]; // normalised names a player may type
  continent: Continent;
  pop: number; // millions
  sovereign: boolean;
  shape: Shape;
  areaKm2: number;
  density: number; // people per km²
  centroid: LonLat;
  /** Center of the country's largest landmass: where routes and labels should point. */
  anchor: LonLat;
  /** The largest single landmass, for silhouettes. */
  main: Polygon;
  bounds: [LonLat, LonLat];
}

const atlas = atlasJson as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const shapes = (feature(atlas, atlas.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;
export const BORDERS = mesh(atlas, atlas.objects.countries, (a, b) => a !== b) as MultiLineString;

/* ── names ── */
export function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");
}
const squash = (s: string) => norm(s).replace(/ /g, "");

export const COUNTRIES: Country[] = shapes.map((shape) => {
  const key = shape.properties.name;
  const [name, aliases, continent, pop, sovereign] = COUNTRY_DATA[key] ?? [key, "", "Asia", 1, false];
  const areaKm2 = geoArea(shape) * 6371 * 6371;
  const keys = [...new Set([key, name, ...aliases.split("/")].filter(Boolean).map(squash))];
  const g = shape.geometry, main: Polygon = g.type === "Polygon" ? g : { type: "Polygon", coordinates: g.coordinates.reduce((a, b) => (geoArea({ type: "Polygon", coordinates: b }) > geoArea({ type: "Polygon", coordinates: a }) ? b : a)) };
  return { key, name, keys, continent, pop, sovereign, shape, areaKm2, density: (pop * 1e6) / areaKm2, centroid: geoCentroid(shape) as LonLat, anchor: geoCentroid(main) as LonLat, main, bounds: geoBounds(shape) as [LonLat, LonLat] };
});
export const byKey = new Map(COUNTRIES.map((c) => [c.key, c]));
export const LAND: FeatureCollection = { type: "FeatureCollection", features: COUNTRIES.map((c) => c.shape) };

function typoDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

/** The country a player meant: exact name or alias first, then a small typo allowance. */
export function matchCountry(input: string): Country | null {
  const k = squash(input);
  if (!k) return null;
  const exact = COUNTRIES.find((c) => c.keys.includes(k));
  if (exact) return exact;
  const max = k.length <= 4 ? 0 : k.length <= 7 ? 1 : 2;
  let best: Country | null = null, bd = max + 1;
  for (const c of COUNTRIES) for (const ck of c.keys) {
    const d = typoDistance(k, ck, max);
    if (d < bd) { bd = d; best = c; }
  }
  return bd <= max ? best : null;
}

/** Which country contains a point, if any. */
export function countryAt(p: LonLat): Country | null {
  for (const c of COUNTRIES) {
    const [[x0, y0], [x1, y1]] = c.bounds;
    if (p[1] < y0 - 0.01 || p[1] > y1 + 0.01) continue;
    if (x0 <= x1 && (p[0] < x0 - 0.01 || p[0] > x1 + 0.01)) continue; // bounds that cross the antimeridian have x0 > x1
    if (geoContains(c.shape, p)) return c;
  }
  return null;
}

/** A rough ocean name for a point at sea. */
export function oceanAt([lon, lat]: LonLat): string {
  if (lat < -60) return "the Southern Ocean";
  if (lat > 66) return "the Arctic Ocean";
  if (lon > 20 && lon < 120 && lat < 25) return "the Indian Ocean";
  if (lon > -70 && lon < 20) return "the Atlantic Ocean";
  if (lon >= -100 && lon <= -70 && lat > 8) return "the Atlantic Ocean";
  return "the Pacific Ocean";
}

export const KM_PER_RAD = 6371;
export const distanceKm = (a: LonLat, b: LonLat) => geoDistance(a, b) * KM_PER_RAD;
export const antipode = ([lon, lat]: LonLat): LonLat => [lon > 0 ? lon - 180 : lon + 180, -lat];
export const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-US")) + " km";
export const placeName = (p: LonLat) => { const c = countryAt(p); return c ? c.name : oceanAt(p); };

/* ── cities ── */
export interface CityInfo { name: string; country: Country; at: LonLat }
export const CITY_LIST: CityInfo[] = CITIES.map(([name, key, lat, lon]) => ({ name, country: byKey.get(key)!, at: [lon, lat] as LonLat }));

/* ── seeded randomness for daily puzzles ── */
export function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seeded(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** n distinct picks from a list, weighted. */
export function pick<T>(list: T[], n: number, rnd: () => number, weight: (t: T) => number = () => 1): T[] {
  const pool = list.map((t) => ({ t, w: Math.max(0, weight(t)) })).filter((x) => x.w > 0), out: T[] = [];
  while (out.length < n && pool.length) {
    let r = rnd() * pool.reduce((s, x) => s + x.w, 0), i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool.splice(i, 1)[0].t);
  }
  return out;
}
/** Points for how close a guess landed: 1000 for a bullseye, fading with distance. */
export const pointsForKm = (km: number, scale: number) => (km < 50 ? 1000 : Math.round(1000 * Math.exp(-km / scale)));

/** Remote islands too small for the 110m map, so "nearest land" facts don't skip them: [name, lat, lon]. */
const ISLANDS: [string, number, number][] = [
  ["Tahiti", -17.65, -149.43], ["the Tuamotus", -16.5, -144], ["the Marquesas", -9, -139.5], ["the Gambier Islands", -23.1, -134.97], ["Pitcairn", -25.07, -130.1],
  ["Easter Island", -27.12, -109.35], ["the Galápagos", -0.7, -90.5], ["Hawaii", 19.6, -155.5], ["Midway", 28.2, -177.4], ["the Cook Islands", -21.2, -159.8],
  ["Samoa", -13.8, -172], ["Tonga", -21.2, -175.2], ["Kiritimati", 1.87, -157.4], ["Tarawa", 1.45, 173], ["the Marshall Islands", 7.1, 171.2],
  ["Pohnpei", 6.9, 158.2], ["Guam", 13.44, 144.79], ["Palau", 7.5, 134.6], ["Tuvalu", -8.5, 179.2], ["Nauru", -0.52, 166.9], ["Norfolk Island", -29, 168],
  ["Lord Howe Island", -31.55, 159.08], ["the Chatham Islands", -44, -176.5], ["Macquarie Island", -54.6, 158.9], ["the Juan Fernández Islands", -33.6, -78.8],
  ["Clipperton Island", 10.3, -109.2], ["the Revillagigedo Islands", 18.8, -111], ["the Aleutians", 52, -175], ["the Azores", 37.8, -25.5], ["Bermuda", 32.3, -64.8],
  ["the Canary Islands", 28.3, -16.5], ["Cape Verde", 16, -24], ["Saint Helena", -15.96, -5.7], ["Ascension Island", -7.95, -14.36], ["Tristan da Cunha", -37.1, -12.3],
  ["South Georgia", -54.3, -36.5], ["Bouvet Island", -54.4, 3.4], ["Mauritius", -20.2, 57.5], ["Réunion", -21.1, 55.5], ["the Seychelles", -4.6, 55.5],
  ["the Maldives", 3.2, 73.2], ["the Chagos Islands", -7.3, 72.4], ["Heard Island", -53.1, 73.5], ["the Crozet Islands", -46.4, 51.8], ["Amsterdam Island", -37.8, 77.5],
  ["Christmas Island", -10.5, 105.7], ["the Cocos Islands", -12.2, 96.8], ["Svalbard", 78, 16], ["Jan Mayen", 71, -8.4], ["the Faroe Islands", 62, -7],
  ["Fernando de Noronha", -3.85, -32.42], ["the Falklands", -51.7, -59.5], ["Wallis and Futuna", -13.3, -176.2], ["Niue", -19.05, -169.87], ["the Kermadec Islands", -29.25, -177.9],
];

/** The closest land to a point (a country's coastline or a remote island), with its distance. */
export function nearestLand(p: LonLat): { name: string; km: number } {
  let best = "", bd = Infinity;
  for (const c of COUNTRIES) {
    const polys = c.shape.geometry.type === "Polygon" ? [c.shape.geometry.coordinates] : c.shape.geometry.coordinates;
    for (const poly of polys) for (const q of poly[0]) { const d = geoDistance(p, q as LonLat); if (d < bd) { bd = d; best = c.name; } }
  }
  for (const [name, lat, lon] of ISLANDS) { const d = geoDistance(p, [lon, lat]); if (d < bd) { bd = d; best = name; } }
  return { name: best, km: bd * KM_PER_RAD };
}

/** The best-known city closest to a point. */
export function nearestCity(p: LonLat, except?: CityInfo): { city: CityInfo; km: number } {
  let best = CITY_LIST[0], bd = Infinity;
  for (const c of CITY_LIST) { if (c === except) continue; const d = distanceKm(p, c.at); if (d < bd) { bd = d; best = c; } }
  return { city: best, km: bd };
}


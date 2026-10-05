/**
 * A simplified reconstruction of Pangaea (~200 million years ago). Each plate gets one rigid rotation from its
 * present position; Africa (and Arabia) stays put. Atlantic fits use classic published Euler poles; the
 * Gondwana fragments are placed by fitting two landmarks each. Good enough to see the supercontinent and play
 * with it, not for research. Pure math, no DOM.
 */
import type { Plate } from "./data/countries";

export type Vec = [number, number, number];
export type Quat = [number, number, number, number]; // [w, x, y, z]

const RAD = Math.PI / 180;
export const toVec = (lon: number, lat: number): Vec => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
export const toLonLat = ([x, y, z]: Vec): [number, number] => [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec): Vec => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

export const IDENTITY: Quat = [1, 0, 0, 0];
export const axisAngle = (axis: Vec, deg: number): Quat => { const h = (deg * RAD) / 2, s = Math.sin(h), u = unit(axis); return [Math.cos(h), u[0] * s, u[1] * s, u[2] * s]; };
/** Euler pole rotation: pole latitude/longitude and angle in degrees (counter-clockwise seen from above the pole). */
export const eulerPole = (lat: number, lon: number, deg: number): Quat => axisAngle(toVec(lon, lat), deg);
/** a then b: the rotation that applies `a` first, then `b`. */
export const then = (a: Quat, b: Quat): Quat => [
  b[0] * a[0] - b[1] * a[1] - b[2] * a[2] - b[3] * a[3],
  b[0] * a[1] + b[1] * a[0] + b[2] * a[3] - b[3] * a[2],
  b[0] * a[2] - b[1] * a[3] + b[2] * a[0] + b[3] * a[1],
  b[0] * a[3] + b[1] * a[2] - b[2] * a[1] + b[3] * a[0],
];
export const rotate = (q: Quat, v: Vec): Vec => {
  const [w, x, y, z] = q, t: Vec = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
/** Spherical interpolation from no rotation (t=0) to q (t=1). */
export const partial = (q: Quat, t: number): Quat => {
  const w = Math.max(-1, Math.min(1, q[0])), half = Math.acos(w), s = Math.sin(half);
  if (s < 1e-9) return IDENTITY;
  const k = Math.sin(t * half) / s;
  return [Math.cos(t * half), q[1] * k, q[2] * k, q[3] * k];
};
/** Rotation carrying landmark a to a2, then spinning about a2 so landmark b heads toward b2. */
export function fit(a: [number, number], a2: [number, number], b: [number, number], b2: [number, number]): Quat {
  const A = toVec(...a), A2 = toVec(...a2);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(A, A2)))) / RAD;
  const q1 = ang < 1e-6 ? IDENTITY : axisAngle(cross(A, A2), ang);
  const B1 = rotate(q1, toVec(...b)), B2 = toVec(...b2);
  // angle between B1 and B2 as seen around the A2 axis
  const p1 = unit(cross(A2, B1)), p2 = unit(cross(A2, B2));
  const spin = Math.atan2(dot(cross(p1, p2), A2), dot(p1, p2)) / RAD;
  return then(q1, axisAngle(A2, spin));
}

// ── present → Pangaea rotations, Africa fixed ──
const SA = eulerPole(44.0, -30.6, 57.0); // Bullard et al. 1965 South America–Africa fit
const NA = eulerPole(66.95, -12.02, 75.55); // North America–Africa, Early Jurassic
const EU_TO_NA = eulerPole(88.5, 27.7, -38.0); // Bullard Europe–North America fit
const EU = then(EU_TO_NA, NA);
const MG = fit([49.3, -12.0], [45.0, -3.0], [45.1, -25.6], [40.5, -16.0]); // Madagascar back against Somalia/Kenya
const IN = fit([72.9, 19.0], [51.5, -5.0], [77.5, 8.1], [48.5, -17.5]); // India's west coast against Madagascar
const AN = fit([0, -70], [38, -26], [50, -67], [60, -19]); // Dronning Maud Land against Mozambique, Enderby Land against India
const AU = then(fit([115, -34.4], [110, -65.5], [147, -43.6], [160, -69]), AN); // Australia's south coast against Wilkes Land

export const PLATE_ROTATION: Record<Plate, Quat> = { AF: IDENTITY, SA, NA, EU, MG, IN, AN, AU };

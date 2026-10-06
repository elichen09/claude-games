/*
 * One entry point for making a puzzle from a seed, used by the worker (and directly as a fallback).
 * Difficulty follows the week: index 0 is Monday (easiest) through 6, Sunday (hardest).
 */
import { generateFields, type FieldsPuzzle } from "./fields";
import { generateRiver, type RiverPuzzle } from "./river";
import { generateStars, type StarsPuzzle } from "./stars";

export type Kind = "stars" | "fields" | "river";
export type Puzzle = { kind: "stars"; p: StarsPuzzle } | { kind: "fields"; p: FieldsPuzzle } | { kind: "river"; p: RiverPuzzle };

export const LEVELS = {
  stars: [[6, 1], [7, 1], [8, 1], [8, 2], [9, 2], [9, 2], [9, 2]] as [number, number][],
  fields: [5, 5, 6, 6, 6, 7, 7],
  river: [6, 6, 8, 8, 8, 10, 10],
};

export function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seeded(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Deterministic: the same kind, level and seed always give the same puzzle. */
export function makePuzzle(kind: Kind, level: number, seed: number): Puzzle {
  for (let k = 0; ; k++) {
    const rnd = seeded(seed + k * 7919);
    if (kind === "stars") { const [n, s] = LEVELS.stars[level]; const p = generateStars(n, s, rnd); if (p) return { kind, p }; }
    if (kind === "fields") { const p = generateFields(LEVELS.fields[level], rnd); if (p) return { kind, p }; }
    if (kind === "river") { const p = generateRiver(LEVELS.river[level], rnd, level >= 5 ? 0.14 : 0.18); if (p) return { kind, p }; }
  }
}

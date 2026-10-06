/*
 * River: draw one closed loop that passes through every cell exactly once (a Hamiltonian cycle on the grid).
 * Some stretches of the river are drawn in as clues. The generator builds a random loop (spanning tree of 2×2
 * blocks, then random flips that keep it a single loop) and adds clue stretches until the same rules a person
 * uses (two stretches per cell, no early loops) pin down the whole river, so it never needs guessing.
 * Edges are numbered: horizontal h(r,c) = r*(n-1)+c joins (r,c)-(r,c+1); vertical v(r,c) = H + r*n+c joins (r,c)-(r+1,c).
 */
import { shuffle, type Rnd } from "./stars";

export interface RiverPuzzle { n: number; clues: number[]; solution: number[] }

export const edgeCount = (n: number) => 2 * n * (n - 1);
const H = (n: number) => n * (n - 1);
export const hEdge = (n: number, r: number, c: number) => r * (n - 1) + c;
export const vEdge = (n: number, r: number, c: number) => H(n) + r * n + c;
/** The two cells an edge joins. */
export function edgeCells(n: number, e: number): [number, number] {
  if (e < H(n)) { const r = Math.floor(e / (n - 1)), c = e % (n - 1); return [r * n + c, r * n + c + 1]; }
  const k = e - H(n); return [k, k + n];
}
/** The edge between two neighbouring cells, or -1. */
export function edgeBetween(n: number, a: number, b: number) {
  if (a > b) [a, b] = [b, a];
  if (b === a + 1 && a % n !== n - 1) return hEdge(n, Math.floor(a / n), a % n);
  if (b === a + n) return vEdge(n, Math.floor(a / n), a % n);
  return -1;
}

/** Whether a set of edges forms one loop through every cell. */
export function isSingleLoop(n: number, edges: Set<number>) {
  if (edges.size !== n * n) return false;
  const adj: number[][] = Array.from({ length: n * n }, () => []);
  for (const e of edges) { const [a, b] = edgeCells(n, e); adj[a].push(b); adj[b].push(a); }
  if (adj.some((x) => x.length !== 2)) return false;
  let prev = -1, cur = 0, steps = 0;
  do { const next = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0]; prev = cur; cur = next; steps++; } while (cur !== 0 && steps <= n * n);
  return steps === n * n;
}


/** A random loop through every cell of an even-sized grid. */
function randomLoop(n: number, rnd: Rnd): Set<number> {
  const m = n / 2, edges = new Set<number>();
  // each 2×2 block starts as its own little loop
  for (let br = 0; br < m; br++) for (let bc = 0; bc < m; bc++) {
    const r = br * 2, c = bc * 2;
    edges.add(hEdge(n, r, c)); edges.add(hEdge(n, r + 1, c)); edges.add(vEdge(n, r, c)); edges.add(vEdge(n, r, c + 1));
  }
  // join blocks along a random spanning tree: swap two facing walls for two bridges
  const parent = [...Array(m * m).keys()], find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const links: [number, number, boolean][] = [];
  for (let br = 0; br < m; br++) for (let bc = 0; bc < m; bc++) { if (bc < m - 1) links.push([br * m + bc, br * m + bc + 1, true]); if (br < m - 1) links.push([br * m + bc, (br + 1) * m + bc, false]); }
  for (const [a, b, horiz] of shuffle(links, rnd)) {
    if (find(a) === find(b)) continue;
    parent[find(a)] = find(b);
    const r = Math.floor(a / m) * 2, c = (a % m) * 2;
    if (horiz) { edges.delete(vEdge(n, r, c + 1)); edges.delete(vEdge(n, r, c + 2)); edges.add(hEdge(n, r, c + 1)); edges.add(hEdge(n, r + 1, c + 1)); }
    else { edges.delete(hEdge(n, r + 1, c)); edges.delete(hEdge(n, r + 2, c)); edges.add(vEdge(n, r + 1, c)); edges.add(vEdge(n, r + 1, c + 1)); }
  }
  // roughen it up: in any 2×2 square crossed by two parallel edges, try the other pair; keep it if still one loop
  for (let it = 0; it < n * n * 30; it++) {
    const r = Math.floor(rnd() * (n - 1)), c = Math.floor(rnd() * (n - 1));
    const top = hEdge(n, r, c), bot = hEdge(n, r + 1, c), lef = vEdge(n, r, c), rig = vEdge(n, r, c + 1);
    const [a1, a2, b1, b2] = edges.has(top) && edges.has(bot) && !edges.has(lef) && !edges.has(rig) ? [top, bot, lef, rig] : edges.has(lef) && edges.has(rig) && !edges.has(top) && !edges.has(bot) ? [lef, rig, top, bot] : [-1, -1, -1, -1];
    if (a1 < 0) continue;
    edges.delete(a1); edges.delete(a2); edges.add(b1); edges.add(b2);
    if (!isSingleLoop(n, edges)) { edges.delete(b1); edges.delete(b2); edges.add(a1); edges.add(a2); }
  }
  return edges;
}


/** Stretch states while solving: 1 river, -1 no river, 0 not known yet. */
export type Marks = number[];

/** The stretches touching each cell. */
export function cellEdges(n: number) {
  const out: number[][] = Array.from({ length: n * n }, () => []);
  for (let e = 0; e < edgeCount(n); e++) { const [a, b] = edgeCells(n, e); out[a].push(e); out[b].push(e); }
  return out;
}

export interface Step { edge: number; value: 1 | -1; why: string }

/**
 * One deduction a person could make from the marks so far, or null if none (or the marks contradict themselves).
 * Rules, easiest first: a cell with two stretches takes no more; a cell with exactly two possible stretches takes
 * both; a stretch that would close a loop missing some cells is out. With deep set, also: a stretch whose opposite
 * leads straight to a contradiction under those rules.
 */
export function nextStep(n: number, s: Marks, ce = cellEdges(n), deep = false): Step | null {
  const N = n * n;
  for (let i = 0; i < N; i++) {
    let on = 0, unk = 0;
    for (const e of ce[i]) if (s[e] === 1) on++; else if (s[e] === 0) unk++;
    if (on > 2 || on + unk < 2) return null;
    if (!unk) continue;
    if (on === 2) return { edge: ce[i].find((e) => s[e] === 0)!, value: -1, why: "That cell already has its two stretches." };
    if (on + unk === 2) return { edge: ce[i].find((e) => s[e] === 0)!, value: 1, why: on ? "That cell has only one way left to go." : "That cell only has two ways in or out, so the river uses both." };
  }
  const { find, size, closed } = components(n, s);
  if (closed) return null;
  for (let e = 0; e < s.length; e++) {
    if (s[e] !== 0) continue;
    const [a, b] = edgeCells(n, e);
    if (find(a) === find(b) && size(a) < N) return { edge: e, value: -1, why: "That would close the river into a loop that misses some cells." };
  }
  if (!deep) return null;
  for (let e = 0; e < s.length; e++) {
    if (s[e] !== 0) continue;
    for (const v of [1, -1] as const) {
      const t = [...s]; t[e] = v;
      if (!settle(n, t, ce)) return { edge: e, value: v === 1 ? -1 : 1, why: v === 1 ? "Putting river there leads to a dead end or a short loop." : "Leaving that out strands a cell." };
    }
  }
  return null;
}

/** Union the river so far; `closed` when it contains a loop that isn't the whole river. */
function components(n: number, s: Marks) {
  const N = n * n, parent = [...Array(N).keys()], sz = new Array(N).fill(1);
  const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  let closed = false;
  for (let e = 0; e < s.length; e++) {
    if (s[e] !== 1) continue;
    const [a, b] = edgeCells(n, e), ra = find(a), rb = find(b);
    if (ra === rb) { if (sz[ra] < N) closed = true; continue; }
    parent[ra] = rb; sz[rb] += sz[ra];
  }
  return { find, size: (x: number) => sz[find(x)], closed };
}

/** Apply the basic rules until they run out. False if the marks lead to a contradiction. */
function settle(n: number, s: Marks, ce: number[][]) {
  for (;;) {
    const st = nextStep(n, s, ce);
    if (!st) return !contradiction(n, s, ce);
    s[st.edge] = st.value;
  }
}

function contradiction(n: number, s: Marks, ce: number[][]) {
  for (let i = 0; i < n * n; i++) {
    let on = 0, unk = 0;
    for (const e of ce[i]) if (s[e] === 1) on++; else if (s[e] === 0) unk++;
    if (on > 2 || on + unk < 2) return true;
  }
  return components(n, s).closed;
}

/** Deduce as far as the rules go (in place). Returns false on a contradiction. */
export function deduceRiver(n: number, s: Marks, deep = false, ce = cellEdges(n)) {
  if (!settle(n, s, ce)) return false;
  if (!deep) return true;
  for (;;) {
    const st = nextStep(n, s, ce, true);
    if (!st) return !contradiction(n, s, ce);
    s[st.edge] = st.value;
    if (!settle(n, s, ce)) return false;
  }
}

const marksFor = (n: number, clues: Iterable<number>) => { const s: Marks = new Array(edgeCount(n)).fill(0); for (const e of clues) s[e] = 1; return s; };

/**
 * Builds a loop, then adds clue stretches until the rules alone finish the river; that also proves it's the only
 * answer. `prune` then drops that share of clues where the river stays solvable; `deep` allows trial reasoning.
 * Limits are attempt counts, not time, so the same seed gives the same puzzle on every device.
 */
export function generateRiver(n: number, rnd: Rnd, opts: { prune: number; deep: boolean }, attempts = 6): RiverPuzzle | null {
  const ce = cellEdges(n);
  const solves = (clues: Iterable<number>) => { const s = marksFor(n, clues); return deduceRiver(n, s, opts.deep, ce) && s.every((v) => v !== 0); };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const loop = randomLoop(n, rnd), solution = [...loop].sort((a, b) => a - b);
    const clues = new Set<number>(), s = marksFor(n, []);
    for (;;) {
      if (!deduceRiver(n, s, opts.deep, ce)) break;
      const open = solution.filter((e) => s[e] === 0);
      if (!open.length) break;
      const e = open[Math.floor(rnd() * open.length)];
      clues.add(e); s[e] = 1;
    }
    if (s.some((v, e) => v !== (loop.has(e) ? 1 : -1))) continue;
    for (const e of shuffle([...clues], rnd)) {
      if (rnd() >= opts.prune) continue;
      clues.delete(e);
      if (!solves(clues)) clues.add(e);
    }
    return { n, clues: [...clues].sort((a, b) => a - b), solution };
  }
  return null;
}

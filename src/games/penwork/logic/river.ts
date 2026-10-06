/*
 * River: draw one closed loop that passes through every cell exactly once (a Hamiltonian cycle on the grid).
 * Some stretches of the river are drawn in as clues. The generator builds a random loop (spanning tree of 2×2
 * blocks, then random flips that keep it a single loop) and adds clue edges until the solver finds just one loop.
 * Edges are numbered: horizontal h(r,c) = r*(n-1)+c joins (r,c)-(r,c+1); vertical v(r,c) = H + r*n+c joins (r,c)-(r+1,c).
 */
import type { Rnd } from "./stars";

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

const shuffle = <T>(a: T[], rnd: Rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

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

/** Up to `limit` loops that use every clue edge. Cells are decided in reading order; gives up after nodeLimit. */
export function solveRiver(n: number, clues: Set<number>, limit = 2, nodeLimit = 200000) {
  const deg = new Array(n * n).fill(0), end = new Array(n * n).fill(-1), on = new Set<number>(), found: number[][] = [];
  let nodes = 0;
  for (let i = 0; i < n * n; i++) end[i] = i;
  // add an edge a-b, joining path ends; returns an undo function or null if it would close a loop too early
  const add = (a: number, b: number, e: number, last: boolean) => {
    if (deg[a] >= 2 || deg[b] >= 2) return null;
    const ea = end[a], eb = end[b];
    if (ea === b && !last) return null; // would close a loop that doesn't cover every cell
    deg[a]++; deg[b]++; on.add(e);
    const saved = [end[a], end[b], end[ea], end[eb]];
    end[ea] = eb; end[eb] = ea;
    return () => { end[ea] = saved[2]; end[eb] = saved[3]; end[a] = saved[0]; end[b] = saved[1]; deg[a]--; deg[b]--; on.delete(e); };
  };
  const go = (i: number): void => {
    if (found.length >= limit || nodes > nodeLimit) return;
    if (i === n * n) { if (on.size === n * n) found.push([...on]); return; }
    const r = Math.floor(i / n), c = i % n, need = 2 - deg[i];
    const right = c < n - 1 ? i + 1 : -1, down = r < n - 1 ? i + n : -1;
    const eR = right >= 0 ? hEdge(n, r, c) : -1, eD = down >= 0 ? vEdge(n, r, c) : -1;
    const options: [boolean, boolean][] = need === 0 ? [[false, false]] : need === 1 ? [[true, false], [false, true]] : need === 2 ? [[true, true]] : [];
    for (const [useR, useD] of options) {
      nodes++;
      if ((useR && right < 0) || (useD && down < 0)) continue;
      if ((eR >= 0 && clues.has(eR) && !useR) || (eD >= 0 && clues.has(eD) && !useD)) continue;
      const undo: (() => void)[] = [];
      let ok = true;
      if (useR) { const u = add(i, right, eR, on.size === n * n - 1); if (u) undo.push(u); else ok = false; }
      if (ok && useD) { const u = add(i, down, eD, on.size === n * n - 1); if (u) undo.push(u); else ok = false; }
      if (ok) go(i + 1);
      undo.reverse().forEach((u) => u());
      if (found.length >= limit || nodes > nodeLimit) return;
    }
  };
  go(0);
  return { solutions: found, aborted: nodes > nodeLimit };
}

/** Limits are attempt counts, not time, so the same seed gives the same puzzle on every device. */
export function generateRiver(n: number, rnd: Rnd, clueShare = 0.18, attempts = 20): RiverPuzzle | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const loop = randomLoop(n, rnd), solution = [...loop].sort((a, b) => a - b);
    const clues = new Set(shuffle([...solution], rnd).slice(0, Math.round(solution.length * clueShare)));
    for (let it = 0; it < n * n; it++) {
      const { solutions, aborted } = solveRiver(n, clues, 2);
      if (!aborted && solutions.length === 1) return { n, clues: [...clues].sort((a, b) => a - b), solution };
      const other = solutions.find((s) => s.length !== solution.length || s.some((e) => !loop.has(e)));
      const missing = other ? solution.filter((e) => !other.includes(e) && !clues.has(e)) : solution.filter((e) => !clues.has(e));
      if (!missing.length) break;
      clues.add(missing[Math.floor(rnd() * missing.length)]);
    }
  }
  return null;
}

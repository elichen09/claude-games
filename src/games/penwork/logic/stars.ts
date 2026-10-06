/*
 * Stars (a.k.a. Star Battle): place k stars in every row, column and region of an n×n grid; stars never touch,
 * not even diagonally. The generator builds a random star layout, grows regions around it, then reshapes the
 * regions until the solver finds exactly one solution. Pure logic, no DOM.
 */
export type Rnd = () => number;
export interface StarsPuzzle { n: number; k: number; regions: number[]; solution: number[] }

export const shuffle = <T>(a: T[], rnd: Rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Every way to put k stars in a row of n cells with none side by side. */
function rowCombos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const go = (start: number, cur: number[]) => {
    if (cur.length === k) return void out.push([...cur]);
    for (let c = start; c < n; c++) { cur.push(c); go(c + 2, cur); cur.pop(); }
  };
  go(0, []);
  return out;
}

/** Counts solutions (stopping at `limit`), returning the first one found. Gives up after `nodeLimit` steps. */
export function solveStars(n: number, k: number, regions: number[], limit = 2, nodeLimit = 300000) {
  const combos = rowCombos(n, k), col = new Array(n).fill(0), reg = new Array(n).fill(0);
  // cells of each region in rows at or after r: what a region can still use
  const left: number[][] = Array.from({ length: n + 1 }, () => new Array(n).fill(0));
  for (let r = n - 1; r >= 0; r--) { for (let g = 0; g < n; g++) left[r][g] = left[r + 1][g]; for (let c = 0; c < n; c++) left[r][regions[r * n + c]]++; }
  let count = 0, nodes = 0, first: number[] | null = null;
  const placed: number[][] = [];
  const go = (r: number, prev: number[]): void => {
    if (count >= limit || nodes > nodeLimit) return;
    if (r === n) { count++; if (!first) first = placed.flatMap((cs, rr) => cs.map((c) => rr * n + c)); return; }
    for (const cs of combos) {
      nodes++;
      if (cs.some((c) => col[c] >= k || prev.some((p) => Math.abs(p - c) <= 1))) continue;
      for (const c of cs) { reg[regions[r * n + c]]++; col[c]++; }
      let ok = cs.every((c) => reg[regions[r * n + c]] <= k);
      // every region and column must still be able to reach k with the rows that are left
      for (let g = 0; g < n && ok; g++) if (reg[g] + Math.min(left[r + 1][g], (n - r - 1) * k) < k) ok = false;
      for (let c = 0; c < n && ok; c++) if (col[c] + (n - r - 1) < k) ok = false;
      if (ok) { placed.push(cs); go(r + 1, cs); placed.pop(); }
      for (const c of cs) { reg[regions[r * n + c]]--; col[c]--; }
      if (count >= limit || nodes > nodeLimit) return;
    }
  };
  go(0, []);
  return { count, solution: first as number[] | null, aborted: nodes > nodeLimit };
}

/** A random layout of k stars per row and column with no two touching. */
function randomLayout(n: number, k: number, rnd: Rnd): number[] | null {
  const combos = rowCombos(n, k), col = new Array(n).fill(0), rows: number[][] = [];
  let nodes = 0;
  const go = (r: number, prev: number[]): boolean => {
    if (r === n) return true;
    for (const cs of shuffle([...combos], rnd)) {
      if (++nodes > 20000) return false;
      if (cs.some((c) => col[c] >= k || prev.some((p) => Math.abs(p - c) <= 1))) continue;
      cs.forEach((c) => col[c]++);
      let ok = true;
      for (let c = 0; c < n; c++) if (col[c] + (n - r - 1) < k) ok = false;
      if (ok) { rows.push(cs); if (go(r + 1, cs)) return true; rows.pop(); }
      cs.forEach((c) => col[c]--);
    }
    return false;
  };
  return go(0, []) ? rows.flatMap((cs, r) => cs.map((c) => r * n + c)) : null;
}

const nbrs = (n: number, i: number) => { const r = Math.floor(i / n), c = i % n, out: number[] = []; if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n); if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1); return out; };

/** Grow n regions so each holds exactly k of the stars: pair stars up with short paths, then flood outwards. */
function growRegions(n: number, k: number, stars: number[], rnd: Rnd): number[] | null {
  const region = new Array(n * n).fill(-1), isStar = new Set(stars);
  const groups: number[][] = [];
  if (k === 1) stars.forEach((s) => groups.push([s]));
  else {
    const free = new Set(stars);
    for (const s of shuffle([...stars], rnd)) {
      if (!free.has(s)) continue;
      free.delete(s);
      // breadth-first search to the nearest unpaired star, not stepping on other stars or claimed cells
      const prev = new Map<number, number>([[s, -1]]), q = [s];
      let found = -1;
      while (q.length && found < 0) {
        const x = q.shift()!;
        for (const y of shuffle(nbrs(n, x), rnd)) {
          if (prev.has(y) || region[y] >= 0) continue;
          if (isStar.has(y)) { if (free.has(y)) { prev.set(y, x); found = y; break; } continue; }
          prev.set(y, x); q.push(y);
        }
      }
      if (found < 0) return null;
      free.delete(found);
      const g = groups.length, path: number[] = [];
      for (let x = found; x !== -1; x = prev.get(x)!) path.push(x);
      path.forEach((x) => (region[x] = g));
      groups.push(path);
    }
  }
  groups.forEach((cells, g) => cells.forEach((x) => (region[x] = g)));
  // flood: repeatedly let a random region grab a random free neighbour (smaller regions get more turns)
  let freeCount = region.filter((g) => g < 0).length;
  const size = groups.map((g) => g.length);
  while (freeCount > 0) {
    // one random key per region, drawn before sorting, so every JS engine consumes the RNG identically
    const key = size.map((s) => s + rnd() * 6);
    const order = [...Array(n).keys()].sort((a, b) => key[a] - key[b] || a - b);
    let grew = false;
    for (const g of order) {
      const frontier: number[] = [];
      for (let i = 0; i < n * n; i++) if (region[i] === g) for (const y of nbrs(n, i)) if (region[y] < 0) frontier.push(y);
      if (!frontier.length) continue;
      const y = frontier[Math.floor(rnd() * frontier.length)];
      region[y] = g; size[g]++; freeCount--; grew = true; break;
    }
    if (!grew) return null;
  }
  return region;
}

/** Whether a region stays connected without cell i. */
function stillConnected(n: number, region: number[], i: number) {
  const g = region[i], cells = [];
  for (let x = 0; x < n * n; x++) if (region[x] === g && x !== i) cells.push(x);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), q = [cells[0]];
  while (q.length) { const x = q.shift()!; for (const y of nbrs(n, x)) if (y !== i && region[y] === g && !seen.has(y)) { seen.add(y); q.push(y); } }
  return seen.size === cells.length;
}

/**
 * A puzzle with exactly one solution, or null if this seed didn't converge (callers retry with another seed).
 * Limits are attempt counts, not time, so the same seed gives the same puzzle on every device.
 */
export function generateStars(n: number, k: number, rnd: Rnd, attempts = 30): StarsPuzzle | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stars = randomLayout(n, k, rnd);
    if (!stars) continue;
    const grown = growRegions(n, k, stars, rnd);
    if (!grown) continue;
    let regions: number[] = grown;
    const isStar = new Set(stars);
    let res = solveStars(n, k, regions, 40);
    // reshape: move boundary cells between regions while the number of solutions doesn't go up
    for (let it = 0; it < 400 && res.count !== 1; it++) {
      const i = Math.floor(rnd() * n * n);
      if (isStar.has(i)) continue;
      const others = nbrs(n, i).map((y) => regions[y]).filter((g) => g !== regions[i]);
      if (!others.length || !stillConnected(n, regions, i)) continue;
      const next = [...regions]; next[i] = others[Math.floor(rnd() * others.length)];
      const r2 = solveStars(n, k, next, 40);
      if (r2.count >= 1 && !r2.aborted && r2.count <= res.count) { regions = next; res = r2; }
    }
    if (res.count === 1 && !res.aborted) return { n, k, regions, solution: [...stars].sort((a, b) => a - b) };
  }
  return null;
}

/** Problems with a set of stars: over-full rows/columns/regions and touching stars (cell indices to flag). */
export function starConflicts(p: Pick<StarsPuzzle, "n" | "k" | "regions">, stars: Set<number>) {
  const { n, k, regions } = p, bad = new Set<number>(), rows = new Map<number, number[]>(), cols = new Map<number, number[]>(), regs = new Map<number, number[]>();
  for (const s of stars) {
    const r = Math.floor(s / n), c = s % n;
    for (const [m, key] of [[rows, r], [cols, c], [regs, regions[s]]] as const) { if (!m.has(key)) m.set(key, []); m.get(key)!.push(s); }
    for (const t of stars) if (t !== s && Math.abs(Math.floor(t / n) - r) <= 1 && Math.abs((t % n) - c) <= 1) bad.add(s);
  }
  for (const m of [rows, cols, regs]) for (const cells of m.values()) if (cells.length > k) cells.forEach((x) => bad.add(x));
  return bad;
}
export const starsSolved = (p: StarsPuzzle, stars: Set<number>) => stars.size === p.n * p.k && starConflicts(p, stars).size === 0;

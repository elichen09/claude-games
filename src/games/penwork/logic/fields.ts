/*
 * Fields: colour every cell green or blue. Each connected patch of one colour is a field, and every field holds
 * exactly one number: its size. The generator paints organic blobs, numbers each one, then pre-colours a few cells
 * wherever the solver finds a second solution, until the puzzle has exactly one. Pure logic, no DOM.
 */
import { shuffle, type Rnd } from "./stars";

export type Color = 0 | 1 | 2; // 0 unknown, 1 green, 2 blue
export interface FieldsPuzzle { n: number; nums: number[]; givens: Color[]; solution: Color[] }

const nbrs = (n: number, i: number) => { const r = Math.floor(i / n), c = i % n, out: number[] = []; if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n); if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1); return out; };

/** Connected same-coloured groups of known cells. */
export function fieldsOf(n: number, colors: Color[]) {
  const id = new Array(n * n).fill(-1), groups: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    if (!colors[i] || id[i] >= 0) continue;
    const g = groups.length, cells = [i]; id[i] = g;
    for (let q = 0; q < cells.length; q++) for (const y of nbrs(n, cells[q])) if (id[y] < 0 && colors[y] === colors[i]) { id[y] = g; cells.push(y); }
    groups.push(cells);
  }
  return { id, groups };
}

/** False if the partial colouring already breaks a rule. */
function consistent(n: number, nums: number[], colors: Color[]) {
  const { groups } = fieldsOf(n, colors);
  for (const cells of groups) {
    let numbers = 0, target = 0, open = false;
    for (const x of cells) {
      if (nums[x]) { numbers++; target = nums[x]; }
      if (!open) for (const y of nbrs(n, x)) if (!colors[y]) { open = true; break; }
    }
    if (numbers > 1 || (numbers === 1 && cells.length > target)) return false;
    if (!open && (numbers !== 1 || cells.length !== target)) return false;
    // an open numbered field must be able to reach its size through unknown cells
    if (numbers === 1 && open && cells.length < target) {
      const seen = new Set(cells), q = [...cells];
      let room = cells.length;
      for (let i = 0; i < q.length && room < target; i++) for (const y of nbrs(n, q[i])) if (!seen.has(y) && (!colors[y] || colors[y] === colors[cells[0]])) { seen.add(y); q.push(y); room++; }
      if (room < target) return false;
    }
  }
  return true;
}

/** Check one field (the group of same-coloured known cells containing x) against the rules. */
function fieldOK(n: number, nums: number[], colors: Color[], x: number) {
  const col = colors[x], cells = [x], seen = new Set([x]);
  let numbers = 0, target = 0, open = false;
  for (let q = 0; q < cells.length; q++) {
    const c = cells[q];
    if (nums[c]) { numbers++; target = nums[c]; if (numbers > 1) return false; }
    for (const y of nbrs(n, c)) {
      if (!colors[y]) open = true;
      else if (colors[y] === col && !seen.has(y)) { seen.add(y); cells.push(y); }
    }
    if (numbers === 1 && cells.length > target) return false;
  }
  if (!open) return numbers === 1 && cells.length === target;
  if (numbers === 1 && cells.length < target) {
    // can it still grow to its size through unknown cells?
    const reach = new Set(cells), q = [...cells];
    for (let i = 0; i < q.length && reach.size < target; i++) for (const y of nbrs(n, q[i])) if (!reach.has(y) && (!colors[y] || colors[y] === col)) { reach.add(y); q.push(y); }
    if (reach.size < target) return false;
  }
  return true;
}
/** After colouring cell i: its own field, and the neighbouring fields it may have closed off, must still be fine. */
const localOK = (n: number, nums: number[], colors: Color[], i: number) => fieldOK(n, nums, colors, i) && nbrs(n, i).every((y) => !colors[y] || colors[y] === colors[i] || fieldOK(n, nums, colors, y));

/**
 * Fill in every cell whose colour is forced: if one colour breaks a rule, it must be the other. Returns false on a
 * contradiction. This is most of how a person solves it, so most puzzles need little or no guessing.
 */
function propagate(n: number, nums: number[], colors: Color[]) {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < n * n; i++) {
      if (colors[i]) continue;
      colors[i] = 1; const g = localOK(n, nums, colors, i);
      colors[i] = 2; const b = localOK(n, nums, colors, i);
      colors[i] = 0;
      if (!g && !b) return false;
      if (g !== b) { colors[i] = g ? 1 : 2; changed = true; }
    }
  }
  return true;
}

/** Up to `limit` solutions; gives up after nodeLimit guesses (aborted = true). */
export function solveFields(n: number, nums: number[], givens: Color[], limit = 2, nodeLimit = 4000) {
  const found: Color[][] = [];
  let nodes = 0;
  const go = (colors: Color[]): void => {
    if (found.length >= limit || nodes > nodeLimit) return;
    if (!propagate(n, nums, colors)) return;
    // guess at the unknown cell with the most coloured neighbours
    let best = -1, bestScore = -1;
    for (let i = 0; i < n * n; i++) if (!colors[i]) { const sc = nbrs(n, i).filter((y) => colors[y]).length; if (sc > bestScore) { bestScore = sc; best = i; } }
    if (best < 0) { if (consistent(n, nums, colors)) found.push(colors); return; }
    for (const c of [1, 2] as Color[]) {
      nodes++;
      const next = [...colors] as Color[]; next[best] = c;
      go(next);
      if (found.length >= limit || nodes > nodeLimit) return;
    }
  };
  if (consistent(n, nums, givens)) go([...givens] as Color[]);
  return { solutions: found, aborted: nodes > nodeLimit };
}

/** Organic two-colour blobs: grow from random coloured seeds; touching same-colour blobs merge into one field. */
function paint(n: number, maxSize: number, rnd: Rnd): Color[] | null {
  for (let tries = 0; tries < 300; tries++) {
    const owner = new Array(n * n).fill(-1), seeds = Math.round((n * n) / 2.6), color: Color[] = [];
    const cells = shuffle([...Array(n * n).keys()], rnd).slice(0, seeds);
    cells.forEach((x, s) => { owner[x] = s; color.push(rnd() < 0.5 ? 1 : 2); });
    for (let left = n * n - seeds; left > 0; ) {
      const x = Math.floor(rnd() * n * n);
      if (owner[x] >= 0) continue;
      const taken = nbrs(n, x).filter((y) => owner[y] >= 0);
      if (!taken.length) continue;
      owner[x] = owner[taken[Math.floor(rnd() * taken.length)]]; left--;
    }
    const c = owner.map((o) => color[o]) as Color[];
    const { groups } = fieldsOf(n, c);
    const ones = groups.filter((g) => g.length === 1).length;
    if (groups.every((g) => g.length <= maxSize) && ones <= Math.ceil(n / 2) && groups.length >= n + 2) return c;
  }
  return null;
}

/** Limits are attempt counts, not time, so the same seed gives the same puzzle on every device. */
export function generateFields(n: number, rnd: Rnd, attempts = 25): FieldsPuzzle | null {
  const maxSize = n <= 5 ? 5 : n <= 6 ? 7 : 9;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = paint(n, maxSize, rnd);
    if (!solution) continue;
    const nums = new Array(n * n).fill(0);
    for (const cells of fieldsOf(n, solution).groups) nums[cells[Math.floor(rnd() * cells.length)]] = cells.length;
    const givens: Color[] = new Array(n * n).fill(0);
    // pin down ambiguity: colour in one cell where another solution disagrees, until only one remains
    for (let it = 0; it < n * 2; it++) {
      const { solutions, aborted } = solveFields(n, nums, givens, 2);
      if (!aborted && solutions.length === 1) return { n, nums, givens, solution };
      const other = solutions.find((sol) => sol.some((v, i) => v !== solution[i]));
      const diff = other ? [...other.keys()].filter((i) => other[i] !== solution[i] && !givens[i]) : [...solution.keys()].filter((i) => !givens[i] && !nums[i]);
      if (!diff.length) break;
      const i = diff[Math.floor(rnd() * diff.length)];
      givens[i] = solution[i];
    }
  }
  return null;
}

/** Cells in fields that break a rule (two numbers, too big, or closed at the wrong size). */
export function fieldErrors(n: number, nums: number[], colors: Color[]) {
  const bad = new Set<number>();
  for (const cells of fieldsOf(n, colors).groups) {
    const numbered = cells.filter((x) => nums[x]), open = cells.some((x) => nbrs(n, x).some((y) => !colors[y]));
    const wrong = numbered.length > 1 || (numbered.length === 1 && cells.length > nums[numbered[0]]) || (!open && (numbered.length !== 1 || cells.length !== nums[numbered[0]]));
    if (wrong) cells.forEach((x) => bad.add(x));
  }
  return bad;
}
export const fieldsSolved = (p: FieldsPuzzle, colors: Color[]) => colors.every((c) => c) && fieldErrors(p.n, p.nums, colors).size === 0;

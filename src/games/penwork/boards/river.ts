/*
 * River board: meadow tiles with water drawn between them. Drag through cells to lay river (drag back over it to
 * erase); tap the side between two cells to cycle river → ✕ → empty; right-click a side for ✕. Given stretches are
 * deep blue and fixed. Hint applies the next deduction a person could make and says why.
 */
import { cellEdges, edgeBetween, edgeCells, edgeCount, isSingleLoop, nextStep, type Marks, type RiverPuzzle } from "../logic/river";
import { History, type Board } from "../shell";

const SVG = "http://www.w3.org/2000/svg";
const S = 10; // svg units per cell

interface State { on: Set<number>; x: Set<number> }

export function riverBoard(p: RiverPuzzle, solved: () => void, changed: () => void): Board {
  const { n } = p, clues = new Set(p.clues), sol = new Set(p.solution), ce = cellEdges(n), E = edgeCount(n);
  let st: State = { on: new Set(p.clues), x: new Set() };
  const copy = (s: State): State => ({ on: new Set(s.on), x: new Set(s.x) });
  const same = (a: State, b: State) => a.on.size === b.on.size && a.x.size === b.x.size && [...a.on].every((e) => b.on.has(e)) && [...a.x].every((e) => b.x.has(e));
  const hist = new History<State>(copy);
  const el = document.createElement("div");
  el.className = "pw-river";
  el.innerHTML = `<svg viewBox="-1.5 -1.5 ${n * S + 3} ${n * S + 3}" role="img" aria-label="River: draw one loop through every cell"></svg><p class="pw-loops" aria-live="polite"></p>`;
  const svg = el.querySelector("svg")!, loopsMsg = el.querySelector<HTMLElement>(".pw-loops")!;
  const mk = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent.appendChild(e); return e; };
  const center = (i: number) => [(i % n) * S + S / 2, Math.floor(i / n) * S + S / 2];

  mk("rect", { x: -1.5, y: -1.5, width: n * S + 3, height: n * S + 3, class: "pw-river-frame" });
  const tiles: SVGElement[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    tiles.push(mk("rect", { x: c * S + 0.3, y: r * S + 0.3, width: S - 0.6, height: S - 0.6, rx: 1, class: "pw-tile" + ((r + c) % 2 ? " alt" : "") }));
  }
  const layer = (cls: string) => mk("g", { class: cls });
  // banks under water under ripples, so neighbouring stretches merge into one channel; given water sits on top
  const gCross = layer("pw-crosses"), gBank = layer("pw-banks"), gWater = layer("pw-water"), gGiven = layer("pw-water"), gRipple = layer("pw-ripples");
  const banks: SVGElement[] = [], waters: SVGElement[] = [], ripples: SVGElement[] = [], crosses: SVGElement[] = [];
  for (let e = 0; e < E; e++) {
    const [a, b] = edgeCells(n, e), [x1, y1] = center(a), [x2, y2] = center(b), given = clues.has(e) ? " given" : "";
    banks.push(mk("line", { x1, y1, x2, y2, class: "pw-bank" + given }, gBank));
    waters.push(mk("line", { x1, y1, x2, y2, class: "pw-wet" + given }, given ? gGiven : gWater));
    ripples.push(mk("line", { x1, y1, x2, y2, class: "pw-ripple" }, gRipple));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, d = 1.3;
    crosses.push(mk("path", { d: `M${mx - d} ${my - d}L${mx + d} ${my + d}M${mx + d} ${my - d}L${mx - d} ${my + d}`, class: "pw-cross" }, gCross));
  }
  const flow = mk("path", { class: "pw-flow", d: "" });

  const adjOf = (on: Set<number>) => { const adj: number[][] = Array.from({ length: n * n }, () => []); for (const e of on) { const [a, b] = edgeCells(n, e); adj[a].push(b); adj[b].push(a); } return adj; };

  function render() {
    const adj = adjOf(st.on);
    for (let e = 0; e < E; e++) {
      const on = st.on.has(e);
      banks[e].classList.toggle("on", on); waters[e].classList.toggle("on", on); ripples[e].classList.toggle("on", on);
      crosses[e].classList.toggle("on", st.x.has(e));
    }
    tiles.forEach((t, i) => t.classList.toggle("bad", adj[i].length > 2));
    let msg = "";
    if (adj.every((a) => a.length === 2) && !isSingleLoop(n, st.on)) {
      const seen = new Set<number>(); let loops = 0;
      for (let i = 0; i < n * n; i++) if (!seen.has(i)) { loops++; const q = [i]; seen.add(i); while (q.length) for (const y of adj[q.pop()!]) if (!seen.has(y)) { seen.add(y); q.push(y); } }
      msg = `That's ${loops} separate loops. The river has to be one.`;
    }
    loopsMsg.textContent = msg;
    changed();
    if (isSingleLoop(n, st.on)) win(adj);
  }

  function win(adj: number[][]) {
    // trace the loop in order so the water can flow along it
    const order = [0]; let prev = -1, cur = 0;
    do { const next = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0]; prev = cur; cur = next; order.push(cur); } while (cur !== 0);
    flow.setAttribute("d", "M" + order.map((i) => center(i).join(" ")).join(" L") + " Z");
    crosses.forEach((x) => x.classList.remove("on"));
    el.classList.add("won");
    solved();
  }

  const flash = (e: number, cls: string) => {
    for (const node of [banks[e], waters[e], crosses[e]]) { node.classList.remove(cls); void (node as unknown as HTMLElement).getBoundingClientRect(); node.classList.add(cls); }
  };
  /** Set a side to river (1), ✕ (-1) or empty (0). Returns whether anything changed. */
  const setEdge = (e: number, v: 1 | -1 | 0) => {
    if (clues.has(e)) return false;
    const was = st.on.has(e) ? 1 : st.x.has(e) ? -1 : 0;
    if (was === v) return false;
    st.on.delete(e); st.x.delete(e);
    if (v === 1) st.on.add(e); else if (v === -1) st.x.add(e);
    return true;
  };

  // input
  const at = (e: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return { i: -1, x: 0, y: 0 };
    const q = pt.matrixTransform(m.inverse()), c = Math.floor(q.x / S), r = Math.floor(q.y / S);
    return { i: c >= 0 && c < n && r >= 0 && r < n ? r * n + c : -1, x: q.x, y: q.y };
  };
  /** The side nearest a point, if the point is reasonably close to it. */
  const sideAt = (x: number, y: number) => {
    let best = -1, bestD = 0.42 * S;
    for (let e = 0; e < E; e++) {
      const [a, b] = edgeCells(n, e), [x1, y1] = center(a), [x2, y2] = center(b), d = Math.hypot(x - (x1 + x2) / 2, y - (y1 + y2) / 2);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };
  let drag: { last: number; mode: 1 | 0 | null; before: State; moved: boolean; x: number; y: number } | null = null;
  svg.addEventListener("pointerdown", (e) => {
    if (el.classList.contains("won")) return;
    const { i, x, y } = at(e);
    if (i < 0) return;
    e.preventDefault();
    if (e.button === 2) { // right-click a side: toggle ✕
      const side = sideAt(x, y), before = copy(st);
      if (side >= 0 && setEdge(side, st.x.has(side) ? 0 : -1)) { hist.push(before); render(); }
      return;
    }
    svg.setPointerCapture(e.pointerId);
    drag = { last: i, mode: null, before: copy(st), moved: false, x, y };
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { i } = at(e);
    if (i < 0 || i === drag.last) return;
    // walk one cell at a time so a fast drag doesn't skip any
    let any = false;
    while (drag.last !== i) {
      const lr = Math.floor(drag.last / n), lc = drag.last % n, tr = Math.floor(i / n), tc = i % n;
      const next = lc !== tc ? drag.last + Math.sign(tc - lc) : drag.last + n * Math.sign(tr - lr);
      const edge = edgeBetween(n, drag.last, next);
      if (edge >= 0 && !clues.has(edge)) {
        if (drag.mode === null) drag.mode = st.on.has(edge) ? 0 : 1;
        if (setEdge(edge, drag.mode)) any = true;
      }
      drag.last = next;
    }
    drag.moved = true;
    if (any) render();
  });
  svg.addEventListener("pointerup", () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.moved) { if (!same(d.before, st)) hist.push(d.before); return; }
    // a tap on a side cycles river → ✕ → empty
    const side = sideAt(d.x, d.y);
    if (side >= 0 && setEdge(side, st.on.has(side) ? -1 : st.x.has(side) ? 0 : 1)) { hist.push(d.before); render(); }
  });
  svg.addEventListener("pointercancel", () => { if (drag && !same(drag.before, st)) hist.push(drag.before); drag = null; });
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  const wrongMarks = () => [...Array(E).keys()].filter((e) => (st.on.has(e) && !sol.has(e)) || (st.x.has(e) && sol.has(e)));

  render();
  return {
    el,
    undo() { const s = hist.pop(); if (s) { st = s; render(); } },
    clear() { hist.push(st); st = { on: new Set(p.clues), x: new Set() }; render(); },
    check() { const wrong = wrongMarks(); wrong.forEach((e) => flash(e, "wrong")); return wrong.length; },
    hint() {
      const wrong = wrongMarks();
      if (wrong.length) { wrong.forEach((e) => flash(e, "wrong")); return `Fix ${wrong.length === 1 ? "the mark" : `the ${wrong.length} marks`} flashing red first.`; }
      const marks: Marks = new Array(E).fill(0);
      for (const e of st.on) marks[e] = 1;
      for (const e of st.x) marks[e] = -1;
      const step = nextStep(n, marks, ce) ?? nextStep(n, marks, ce, true);
      const before = copy(st);
      const edge = step ? step.edge : p.solution.find((x) => !st.on.has(x))!;
      setEdge(edge, step ? step.value : 1);
      hist.push(before); render(); flash(edge, "hinted");
      return step ? step.why : "Here's a stretch of the river.";
    },
    destroy() {},
  };
}

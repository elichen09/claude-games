/*
 * River board: drag through cells to lay river, drag back over it to erase, or tap between two dots to toggle one
 * stretch. Clue stretches are inked in and can't be removed. When it's one loop through every cell, the water flows.
 */
import { edgeBetween, edgeCells, edgeCount, isSingleLoop, type RiverPuzzle } from "../logic/river";
import { History, type Board } from "../shell";

const SVG = "http://www.w3.org/2000/svg";
const S = 10; // svg units per cell

export function riverBoard(p: RiverPuzzle, solved: () => void, changed: () => void): Board {
  const { n } = p, clues = new Set(p.clues), sol = new Set(p.solution);
  let on = new Set<number>(p.clues);
  const hist = new History<Set<number>>((s) => new Set(s));
  const el = document.createElement("div");
  el.className = "pw-river";
  el.innerHTML = `<svg viewBox="-2 -2 ${n * S + 4} ${n * S + 4}" role="img" aria-label="River: draw one loop through every cell"></svg><p class="pw-loops" aria-live="polite"></p>`;
  const svg = el.querySelector("svg")!, loopsMsg = el.querySelector<HTMLElement>(".pw-loops")!;
  const mk = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent.appendChild(e); return e; };
  const center = (i: number) => [(i % n) * S + S / 2, Math.floor(i / n) * S + S / 2];

  mk("rect", { x: -2, y: -2, width: n * S + 4, height: n * S + 4, class: "pw-river-bg" });
  for (let k = 1; k < n; k++) { mk("line", { x1: k * S, y1: 0, x2: k * S, y2: n * S, class: "pw-river-grid" }); mk("line", { x1: 0, y1: k * S, x2: n * S, y2: k * S, class: "pw-river-grid" }); }
  const lines: SVGElement[] = [];
  for (let e = 0; e < edgeCount(n); e++) {
    const [a, b] = edgeCells(n, e), [x1, y1] = center(a), [x2, y2] = center(b);
    lines.push(mk("line", { x1, y1, x2, y2, class: "pw-edge" + (clues.has(e) ? " clue" : "") }));
  }
  const dots: SVGElement[] = [];
  for (let i = 0; i < n * n; i++) { const [cx, cy] = center(i); dots.push(mk("circle", { cx, cy, r: 1.1, class: "pw-dot" })); }
  const flow = mk("path", { class: "pw-flow", d: "" });

  function render() {
    const deg = new Array(n * n).fill(0);
    for (const e of on) { const [a, b] = edgeCells(n, e); deg[a]++; deg[b]++; }
    lines.forEach((l, e) => { l.classList.toggle("on", on.has(e)); });
    dots.forEach((d, i) => { d.classList.toggle("bad", deg[i] > 2); d.classList.toggle("full", deg[i] === 2); });
    // all cells full but more than one loop: say so
    let msg = "";
    if (deg.every((d) => d === 2) && !isSingleLoop(n, on)) {
      const seen = new Set<number>(); let loops = 0;
      const adj: number[][] = Array.from({ length: n * n }, () => []);
      for (const e of on) { const [a, b] = edgeCells(n, e); adj[a].push(b); adj[b].push(a); }
      for (let i = 0; i < n * n; i++) if (!seen.has(i)) { loops++; const q = [i]; seen.add(i); while (q.length) for (const y of adj[q.pop()!]) if (!seen.has(y)) { seen.add(y); q.push(y); } }
      msg = `That's ${loops} separate loops. The river has to be one.`;
    }
    loopsMsg.textContent = msg;
    changed();
    if (isSingleLoop(n, on)) win();
  }

  function win() {
    // trace the loop in order so the water can flow along it
    const adj: number[][] = Array.from({ length: n * n }, () => []);
    for (const e of on) { const [a, b] = edgeCells(n, e); adj[a].push(b); adj[b].push(a); }
    const order = [0]; let prev = -1, cur = 0;
    do { const next = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0]; prev = cur; cur = next; order.push(cur); } while (cur !== 0);
    flow.setAttribute("d", "M" + order.map((i) => center(i).join(" ")).join(" L") + " Z");
    el.classList.add("won");
    solved();
  }

  // input
  const cellAt = (e: PointerEvent) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return { i: -1, x: 0, y: 0 };
    const q = pt.matrixTransform(m.inverse()), c = Math.floor(q.x / S), r = Math.floor(q.y / S);
    return { i: c >= 0 && c < n && r >= 0 && r < n ? r * n + c : -1, x: q.x, y: q.y };
  };
  let drag: { last: number; mode: "add" | "remove" | null; moved: boolean } | null = null;
  svg.addEventListener("pointerdown", (e) => {
    if (el.classList.contains("won")) return;
    const { i } = cellAt(e);
    if (i < 0) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    hist.push(on);
    drag = { last: i, mode: null, moved: false };
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { i } = cellAt(e);
    if (i < 0 || i === drag.last) return;
    const edge = edgeBetween(n, drag.last, i);
    if (edge >= 0 && !clues.has(edge)) {
      if (!drag.mode) drag.mode = on.has(edge) ? "remove" : "add";
      if (drag.mode === "add") on.add(edge); else on.delete(edge);
      drag.moved = true; render();
    }
    drag.last = i;
  });
  svg.addEventListener("pointerup", (e) => {
    const d = drag; drag = null;
    if (!d || d.moved) return;
    // a tap: toggle the stretch closest to where you tapped, if it's near a cell edge
    const { x, y } = cellAt(e), c = Math.floor(x / S), r = Math.floor(y / S), fx = x / S - c, fy = y / S - r;
    const sides: [number, number][] = [[fx, 1], [1 - fx, -1], [fy, n], [1 - fy, -n]]; // distance to each side, and the step to that neighbour
    const [dist, step] = sides.sort((a, b) => a[0] - b[0])[0];
    const i = r * n + c, j = Math.abs(step) === 1 ? (step === 1 ? i - 1 : i + 1) : step === n ? i - n : i + n;
    if (dist > 0.3 || j < 0 || j >= n * n || (Math.abs(step) === 1 && Math.floor(j / n) !== r)) return;
    const edge = edgeBetween(n, i, j);
    if (edge < 0 || clues.has(edge)) return;
    if (on.has(edge)) on.delete(edge); else on.add(edge);
    render();
  });
  svg.addEventListener("pointercancel", () => (drag = null));
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  render();
  return {
    el,
    undo() { const s = hist.pop(); if (s) { on = s; render(); } },
    clear() { hist.push(on); on = new Set(p.clues); render(); },
    check() {
      let wrong = 0;
      lines.forEach((l, e) => { if (on.has(e) && !sol.has(e)) { wrong++; l.classList.remove("wrong"); void (l as unknown as HTMLElement).getBoundingClientRect(); l.classList.add("wrong"); } });
      return wrong;
    },
    destroy() {},
  };
}

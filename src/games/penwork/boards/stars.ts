/* Stars board: tap cycles empty → dot → star; drag from an empty cell paints dots; right-click or long-press toggles a star. */
import { starConflicts, starsSolved, type StarsPuzzle } from "../logic/stars";
import { History, type Board } from "../shell";

/** Bright paper pastels, picked to stay apart from each other, so the board reads the same in every world. */
const PASTELS = ["#f7c59f", "#b8dcf5", "#c8e6a8", "#f5b3c8", "#f9e79a", "#d2c1f2", "#a6e3d6", "#e0cfb1", "#f4a6a0", "#cfd8dc"];
export const regionColors = (n: number) => PASTELS.slice(0, n);

export function starsBoard(p: StarsPuzzle, solved: () => void, changed: () => void): Board {
  const { n, k, regions } = p, sol = new Set(p.solution);
  let state: number[] = new Array(n * n).fill(0); // 0 empty, 1 dot, 2 star
  const hist = new History<number[]>((s) => [...s]);
  const el = document.createElement("div");
  el.className = "pw-grid pw-stars";
  el.style.setProperty("--n", String(n));
  el.setAttribute("role", "grid");
  el.setAttribute("aria-label", `Stars: ${k} per row, column and region`);
  const colors = regionColors(n);
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n, b = document.createElement("button");
    b.type = "button"; b.className = "pw-cell"; b.dataset.i = String(i);
    b.style.background = colors[regions[i]];
    // thick ink where the region changes
    if (r === 0 || regions[i - n] !== regions[i]) b.classList.add("bt");
    if (r === n - 1 || regions[i + n] !== regions[i]) b.classList.add("bb");
    if (c === 0 || regions[i - 1] !== regions[i]) b.classList.add("bl");
    if (c === n - 1 || regions[i + 1] !== regions[i]) b.classList.add("br");
    b.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
    cells.push(b); el.appendChild(b);
  }

  function render() {
    const stars = new Set<number>(); state.forEach((v, i) => v === 2 && stars.add(i));
    const bad = starConflicts(p, stars);
    cells.forEach((b, i) => {
      const v = state[i];
      b.textContent = v === 2 ? "★" : "";
      b.classList.toggle("star", v === 2); b.classList.toggle("dot", v === 1); b.classList.toggle("bad", bad.has(i));
    });
    changed();
    if (starsSolved(p, stars)) { el.classList.add("won"); solved(); }
  }

  // input: drag paints dots when it starts on an empty cell
  let painting = false, pressTimer = 0, longPressed = false;
  const cellAt = (x: number, y: number) => { const t = document.elementFromPoint(x, y) as HTMLElement | null; return t?.closest<HTMLElement>(".pw-cell") && el.contains(t) ? +t.closest<HTMLElement>(".pw-cell")!.dataset.i! : -1; };
  el.addEventListener("pointerdown", (e) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || el.classList.contains("won")) return;
    if (e.button === 2) return; // handled by contextmenu
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    hist.push(state);
    longPressed = false;
    clearTimeout(pressTimer);
    const before = state[i]; // a long press toggles the star relative to how the cell was before the press
    pressTimer = window.setTimeout(() => { longPressed = true; painting = false; state[i] = before === 2 ? 0 : 2; render(); }, 450);
    if (state[i] === 0) { state[i] = 1; painting = true; } else if (state[i] === 1) state[i] = 2; else state[i] = 0;
    render();
  });
  el.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0 && state[i] === 0) { clearTimeout(pressTimer); state[i] = 1; render(); }
  });
  const end = () => { painting = false; clearTimeout(pressTimer); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || longPressed || el.classList.contains("won")) return;
    hist.push(state); state[i] = state[i] === 2 ? 0 : 2; render();
  });

  render();
  return {
    el,
    undo() { const s = hist.pop(); if (s) { state = s; render(); } },
    clear() { hist.push(state); state = new Array(n * n).fill(0); render(); },
    check() {
      let wrong = 0;
      cells.forEach((b, i) => { const bad = (state[i] === 2 && !sol.has(i)) || (state[i] === 1 && sol.has(i)); if (bad) { wrong++; b.classList.remove("wrong"); void b.offsetWidth; b.classList.add("wrong"); } });
      return wrong;
    },
    destroy() { clearTimeout(pressTimer); },
  };
}

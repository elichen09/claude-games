/* Fields board: tap cycles blank → green → blue; drag paints the colour you started with. Pre-coloured cells are locked. */
import { fieldErrors, fieldsSolved, type Color, type FieldsPuzzle } from "../logic/fields";
import { History, lightWorld, type Board } from "../shell";

export function fieldsBoard(p: FieldsPuzzle, solved: () => void, changed: () => void): Board {
  const { n } = p;
  let colors = [...p.givens] as Color[];
  const hist = new History<Color[]>((s) => [...s]);
  const el = document.createElement("div");
  el.className = "pw-grid pw-fields" + (lightWorld() ? "" : " dark");
  el.style.setProperty("--n", String(n));
  el.setAttribute("role", "grid");
  el.setAttribute("aria-label", "Fields: colour every cell green or blue");
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < n * n; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pw-cell"; b.dataset.i = String(i);
    if (p.nums[i]) b.textContent = String(p.nums[i]);
    if (p.givens[i]) b.classList.add("given");
    b.setAttribute("aria-label", `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${p.nums[i] ? `, field of ${p.nums[i]}` : ""}`);
    cells.push(b); el.appendChild(b);
  }

  function render() {
    const bad = fieldErrors(n, p.nums, colors);
    cells.forEach((b, i) => {
      b.classList.toggle("g", colors[i] === 1); b.classList.toggle("u", colors[i] === 2); b.classList.toggle("bad", bad.has(i));
      // a thin seam between neighbouring cells of different colours makes the fields read as shapes
      const r = Math.floor(i / n), c = i % n, col = colors[i];
      b.classList.toggle("sr", !!col && c < n - 1 && !!colors[i + 1] && colors[i + 1] !== col);
      b.classList.toggle("sb", !!col && r < n - 1 && !!colors[i + n] && colors[i + n] !== col);
    });
    changed();
    if (fieldsSolved(p, colors)) { el.classList.add("won"); solved(); }
  }

  let paint: Color | null = null;
  const cellAt = (x: number, y: number) => { const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(".pw-cell"); return t && el.contains(t) ? +t.dataset.i! : -1; };
  el.addEventListener("pointerdown", (e) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || p.givens[i] || el.classList.contains("won")) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    hist.push(colors);
    colors[i] = ((colors[i] + 1) % 3) as Color;
    paint = colors[i];
    render();
  });
  el.addEventListener("pointermove", (e) => {
    if (paint === null) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0 && !p.givens[i] && colors[i] !== paint) { colors[i] = paint; render(); }
  });
  const end = () => (paint = null);
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  render();
  return {
    el,
    undo() { const s = hist.pop(); if (s) { colors = s; render(); } },
    clear() { hist.push(colors); colors = [...p.givens] as Color[]; render(); },
    check() {
      let wrong = 0;
      cells.forEach((b, i) => { if (colors[i] && colors[i] !== p.solution[i]) { wrong++; b.classList.remove("wrong"); void b.offsetWidth; b.classList.add("wrong"); } });
      return wrong;
    },
    destroy() {},
  };
}

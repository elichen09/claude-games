/* Population Hills: the world extruded by population density. Name the country whose hills glow. */
import { geoEquirectangular, geoPath } from "d3-geo";
import { COUNTRIES, pick, type Country } from "../geo";
import { animate, canvasPoint, darken, ease, label, palette, pixelCanvas, type Palette } from "../pixel";
import { esc, guessBox, type ModeDef } from "../ui";

const CELL = 3, COLS = 360 / CELL, ROWS = 150 / CELL; // 3° cells from 90°N to 60°S (Antarctica left out)
const CAP = 1300, TRIES = 3, POINTS = [1000, 600, 300];
interface Cell { i: number; j: number; c: Country }
interface Spec { country: Country }

let grid: Cell[] | null = null;
/** Which country fills each 3° cell, found by painting every country in a unique color and reading the pixels back. */
function buildGrid(): Cell[] {
  if (grid) return grid;
  const w = 360, h = 180, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently: true })!, path = geoPath(geoEquirectangular().fitSize([w, h], { type: "Sphere" }), g);
  const code = (i: number) => [i, (i * 37) % 256, (i * 91 + 13) % 256], lookup = new Map<string, Country>();
  COUNTRIES.forEach((c, i) => { const [r, gg, b] = code(i + 1); lookup.set(`${r},${gg},${b}`, c); g.beginPath(); path(c.shape); g.fillStyle = `rgb(${r},${gg},${b})`; g.fill(); });
  const px = g.getImageData(0, 0, w, h).data, out: Cell[] = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const x = i * CELL + 1, y = j * CELL + 1, o = (y * w + x) * 4;
    if (px[o + 3] < 255) continue;
    const c = lookup.get(`${px[o]},${px[o + 1]},${px[o + 2]}`); // blended edge pixels match nothing and are skipped
    if (c && c.key !== "Antarctica") out.push({ i, j, c });
  }
  return (grid = out);
}
const heightOf = (c: Country) => Math.sqrt(Math.min(c.density, CAP) / CAP);

export const HILLS: ModeDef<Spec> = {
  id: "hills",
  name: "Population Hills",
  tagline: "The world, extruded by crowding",
  how: "Every country rises by how many people live per square kilometre. Drag to spin the map, then name the country that's glowing.",
  rounds: 5,
  prepare(rnd) {
    const cells = buildGrid(), counts = new Map<Country, number>();
    for (const c of cells) counts.set(c.c, (counts.get(c.c) || 0) + 1);
    const cands = [...counts.keys()].filter((c) => c.sovereign && c.pop >= 2 && counts.get(c)! >= 4);
    return pick(cands, 5, rnd, (c) => (c.pop >= 20 ? 1 : 0.5)).map((country) => ({ country }));
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, target = spec.country, cells = buildGrid();
    const sov = COUNTRIES.filter((c) => c.sovereign && c.key !== "Antarctica"), world = sov.reduce((s, c) => s + c.pop * 1e6, 0) / sov.reduce((s, c) => s + c.areaKm2, 0);
    const rank = [...sov].sort((a, b) => b.density - a.density).indexOf(target) + 1;
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Population Hills</span>
        <h2>Whose hills are glowing?</h2><p class="note">Height is people per km². Drag the map to spin it. Three guesses.</p></section>
      <section class="panel otm-viz"><div class="otm-map-wrap" id="mw"></div><p class="otm-hint" id="hint"></p><div id="gb"></div>
        <div class="row"><button class="ghost" id="skip">Reveal it</button></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const pc = pixelCanvas(400, 250, "otm-canvas otm-hills");
    $("mw").appendChild(pc.canvas);
    pc.canvas.style.touchAction = "none";

    let theta = -0.75, rise = 0, glow = 0, over = false, misses = 0;
    const S = pc.w / 122, H = 58, cx = pc.w / 2, cy = pc.h * 0.6;
    const tc = cells.filter((c) => c.c === target), tci = tc.reduce((s, c) => s + c.i, 0) / tc.length, tcj = tc.reduce((s, c) => s + c.j, 0) / tc.length;

    function screen(gx: number, gy: number, h: number): [number, number] {
      const rx = gx * Math.cos(theta) - gy * Math.sin(theta), ry = gx * Math.sin(theta) + gy * Math.cos(theta);
      return [cx + rx * S, cy + ry * S * 0.5 - h];
    }
    const depth = (c: Cell) => (c.i - COLS / 2) * Math.sin(theta) + (c.j - ROWS / 2) * Math.cos(theta);
    function topColor(f: number, pal: Palette) { return f > 0.7 ? pal.t[4] : f > 0.45 ? pal.t[3] : f > 0.25 ? pal.t[2] : f > 0.1 ? pal.t[1] : pal.t[0]; }

    function draw() {
      const { ctx: g, w, h } = pc, pal = palette();
      g.clearRect(0, 0, w, h);
      // sea plane
      const corners = [[-COLS / 2, -ROWS / 2], [COLS / 2, -ROWS / 2], [COLS / 2, ROWS / 2], [-COLS / 2, ROWS / 2]].map(([x, y]) => screen(x, y, 0));
      g.beginPath(); corners.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = pal.ocean; g.fill();
      const sorted = [...cells].sort((a, b) => depth(a) - depth(b));
      for (const cell of sorted) {
        const isT = cell.c === target, f = heightOf(cell.c), hh = Math.max(1, f * H * rise) * (isT ? 1 + 0.06 * glow : 1);
        const gx = cell.i - COLS / 2, gy = cell.j - ROWS / 2;
        const top = [[gx, gy], [gx + 1, gy], [gx + 1, gy + 1], [gx, gy + 1]].map(([x, y]) => screen(x, y, hh));
        const base = top.map(([x, y]) => [x, y + hh] as [number, number]);
        const base0 = isT ? pal.accent2 : topColor(f, pal);
        // sides: the hull of the top face and its footprint
        const pts = [...top, ...base].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const hull = monotone(pts);
        g.beginPath(); hull.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        g.fillStyle = darken(base0, 0.58); g.fill();
        g.beginPath(); top.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        g.fillStyle = isT ? (glow > 0.5 && !over ? "#ffffff" : pal.accent2) : base0; g.fill();
      }
      const [ax, ay] = screen(tci - COLS / 2 + 0.5, tcj - ROWS / 2 + 0.5, heightOf(target) * H * rise + 8);
      if (over) label(g, target.name.toUpperCase(), ax, ay - 6, pal.fg, pal.bg, 9, "center");
      else { // a bouncing pixel arrow over the glowing country
        const by = Math.round(ay - 10 - (glow > 0.5 ? 2 : 0));
        g.fillStyle = pal.bg; g.fillRect(ax - 5, by - 1, 11, 4); g.fillRect(ax - 3, by + 3, 7, 2); g.fillRect(ax - 1, by + 5, 3, 2);
        g.fillStyle = pal.fg; g.fillRect(ax - 4, by, 9, 2); g.fillRect(ax - 2, by + 2, 5, 2); g.fillRect(ax, by + 4, 1, 2);
      }
    }
    function monotone(p: [number, number][]) {
      const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo: [number, number][] = [], up: [number, number][] = [];
      for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }

    // drag to spin
    let drag: { x: number; th: number } | null = null;
    pc.canvas.addEventListener("pointerdown", (e) => { pc.canvas.setPointerCapture(e.pointerId); drag = { x: canvasPoint(pc, e)[0], th: theta }; });
    pc.canvas.addEventListener("pointermove", (e) => { if (!drag) return; theta = drag.th + (canvasPoint(pc, e)[0] - drag.x) * 0.012; draw(); });
    pc.canvas.addEventListener("pointerup", () => (drag = null));

    const intro = animate(1600, (t) => { rise = ease(t); theta = -0.75 + 0.4 * ease(t); draw(); });
    let pulse = 0;
    const tick = setInterval(() => { if (over) return; glow = glow > 0.5 ? 0 : 1; if (++pulse < 6 || pulse % 4 === 0) draw(); }, 420);

    const box = guessBox((g, raw) => {
      if (over) return;
      if (!g) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      if (g === target) return reveal(POINTS[misses], `Yes${misses ? "" : ", first try"}!`);
      misses++; ctx.sound.miss(); box.shake();
      if (misses >= TRIES) return reveal(0, `Not ${esc(g.name)}.`);
      box.say(`Not ${esc(g.name)} (${Math.round(g.density).toLocaleString("en-US")}/km²). ${TRIES - misses} left.`, "bad");
      if (misses === 1) $("hint").innerHTML = `Hint: it's in <b>${esc(target.continent)}</b>.`;
      if (misses === 2) $("hint").innerHTML = `Hint: ${esc(target.continent)}, <b>${Math.round(target.density).toLocaleString("en-US")}</b> people per km² (#${rank} of ${sov.length}).`;
    });
    $("gb").appendChild(box.el);
    $("skip").onclick = () => reveal(0, "Revealed.");

    function reveal(points: number, why: string) {
      if (over) return;
      over = true; intro.stop(); rise = 1; glow = 0; box.lock(); ($("skip") as HTMLButtonElement).disabled = true;
      const x = target.density / world;
      box.say(`${why} It's <b>${esc(target.name)}</b>: ${Math.round(target.density).toLocaleString("en-US")} people per km², ${x >= 1.5 ? `${x.toFixed(x < 10 ? 1 : 0)}× the world average` : x > 0.67 ? `close to the world average` : `about 1/${Math.round(1 / x)} of the world average`}.`, points ? "good" : "");
      draw();
      finish({ points, label: `${target.name}${points ? "" : " (missed)"}` });
    }
    return () => { over = true; intro.stop(); clearInterval(tick); };
  },
};

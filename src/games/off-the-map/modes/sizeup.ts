/*
 * Size Up: a reference country is drawn at true scale. Resize a second country until you think it's the right
 * size next to it, then see the truth. Both use an equal-area projection centred on each country, so on-screen
 * area really is comparable. Score depends on how far off your area guess was.
 */
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoDistance, geoPath } from "d3-geo";
import type { MultiPolygon } from "geojson";
import { byKey, COUNTRIES, KM_PER_RAD, pick, type Country } from "../geo";
import { animate, canvasPoint, darken, ease, label, palette, pixelCanvas } from "../pixel";
import { esc, pts, type ModeDef } from "../ui";

/** A country's land within 2,500 km of its main landmass: Japan keeps its islands, France drops French Guiana. */
interface Local { c: Country; geo: MultiPolygon; km2: number }
const local = new Map<Country, Local>();
function localOf(c: Country): Local {
  let l = local.get(c);
  if (!l) {
    const g = c.shape.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const near = polys.filter((p) => geoDistance(geoCentroid({ type: "Polygon", coordinates: p }), c.anchor) * KM_PER_RAD < 2500);
    const geo: MultiPolygon = { type: "MultiPolygon", coordinates: near };
    l = { c, geo, km2: geoArea(geo) * KM_PER_RAD * KM_PER_RAD };
    local.set(c, l);
  }
  return l;
}

interface Spec { ref: Country; target: Country; start: number }
const FAMOUS: [string, string][] = [
  ["United Kingdom", "Japan"], ["Greenland", "Dem. Rep. Congo"], ["India", "Greenland"], ["Brazil", "Australia"], ["Spain", "Iraq"],
  ["Mexico", "Greenland"], ["Indonesia", "Mexico"], ["Germany", "Japan"], ["Italy", "New Zealand"], ["Egypt", "Pakistan"], ["Argentina", "India"],
];
const fmtKm2 = (km2: number) => (km2 >= 1e6 ? `${(km2 / 1e6).toFixed(2)}M` : `${Math.round(km2 / 1000)}k`) + " km²";
const TIERS: [number, string][] = [[0.1, "Nailed it!"], [0.25, "So close"], [0.5, "Not bad"], [1, "Way off"], [Infinity, "Not even close"]];

export const SIZEUP: ModeDef<Spec> = {
  id: "sizeup",
  name: "Size Up",
  tagline: "Resize a country to its true size",
  how: "A country is drawn at true scale. Drag, pinch or slide to resize a second one until it's the right size next to it. Maps distort size; this doesn't.",
  rounds: 6,
  prepare(rnd) {
    const pool = COUNTRIES.filter((c) => c.key !== "Antarctica" && c.areaKm2 > 20000 && (c.sovereign || c.key === "Greenland") && localOf(c).km2 > c.areaKm2 * 0.85);
    const out: Spec[] = [];
    const famous = pick(FAMOUS.filter(([a, b]) => pool.includes(byKey.get(a)!) && pool.includes(byKey.get(b)!)), 2, rnd);
    for (let i = 0; out.length < 6 && i < 500; i++) {
      let ref: Country, target: Country;
      if (famous.length && (out.length === 1 || out.length === 4)) { const [a, b] = famous.pop()!; ref = byKey.get(a)!; target = byKey.get(b)!; }
      else { [ref, target] = pick(pool, 2, rnd, (c) => (c.pop > 5 ? 2 : 1)); }
      const r = localOf(target).km2 / localOf(ref).km2;
      if (r < 1 / 10 || r > 10 || Math.abs(Math.log(r)) < 0.15 || out.some((s) => s.target === target)) continue;
      // start the target 1.5–2.5× too big or too small (in area) so it always needs resizing
      const off = Math.exp((0.4 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1));
      out.push({ ref, target, start: off });
    }
    return out;
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, ref = localOf(spec.ref), tgt = localOf(spec.target);
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Size Up · ${env.round + 1} of ${env.rounds}</span>
        <h2>Resize <b>${esc(spec.target.name)}</b> to its true size next to <b>${esc(spec.ref.name)}</b>.</h2></section>
      <section class="panel otm-viz"><div class="otm-size-wrap" id="cw"></div>
        <div class="otm-size-controls"><button class="ghost" id="smaller" aria-label="Smaller">−</button>
          <input type="range" id="slider" step="0.001" aria-label="Size of ${esc(spec.target.name)}">
          <button class="ghost" id="bigger" aria-label="Bigger">+</button></div>
        <div class="row"><button class="go" id="lock">Lock it in</button><span class="note" id="tip">Drag to move it, scroll or pinch to resize.</span></div>
        <div class="otm-verdict" id="verdict" hidden></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const pc = pixelCanvas(360, 230, "otm-canvas otm-size");
    $("cw").appendChild(pc.canvas);
    pc.canvas.style.touchAction = "none";

    // both shapes in an equal-area projection centred on themselves; k = pixels per unit at scale 1
    const shapeOf = (l: Local) => {
      const proj = geoAzimuthalEqualArea().rotate([-l.c.anchor[0], -l.c.anchor[1]]).scale(1).translate([0, 0]).precision(0.3);
      const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(l.geo);
      return { l, proj, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    const A = shapeOf(ref), B = shapeOf(tgt);
    // one shared true scale that fits both shapes side by side at their real sizes
    const trueK = Math.min((pc.w * 0.46) / Math.max(A.w, B.w), (pc.h * 0.78) / Math.max(A.h, B.h));
    // Slider range in log units of linear size (0 = true size), shifted at random so the middle isn't the answer.
    const shift = env.rnd() - 0.5, LO = Math.log(0.25) + shift, HI = Math.log(4) + shift;
    let s = Math.sqrt(spec.start); // linear scale factor of the target: 1 = true size
    let pos: [number, number] = [pc.w * 0.72, pc.h * 0.5], over = false, ghost = 0, truthT = 0;
    const refPos: [number, number] = [pc.w * 0.27, pc.h * 0.5];
    const slider = $("slider") as HTMLInputElement;
    slider.min = String(LO); slider.max = String(HI);
    const setS = (v: number) => { if (over) return; s = Math.max(Math.exp(LO), Math.min(Math.exp(HI), v)); slider.value = String(Math.log(s)); draw(); };

    function drawShape(g: CanvasRenderingContext2D, sh: ReturnType<typeof shapeOf>, k: number, at: [number, number], fill: string, line: string, alpha = 1, dashed = false) {
      const pr = sh.proj.scale(k).translate([at[0] - sh.cx * k, at[1] - sh.cy * k]);
      g.save(); g.globalAlpha = alpha; g.beginPath(); geoPath(pr, g)(sh.l.geo);
      if (!dashed) { g.fillStyle = fill; g.fill(); }
      g.globalAlpha = 1; g.strokeStyle = line; g.lineWidth = dashed ? 1 : 1; if (dashed) g.setLineDash([3, 2]); g.stroke(); g.restore();
      sh.proj.scale(1).translate([0, 0]);
    }
    function draw() {
      const g = pc.ctx, pal = palette();
      g.clearRect(0, 0, pc.w, pc.h); g.fillStyle = pal.bg; g.fillRect(0, 0, pc.w, pc.h);
      g.fillStyle = pal.line; for (let x = 10; x < pc.w; x += 20) for (let y = 10; y < pc.h; y += 20) g.fillRect(x, y, 1, 1); // dot grid
      drawShape(g, A, trueK, refPos, pal.land, darken(pal.land, 0.55));
      label(g, spec.ref.name, refPos[0], Math.min(pc.h - 8, refPos[1] + (A.h * trueK) / 2 + 9), pal.fg, pal.bg, 8, "center");
      const shown = over ? s + (1 - s) * truthT : s;
      if (over && ghost > 0) drawShape(g, B, trueK * s, pos, pal.accent, pal.accent2, ghost, true); // your guess, dashed
      drawShape(g, B, trueK * shown, pos, pal.accent, darken(pal.accent, 0.5), 0.8);
      label(g, over && truthT >= 1 ? `${spec.target.name} (true size)` : spec.target.name, pos[0], Math.min(pc.h - 8, pos[1] + (B.h * trueK * shown) / 2 + 9), pal.fg, pal.bg, 8, "center");
    }

    // pointer: drag to move, two fingers to resize; wheel to resize
    const pointers = new Map<number, [number, number]>();
    let drag: { from: [number, number]; pos: [number, number] } | null = null, pinch: { d: number; s: number } | null = null;
    const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    pc.canvas.addEventListener("pointerdown", (e) => {
      if (over) return;
      pc.canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) { pinch = { d: dist(), s }; drag = null; } else drag = { from: canvasPoint(pc, e), pos: [...pos] as [number, number] };
    });
    pc.canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size >= 2) return setS(pinch.s * (dist() / Math.max(1, pinch.d)));
      if (drag) { const p = canvasPoint(pc, e); pos = [drag.pos[0] + p[0] - drag.from[0], drag.pos[1] + p[1] - drag.from[1]]; draw(); }
    });
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; };
    pc.canvas.addEventListener("pointerup", up); pc.canvas.addEventListener("pointercancel", up);
    pc.canvas.addEventListener("wheel", (e) => { if (over) return; e.preventDefault(); setS(s * Math.exp(-e.deltaY * (e.deltaMode ? 0.04 : 0.0012))); }, { passive: false });
    slider.addEventListener("input", () => setS(Math.exp(+slider.value)));
    $("smaller").onclick = () => setS(s / 1.06);
    $("bigger").onclick = () => setS(s * 1.06);
    slider.value = String(Math.log(s));
    draw();

    let anim: { stop: () => void } | null = null;
    $("lock").onclick = async () => {
      if (over) return;
      over = true; ctx.sound.click();
      stage.querySelectorAll<HTMLButtonElement | HTMLInputElement>("#lock, #smaller, #bigger, #slider").forEach((b) => (b.disabled = true));
      ghost = 1;
      const a = animate(900, (t) => { truthT = ease(t); draw(); }); anim = a; await a.done;
      const areaRatio = s * s, err = Math.abs(Math.log2(areaRatio)), points = Math.max(0, Math.round(1000 * (1 - err / 1.6)));
      const rel = Math.max(areaRatio, 1 / areaRatio) - 1, tierN = TIERS.findIndex(([lim]) => rel < lim), tier = TIERS[tierN];
      const real = tgt.km2 / ref.km2, offBy = areaRatio >= 1 ? `${areaRatio.toFixed(2)}× too big` : `${(1 / areaRatio).toFixed(2)}× too small`;
      const v = $("verdict"); v.hidden = false;
      v.innerHTML = `<b class="otm-tier t${4 - tierN}">${esc(tier[1])}</b><span>You made it ${rel < 0.03 ? "almost exactly right" : offBy} · +${pts(points)}</span>
        <p class="otm-fact">${real >= 1 ? `<b>${esc(spec.target.name)}</b> is ${real.toFixed(real < 10 ? 2 : 1)}× the size of ${esc(spec.ref.name)}` : `<b>${esc(spec.ref.name)}</b> is ${(1 / real).toFixed(real > 0.1 ? 2 : 1)}× the size of ${esc(spec.target.name)}`}: ${real >= 1 ? `${fmtKm2(tgt.km2)} vs ${fmtKm2(ref.km2)}` : `${fmtKm2(ref.km2)} vs ${fmtKm2(tgt.km2)}`}.</p>`;
      v.classList.remove("pop"); void v.offsetWidth; v.classList.add("pop");
      $("tip").textContent = "Dashed outline: your guess.";
      if (points >= 900) ctx.world.burst(4); else if (points >= 700) ctx.world.burst(3);
      finish({ points, label: `${spec.target.name} vs ${spec.ref.name}: ${offBy}` });
    };
    return () => { over = true; anim?.stop(); };
  },
};

/** Menu art: the United Kingdom at true scale next to Japan. */
export function sizeUpPreview(): HTMLCanvasElement {
  const pc = pixelCanvas(120, 110, "otm-canvas"), pal = palette(), g = pc.ctx;
  g.fillStyle = pal.bg; g.fillRect(0, 0, pc.w, pc.h);
  const shapes = [byKey.get("United Kingdom")!, byKey.get("Japan")!].map((c) => {
    const l = localOf(c), proj = geoAzimuthalEqualArea().rotate([-c.anchor[0], -c.anchor[1]]).scale(1).translate([0, 0]);
    const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(l.geo); return { l, proj, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  });
  const k = Math.min(52 / Math.max(...shapes.map((x) => x.w)), 90 / Math.max(...shapes.map((x) => x.h)));
  shapes.forEach((sh, i) => {
    const at = [i ? 84 : 32, 52], pr = sh.proj.scale(k).translate([at[0] - sh.cx * k, at[1] - sh.cy * k]);
    g.beginPath(); geoPath(pr, g)(sh.l.geo); g.fillStyle = i ? pal.accent : pal.land; g.globalAlpha = i ? 0.85 : 1; g.fill(); g.globalAlpha = 1;
  });
  g.strokeStyle = pal.accent2; g.setLineDash([2, 2]); g.strokeRect(62.5, 18.5, 46, 72); g.setLineDash([]);
  return pc.canvas;
}

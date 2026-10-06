/*
 * True Size: quick-fire "which is bigger?" and "which has more people?". The choices show both shapes at the same
 * size; the reveal redraws them at true scale (or scaled by population), which is where the surprises live.
 * Each round is a streak run: one wrong answer ends it.
 */
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { byKey, COUNTRIES, pick, type Country } from "../geo";
import { animate, ease, label, palette, pixelCanvas, wait, type PixelCanvas } from "../pixel";
import { esc, type ModeDef } from "../ui";

type Kind = "area" | "pop";
interface Pair { kind: Kind; a: Country; b: Country }
interface Spec { title: string; pairs: Pair[] }
const PAIRS_PER_ROUND = 10;

// pairs that surprise people, injected now and then
const FAMOUS: [Kind, string, string][] = [
  ["area", "Greenland", "India"], ["area", "Greenland", "Argentina"], ["area", "Greenland", "Australia"], ["area", "Russia", "Canada"],
  ["area", "Dem. Rep. Congo", "Greenland"], ["area", "Mexico", "Indonesia"], ["pop", "Nigeria", "Russia"], ["pop", "Bangladesh", "Russia"], ["pop", "Pakistan", "Brazil"],
  ["pop", "Philippines", "Germany"], ["pop", "Egypt", "Germany"], ["pop", "Dem. Rep. Congo", "France"], ["pop", "Uganda", "Canada"],
  ["pop", "Ghana", "Australia"], ["pop", "Tanzania", "South Korea"],
];
const value = (c: Country, k: Kind) => (k === "area" ? c.areaKm2 : c.pop);
const fmtVal = (c: Country, k: Kind) => (k === "area" ? `${c.areaKm2 >= 1e6 ? (c.areaKm2 / 1e6).toFixed(2) + "M" : Math.round(c.areaKm2 / 1000) + "k"} km²` : `${c.pop >= 1 ? (c.pop >= 100 ? Math.round(c.pop) : c.pop.toFixed(1)) + "M" : Math.round(c.pop * 1000) + "k"} people`);
const question = (k: Kind) => (k === "area" ? "Which is <b>bigger</b>?" : "Which has <b>more people</b>?");

function pairsFor(kinds: Kind[], rnd: () => number): Pair[] {
  const area = COUNTRIES.filter((c) => c.key !== "Antarctica" && c.areaKm2 > 15000), people = COUNTRIES.filter((c) => c.sovereign && c.pop >= 0.5);
  const out: Pair[] = [];
  const famous = pick(FAMOUS.filter(([k, a, b]) => kinds.includes(k) && byKey.get(a) && byKey.get(b)), 2, rnd);
  for (let i = 0; out.length < PAIRS_PER_ROUND && i < 400; i++) {
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    if (famous.length && rnd() < 0.25) { const [k, a, b] = famous.pop()!; out.push({ kind: k, a: byKey.get(a)!, b: byKey.get(b)! }); continue; }
    const pool = kind === "area" ? area : people, [a, b] = pick(pool, 2, rnd), r = value(a, kind) / value(b, kind);
    // close enough to be a real question, far enough apart that the map data can't get it wrong
    if (r > 1.15 && r < 3.5 || r < 1 / 1.15 && r > 1 / 3.5) out.push({ kind, a, b });
  }
  return out.map((p) => (rnd() < 0.5 ? { ...p, a: p.b, b: p.a } : p));
}

/** Projection centred on a country: equal-area, so the same scale means the same real size. */
const projFor = (c: Country) => geoAzimuthalEqualArea().rotate([-c.anchor[0], -c.anchor[1]]).precision(0.5);
function silhouette(pc: PixelCanvas, c: Country, color: string, pad = 8) {
  const proj = projFor(c).scale(1).translate([0, 0]), [[x0, y0], [x1, y1]] = geoPath(proj).bounds(c.main);
  const k = Math.min((pc.w - pad * 2) / (x1 - x0), (pc.h - pad * 2) / (y1 - y0));
  proj.scale(k).translate([pc.w / 2 - ((x0 + x1) / 2) * k, pc.h / 2 - ((y0 + y1) / 2) * k]);
  pc.ctx.clearRect(0, 0, pc.w, pc.h);
  pc.ctx.beginPath(); geoPath(proj, pc.ctx)(c.main); pc.ctx.fillStyle = color; pc.ctx.fill();
}

export const TRUESIZE: ModeDef<Spec> = {
  id: "truesize",
  name: "True Size",
  tagline: "Maps lie. Countries don't.",
  how: "Two countries, same size on screen. Which is really bigger, or has more people? The reveal shows them at true scale. One wrong answer ends the streak.",
  rounds: 3,
  prepare: (rnd) => [
    { title: "Area", pairs: pairsFor(["area"], rnd) },
    { title: "Population", pairs: pairsFor(["pop"], rnd) },
    { title: "Mixed", pairs: pairsFor(["area", "pop"], rnd) },
  ],
  round(stage, spec, env, finish) {
    const { ctx } = env;
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">True Size · ${esc(spec.title)} · Round ${env.round + 1} of ${env.rounds}</span>
        <h2 id="q"></h2><div class="otm-streak" id="streak"></div></section>
      <section class="panel otm-viz"><div class="otm-ts-choices" id="choices"></div>
        <div class="otm-ts-reveal" id="reveal"></div><p class="otm-fact" id="fact"></p></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const big = pixelCanvas(320, 150, "otm-canvas otm-ts-canvas");
    $("reveal").appendChild(big.canvas);
    let i = 0, streak = 0, score = 0, gone = false, anim: ReturnType<typeof animate> | null = null;

    function show() {
      const p = spec.pairs[i], pal = palette();
      $("q").innerHTML = question(p.kind);
      $("streak").innerHTML = Array.from({ length: PAIRS_PER_ROUND }, (_, k) => `<i class="${k < i ? "on" : k === i ? "now" : ""}"></i>`).join("");
      $("choices").innerHTML = "";
      $("fact").textContent = "";
      big.ctx.clearRect(0, 0, big.w, big.h);
      label(big.ctx, "Same size on screen. Not in real life.", big.w / 2, big.h / 2, pal.muted, pal.bg, 8, "center");
      for (const c of [p.a, p.b]) {
        const btn = document.createElement("button"); btn.className = "otm-ts-choice";
        const mini = pixelCanvas(120, 80, "otm-canvas"); silhouette(mini, c, pal.land);
        btn.appendChild(mini.canvas);
        btn.insertAdjacentHTML("beforeend", `<b>${esc(c.name)}</b><small>${esc(c.continent)}</small>`);
        btn.onclick = () => answer(c, btn);
        $("choices").appendChild(btn);
      }
    }

    async function answer(pickC: Country, btn: HTMLButtonElement) {
      const p = spec.pairs[i], other = pickC === p.a ? p.b : p.a, right = value(pickC, p.kind) > value(other, p.kind);
      stage.querySelectorAll<HTMLButtonElement>(".otm-ts-choice").forEach((b) => (b.disabled = true));
      btn.classList.add(right ? "right" : "wrong");
      if (!right) stage.querySelectorAll<HTMLButtonElement>(".otm-ts-choice").forEach((b) => { if (b !== btn) b.classList.add("right"); });
      if (right) { streak++; const gain = 50 + 25 * (streak - 1); score += gain; env.badge(`Streak ${streak}`); ctx.sound.reward(Math.min(4, 1 + Math.floor(streak / 3))); }
      else { ctx.sound.miss(); env.badge(null); }
      const winner = value(p.a, p.kind) > value(p.b, p.kind) ? p.a : p.b;
      await reveal(p, winner); if (gone) return;
      const ratio = Math.max(value(p.a, p.kind), value(p.b, p.kind)) / Math.min(value(p.a, p.kind), value(p.b, p.kind));
      $("fact").innerHTML = `<b>${esc(winner.name)}</b> ${p.kind === "area" ? "is" : "has"} ${ratio >= 1.95 ? `${ratio.toFixed(1)}×` : `${Math.round((ratio - 1) * 100)}%`} ${p.kind === "area" ? "bigger" : "more people"}: ${fmtVal(p.a, p.kind)} vs ${fmtVal(p.b, p.kind)}.`;
      if (!right || ++i >= spec.pairs.length) return done(right);
      await wait(1700); if (gone) return;
      show();
    }

    /** Grow both shapes from "same size" to true scale (area), or to size by population. */
    function reveal(p: Pair, winner: Country) {
      const pal = palette(), half = big.w / 2;
      const fit = (c: Country) => { const pr = projFor(c).scale(1).translate([0, 0]), [[x0, y0], [x1, y1]] = geoPath(pr).bounds(c.main); return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };
      const fa = fit(p.a), fb = fit(p.b);
      // the scale each shape needs to fill its half of the canvas, and a shared "true" scale
      const own = (f: ReturnType<typeof fit>) => Math.min((half - 16) / f.w, (big.h - 34) / f.h);
      // population mode: scale shapes so drawn area is proportional to people
      const realK = (c: Country, f: ReturnType<typeof fit>) => (p.kind === "area" ? 1 : Math.sqrt(c.pop / c.areaKm2));
      const ka = realK(p.a, fa), kb = realK(p.b, fb), shared = Math.min(own(fa) / ka, own(fb) / kb);
      const a = animate(900, (t) => {
        const e = ease(t), g = big.ctx;
        g.clearRect(0, 0, big.w, big.h);
        [[p.a, fa, ka, half / 2], [p.b, fb, kb, half * 1.5]].forEach(([c0, f0, k0, x0]) => {
          const c = c0 as Country, f = f0 as ReturnType<typeof fit>, k = (own(f) * (1 - e) + shared * (k0 as number) * e);
          const pr = projFor(c).scale(k).translate([(x0 as number) - f.cx * k, (big.h - 16) / 2 - f.cy * k]);
          g.beginPath(); geoPath(pr, g)(c.main); g.fillStyle = c === winner ? pal.accent : pal.land; g.fill();
          g.strokeStyle = pal.bg; g.lineWidth = 1; g.stroke();
          label(g, c.name, x0 as number, big.h - 8, pal.fg, pal.bg, 8, "center");
        });
        if (t >= 1) label(g, p.kind === "area" ? "TRUE SCALE" : "SIZED BY POPULATION", 4, 7, pal.muted, pal.bg, 7);
      });
      anim = a;
      return a.done;
    }

    function done(clean: boolean) {
      const n = clean ? spec.pairs.length : i;
      if (clean) { score += 300; ctx.world.burst(4); }
      $("q").innerHTML = clean ? `Perfect run! <b>${n}/${n}</b>` : `Streak over at <b>${n}</b>.`;
      $("streak").innerHTML = Array.from({ length: PAIRS_PER_ROUND }, (_, k) => `<i class="${k < n ? "on" : k === n && !clean ? "bad" : ""}"></i>`).join("");
      finish({ points: score, label: `${spec.title}: streak of ${n}${clean ? " (perfect, +300)" : ""}` });
    }

    show();
    return () => { gone = true; anim?.stop(); };
  },
};


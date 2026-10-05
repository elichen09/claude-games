/* Rivers Only: a country drawn with nothing but its rivers. Guess it; the border fades in on the reveal. */
import { geoMercator, geoPath } from "d3-geo";
import type { MultiLineString, Position } from "geojson";
import { byKey, COUNTRIES, pick, type Country } from "../geo";
import { animate, label, palette, pixelCanvas } from "../pixel";
import { esc, guessBox, type ModeDef } from "../ui";

interface River { w: number; pts: Position[] }
interface Spec { country: Country; rivers: River[] }
const TRIES = 3, POINTS = [1000, 600, 300];

export const RIVERS: ModeDef<Spec> = {
  id: "rivers",
  name: "Rivers Only",
  tagline: "Name a country from its rivers",
  how: "A country drawn with nothing but its rivers: no borders, no coast, no labels. Three guesses, with a hint after each miss.",
  rounds: 5,
  async prepare(rnd) {
    const data = (await import("../data/rivers.json")).default as Record<string, string[]>;
    const cands = Object.keys(data).filter((k) => byKey.get(k)?.sovereign && data[k].length >= 5);
    return pick(cands, 5, rnd, (k) => (byKey.get(k)!.pop >= 5 ? 1 : 0.4)).map((k) => ({
      country: byKey.get(k)!,
      rivers: data[k].map((s) => { const [w, pts] = s.split("|"); return { w: +w, pts: pts.split(" ").map((p) => p.split(",").map(Number)) }; })
        .sort((a, b) => b.w - a.w), // big rivers draw first
    }));
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, c = spec.country;
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Rivers Only</span>
        <h2>Which country is this?</h2><p class="note">Only its rivers are drawn. You get three guesses, with a hint after each miss.</p></section>
      <section class="panel otm-viz"><div class="otm-map-wrap" id="mw"></div><p class="otm-hint" id="hint"></p><div id="gb"></div>
        <div class="row"><button class="ghost" id="skip">Reveal it</button></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const pc = pixelCanvas(300, 240, "otm-canvas otm-rivers");
    $("mw").appendChild(pc.canvas);
    const geo: MultiLineString = { type: "MultiLineString", coordinates: spec.rivers.map((r) => r.pts) };
    const proj = geoMercator().fitExtent([[14, 14], [pc.w - 14, pc.h - 14]], geo), path = geoPath(proj, pc.ctx);
    // neighbours that fall inside the frame, for the reveal
    const [[vx0, vy0], [vx1, vy1]] = [proj.invert!([0, pc.h])!, proj.invert!([pc.w, 0])!];
    const nearby = COUNTRIES.filter((k) => k !== c && k.bounds[1][0] >= vx0 && k.bounds[0][0] <= vx1 && k.bounds[1][1] >= vy0 && k.bounds[0][1] <= vy1);

    let grow = 0, outline = 0, faint = false, misses = 0, over = false;
    function draw() {
      const { ctx: g, w, h } = pc, pal = palette();
      g.clearRect(0, 0, w, h); g.fillStyle = pal.bg; g.fillRect(0, 0, w, h);
      if (outline > 0) {
        g.globalAlpha = outline * 0.5; for (const k of nearby) { g.beginPath(); path(k.shape); g.strokeStyle = pal.muted; g.lineWidth = 1; g.stroke(); }
        g.globalAlpha = outline * 0.18; g.beginPath(); path(c.shape); g.fillStyle = pal.accent; g.fill();
        g.globalAlpha = outline; g.beginPath(); path(c.shape); g.strokeStyle = pal.accent; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
      } else if (faint) { g.beginPath(); path(c.shape); g.setLineDash([2, 3]); g.strokeStyle = pal.muted; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
      // rivers: each one grows from its first point, the big ones first
      const n = spec.rivers.length;
      spec.rivers.forEach((r, i) => {
        const f = Math.max(0, Math.min(1, grow * 1.7 - (i / n) * 0.7));
        if (f <= 0) return;
        const k = Math.max(2, Math.ceil(r.pts.length * f)), part: MultiLineString = { type: "MultiLineString", coordinates: [r.pts.slice(0, k)] };
        g.beginPath(); path(part); g.strokeStyle = pal.t[1]; g.globalAlpha = 0.35; g.lineWidth = r.w + 3; g.lineJoin = "round"; g.stroke();
        g.globalAlpha = 1; g.beginPath(); path(part); g.strokeStyle = r.w >= 2 ? "#e9f6ff" : pal.t[1]; g.lineWidth = r.w; g.stroke();
      });
      if (outline > 0.6) { const p = proj(c.centroid); if (p) label(g, c.name.toUpperCase(), p[0], p[1], pal.fg, pal.bg, 10, "center"); }
    }
    const intro = animate(3200, (t) => { grow = t; draw(); });

    const box = guessBox((g, raw) => {
      if (over) return;
      if (!g) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      if (g === c) { ctx.sound.click(); return reveal(POINTS[misses], `Got it${misses ? ` on guess ${misses + 1}` : " first try"}!`); }
      misses++; ctx.sound.miss(); box.shake();
      if (misses >= TRIES) return reveal(0, `Not ${esc(g.name)}.`);
      box.say(`Not ${esc(g.name)}. ${TRIES - misses} ${TRIES - misses === 1 ? "guess" : "guesses"} left.`, "bad");
      if (misses === 1) $("hint").innerHTML = `Hint: it's in <b>${esc(c.continent)}</b>.`;
      if (misses === 2) { faint = true; $("hint").innerHTML = `Hint: ${esc(c.continent)}. Here's a faint outline.`; draw(); }
    });
    $("gb").appendChild(box.el);
    $("skip").onclick = () => reveal(0, "Revealed.");

    let fade: { stop: () => void } | null = null;
    function reveal(points: number, why: string) {
      if (over) return;
      over = true; intro.stop(); grow = 1; box.lock(); ($("skip") as HTMLButtonElement).disabled = true;
      box.say(`${why} It's <b>${esc(c.name)}</b>.`, points ? "good" : "");
      fade = animate(900, (t) => { outline = t; draw(); });
      finish({ points, label: `${c.name}${points ? "" : " (missed)"}` });
    }
    return () => { over = true; intro.stop(); fade?.stop(); };
  },
};

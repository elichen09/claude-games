/* Drift: find where a modern city sat on Pangaea, then watch the continents drift apart to today. */
import { geoEquirectangular, geoGraticule, geoPath } from "d3-geo";
import type { Geometry, Position } from "geojson";
import { CITY_LIST, COUNTRIES, distanceKm, fmtKm, pick, pointsForKm, type CityInfo, type LonLat } from "../geo";
import { animate, canvasPoint, ease, label, palette, pin, pixelCanvas } from "../pixel";
import { partial, PLATE_ROTATION, rotate, toLonLat, toVec, type Quat } from "../plates";
import { esc, type ModeDef } from "../ui";

const MA = 200; // million years ago
const GRID = geoGraticule().step([30, 30])();
const PLATE_NAME: Record<string, string> = { NA: "North America", SA: "South America", AF: "Africa", EU: "Eurasia", IN: "India", AU: "Australia", AN: "Antarctica", MG: "Madagascar" };

/** Rotation for a plate at time t: 0 = Pangaea, 1 = today. */
const at = (plate: keyof typeof PLATE_ROTATION, t: number): Quat => partial(PLATE_ROTATION[plate], 1 - t);
const move = (q: Quat, p: Position): Position => toLonLat(rotate(q, toVec(p[0], p[1])));
function moveGeom(g: Geometry, q: Quat): Geometry {
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map((p) => move(q, p))) };
  if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map((r) => r.map((p) => move(q, p)))) };
  return g;
}

export const DRIFT: ModeDef<CityInfo> = {
  id: "drift",
  name: "Drift",
  tagline: "Find a city on Pangaea",
  how: "200 million years ago every continent was jammed into one: Pangaea. Tap where a modern city sat, then watch the plates drift to today.",
  rounds: 5,
  // Africa is the fixed frame here, so its cities barely move: pick them rarely
  prepare: (rnd) => pick(CITY_LIST.filter((c) => c.country.plate !== "AN"), 5, rnd, (c) => (c.country.plate === "AF" ? 0.15 : c.country.plate === "EU" ? 0.7 : 1)),
  round(stage, city, env, finish) {
    const { ctx } = env, plate = city.country.plate;
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Drift · ${MA} million years ago</span>
        <h2>Where on Pangaea was <b>${esc(city.name)}</b>, ${esc(city.country.name)}?</h2>
        <p class="note">Its plate, ${esc(PLATE_NAME[plate])}, is highlighted. Tap the map to drop your pin.</p></section>
      <section class="panel otm-viz"><div class="otm-map-wrap" id="mw"></div>
        <div class="otm-timeline"><span id="ma">${MA} Ma</span><div class="otm-track"><span id="tk"></span></div><span>Today</span></div>
        <div class="row"><button class="go" id="lock" disabled>Lock it in</button><span class="note" id="where">No pin yet</span></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const pc = pixelCanvas(360, 180, "otm-canvas otm-map");
    $("mw").appendChild(pc.canvas);
    const proj = geoEquirectangular().rotate([-10, 0]).fitSize([pc.w, pc.h], { type: "Sphere" }), path = geoPath(proj, pc.ctx);

    let t = 0, guess: LonLat | null = null, phase: "aim" | "reveal" | "drift" = "aim";
    const truth = (time: number) => move(at(plate, time), city.at) as LonLat;

    function draw() {
      const { ctx: c, w, h } = pc, pal = palette();
      c.clearRect(0, 0, w, h);
      c.beginPath(); path({ type: "Sphere" }); c.fillStyle = pal.ocean; c.fill();
      c.beginPath(); path(GRID); c.strokeStyle = pal.line; c.lineWidth = 1; c.stroke();
      for (const k of COUNTRIES) {
        c.beginPath(); path(moveGeom(k.shape.geometry, at(k.plate, t)));
        c.fillStyle = k.plate === plate && phase !== "drift" ? pal.t[2] : pal.land; c.fill();
      }
      if (guess && phase !== "drift") {
        const g = proj(guess)!; pin(c, g[0], g[1], pal.accent, pal.bg, 2);
        if (phase === "reveal") {
          const tp = proj(truth(0))!;
          c.beginPath(); path({ type: "LineString", coordinates: [guess, truth(0)] }); c.strokeStyle = pal.fg; c.setLineDash([3, 3]); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
          pin(c, tp[0], tp[1], pal.good, pal.bg, 2); label(c, city.name, tp[0] + 6, tp[1] - 6, pal.good, pal.bg, 8);
        }
      }
      if (phase === "drift") { const p = proj(truth(t))!; pin(c, p[0], p[1], pal.good, pal.bg, 2); label(c, city.name, p[0] + 6, p[1] - 6, pal.fg, pal.bg, 8); }
    }

    pc.canvas.addEventListener("pointerup", (e) => {
      if (phase !== "aim") return;
      const ll = proj.invert!(canvasPoint(pc, e));
      if (!ll) return;
      guess = ll as LonLat; ctx.sound.tick();
      ($("lock") as HTMLButtonElement).disabled = false; $("where").textContent = "Pin dropped. Tap again to move it.";
      draw();
    });
    draw();

    let anim: { stop: () => void } | null = null, gone = false;
    $("lock").onclick = async () => {
      if (!guess || phase !== "aim") return;
      ctx.sound.click(); ($("lock") as HTMLButtonElement).disabled = true;
      phase = "reveal"; draw();
      const km = distanceKm(guess, truth(0)), points = pointsForKm(km, 1200);
      $("where").textContent = `Off by ${fmtKm(km)} · now watch it drift…`;
      await new Promise((r) => setTimeout(r, 1400)); if (gone) return;
      phase = "drift";
      ctx.sound.tone(70, 0, 3.5, "triangle", 0.05);
      anim = animate(4200, (k) => {
        t = ease(k); draw();
        $("ma").textContent = `${Math.round(MA * (1 - t))} Ma`;
        $("tk").style.width = t * 100 + "%";
      });
      await (anim as ReturnType<typeof animate>).done; if (gone) return;
      $("where").textContent = `Off by ${fmtKm(km)} on Pangaea. Since then it has drifted about ${fmtKm(distanceKm(truth(0), city.at))} relative to Africa.`;
      finish({ points, label: `${city.name}: off by ${fmtKm(km)}` });
    };

    return () => { gone = true; anim?.stop(); };
  },
};

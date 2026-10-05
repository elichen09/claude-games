/* Antipode: drop a pin on the exact opposite side of the Earth. The reveal drills a line straight through the core. */
import { geoInterpolate, geoOrthographic } from "d3-geo";
import { antipode, CITY_LIST, distanceKm, fmtKm, pick, placeName, pointsForKm, type CityInfo, type LonLat } from "../geo";
import { animate, ease, Globe, label, pin, type Palette } from "../pixel";
import { esc, type ModeDef } from "../ui";

export const ANTIPODE: ModeDef<CityInfo> = {
  id: "antipode",
  name: "Antipode",
  tagline: "Tunnel straight through the Earth",
  how: "Drop a pin on the exact opposite side of the planet from a city. The reveal drills a line through the core.",
  rounds: 5,
  prepare: (rnd) => pick(CITY_LIST, 5, rnd),
  round(stage, city, env, finish) {
    const { ctx } = env;
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Antipode · ${esc(city.country.name)}</span>
        <h2>Where's the exact opposite side of the Earth from <b>${esc(city.name)}</b>?</h2>
        <p class="note">Drag to spin the globe. Tap to drop your pin, then lock it in.</p></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"></div>
        <div class="row"><button class="go" id="lock" disabled>Lock it in</button><span class="note" id="where">No pin yet</span></div>
        <p class="otm-fact" id="fact" hidden></p></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(240);
    $("gw").appendChild(globe.pc.canvas);
    globe.center(city.at, 0);

    let guess: LonLat | null = null, phase: "aim" | "drill" | "reveal" = "aim", drill = 0, cut = 0;
    const anti = antipode(city.at);
    const sideProj = () => geoOrthographic().scale(globe.proj.scale()).translate(globe.proj.translate()).rotate(globe.proj.rotate()); // unclipped, to place limb points

    globe.style = {
      overlay(c, path, proj, pal) {
        const showCity = phase === "aim" || globe.visible(city.at);
        if (phase === "drill" && cut > 0) drawCore(c, pal);
        if (showCity) { const p = proj(city.at); if (p) { pin(c, p[0], p[1], pal.accent2, pal.bg, 2); label(c, city.name, p[0] + 6, p[1], pal.fg, pal.bg, 8); } }
        if (phase === "reveal" && guess) {
          c.beginPath(); path({ type: "LineString", coordinates: [guess, anti] }); c.strokeStyle = pal.fg; c.setLineDash([3, 3]); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
          const t = proj(anti); if (t && globe.visible(anti)) { pin(c, t[0], t[1], pal.good, pal.bg, 3); label(c, "Antipode", t[0] + 7, t[1] - 6, pal.good, pal.bg, 8); }
        }
        if (guess && globe.visible(guess)) { const g = proj(guess); if (g) { pin(c, g[0], g[1], pal.accent, pal.bg, 3); if (phase === "reveal") label(c, "You", g[0] + 7, g[1] + 7, pal.accent, pal.bg, 8); } }
      },
    };

    /** The cutaway: crust, mantle and core rings, with the drill line racing from the city to its antipode. */
    function drawCore(c: CanvasRenderingContext2D, pal: Palette) {
      const sp = sideProj(), a = sp(city.at)!, b = sp(anti)!, [cx, cy] = globe.proj.translate(), r = globe.proj.scale();
      c.save(); c.globalAlpha = cut;
      const rings: [number, string][] = [[1, "#5a2a1a"], [0.94, "#b8441f"], [0.7, "#e2711d"], [0.54, "#f5a623"], [0.3, "#ffe08a"], [0.18, "#fffbe6"]];
      for (const [k, col] of rings) { c.beginPath(); c.arc(cx, cy, r * k, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
      c.globalAlpha = 1;
      const x = a[0] + (b[0] - a[0]) * drill, y = a[1] + (b[1] - a[1]) * drill;
      c.strokeStyle = pal.accent; c.lineWidth = 3; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(x, y); c.stroke();
      c.strokeStyle = "#ffffff"; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(x, y); c.stroke();
      pin(c, x, y, "#ffffff", pal.accent, 2);
      if (drill > 0.45) label(c, "12,742 km", cx, cy - 14, pal.fg, "#3a1408", 8, "center");
      c.restore();
    }

    globe.onTap = (p) => {
      if (phase !== "aim") return;
      guess = p; ctx.sound.tick();
      ($("lock") as HTMLButtonElement).disabled = false;
      $("where").textContent = "Pin dropped. Tap again to move it.";
      globe.draw();
    };
    globe.draw();

    let anim: { stop: () => void } | null = null, gone = false;
    const run = (ms: number, fn: (t: number) => void) => { const a = animate(ms, (t) => { fn(t); globe.draw(); }); anim = a; return a.done; };
    const turn = (to: LonLat, ms: number) => { const from = globe.centerOf(), path = geoInterpolate(from, to); return run(ms, (t) => globe.center(path(ease(t)) as LonLat)); };

    $("lock").onclick = async () => {
      if (!guess || phase !== "aim") return;
      ctx.sound.click(); globe.interactive = false; ($("lock") as HTMLButtonElement).disabled = true; $("where").textContent = "Drilling…";
      // 1. turn side-on so the city sits on the left edge of the disc
      phase = "drill";
      await turn([city.at[0] + 90, 0], 1100); if (gone) return;
      // 2. open the planet and drill through
      await run(500, (t) => (cut = t)); if (gone) return;
      ctx.sound.tone(110, 0, 1.2, "sawtooth", 0.05);
      await run(1500, (t) => (drill = ease(t))); if (gone) return;
      await new Promise((r) => setTimeout(r, 450)); if (gone) return;
      await run(400, (t) => (cut = 1 - t)); if (gone) return;
      // 3. swing round to the antipode and compare
      phase = "reveal";
      const mid = geoInterpolate(guess, anti)(0.5) as LonLat;
      await turn(mid, 1300); if (gone) return;
      const km = distanceKm(guess, anti), points = pointsForKm(km, 1500);
      $("where").textContent = `Off by ${fmtKm(km)}`;
      const f = $("fact"); f.hidden = false;
      f.innerHTML = `The antipode of <b>${esc(city.name)}</b> is in <b>${esc(placeName(anti))}</b>. Your pin landed in ${esc(placeName(guess))}.`;
      finish({ points, label: `${city.name} → ${placeName(anti)}, off by ${fmtKm(km)}` });
    };

    return () => { gone = true; anim?.stop(); globe.destroy(); };
  },
};

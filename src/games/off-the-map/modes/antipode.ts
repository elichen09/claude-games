/*
 * Antipode: dig straight through the Earth.
 *   Pin rounds: drop a pin where you'd pop out on the far side.
 *   Dig rounds: you're standing on a glowing spot; pick which city you'd come out under.
 * Good rounds build a streak multiplier. The reveal drills a line through the planet's core.
 */
import { geoInterpolate, geoOrthographic } from "d3-geo";
import { antipode, CITY_LIST, countryAt, distanceKm, fmtKm, nearestCity, nearestLand, oceanAt, pick, placeName, pointsForKm, type CityInfo, type LonLat } from "../geo";
import { animate, ease, easeOut, flag, Globe, label, pin, wait, type Palette } from "../pixel";
import { esc, pts, type ModeDef } from "../ui";

type Spec = { kind: "pin"; city: CityInfo } | { kind: "dig"; city: CityInfo; choices: CityInfo[] };
interface Marker { at: LonLat; kind: "flag" | "pin" | "hole"; color: (p: Palette) => string; text?: string; drop?: number }

const TIERS: [number, string][] = [[200, "Bullseye!"], [700, "Core sample"], [1800, "Warm rock"], [4000, "Lost in the mantle"], [Infinity, "Wrong hemisphere"]];
const tierName = (km: number) => TIERS.find(([lim]) => km < lim)![1];
let streak = 0;
const multiplier = () => 1 + 0.25 * Math.min(streak, 4);

export const ANTIPODE: ModeDef<Spec> = {
  id: "antipode",
  name: "Antipode",
  tagline: "Dig straight through the Earth",
  how: "Drop a pin where you'd pop out if you dug straight down from a city, or pick which city sits under a spot in the ocean. Good digs build a streak.",
  rounds: 6,
  start: () => { streak = 0; },
  prepare(rnd) {
    const cities = pick(CITY_LIST, 6, rnd);
    return cities.map((city, i): Spec => {
      if (i % 3 !== 2) return { kind: "pin", city };
      // dig round: three decoys whose antipodes are far from this one
      const spot = antipode(city.at);
      const decoys = pick(CITY_LIST.filter((c) => c !== city && distanceKm(antipode(c.at), spot) > 2500), 3, rnd);
      return { kind: "dig", city, choices: pick([city, ...decoys], 4, rnd) };
    });
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, city = spec.city, anti = antipode(city.at), dig = spec.kind === "dig";
    env.badge(streak ? `Streak ×${multiplier().toFixed(2).replace(/0$/, "")}` : null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">${dig ? "Dig round" : "Pin round"} · ${env.round + 1} of ${env.rounds}</span>
        ${dig
          ? `<h2>You're standing on the glowing spot in <b>${esc(placeName(anti))}</b>. Dig straight down: which city do you come out under?</h2>`
          : `<h2>Dig straight down from <b>${esc(city.name)}</b>, ${esc(city.country.name)}. Where do you pop out?</h2>`}
      </section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"></div>
        <div id="controls">${dig
          ? `<div class="otm-choices">${spec.choices.map((c, i) => `<button class="otm-choice" data-i="${i}"><b>${esc(c.name)}</b><small>${esc(c.country.name)}</small></button>`).join("")}</div>`
          : `<div class="row"><button class="go" id="lock" disabled>Dig!</button><span class="note" id="where">Spin the globe, then tap to drop your pin.</span></div>`}</div>
        <div class="otm-verdict" id="verdict" hidden></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(230);
    $("gw").appendChild(globe.el);
    globe.center(dig ? anti : city.at);

    const markers: Marker[] = dig
      ? [{ at: anti, kind: "hole", color: (p) => p.accent2, text: "You" }]
      : [{ at: city.at, kind: "flag", color: (p) => p.accent2, text: city.name }];
    let arc: [LonLat, LonLat] | null = null, cut = 0, drill = 0, from: LonLat = city.at, to: LonLat = anti, pulse = 0;
    const sideProj = () => geoOrthographic().scale(globe.proj.scale()).translate(globe.proj.translate()).rotate(globe.proj.rotate());

    globe.onFrame = (dt) => {
      pulse += dt / 1000;
      for (const m of markers) if (m.drop !== undefined && m.drop < 1) m.drop = Math.min(1, m.drop + dt / 260);
    };
    globe.style = {
      overlay(c, path, proj, pal) {
        if (cut > 0) drawCore(c, pal);
        if (arc) { c.beginPath(); path({ type: "LineString", coordinates: arc }); c.strokeStyle = pal.fg; c.setLineDash([3, 3]); c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
        for (const m of markers) {
          if (!globe.visible(m.at)) continue;
          const p = proj(m.at); if (!p) continue;
          const col = m.color(pal);
          if (m.kind === "hole") {
            const r = 4 + (Math.sin(pulse * 5) + 1) * 2.5;
            c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.stroke();
            c.fillStyle = "#1a0b05"; c.fillRect(Math.round(p[0]) - 2, Math.round(p[1]) - 2, 5, 5);
          } else if (m.kind === "flag") flag(c, p[0], p[1], col, pal.bg);
          else pin(c, p[0], p[1] - (1 - easeOut(m.drop ?? 1)) * 24, col, pal.bg, 3);
          if (m.text && cut === 0) label(c, m.text, p[0] + 9, p[1] - (m.kind === "flag" ? 10 : 0), pal.fg, pal.bg, 8);
        }
      },
    };

    /** The cutaway: crust, mantle and core, with the drill racing between two points on the limb. */
    function drawCore(c: CanvasRenderingContext2D, pal: Palette) {
      const sp = sideProj(), a = sp(from)!, b = sp(to)!, [cx, cy] = globe.proj.translate(), r = globe.proj.scale();
      c.save(); c.globalAlpha = cut;
      const rings: [number, string][] = [[1, "#4a2214"], [0.95, "#a63a1a"], [0.72, "#d9621c"], [0.55, "#f29b26"], [0.33, "#ffd66b"], [0.2, "#fff6d5"]];
      for (const [k, col] of rings) { c.beginPath(); c.arc(cx, cy, r * k, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
      c.globalAlpha = cut * (0.5 + 0.5 * Math.sin(pulse * 9)); c.beginPath(); c.arc(cx, cy, r * 0.12, 0, Math.PI * 2); c.fillStyle = "#ffffff"; c.fill();
      c.globalAlpha = 1;
      const x = a[0] + (b[0] - a[0]) * drill, y = a[1] + (b[1] - a[1]) * drill;
      c.strokeStyle = "#1a0b05"; c.lineWidth = 5; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(x, y); c.stroke();
      c.strokeStyle = pal.accent; c.lineWidth = 3; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(x, y); c.stroke();
      c.strokeStyle = "#ffffff"; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(x, y); c.stroke();
      if (drill > 0 && drill < 1) pin(c, x, y, "#ffffff", pal.accent, 2);
      if (drill > 0.5) label(c, "12,742 KM", cx, cy - 16, "#fff6d5", "#4a2214", 8, "center");
      c.restore();
      if (drill > 0 && drill < 1) globe.burst(x, y, ["#ffd66b", "#ffffff", pal.accent], 2, 0.8);
    }

    // ── shared reveal: turn side-on, drill through, swing to the exit ──
    let fast = false, gone = false, anim: { stop: () => void } | null = null;
    const run = (ms: number, fn: (t: number) => void) => { const a = animate(fast ? 1 : ms, fn); anim = a; return a.done; };
    const turn = (dest: LonLat, ms: number) => { const path = geoInterpolate(globe.centerOf(), dest); return run(ms, (t) => globe.center(path(ease(t)) as LonLat)); };
    async function drillReveal(a: LonLat, b: LonLat, focus: LonLat) {
      from = a; to = b; globe.interactive = false;
      if (globe.zoom > 1) await globe.zoomTo(1, 350); // the cutaway needs the whole planet in view
      const skip = document.createElement("button"); skip.className = "ghost otm-skip"; skip.textContent = "Skip ▸▸";
      skip.onclick = () => { fast = true; anim?.stop(); skip.remove(); };
      $("gw").appendChild(skip);
      await turn([a[0] + 90, 0], 650); if (gone) return;
      await run(250, (t) => (cut = t)); if (gone) return;
      if (!fast) ctx.sound.tone(90, 0, 0.9, "sawtooth", 0.05);
      globe.shake = 1;
      await run(850, (t) => { drill = ease(t); globe.shake = Math.max(globe.shake, 0.6); }); if (gone) return;
      if (!fast) await wait(250);
      await run(200, (t) => (cut = 1 - t)); if (gone) return;
      cut = 0; drill = 0;
      await turn(focus, 800); if (gone) return;
      skip.remove();
      const p = globe.proj(b);
      if (p) globe.burst(p[0], p[1], ["#ffffff", "#ffd66b", "#7ef2d2", "#ff7a8a"], 40, 2);
      globe.shake = 0.5;
    }

    function verdict(title: string, tier: number, detail: string, facts: string[]) {
      const v = $("verdict"); v.hidden = false;
      v.innerHTML = `<b class="otm-tier t${tier}">${esc(title)}</b><span>${detail}</span>${facts.map((f) => `<p class="otm-fact">${f}</p>`).join("")}`;
      v.classList.remove("pop"); void v.offsetWidth; v.classList.add("pop");
    }
    function exitFacts(spot: LonLat, start: CityInfo | null) {
      const out: string[] = [], land = countryAt(spot);
      if (land) out.push(`You'd pop out on dry land in <b>${esc(land.name)}</b>. Only about 4% of Earth's surface is land with land directly opposite.`);
      else { const n = nearestLand(spot); out.push(`You'd surface in <b>${esc(oceanAt(spot))}</b>, ${fmtKm(n.km)} from the nearest land, ${esc(n.name)}.`); }
      const twin = nearestCity(spot, start ?? undefined);
      if (twin.km < 1500) out.push(`Antipode twin: <b>${esc(twin.city.name)}</b> is just ${fmtKm(twin.km)} from the exit.`);
      return out;
    }
    function digFacts() {
      const land = countryAt(anti), n = nearestLand(anti);
      return [land ? `Your starting spot was on land, in <b>${esc(land.name)}</b>. That's rare: most antipodes of cities are ocean.` : `Your starting spot was ${fmtKm(n.km)} from the nearest land, ${esc(n.name)}.`];
    }
    const award = (base: number) => {
      const mult = multiplier(), points = Math.round(base * mult);
      if (base >= 700) streak++; else streak = 0;
      env.badge(streak ? `Streak ×${multiplier().toFixed(2).replace(/0$/, "")}` : null);
      return { points, mult };
    };

    if (spec.kind === "pin") {
      let guess: LonLat | null = null;
      globe.onTap = (p) => {
        guess = p; ctx.sound.tick();
        const existing = markers.find((m) => m.kind === "pin");
        if (existing) { existing.at = p; existing.drop = 0; } else markers.push({ at: p, kind: "pin", color: (pal) => pal.accent, text: "You", drop: 0 });
        ($("lock") as HTMLButtonElement).disabled = false; $("where").textContent = "Pin dropped. Tap again to move it.";
      };
      $("lock").onclick = async () => {
        if (!guess) return;
        ctx.sound.click(); globe.onTap = undefined; ($("lock") as HTMLButtonElement).disabled = true; $("where").textContent = "Drilling…";
        await drillReveal(city.at, anti, geoInterpolate(guess, anti)(0.5) as LonLat); if (gone) return;
        markers.push({ at: anti, kind: "flag", color: (p) => p.good, text: "Exit" });
        arc = [guess, anti];
        const km = distanceKm(guess, anti), base = pointsForKm(km, 1400), { points, mult } = award(base);
        const tier = km < 200 ? 4 : km < 700 ? 3 : km < 1800 ? 2 : km < 4000 ? 1 : 0;
        $("where").textContent = "";
        verdict(tierName(km), tier, `Off by ${fmtKm(km)} · +${pts(points)}${mult > 1 ? ` (×${mult} streak)` : ""}`, exitFacts(anti, city));
        if (tier >= 3) ctx.world.burst(tier);
        finish({ points, label: `${city.name}: off by ${fmtKm(km)}` });
      };
    } else {
      stage.querySelectorAll<HTMLButtonElement>(".otm-choice").forEach((btn) => (btn.onclick = async () => {
        const choice = spec.choices[+btn.dataset.i!], right = choice === city;
        stage.querySelectorAll<HTMLButtonElement>(".otm-choice").forEach((b) => (b.disabled = true));
        btn.classList.add(right ? "right" : "wrong"); ctx.sound.click();
        await drillReveal(anti, city.at, city.at); if (gone) return;
        stage.querySelector<HTMLElement>(`.otm-choice[data-i="${spec.choices.indexOf(city)}"]`)!.classList.add("right");
        markers.push({ at: city.at, kind: "flag", color: (p) => p.good, text: city.name });
        if (!right) markers.push({ at: choice.at, kind: "pin", color: (p) => p.bad, text: choice.name });
        const { points, mult } = award(right ? 1000 : 0);
        if (!right) ctx.sound.miss();
        verdict(right ? "Straight through!" : "Wrong tunnel", right ? 4 : 0, right ? `+${pts(points)}${mult > 1 ? ` (×${mult} streak)` : ""}` : `You'd come out under ${esc(city.name)}, ${esc(city.country.name)}. Streak lost.`, digFacts());
        finish({ points, label: `Dig: ${right ? "found" : "missed"} ${city.name}` });
      }));
    }

    return () => { gone = true; anim?.stop(); globe.destroy(); };
  },
};

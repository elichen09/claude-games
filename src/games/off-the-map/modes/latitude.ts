/* Same Latitude: a glowing line wraps the globe through a city; name the countries it crosses. Obscure ones score more. */
import { geoInterpolate } from "d3-geo";
import { byKey, CITY_LIST, countryAt, pick, type CityInfo, type Country, type LonLat } from "../geo";
import { animate, ease, Globe, label, pin } from "../pixel";
import { esc, guessBox, type ModeDef } from "../ui";

interface Spec { city: CityInfo; answers: Country[]; hits: Map<string, number> }

const SECONDS = 60, STRIKES = 3, BAND = 0.6;
/** Rarer = smaller population: China ~50 points, Belize ~150. */
const pointsFor = (c: Country) => Math.max(50, Math.min(200, 50 + Math.round(150 * (1 - (Math.log10(Math.max(1e4, c.pop * 1e6)) - 4) / 5.2))));
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;

/** Every country the parallel touches (within a narrow band), with the longitude where it first crosses each. */
function crossings(lat: number) {
  const hits = new Map<string, number>();
  for (const dl of [-BAND, 0, BAND]) for (let lon = -180; lon < 180; lon += 0.25) {
    const c = countryAt([lon, lat + dl]);
    if (c && c.key !== "Antarctica" && !hits.has(c.key)) hits.set(c.key, lon);
  }
  return hits;
}

export const LATITUDE: ModeDef<Spec> = {
  id: "latitude",
  name: "Same Latitude",
  tagline: "Follow one line around the planet",
  how: "A line circles the globe through a city. Name every country it crosses in 60 seconds. Obscure countries score more.",
  rounds: 3,
  prepare(rnd) {
    const cands = CITY_LIST.filter((c) => c.at[1] > -46 && c.at[1] < 62);
    const out: Spec[] = [];
    for (const city of pick(cands, cands.length, rnd)) {
      if (out.some((s) => Math.abs(s.city.at[1] - city.at[1]) < 6)) continue;
      const hits = crossings(city.at[1]);
      if (hits.size < 5) continue;
      out.push({ city, hits, answers: [...hits.keys()].map((k) => byKey.get(k)!) });
      if (out.length === 3) break;
    }
    return out;
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, lat = spec.city.at[1];
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Same Latitude · ${fmtLat(lat)}</span>
        <h2>Name countries on the same line as <b>${esc(spec.city.name)}</b>.</h2>
        <p class="note">${spec.answers.length} countries sit on this line. Obscure ones score more. Three misses and you're out.</p></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"></div>
        <div class="otm-timer"><span id="bar"></span></div>
        <div class="otm-status"><span id="found">0 found</span><span id="strikes"></span><button class="ghost" id="stop">I'm done</button></div>
        <div id="gb"></div><div class="otm-chips" id="chips"></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(240);
    $("gw").appendChild(globe.pc.canvas);
    globe.center([spec.city.at[0], lat]);

    const found = new Set<string>(), parallel = { type: "LineString" as const, coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]) };
    let over = false, strikes = 0, score = 0, flash = 0;
    globe.style = {
      fill: (c, pal) => (found.has(c.key) ? pal.accent : over && spec.hits.has(c.key) ? pal.t[1] : null),
      underlay(c, path, _p, pal) { c.beginPath(); path(parallel); c.strokeStyle = pal.accent2; c.globalAlpha = 0.35 + 0.25 * flash; c.lineWidth = 7; c.stroke(); c.globalAlpha = 1; },
      overlay(c, path, proj, pal) {
        c.beginPath(); path(parallel); c.strokeStyle = pal.accent2; c.lineWidth = 2; c.stroke();
        c.beginPath(); path(parallel); c.strokeStyle = "#ffffff"; c.globalAlpha = 0.7; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        if (globe.visible(spec.city.at)) { const p = proj(spec.city.at); if (p) { pin(c, p[0], p[1], pal.fg, pal.bg, 2); label(c, spec.city.name, p[0] + 6, p[1] - 7, pal.fg, pal.bg, 8); } }
        if (over) {
          // label missed countries, skipping any that would collide with one already placed
          const placed: [number, number, number][] = [];
          for (const ans of spec.answers) if (!found.has(ans.key)) {
            const at: LonLat = [spec.hits.get(ans.key)!, lat], p = globe.visible(at) ? proj(at) : null;
            if (!p) continue;
            const half = ans.name.length * 3.2;
            if (placed.some(([x, y, hw]) => Math.abs(x - p[0]) < hw + half + 2 && Math.abs(y - (p[1] + 9)) < 9)) continue;
            placed.push([p[0], p[1] + 9, half]); label(c, ans.name, p[0], p[1] + 9, pal.fg, pal.bg, 7, "center");
          }
        }
      },
    };

    // the globe drifts east along the line; a drag or a correct answer takes over for a moment
    let raf = 0, idleUntil = 0, last = performance.now(), turning: ReturnType<typeof animate> | null = null;
    globe.pc.canvas.addEventListener("pointerdown", () => (idleUntil = performance.now() + 2500));
    const spin = (now: number) => {
      const dt = now - last; last = now;
      if (now > idleUntil && !turning) { const [lon] = globe.centerOf(); globe.center([lon + dt * 0.012, lat * 0.8]); }
      if (flash > 0) flash = Math.max(0, flash - dt / 600);
      globe.draw();
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);

    const box = guessBox((c, raw) => {
      if (over) return;
      if (!c) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      if (found.has(c.key)) { box.say(`${esc(c.name)} is already lit.`, ""); return; }
      if (spec.hits.has(c.key)) {
        found.add(c.key); const pts = pointsFor(c); score += pts; flash = 1;
        ctx.sound.reward(pts >= 150 ? 3 : pts >= 100 ? 2 : 1);
        box.say(`<b>${esc(c.name)}</b> +${pts}`, "good");
        $("found").textContent = `${found.size} found`;
        const chip = document.createElement("span"); chip.className = "otm-chip"; chip.textContent = `${c.name} +${pts}`; $("chips").appendChild(chip);
        turning?.stop();
        const from = globe.centerOf(), to: LonLat = [spec.hits.get(c.key)!, lat * 0.8], path = geoInterpolate(from, to);
        turning = animate(700, (t) => globe.center(path(ease(t)) as LonLat));
        turning.done.then(() => { turning = null; idleUntil = performance.now() + 1500; });
        if (found.size === spec.answers.length) end("You found them all!");
      } else {
        strikes++; ctx.sound.miss(); box.shake();
        box.say(`${esc(c.name)} isn't on this line.`, "bad");
        $("strikes").textContent = "✕".repeat(strikes);
        if (strikes >= STRIKES) end("Three misses.");
      }
    });
    $("gb").appendChild(box.el);
    box.input.focus({ preventScroll: true });

    const t0 = performance.now();
    const timer = setInterval(() => {
      const left = SECONDS - (performance.now() - t0) / 1000;
      $("bar").style.width = Math.max(0, (left / SECONDS) * 100) + "%";
      if (left <= 10 && left > 0 && Math.ceil(left) !== Math.ceil(left + 0.25)) ctx.sound.tick();
      if (left <= 0) end("Time's up.");
    }, 250);
    $("stop").onclick = () => end("Stopped.");

    function end(why: string) {
      if (over) return;
      over = true; clearInterval(timer); box.lock(); ($("stop") as HTMLButtonElement).disabled = true;
      const missed = spec.answers.filter((a) => !found.has(a.key));
      box.say(`${why} ${missed.length ? `You missed ${missed.length}: ${missed.map((m) => esc(m.name)).join(", ")}.` : ""}`);
      const points = Math.min(1000, score);
      finish({ points, label: `${spec.city.name} (${fmtLat(lat)}): ${found.size}/${spec.answers.length} countries` });
    }

    return () => { over = true; clearInterval(timer); cancelAnimationFrame(raf); turning?.stop(); globe.destroy(); };
  },
};


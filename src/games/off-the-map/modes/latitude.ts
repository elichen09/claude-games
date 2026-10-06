/*
 * Same Latitude: a glowing line wraps the globe through a city. Name the countries it crosses before the clock
 * runs out. Correct answers add time and quick ones build a combo; letter slots show what's left, west to east.
 */
import { geoInterpolate } from "d3-geo";
import { byKey, CITY_LIST, countryAt, norm, pick, type CityInfo, type Country, type LonLat } from "../geo";
import { animate, ease, flag, Globe, label } from "../pixel";
import { esc, guessBox, type ModeDef } from "../ui";

interface Spec { city: CityInfo; answers: Country[]; hits: Map<string, number> }

const START = 45, BONUS = 4, PENALTY = 3, COMBO_WINDOW = 7000, BAND = 0.6;
/** Rarer = smaller population: China ~50 points, Belize ~150. */
const baseFor = (c: Country) => Math.max(50, Math.min(200, 50 + Math.round(150 * (1 - (Math.log10(Math.max(1e4, c.pop * 1e6)) - 4) / 5.2))));
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
const squash = (s: string) => norm(s).replace(/ /g, "");

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
  tagline: "Race a line around the planet",
  how: "A line circles the globe through a city. Name every country it crosses. Right answers add time, quick ones build a combo, obscure ones score big.",
  rounds: 3,
  prepare(rnd) {
    const cands = CITY_LIST.filter((c) => c.at[1] > -46 && c.at[1] < 62);
    const out: Spec[] = [];
    for (const city of pick(cands, cands.length, rnd)) {
      if (out.some((s) => Math.abs(s.city.at[1] - city.at[1]) < 6)) continue;
      const hits = crossings(city.at[1]);
      if (hits.size < 5) continue;
      // order the slots heading east from the city
      const order = (k: string) => (hits.get(k)! - city.at[0] + 720) % 360;
      out.push({ city, hits, answers: [...hits.keys()].sort((a, b) => order(a) - order(b)).map((k) => byKey.get(k)!) });
      if (out.length === 3) break;
    }
    return out;
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, lat = spec.city.at[1];
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Same Latitude · ${fmtLat(lat)} · Round ${env.round + 1} of ${env.rounds}</span>
        <h2>Name the <b>${spec.answers.length}</b> countries on the same line as <b>${esc(spec.city.name)}</b>.</h2></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"><div class="otm-clock" id="clock">${START}</div></div>
        <div class="otm-timer"><span id="bar"></span></div>
        <div class="otm-slots" id="slots">${spec.answers.map((a) => `<span class="otm-slot" data-k="${esc(a.key)}">${[...a.name].map((ch) => (ch === " " || ch === "-" ? `<i class="gap"></i>` : `<i>${esc(ch)}</i>`)).join("")}</span>`).join("")}</div>
        <div id="gb"></div>
        <div class="otm-status"><button class="ghost" id="hint">Hint: first letters (half points)</button><span class="sp"></span><button class="ghost" id="stop">I'm done</button></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(230);
    $("gw").appendChild(globe.el);
    globe.center([spec.city.at[0], lat * 0.75]);

    const found = new Set<string>(), hinted = new Set<string>(), parallel = { type: "LineString" as const, coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]) };
    let over = false, score = 0, timeLeft = START, combo = 0, lastHit = -1e9, glow = 0, turning: ReturnType<typeof animate> | null = null;
    const remaining = () => spec.answers.filter((a) => !found.has(a.key));

    globe.style = {
      fill: (c, pal) => (found.has(c.key) ? pal.accent : over && spec.hits.has(c.key) ? pal.t[1] : null),
      underlay(c, path, _p, pal) { c.beginPath(); path(parallel); c.strokeStyle = pal.accent2; c.lineWidth = 6 + glow * 4; c.stroke(); },
      overlay(c, path, proj, pal) {
        c.beginPath(); path(parallel); c.strokeStyle = "#ffffff"; c.globalAlpha = 0.75; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        if (globe.visible(spec.city.at)) { const p = proj(spec.city.at); if (p) { flag(c, p[0], p[1], pal.accent2, pal.bg); label(c, spec.city.name, p[0] + 11, p[1] - 9, pal.fg, pal.bg, 8); } }
        const placed: [number, number, number][] = [];
        for (const a of spec.answers) {
          if (!found.has(a.key) && !over) continue;
          const at: LonLat = [spec.hits.get(a.key)!, lat], p = globe.visible(at) ? proj(at) : null;
          if (!p) continue;
          const half = a.name.length * 3.2, y = p[1] + 10;
          if (placed.some(([x, yy, hw]) => Math.abs(x - p[0]) < hw + half + 2 && Math.abs(yy - y) < 9)) continue;
          placed.push([p[0], y, half]); label(c, a.name, p[0], y, found.has(a.key) ? pal.fg : pal.muted, pal.bg, 7, "center");
        }
      },
    };
    // drift east along the line, unless the player is dragging or we're turning to an answer
    globe.onFrame = (dt, now) => {
      glow = Math.max(0, glow - dt / 500);
      if (!globe.dragging && now - globe.lastDrag > 2500 && !turning) { const [lon] = globe.centerOf(); globe.center([lon + dt * 0.01, lat * 0.75]); }
      if (!over) {
        timeLeft -= dt / 1000;
        $("clock").textContent = String(Math.max(0, Math.ceil(timeLeft)));
        $("clock").classList.toggle("low", timeLeft <= 10);
        $("bar").style.width = Math.max(0, Math.min(100, (timeLeft / START) * 100)) + "%";
        if (timeLeft <= 0) end("Time's up!");
      }
    };

    const slot = (k: string) => stage.querySelector<HTMLElement>(`.otm-slot[data-k="${CSS.escape(k)}"]`)!;
    function fillSlot(c: Country, cls: string) {
      const s = slot(c.key); s.classList.add(cls);
      s.querySelectorAll("i:not(.gap)").forEach((el, i) => setTimeout(() => el.classList.add("on"), i * 35));
    }
    const flashClock = (cls: string) => { const c = $("clock"); c.classList.remove("hit", "miss"); void c.offsetWidth; c.classList.add(cls); };

    const box = guessBox((c0, raw) => {
      if (over) return;
      // a unique prefix of a remaining answer counts too ("kaz" → Kazakhstan)
      let c = c0;
      const k = squash(raw);
      if ((!c || !spec.hits.has(c.key)) && k.length >= 3) {
        const m = remaining().filter((a) => a.keys.some((ak) => ak.startsWith(k)));
        if (m.length === 1) c = m[0];
      }
      if (!c) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      if (found.has(c.key)) { box.say(`${esc(c.name)} is already lit.`); return; }
      if (!spec.hits.has(c.key)) {
        timeLeft -= PENALTY; combo = 0; env.badge(null);
        ctx.sound.miss(); box.shake(); box.say(`${esc(c.name)} isn't on this line. −${PENALTY}s`, "bad");
        flashClock("miss");
        return;
      }
      const now = performance.now();
      combo = now - lastHit < COMBO_WINDOW ? Math.min(combo + 1, 5) : 1; lastHit = now;
      const mult = 1 + 0.25 * (combo - 1), earned = Math.round(baseFor(c) * mult * (hinted.has(c.key) ? 0.5 : 1));
      found.add(c.key); score += earned; timeLeft += BONUS; glow = 1; globe.invalidate();
      env.badge(combo > 1 ? `Combo ×${mult}` : null);
      ctx.sound.reward(earned >= 220 ? 4 : earned >= 150 ? 3 : earned >= 100 ? 2 : 1);
      box.say(`<b>${esc(c.name)}</b> +${earned}${combo > 1 ? ` (combo ×${mult})` : ""} · +${BONUS}s`, "good");
      fillSlot(c, "found");
      flashClock("hit");
      // swing to the crossing and celebrate there
      turning?.stop();
      const at: LonLat = [spec.hits.get(c.key)!, lat], path = geoInterpolate(globe.centerOf(), [at[0], lat * 0.75]);
      const t = animate(600, (k2) => globe.center(path(ease(k2)) as LonLat));
      turning = t;
      t.done.then(() => {
        if (turning === t) turning = null;
        const p = globe.proj(at); if (p && !over) globe.burst(p[0], p[1], ["#ffffff", "#ffd66b", "#7ef2d2", "#ff7a8a"], 30, 1.8);
      });
      if (!remaining().length) end("You found them all!");
    });
    $("gb").appendChild(box.el);
    box.input.focus({ preventScroll: true });

    $("hint").onclick = () => {
      if (over) return;
      ($("hint") as HTMLButtonElement).disabled = true; ctx.sound.click();
      for (const a of remaining()) { hinted.add(a.key); slot(a.key).querySelector("i:not(.gap)")!.classList.add("on", "hinted"); }
      box.input.focus({ preventScroll: true });
    };
    $("stop").onclick = () => end("Stopped.");

    function end(why: string) {
      if (over) return;
      over = true; box.lock(); globe.invalidate();
      ($("stop") as HTMLButtonElement).disabled = true; ($("hint") as HTMLButtonElement).disabled = true;
      const missed = remaining();
      for (const m of missed) fillSlot(m, "missed");
      const bonus = missed.length ? 0 : Math.round(Math.max(0, timeLeft) * 10);
      score += bonus;
      box.say(`${why} ${found.size}/${spec.answers.length} countries${bonus ? `, plus ${bonus} for time left` : ""}.`, found.size ? "good" : "");
      env.badge(null);
      if (!missed.length) { const [cx, cy] = globe.proj.translate(); globe.burst(cx, cy, ["#ffffff", "#ffd66b", "#7ef2d2"], 60, 2.4); }
      finish({ points: score, label: `${spec.city.name} (${fmtLat(lat)}): ${found.size}/${spec.answers.length}` });
    }

    return () => { over = true; turning?.stop(); globe.destroy(); };
  },
};

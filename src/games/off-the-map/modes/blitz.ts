/*
 * Pin Blitz: "Find Peru!" Spin the globe and tap the country before the clock runs out. Quick taps earn a speed
 * bonus and consecutive hits build a combo. Targets start big and get smaller.
 */
import { COUNTRIES, countryNear, pick, type Country } from "../geo";
import { Globe, label } from "../pixel";
import { esc, type ModeDef } from "../ui";

interface Spec { targets: Country[] }
const SECONDS = 50, MISS_COST = 3;

export const BLITZ: ModeDef<Spec> = {
  id: "blitz",
  name: "Pin Blitz",
  tagline: "Find it. Tap it. Fast.",
  how: "A country name flashes up. Spin the globe and tap it before the clock runs out. Fast taps earn a bonus and streaks multiply. They get smaller as you go.",
  rounds: 2,
  prepare(rnd) {
    const ranked = COUNTRIES.filter((c) => c.sovereign && c.areaKm2 >= 12000).sort((a, b) => b.areaKm2 - a.areaKm2);
    const make = () => [...pick(ranked.slice(0, 40), 6, rnd), ...pick(ranked.slice(40, 90), 10, rnd), ...pick(ranked.slice(90), 24, rnd)];
    return [{ targets: make() }, { targets: make() }];
  },
  round(stage, spec, env, finish) {
    const { ctx } = env;
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt otm-blitz-head"><span class="eyebrow">Pin Blitz · Round ${env.round + 1} of ${env.rounds}</span>
        <h2 id="q">Get ready…</h2><span class="note" id="sub">Spin the globe and tap the country.</span></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"><div class="otm-clock" id="clock">${SECONDS}</div></div>
        <div class="otm-timer"><span id="bar"></span></div>
        <div class="otm-status"><span class="note" id="tally">0 found</span><span class="sp"></span><button class="ghost" id="skip">Skip (−${MISS_COST}s)</button></div>
        <div class="otm-msg" id="msg" aria-live="polite"></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(240);
    $("gw").appendChild(globe.el);
    globe.center([env.rnd() * 360 - 180, 15]);

    let idx = -1, timeLeft = SECONDS, over = false, combo = 0, score = 0, shownAt = 0, flashBad: Country | null = null, flashUntil = 0, reveal: Country | null = null;
    const found = new Set<Country>();
    const target = () => spec.targets[idx];

    globe.style = {
      fill: (c, pal) => (flashBad === c ? pal.bad : reveal === c ? pal.t[4] : found.has(c) ? pal.accent : null),
      overlay(cx, _path, proj, pal) {
        if (reveal && globe.visible(reveal.anchor)) { const p = proj(reveal.anchor); if (p) label(cx, reveal.name.toUpperCase(), p[0], p[1], "#ffffff", pal.bg, 9, "center"); }
      },
    };
    globe.onFrame = (dt, now) => {
      if (flashBad && now > flashUntil) { flashBad = null; globe.invalidate(); }
      if (over || idx < 0) return;
      timeLeft -= dt / 1000;
      $("clock").textContent = String(Math.max(0, Math.ceil(timeLeft)));
      $("clock").classList.toggle("low", timeLeft <= 10);
      $("bar").style.width = Math.max(0, (timeLeft / SECONDS) * 100) + "%";
      if (timeLeft <= 0) end();
    };

    function next() {
      if (over) return;
      reveal = null; globe.invalidate();
      idx++;
      if (idx >= spec.targets.length) return end();
      const t = target();
      $("q").innerHTML = `Find <b>${esc(t.name)}</b>`;
      $("sub").textContent = `It's in ${t.continent}.`;
      $("q").classList.remove("pop"); void $("q").offsetWidth; $("q").classList.add("pop");
      shownAt = performance.now();
    }
    function say(html: string, kind = "") { $("msg").innerHTML = html; $("msg").className = "otm-msg " + kind; }

    let busy = false;
    globe.onTap = async (p) => {
      if (over || idx < 0 || busy) return;
      const c = countryNear(p, 120);
      if (!c) return;
      const t = target();
      if (c === t) {
        combo = Math.min(combo + 1, 6);
        const secs = (performance.now() - shownAt) / 1000, speed = Math.round(100 * Math.max(0, 1 - secs / 8)), mult = 1 + 0.2 * (combo - 1);
        const gain = Math.round((100 + speed) * mult);
        score += gain; found.add(c); globe.invalidate();
        env.badge(combo > 1 ? `Combo ×${mult.toFixed(1)}` : null);
        ctx.sound.reward(speed > 60 ? 3 : speed > 25 ? 2 : 1);
        const pp = globe.proj(c.anchor); if (pp) globe.burst(pp[0], pp[1], ["#ffffff", "#ffd66b", "#7ef2d2", "#ff7a8a"], 30, 1.8);
        say(`<b>${esc(c.name)}</b> +${gain}${speed > 0 ? ` (${secs.toFixed(1)}s)` : ""}`, "good");
        $("tally").textContent = `${found.size} found`;
        next();
      } else {
        miss(`That's ${esc(c.name)}.`, c);
      }
    };
    async function miss(why: string, wrong: Country | null) {
      busy = true; combo = 0; env.badge(null); timeLeft -= MISS_COST; ctx.sound.miss();
      if (wrong) { flashBad = wrong; flashUntil = performance.now() + 450; }
      const t = target(); reveal = t; globe.invalidate(); globe.shake = 0.4;
      say(`${why} ${esc(t.name)} is here. −${MISS_COST}s`, "bad");
      await globe.turnTo(t.anchor, 600);
      await new Promise((r) => setTimeout(r, 700));
      busy = false; next();
    }
    $("skip").onclick = () => { if (!over && idx >= 0 && !busy) miss("Skipped.", null); };

    function end() {
      if (over) return;
      over = true; ($("skip") as HTMLButtonElement).disabled = true; env.badge(null);
      $("q").innerHTML = `Time! <b>${found.size}</b> found`; $("sub").textContent = "";
      say(`You pinned ${found.size} ${found.size === 1 ? "country" : "countries"}.`, "good");
      finish({ points: score, label: `Blitz: ${found.size} found` });
    }

    // a short countdown so the first target doesn't ambush you
    let n = 3;
    const cd = setInterval(() => { if (over) return clearInterval(cd); $("q").textContent = n > 0 ? String(n) : "Go!"; ctx.sound.tick(); if (n-- <= 0) { clearInterval(cd); next(); } }, 550);
    return () => { over = true; clearInterval(cd); globe.destroy(); };
  },
};

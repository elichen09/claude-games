/*
 * Seeker: find the mystery country by hot and cold. Every guess lights up on the globe in a color from icy blue
 * (far away) to white-hot (next door), with its distance and an arrow pointing the way. Fewer guesses score more.
 */
import { arrowFor, bearing, borderKm, COUNTRIES, countryNear, fmtKm, pick, type Country } from "../geo";
import { Globe, label } from "../pixel";
import { esc, guessBox, pts, type ModeDef } from "../ui";

interface Spec { target: Country }
interface Guess { c: Country; km: number; arrow: string }

/** Distance → heat color: white-hot at the border, through orange and gold, to icy blue. */
export function heat(km: number) {
  return km === 0 ? "#ff3b1f" : km < 500 ? "#ff6a1f" : km < 1200 ? "#ff9a2e" : km < 2200 ? "#ffc94a" : km < 3600 ? "#f2e6a7" : km < 6000 ? "#9cc4e4" : "#5b86c5";
}
const heatWord = (km: number) => (km === 0 ? "Scorching! It's a neighbour." : km < 500 ? "Very hot!" : km < 1200 ? "Hot" : km < 2200 ? "Warm" : km < 3600 ? "Lukewarm" : km < 6000 ? "Cold" : "Freezing");
const pointsFor = (n: number) => Math.max(150, 1100 - 100 * n);

export const SEEKER: ModeDef<Spec> = {
  id: "seeker",
  name: "Seeker",
  tagline: "Hot and cold, planet-sized",
  how: "A mystery country is hidden on the globe. Tap or type guesses: each one glows from icy blue to white-hot by how close it is. Find it in as few guesses as you can.",
  rounds: 3,
  prepare: (rnd) => pick(COUNTRIES.filter((c) => c.sovereign && (c.areaKm2 > 40000 || c.pop > 8)), 3, rnd, (c) => Math.log10(c.pop * 1e6)).map((target) => ({ target })),
  round(stage, { target }, env, finish) {
    const { ctx } = env;
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Seeker · Round ${env.round + 1} of ${env.rounds}</span>
        <h2>Find the <b>mystery country</b>. The closer you guess, the hotter it glows.</h2></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"></div>
        <div id="gb"></div><p class="otm-hint" id="hint"></p>
        <ol class="otm-heatlist" id="list"></ol>
        <div class="otm-status"><span class="note" id="count">Tap a country on the globe or type one.</span><span class="sp"></span><button class="ghost" id="give">Give up</button></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(230);
    $("gw").appendChild(globe.el);
    globe.center([env.rnd() * 360 - 180, 20]);

    const guesses: Guess[] = [];
    let over = false, won = false, flashT = 0;
    globe.style = {
      fill: (c, pal) => (c === target && over ? (won && flashT % 2 ? "#ffffff" : pal.accent) : guesses.find((g) => g.c === c) ? heat(guesses.find((g) => g.c === c)!.km) : null),
      overlay(cx, _path, proj, pal) {
        const last = guesses[guesses.length - 1];
        if (last && !over && globe.visible(last.c.anchor)) { const p = proj(last.c.anchor); if (p) label(cx, last.c.name, p[0], p[1], pal.fg, pal.bg, 8, "center"); }
        if (over && globe.visible(target.anchor)) { const p = proj(target.anchor); if (p) label(cx, target.name.toUpperCase(), p[0], p[1], "#ffffff", pal.bg, 9, "center"); }
      },
    };
    let flashTimer = 0;
    globe.onFrame = (_dt, now) => { if (over && won && now > flashTimer) { flashT++; flashTimer = now + 180; globe.invalidate(); } };

    function render() {
      const sorted = [...guesses].sort((a, b) => a.km - b.km);
      $("list").innerHTML = sorted.map((g, i) => `<li class="${i === 0 ? "best" : ""}"><span class="sw" style="background:${heat(g.km)}"></span><span>${esc(g.c.name)}</span><span class="km">${g.km === 0 ? "border" : fmtKm(g.km)}</span><span class="ar">${g.c === target ? "★" : g.arrow}</span></li>`).join("");
      $("count").textContent = `${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"} · worth ${pts(pointsFor(guesses.length + 1))} if the next one's right`;
      if (guesses.length >= 6) $("hint").innerHTML = `Hint: it's in <b>${esc(target.continent)}</b>${guesses.length >= 10 ? ` and starts with <b>${esc(target.name[0])}</b>` : ""}.`;
    }

    function guess(c: Country | null, raw: string) {
      if (over) return;
      if (!c) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      if (c.key === "Antarctica") { box.say("Nobody's hiding in Antarctica.", "bad"); return; }
      if (guesses.some((g) => g.c === c)) { box.say(`You already tried ${esc(c.name)}.`); return; }
      const best = guesses.length ? Math.min(...guesses.map((g) => g.km)) : Infinity;
      const km = c === target ? 0 : borderKm(c, target), arrow = arrowFor(bearing(c.anchor, target.anchor));
      guesses.push({ c, km, arrow });
      globe.invalidate();
      globe.turnTo(c.anchor, 650).then(() => { const p = globe.proj(c.anchor); if (p) globe.burst(p[0], p[1], c === target ? ["#ffffff", "#ffd66b", "#7ef2d2"] : [heat(km), "#ffffff"], c === target ? 70 : 18, c === target ? 2.6 : 1.2); });
      if (c === target) return win();
      const warmer = km < best;
      ctx.sound.tone(warmer ? 520 + Math.max(0, 6000 - km) / 12 : 260, 0, 0.18, "square", 0.04);
      box.say(`${esc(c.name)}: ${heatWord(km)} ${km > 0 ? `${fmtKm(km)} ${arrow}` : ""}${guesses.length > 1 ? (warmer ? " · warmer" : " · colder") : ""}`, km < 1200 ? "good" : "");
      render();
    }
    function win() {
      over = true; won = true; box.lock(); ($("give") as HTMLButtonElement).disabled = true; render();
      globe.shake = 1;
      const points = pointsFor(guesses.length);
      box.say(`Found it! <b>${esc(target.name)}</b> in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.`, "good");
      finish({ points, label: `${target.name} in ${guesses.length}` });
    }

    const box = guessBox(guess, "Guess a country…");
    $("gb").appendChild(box.el);
    globe.onTap = (p) => { const c = countryNear(p); if (c) guess(c, c.name); };
    $("give").onclick = () => {
      if (over) return;
      over = true; box.lock(); ($("give") as HTMLButtonElement).disabled = true; globe.invalidate();
      globe.turnTo(target.anchor, 800);
      box.say(`It was <b>${esc(target.name)}</b>.`);
      finish({ points: 0, label: `${target.name} (gave up)` });
    };
    return () => { over = true; globe.destroy(); };
  },
};

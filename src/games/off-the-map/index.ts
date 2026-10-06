/*
 * Off the Map: geography games built around a lit pixel globe.
 *   Seeker · True Size · Pin Blitz · Border Hop · Antipode · Same Latitude
 * The menu lives here; each mode is a ModeDef in ./modes, run by runMode() in ./ui.ts.
 */
import type { GameModule } from "@/lib/games/types";
import { byKey, today, type LonLat } from "./geo";
import { ANTIPODE } from "./modes/antipode";
import { BLITZ } from "./modes/blitz";
import { HOP } from "./modes/hop";
import { LATITUDE } from "./modes/latitude";
import { heat, SEEKER } from "./modes/seeker";
import { TRUESIZE } from "./modes/truesize";
import { Globe } from "./pixel";
import { esc, pts, runMode, type ModeDef } from "./ui";
import "./style.css";

const MODES = [SEEKER, TRUESIZE, BLITZ, HOP, ANTIPODE, LATITUDE] as ModeDef[];

/** A small spinning globe dressed up for each mode's card. */
function preview(id: string): Globe {
  const g = new Globe(112, 1.1);
  g.interactive = false; g.frameMs = 40; g.paused = true; // spins only while its card is hovered
  const start: Record<string, LonLat> = { seeker: [10, 30], truesize: [-10, 25], blitz: [-60, -10], hop: [5, 45], antipode: [100, 15], latitude: [-30, 30] };
  let [lon, lat] = start[id] || [0, 20], t = 0;
  g.onFrame = (dt) => { lon += dt * 0.008; t += dt / 1000; g.center([lon, lat]); };
  const k = (name: string) => byKey.get(name)!;
  const hot: [string, number][] = [["France", 0], ["Germany", 300], ["Spain", 900], ["Poland", 1500], ["Italy", 700], ["Ukraine", 2600], ["Algeria", 4000], ["Russia", 3000], ["United Kingdom", 1100]];
  const hop = ["Spain", "France", "Germany", "Poland", "Belarus"].map((n) => k(n).anchor);
  g.style = {
    fill: id === "seeker" ? (c) => { const h = hot.find(([n]) => n === c.key); return h ? heat(h[1]) : null; }
      : id === "truesize" ? (c, p) => (c.key === "Greenland" ? p.t[4] : c.key === "Dem. Rep. Congo" ? p.accent : null)
      : id === "blitz" ? (c, p) => (["Brazil", "Peru", "Chile", "Argentina"].includes(c.key) ? p.accent : null)
      : id === "hop" ? (c, p) => (["Spain", "France", "Germany", "Poland", "Belarus"].includes(c.key) ? p.accent : null) : undefined,
    underlay: id === "latitude"
      ? (c, path, _p, pal) => { c.beginPath(); path({ type: "LineString", coordinates: Array.from({ length: 91 }, (_, i) => [-180 + i * 4, 38]) }); c.strokeStyle = pal.accent2; c.lineWidth = 4; c.stroke(); }
      : undefined,
    overlay(c, path, proj, pal) {
      const [x, y] = proj.translate(), r = proj.scale(), pulse = (Math.sin(t * 3) + 1) / 2;
      if (id === "antipode") {
        c.strokeStyle = pal.accent; c.lineWidth = 2; c.globalAlpha = 0.6 + 0.4 * pulse;
        c.beginPath(); c.moveTo(x - r * 0.75, y - r * 0.55); c.lineTo(x + r * 0.75, y + r * 0.55); c.stroke(); c.globalAlpha = 1;
        c.fillStyle = "#ffd66b"; c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      }
      if (id === "hop") { c.beginPath(); path({ type: "LineString", coordinates: hop }); c.strokeStyle = "#ffffff"; c.setLineDash([3, 2]); c.lineWidth = 2; c.stroke(); c.setLineDash([]); }
      if (id === "blitz") {
        const s = 6 + pulse * 3; c.fillStyle = "#ffffff";
        c.fillRect(Math.round(x - s - 4), Math.round(y), 5, 2); c.fillRect(Math.round(x + s), Math.round(y), 5, 2);
        c.fillRect(Math.round(x), Math.round(y - s - 4), 2, 5); c.fillRect(Math.round(x), Math.round(y + s), 2, 5);
      }
    },
  };
  return g;
}

const game: GameModule = {
  mount(root, ctx) {
    root.classList.add("otm");
    ctx.world.follow(true);
    let stop: (() => void) | null = null;

    function menu() {
      stop?.(); stop = null;
      ctx.world.setValue(0);
      const best = ctx.storage.get<Record<string, number>>("best", {}), date = today();
      root.innerHTML = `
        <section class="panel otm-hero"><span class="eyebrow">Geography, but strange · ${date}</span>
          <h1 class="display">Off the <em>Map</em></h1>
          <p>Six ways to play with the planet: hunt a hidden country by hot and cold, catch maps lying about size, pin countries against the clock, hop borders, dig through the core and race a line of latitude. New puzzles every day.</p></section>
        <div class="otm-modes">${MODES.map((m) => {
          const d = ctx.storage.get<{ total: number } | null>(`daily:${m.id}:${date}`, null);
          return `<article class="panel otm-mode" data-mode="${m.id}"><div class="otm-prev"></div>
            <div class="otm-mode-txt"><b>${esc(m.name)}</b><small>${esc(m.tagline)}</small><p>${esc(m.how)}</p>
              <span class="otm-meta">${m.rounds} rounds${d ? ` · Today: ${pts(d.total)}` : ""}${best[m.id] ? ` · Best: ${pts(best[m.id])}` : ""}</span></div>
            <div class="otm-mode-btns"><button class="go" data-play="daily">${d ? "Replay daily" : "Play daily"}</button><button class="ghost" data-play="practice">Practice</button></div></article>`;
        }).join("")}</div>
        <footer class="footer"><span>Maps: Natural Earth.</span><span>Daily puzzles are the same for everyone.</span></footer>`;
      const globes: Globe[] = [];
      root.querySelectorAll<HTMLElement>(".otm-mode").forEach((card) => {
        const m = MODES.find((x) => x.id === card.dataset.mode)!, g = preview(m.id);
        globes.push(g); card.querySelector(".otm-prev")!.appendChild(g.pc.canvas);
        g.onFrame?.(0, 0); // set the starting view
        card.addEventListener("pointerenter", () => (g.paused = false));
        card.addEventListener("pointerleave", () => (g.paused = true));
        card.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) => (b.onclick = () => { ctx.sound.unlock(); ctx.sound.click(); play(m, b.dataset.play === "daily"); }));
      });
      stop = () => globes.forEach((g) => g.destroy());
      window.scrollTo({ top: 0 });
    }

    function play(m: ModeDef, daily: boolean) {
      stop?.();
      stop = runMode(root, ctx, m, daily, menu, () => play(m, false));
      window.scrollTo({ top: 0 });
    }

    menu();
    return () => { stop?.(); ctx.world.setValue(0); ctx.world.follow(false); root.innerHTML = ""; root.classList.remove("otm"); };
  },
};

export default game;

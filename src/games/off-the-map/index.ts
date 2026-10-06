/*
 * Off the Map: geography games built around a lit pixel globe.
 *   Antipode · Same Latitude
 * The menu lives here; each mode is a ModeDef in ./modes, run by runMode() in ./ui.ts.
 */
import type { GameModule } from "@/lib/games/types";
import { today } from "./geo";
import { ANTIPODE } from "./modes/antipode";
import { LATITUDE } from "./modes/latitude";
import { Globe } from "./pixel";
import { esc, pts, runMode, type ModeDef } from "./ui";
import "./style.css";

const MODES = [ANTIPODE, LATITUDE] as ModeDef[];

/** A small spinning globe dressed up for each mode's card. */
function preview(id: string): Globe {
  const g = new Globe(120, 1.12);
  g.interactive = false; g.frameMs = 90;
  let lon = id === "antipode" ? 100 : -30, t = 0;
  const lat = id === "antipode" ? 20 : 38;
  g.onFrame = (dt) => { lon += dt * 0.012; t += dt / 1000; g.center([lon, id === "antipode" ? 15 : 30]); };
  g.style = {
    underlay: id === "latitude"
      ? (c, path, _p, pal) => { c.beginPath(); path({ type: "LineString", coordinates: Array.from({ length: 91 }, (_, i) => [-180 + i * 4, lat]) }); c.strokeStyle = pal.accent2; c.lineWidth = 4; c.stroke(); }
      : undefined,
    overlay: id === "antipode"
      ? (c, _path, proj, pal) => {
          const [x, y] = proj.translate(), r = proj.scale(), k = (Math.sin(t * 2) + 1) / 2;
          c.strokeStyle = pal.accent; c.lineWidth = 2; c.globalAlpha = 0.6 + 0.4 * k;
          c.beginPath(); c.moveTo(x - r * 0.75, y - r * 0.55); c.lineTo(x + r * 0.75, y + r * 0.55); c.stroke(); c.globalAlpha = 1;
          c.fillStyle = "#ffd66b"; c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); c.fillStyle = "#ffffff"; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        }
      : undefined,
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
          <p>Dig straight through the planet, then race a single line of latitude all the way around it. New puzzles every day.</p></section>
        <div class="otm-modes">${MODES.map((m) => {
          const d = ctx.storage.get<{ total: number } | null>(`daily:${m.id}:${date}`, null);
          return `<article class="panel otm-mode" data-mode="${m.id}"><div class="otm-prev"></div>
            <div class="otm-mode-txt"><b>${esc(m.name)}</b><small>${esc(m.tagline)}</small><p>${esc(m.how)}</p>
              <span class="otm-meta">${m.rounds} rounds${d ? ` · Today: ${pts(d.total)}` : ""}${best[m.id] ? ` · Best: ${pts(best[m.id])}` : ""}</span>
              <div class="otm-mode-btns"><button class="go" data-play="daily">${d ? "Replay daily" : "Play daily"}</button><button class="ghost" data-play="practice">Practice</button></div></div></article>`;
        }).join("")}</div>
        <footer class="footer"><span>Maps: Natural Earth.</span><span>Daily puzzles are the same for everyone.</span></footer>`;
      const globes: Globe[] = [];
      root.querySelectorAll<HTMLElement>(".otm-mode").forEach((card) => {
        const m = MODES.find((x) => x.id === card.dataset.mode)!, g = preview(m.id);
        globes.push(g); card.querySelector(".otm-prev")!.appendChild(g.pc.canvas);
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

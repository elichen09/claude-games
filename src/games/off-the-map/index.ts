/*
 * Off the Map: geography games built around true scale and a lit pixel globe.
 *   Size Up · Antipode · Same Latitude
 * The menu lives here; each mode is a ModeDef in ./modes, run by runMode() in ./ui.ts.
 */
import type { GameModule } from "@/lib/games/types";
import { today, type LonLat } from "./geo";
import { ANTIPODE } from "./modes/antipode";
import { LATITUDE } from "./modes/latitude";
import { SIZEUP, sizeUpPreview } from "./modes/sizeup";
import { Globe } from "./pixel";
import { esc, pts, runMode, type ModeDef } from "./ui";
import "./style.css";

const MODES = [SIZEUP, ANTIPODE, LATITUDE] as ModeDef[];

/** Card art: a small globe for the globe modes (spins while its card is hovered), a drawing for Size Up. */
function preview(id: string): { el: HTMLElement; globe?: Globe } {
  if (id === "sizeup") return { el: sizeUpPreview() };
  const g = new Globe(112, 1.1);
  g.interactive = false; g.frameMs = 40; g.paused = true;
  let [lon, lat]: LonLat = id === "antipode" ? [100, 15] : [-30, 30], t = 0;
  g.onFrame = (dt) => { lon += dt * 0.008; t += dt / 1000; g.center([lon, lat]); };
  g.style = {
    underlay: id === "latitude"
      ? (c, path, _p, pal) => { c.beginPath(); path({ type: "LineString", coordinates: Array.from({ length: 91 }, (_, i) => [-180 + i * 4, 38]) }); c.strokeStyle = pal.accent2; c.lineWidth = 4; c.stroke(); }
      : undefined,
    overlay: id === "antipode"
      ? (c, _path, proj, pal) => {
          const [x, y] = proj.translate(), r = proj.scale(), pulse = (Math.sin(t * 3) + 1) / 2;
          c.strokeStyle = pal.accent; c.lineWidth = 2; c.globalAlpha = 0.6 + 0.4 * pulse;
          c.beginPath(); c.moveTo(x - r * 0.75, y - r * 0.55); c.lineTo(x + r * 0.75, y + r * 0.55); c.stroke(); c.globalAlpha = 1;
          c.fillStyle = "#ffd66b"; c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        }
      : undefined,
  };
  g.onFrame(0, 0);
  return { el: g.pc.canvas, globe: g };
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
          <p>Maps lie about size, nobody knows what's on the other side of the planet, and lines of latitude go to strange places. Three games about the world as it really is. New puzzles every day.</p></section>
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
        const m = MODES.find((x) => x.id === card.dataset.mode)!, p = preview(m.id);
        card.querySelector(".otm-prev")!.appendChild(p.el);
        const g = p.globe;
        if (g) { globes.push(g); card.addEventListener("pointerenter", () => (g.paused = false)); card.addEventListener("pointerleave", () => (g.paused = true)); }
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

/*
 * Off the Map: five geography games built around a visual reveal.
 *   Antipode · Same Latitude · Drift · Rivers Only · Population Hills
 * The menu lives here; each mode is a ModeDef in ./modes, run by runMode() in ./ui.ts.
 */
import type { GameModule } from "@/lib/games/types";
import { today } from "./geo";
import { ANTIPODE } from "./modes/antipode";
import { DRIFT } from "./modes/drift";
import { HILLS } from "./modes/hills";
import { LATITUDE } from "./modes/latitude";
import { RIVERS } from "./modes/rivers";
import { Globe, palette, pixelCanvas } from "./pixel";
import { esc, runMode, type ModeDef } from "./ui";
import "./style.css";

const MODES = [ANTIPODE, LATITUDE, DRIFT, RIVERS, HILLS] as ModeDef[];

/** Small animated-feeling preview art for each mode card. */
function preview(id: string): HTMLElement {
  const wrap = document.createElement("div"); wrap.className = "otm-prev";
  const pal = palette();
  if (id === "antipode" || id === "latitude") {
    const g = new Globe(84); g.interactive = false; g.center(id === "antipode" ? [140, 30] : [-20, 38]);
    g.style = {
      overlay(c, path, proj, p) {
        if (id === "latitude") { c.beginPath(); path({ type: "LineString", coordinates: Array.from({ length: 91 }, (_, i) => [-180 + i * 4, 38]) }); c.strokeStyle = p.accent2; c.lineWidth = 2; c.stroke(); }
        else { const [x, y] = proj.translate(), r = proj.scale(); c.strokeStyle = p.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(x - r * 0.7, y - r * 0.7); c.lineTo(x + r * 0.7, y + r * 0.7); c.stroke(); c.fillStyle = "#ffe08a"; c.fillRect(x - 3, y - 3, 6, 6); }
      },
    };
    g.draw(); g.destroy(); wrap.appendChild(g.pc.canvas);
  } else {
    const pc = pixelCanvas(120, 60); const c = pc.ctx;
    c.fillStyle = id === "rivers" ? pal.bg : pal.ocean; c.fillRect(0, 0, 120, 60);
    if (id === "rivers") {
      // a hand-wavy river system
      const seeds = [[8, 10], [30, 4], [70, 6], [100, 12], [14, 50]];
      for (const [sx, sy] of seeds) { c.strokeStyle = pal.t[1]; c.lineWidth = 1; c.beginPath(); let x = sx, y = sy; c.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (60 - x) * 0.18 + Math.sin(k + sx) * 3; y += (34 - y) * 0.18 + Math.cos(k * 1.3 + sy) * 2; c.lineTo(x, y); } c.stroke(); }
      c.strokeStyle = "#e9f6ff"; c.lineWidth = 2; c.beginPath(); c.moveTo(60, 34); c.lineTo(84, 40); c.lineTo(118, 38); c.stroke();
    } else if (id === "hills") {
      for (let k = 0; k < 22; k++) { const h = [6, 9, 4, 14, 22, 8, 5, 30, 38, 18, 10, 6, 4, 12, 26, 44, 20, 9, 7, 5, 3, 2][k]; const x = 6 + k * 5, col = h > 30 ? pal.t[4] : h > 18 ? pal.t[3] : h > 9 ? pal.t[2] : pal.t[1]; c.fillStyle = col; c.fillRect(x, 52 - h, 4, h); c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x + 3, 52 - h, 1, h); }
    } else {
      // Pangaea-ish blob
      c.fillStyle = pal.land; c.beginPath(); c.moveTo(30, 8); c.lineTo(70, 6); c.lineTo(84, 18); c.lineTo(78, 30); c.lineTo(92, 44); c.lineTo(70, 54); c.lineTo(52, 46); c.lineTo(40, 52); c.lineTo(34, 36); c.lineTo(22, 26); c.closePath(); c.fill();
      c.fillStyle = pal.t[2]; c.fillRect(46, 20, 8, 8); c.fillStyle = pal.accent; c.fillRect(60, 30, 3, 3);
    }
    wrap.appendChild(pc.canvas);
  }
  return wrap;
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
          <p>Five ways to see the planet differently. Tunnel through the core, chase a latitude around the globe, rewind 200 million years, name a country by its rivers, and read the world as a skyline of people.</p></section>
        <div class="otm-modes">${MODES.map((m) => {
          const d = ctx.storage.get<{ total: number } | null>(`daily:${m.id}:${date}`, null);
          return `<article class="panel otm-mode" data-mode="${m.id}"><div class="otm-prev-slot"></div>
            <div class="otm-mode-txt"><b>${esc(m.name)}</b><small>${esc(m.tagline)}</small><p>${esc(m.how)}</p>
              <span class="otm-meta">${m.rounds} rounds${d ? ` · Today: ${d.total.toLocaleString("en-US")}` : ""}${best[m.id] ? ` · Best: ${best[m.id].toLocaleString("en-US")}` : ""}</span></div>
            <div class="otm-mode-btns"><button class="go" data-play="daily">${d ? "Replay daily" : "Daily"}</button><button class="ghost" data-play="practice">Practice</button></div></article>`;
        }).join("")}</div>
        <footer class="footer"><span>Maps: Natural Earth. Drift uses a simplified plate reconstruction.</span></footer>`;
      root.querySelectorAll<HTMLElement>(".otm-mode").forEach((card) => {
        const m = MODES.find((x) => x.id === card.dataset.mode)!;
        card.querySelector(".otm-prev-slot")!.replaceWith(preview(m.id));
        card.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) => (b.onclick = () => { ctx.sound.unlock(); ctx.sound.click(); play(m, b.dataset.play === "daily"); }));
      });
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

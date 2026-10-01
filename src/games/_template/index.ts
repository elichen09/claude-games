/*
 * __TITLE__ — starter game created by `npm run new-game`.
 *
 * A game is any code that renders into `root` and returns a cleanup function.
 * Use plain DOM like this, or render a React tree with createRoot(root) if you prefer.
 * Everything the arcade shares is on `ctx`:
 *   ctx.world   – the pixel world behind the page (setValue moves the camera, burst = confetti)
 *   ctx.sound   – shared synth (reward(0..4), miss, tick, click)
 *   ctx.storage – localStorage namespaced to this game
 *   ctx.api     – calls this game's server actions in ./server.ts
 */
import type { GameModule } from "@/lib/games/types";
import "./style.css";

const game: GameModule = {
  mount(root, ctx) {
    let score = 0;
    const best = ctx.storage.get("best", 0);
    ctx.world.follow(true);

    root.innerHTML = `
      <section class="card">
        <span class="eyebrow">New game</span>
        <h1 class="display">__TITLE__</h1>
        <p class="note">This is the starter. Edit src/games/__SLUG__/index.ts to build the real thing.</p>
        <div class="row">
          <button class="go" id="tap">Go deeper</button>
          <button class="ghost" id="ping">Ping the server</button>
        </div>
        <p id="out" class="__SLUG__-out">Score: 0 · Best: ${best}</p>
      </section>`;

    const out = root.querySelector<HTMLElement>("#out")!;
    root.querySelector<HTMLElement>("#tap")!.onclick = () => {
      ctx.sound.unlock();
      score += 25;
      ctx.world.setValue(score * 10);
      ctx.sound.reward(Math.min(4, Math.floor(score / 100)));
      if (score % 100 === 0) ctx.world.burst(3);
      if (score > ctx.storage.get("best", 0)) ctx.storage.set("best", score);
      out.textContent = `Score: ${score} · Best: ${ctx.storage.get("best", 0)} · ${ctx.world.format(score * 10)}`;
    };
    root.querySelector<HTMLElement>("#ping")!.onclick = async () => {
      try {
        const r = await ctx.api<{ message: string }>("ping");
        out.textContent = r.message;
      } catch (e) {
        out.textContent = "Server action failed: " + String(e);
      }
    };

    return () => {
      ctx.world.setValue(0);
      ctx.world.follow(false);
      root.innerHTML = "";
    };
  },
};

export default game;

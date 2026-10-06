/*
 * Border Hop: get from one country to another by naming a chain of neighbours, never leaving land.
 * A pixel plane flies each hop across the globe. Matching the shortest route scores best.
 */
import { geoInterpolate } from "d3-geo";
import { COUNTRIES, NEIGHBORS, pick, type Country, type LonLat } from "../geo";
import { flag, Globe, label, pin } from "../pixel";
import { esc, guessBox, type ModeDef } from "../ui";

interface Spec { from: Country; to: Country; best: Country[] }
const FUEL = 3, PEEK_COST = 150;

/** Shortest chain of neighbours from a to b (inclusive), or null if they don't share a landmass. */
export function route(a: Country, b: Country): Country[] | null {
  const prev = new Map<Country, Country | null>([[a, null]]), queue = [a];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === b) { const out = [b]; let p = prev.get(b); while (p) { out.unshift(p); p = prev.get(p); } return out; }
    for (const n of NEIGHBORS.get(c) || []) if (!prev.has(n) && n.key !== "Antarctica") { prev.set(n, c); queue.push(n); }
  }
  return null;
}

export const HOP: ModeDef<Spec> = {
  id: "hop",
  name: "Border Hop",
  tagline: "Cross a continent on foot",
  how: "Get from one country to another by naming neighbours, one border at a time. A little plane flies every hop. Match the shortest route for full points.",
  rounds: 3,
  prepare(rnd) {
    const starts = COUNTRIES.filter((c) => c.sovereign && (NEIGHBORS.get(c)?.length || 0) >= 2);
    const out: Spec[] = [];
    for (const from of pick(starts, starts.length, rnd)) {
      if (out.some((s) => s.from === from || s.to === from)) continue;
      const far = starts.filter((t) => t !== from).map((t) => ({ t, r: route(from, t) })).filter((x) => x.r && x.r.length >= 4 && x.r.length <= 6);
      if (!far.length) continue;
      const [choice] = pick(far, 1, rnd, (x) => (x.r!.length === 5 ? 2 : 1));
      out.push({ from, to: choice.t, best: choice.r! });
      if (out.length === 3) break;
    }
    return out;
  },
  round(stage, spec, env, finish) {
    const { ctx } = env, { from, to } = spec, par = spec.best.length - 2;
    env.badge(null);
    stage.innerHTML = `
      <section class="panel otm-prompt"><span class="eyebrow">Border Hop · Round ${env.round + 1} of ${env.rounds} · Par: ${par} ${par === 1 ? "stop" : "stops"}</span>
        <h2>Hop from <b>${esc(from.name)}</b> to <b>${esc(to.name)}</b> over land borders.</h2></section>
      <section class="panel otm-viz"><div class="otm-globe-wrap" id="gw"></div>
        <div class="otm-chain" id="chain"></div>
        <div id="gb"></div>
        <div class="otm-status"><span class="otm-fuel" id="fuel"></span><span class="sp"></span><button class="ghost" id="undo">Undo hop</button><button class="ghost" id="peek">Peek neighbours (−${PEEK_COST})</button><button class="ghost" id="give">Give up</button></div></section>`;
    const $ = (id: string) => stage.querySelector<HTMLElement>("#" + id)!;
    const globe = new Globe(230);
    $("gw").appendChild(globe.pc.canvas);
    globe.center(geoInterpolate(from.anchor, to.anchor)(0.5) as LonLat);

    const chain: Country[] = [from];
    let fuel = FUEL, peeks = 0, peeking = false, over = false, plane: { a: LonLat; b: LonLat; t: number } | null = null, pulse = 0, showBest = false;
    const current = () => chain[chain.length - 1];

    globe.style = {
      fill(c, pal) {
        if (c === to) return pal.accent2;
        if (showBest && spec.best.includes(c)) return pal.t[1];
        const i = chain.indexOf(c);
        if (i === chain.length - 1 && !over) return pal.t[4];
        if (i >= 0) return pal.accent;
        if (peeking && NEIGHBORS.get(current())?.includes(c)) return pal.t[3];
        return null;
      },
      overlay(cx, path, proj, pal) {
        const stops = chain.map((c) => c.anchor);
        for (let i = 1; i < stops.length; i++) {
          const seg = { type: "LineString" as const, coordinates: [stops[i - 1], stops[i]] };
          cx.beginPath(); path(seg); cx.strokeStyle = pal.bg; cx.lineWidth = 4; cx.stroke();
          cx.beginPath(); path(seg); cx.strokeStyle = "#ffffff"; cx.setLineDash([3, 2]); cx.lineWidth = 2; cx.stroke(); cx.setLineDash([]);
        }
        for (const c of chain) if (globe.visible(c.anchor)) { const p = proj(c.anchor); if (p) pin(cx, p[0], p[1], c === from ? pal.good : pal.accent, pal.bg, 2); }
        if (globe.visible(to.anchor)) { const p = proj(to.anchor); if (p) { flag(cx, p[0], p[1], pal.accent2, pal.bg); label(cx, to.name, p[0] + 11, p[1] - 9, pal.fg, pal.bg, 8); } }
        if (globe.visible(from.anchor) && chain.length === 1) { const p = proj(from.anchor); if (p) label(cx, from.name, p[0] + 6, p[1] + 8, pal.fg, pal.bg, 8); }
        if (plane) {
          const at = geoInterpolate(plane.a, plane.b)(plane.t) as LonLat, ahead = geoInterpolate(plane.a, plane.b)(Math.min(1, plane.t + 0.05)) as LonLat;
          const p = proj(at), q = proj(ahead);
          if (p && globe.visible(at)) drawPlane(cx, p[0], p[1] - 4 - Math.sin(plane.t * Math.PI) * 6, q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0, pal.fg, pal.bg);
        } else if (!over && globe.visible(current().anchor)) {
          const p = proj(current().anchor); if (p) drawPlane(cx, p[0], p[1] - 7 - Math.round(Math.sin(pulse * 4) * 1.5), 0, pal.fg, pal.bg);
        }
      },
    };
    globe.onFrame = (dt) => { pulse += dt / 1000; };

    /** A tiny pixel plane, nose pointing along `angle`. */
    function drawPlane(c: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, outline: string) {
      c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(Math.round(angle / (Math.PI / 4)) * (Math.PI / 4));
      c.fillStyle = outline; c.fillRect(-6, -2, 13, 5); c.fillRect(-2, -6, 5, 13); c.fillRect(-7, -4, 3, 9);
      c.fillStyle = color; c.fillRect(-5, -1, 11, 3); c.fillRect(-1, -5, 3, 11); c.fillRect(-6, -3, 1, 7); c.fillRect(5, 0, 1, 1);
      c.restore();
    }

    function renderChain() {
      const stops = chain.map((c, i) => `<span class="otm-stop ${i === 0 ? "start" : ""}">${esc(c.name)}</span>`).join(`<i>→</i>`);
      $("chain").innerHTML = stops + (chain[chain.length - 1] === to ? "" : `<i>→</i><span class="otm-stop next">?</span><i>→</i><span class="otm-stop goal">${esc(to.name)}</span>`);
      $("fuel").innerHTML = `Fuel ${"<b>✈</b>".repeat(fuel)}${"<s>✈</s>".repeat(FUEL - fuel)}`;
      box.input.placeholder = over ? "" : `A neighbour of ${current().name}…`;
      ($("undo") as HTMLButtonElement).disabled = over || chain.length < 2;
      ($("peek") as HTMLButtonElement).disabled = over || peeking;
    }

    async function fly(a: Country, b: Country) {
      plane = { a: a.anchor, b: b.anchor, t: 0 };
      globe.turnTo(geoInterpolate(a.anchor, b.anchor)(0.6) as LonLat, 700);
      ctx.sound.tone(330, 0, 0.12, "square", 0.03); ctx.sound.tone(440, 0.1, 0.12, "square", 0.03);
      const start = performance.now();
      await new Promise<void>((res) => { const step = () => { if (!plane) return res(); plane.t = Math.min(1, (performance.now() - start) / 650); if (plane.t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      plane = null; globe.invalidate();
      const p = globe.proj(b.anchor); if (p) globe.burst(p[0], p[1], ["#ffffff", "#ffd66b"], 14, 1);
    }

    const box = guessBox(async (c, raw) => {
      if (over || plane) return;
      if (!c) { box.say(`“${esc(raw)}” isn't a country I know.`, "bad"); box.shake(); return; }
      const cur = current();
      if (chain.includes(c)) { box.say(`You've already been to ${esc(c.name)}.`); return; }
      if (!NEIGHBORS.get(cur)?.includes(c)) {
        fuel--; ctx.sound.miss(); box.shake();
        box.say(`${esc(c.name)} doesn't border ${esc(cur.name)}. −1 fuel`, "bad");
        renderChain();
        if (fuel <= 0) fail();
        return;
      }
      chain.push(c); peeking = false; box.say(c === to ? "" : `${esc(cur.name)} → <b>${esc(c.name)}</b>`, "good"); renderChain();
      await fly(cur, c);
      if (over) return;
      if (c === to) return arrive();
      if (NEIGHBORS.get(c)?.includes(to)) { chain.push(to); renderChain(); await fly(c, to); if (!over) arrive(); }
    }, "A neighbour of…");
    $("gb").appendChild(box.el);

    function arrive() {
      over = true; peeking = false; box.lock(); globe.invalidate();
      const used = chain.length - 2, perfect = used <= par;
      const points = Math.max(50, Math.round(1000 * Math.min(1, (par + 1) / (used + 1)) ** 1.5) - peeks * PEEK_COST);
      globe.shake = 0.8;
      const p = globe.proj(to.anchor); if (p) globe.burst(p[0], p[1], ["#ffffff", "#ffd66b", "#7ef2d2", "#ff7a8a"], 60, 2.4);
      box.say(perfect ? `Perfect route! ${used} ${used === 1 ? "stop" : "stops"}, same as par.` : `Made it in ${used} stops (par ${par}). Shortest: ${spec.best.map((c) => esc(c.name)).join(" → ")}.`, "good");
      renderChain();
      finish({ points, label: `${from.name} → ${to.name}: ${used} stops${perfect ? " (par!)" : ""}` });
    }
    function fail(why = "Out of fuel.") {
      over = true; showBest = true; peeking = false; box.lock(); globe.invalidate(); renderChain();
      box.say(`${why} The shortest route was ${spec.best.map((c) => esc(c.name)).join(" → ")}.`, "bad");
      finish({ points: 0, label: `${from.name} → ${to.name}: didn't make it` });
    }

    $("undo").onclick = () => { if (over || chain.length < 2) return; chain.pop(); peeking = false; globe.invalidate(); globe.turnTo(current().anchor); renderChain(); box.say(`Back to ${esc(current().name)}.`); };
    $("peek").onclick = () => { if (over) return; peeks++; peeking = true; globe.invalidate(); globe.turnTo(current().anchor); renderChain(); box.say(`${esc(current().name)}'s neighbours are glowing purple. −${PEEK_COST} at the finish.`); };
    $("give").onclick = () => fail("Gave up.");
    renderChain();
    box.input.focus({ preventScroll: true });
    return () => { over = true; plane = null; globe.destroy(); };
  },
};


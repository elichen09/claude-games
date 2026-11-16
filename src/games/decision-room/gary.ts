/**
 * Gary: the Decision Room's pixel judge, and the reveal show he runs.
 * Sequence: Gary walks in → gavel → ballots flip one at a time → headline → stats.
 */
import type { GameContext } from "@/lib/games/types";
import type { Result, RoomView, SideIndex } from "./types";

const PAL: Record<string, string> = {
  W: "#f4f1e8", w: "#cfc6b4", S: "#f2c49b", s: "#d9a27a", K: "#1d1a2e", B: "#f08a8a",
  R: "#2b2540", r: "#4a4170", C: "#ffffff", g: "#9fd3ff", T: "#7a3b2e",
};
// 16 × 20. Wig, round glasses, robe with a white jabot.
const BODY = [
  "....wWWWWWWw....",
  "...wWWWWWWWWw...",
  "..wWWWWWWWWWWw..",
  "..WWSSSSSSSSWW..",
  ".wWSSSSSSSSSSWw.",
  ".WWKKKKSSKKKKWW.",
  ".wWKggKKKKggKWw.",
  ".WWKKKKSSKKKKWW.",
  ".wWSSSSssSSSSWw.",
  ".WWSBSSSSSSBSWW.",
  ".wWSSSSSSSSSSWw.",
  "..WwSSSSSSSSwW..",
  "..w.RRCCCCRR.w..",
  "...RRRRCCRRRR...",
  "..RRRRRCCRRRRR..",
  ".SRRRRRrrRRRRR..",
  ".SRRRRRrrRRRRR..",
  "..RRRRRrrRRRRR..",
  "..RRRRRRRRRRRR..",
  "...KK......KK...",
];

function rects(rows: string[], dx = 0, dy = 0) {
  let out = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === ".") { x++; continue; }
      let w = 1;
      while (row[x + w] === c) w++;
      out += `<rect x="${x + dx}" y="${y + dy}" width="${w}" height="1" fill="${PAL[c]}"/>`;
      x += w;
    }
  });
  return out;
}

/** Gary as an inline SVG. `.g-mouth` and `.g-gavel` are animated by CSS. */
export function garySVG(cls = "") {
  return `<svg class="gary ${cls}" viewBox="0 0 26 21" shape-rendering="crispEdges" aria-hidden="true">
    ${rects(BODY)}
    <rect class="g-mouth" x="6" y="10" width="4" height="1" fill="#8a3b3b"/>
    <g class="g-gavel">
      <rect x="18.5" y="9" width="1" height="7" fill="${PAL.T}"/>
      <rect x="16" y="6" width="6" height="3" fill="#5a2a1f"/>
      <rect x="18" y="6" width="2" height="3" fill="#c98b4a"/>
      <rect x="17" y="15" width="3" height="2" fill="${PAL.S}"/>
    </g>
    <rect class="g-block" x="15" y="19" width="8" height="2" fill="#5a2a1f"/>
  </svg>`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(0) : String(Math.round(n * 100) / 100));

/** Winners and losers alternate so the deciding ballot comes last: 2–1 flips W, L, W. */
function revealOrder(r: Result) {
  if (r.winner === null) return r.ballots.slice();
  const W = r.ballots.filter((b) => b.winner === r.winner), L = r.ballots.filter((b) => b.winner !== r.winner);
  const out = [];
  while (W.length > 1 && L.length) out.push(W.shift()!, L.shift()!);
  out.push(...L, ...W);
  return out;
}

export function resultsHTML(room: RoomView, r: Result) {
  const n = r.ballots.length;
  const sideName = (s: SideIndex) => `${esc(room.labels[s])} · ${esc(room.sides[s].code)}`;
  const topAvg = r.speakers[0]?.avg ?? 0;
  const speakers = r.speakers.map((s) => `<tr class="s${s.side}"><td>${s.avg === topAvg && topAvg > 0 ? "★ " : ""}${esc(s.name)}</td><td>${esc(room.sides[s.side].code)}</td><td class="num">${fmt(s.avg)}</td><td class="num dim">${s.low === s.high ? fmt(s.low) : `${fmt(s.low)}–${fmt(s.high)}`}</td></tr>`).join("");
  const themes = r.themes.slice(0, 6).map((t) => `<li><span>${esc(t.label)}</span><i style="--w:${Math.round((t.count / Math.max(1, n)) * 100)}%"></i><b>${t.count}/${n}</b></li>`).join("");
  const ballots = r.ballots.map((b) => `<details class="dr-rfd s${b.winner}"><summary><b>${esc(b.judge)}</b> <span>→ ${sideName(b.winner)}</span></summary>
      <p class="dr-pts">${room.sides.map((side, s) => side.debaters.map((d, i) => `${esc(d)} <b>${fmt(b.points[s]?.[i] ?? 0)}</b>`).join(" · ")).join(" &nbsp;|&nbsp; ")}</p>
      <p class="dr-rfd-text">${esc(b.rfd).replace(/\n/g, "<br>")}</p></details>`).join("");
  return `
    <div class="dr-stats">
      <section class="panel dr-take"><span class="eyebrow">Gary's take</span><ul>${r.garyLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>
      <section class="panel"><span class="eyebrow">Speaker points</span>
        <table class="dr-table"><thead><tr><th>Debater</th><th>Team</th><th class="num">Avg</th><th class="num">Range</th></tr></thead><tbody>${speakers}</tbody></table>
        <p class="note">Team averages: ${esc(room.labels[0])} ${fmt(r.teamAvg[0])} · ${esc(room.labels[1])} ${fmt(r.teamAvg[1])}${r.lowPointWin ? " · <b>low-point win</b>" : ""}</p></section>
      ${themes ? `<section class="panel"><span class="eyebrow">What the RFDs were about</span><ul class="dr-bars">${themes}</ul>
        ${r.keywords.length ? `<div class="dr-chips">${r.keywords.map((k) => `<span>${esc(k.word)}${k.count > 1 ? ` <b>×${k.count}</b>` : ""}</span>`).join("")}</div>` : ""}</section>` : ""}
      ${r.keyLine ? `<section class="panel dr-quote"><span class="eyebrow">Why it went that way</span><blockquote>“${esc(r.keyLine.text)}”</blockquote><cite>${esc(r.keyLine.judge)}</cite>
        ${r.dissentLine ? `<span class="eyebrow">The dissent</span><blockquote>“${esc(r.dissentLine.text)}”</blockquote><cite>${esc(r.dissentLine.judge)}</cite>` : ""}</section>` : ""}
      <section class="panel"><span class="eyebrow">Every ballot</span>${ballots}</section>
    </div>`;
}

/**
 * Plays the reveal in a full-screen overlay. Returns a function that tears it down.
 * `instant` skips straight to the final screen (for replays and late joiners).
 */
export function playReveal(ctx: GameContext, room: RoomView, r: Result, opts: { instant?: boolean; onClose: () => void }) {
  const el = document.createElement("div");
  el.className = "dr-reveal";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Decision");
  const order = revealOrder(r);
  el.innerHTML = `<div class="dr-rv-inner">
    <div class="dr-rv-top"><span class="eyebrow">${esc(room.title)}${room.tournament ? ` · ${esc(room.tournament)}` : ""}</span>
      <div class="sp"></div><button class="ghost" data-skip>Skip ▸▸</button><button class="ghost" data-close>Close ✕</button></div>
    <div class="dr-matchup">
      <div class="dr-team s0"><small>${esc(room.labels[0])}</small><b>${esc(room.sides[0].code)}</b><span class="dr-count" data-c="0">0</span></div>
      <div class="dr-vs">vs</div>
      <div class="dr-team s1"><small>${esc(room.labels[1])}</small><b>${esc(room.sides[1].code)}</b><span class="dr-count" data-c="1">0</span></div>
    </div>
    <div class="dr-stage">
      <div class="dr-gary">${garySVG()}<div class="dr-bubble" aria-live="polite"></div></div>
      <div class="dr-cards">${order.map((b) => `<div class="dr-card s${b.winner}"><div class="dr-card-in"><div class="dr-back">BALLOT</div>
        <div class="dr-front"><small>${esc(b.judge)}</small><b>${esc(room.labels[b.winner])}</b><span>${esc(room.sides[b.winner].code)}</span></div></div></div>`).join("")}</div>
    </div>
    <h1 class="display dr-headline" aria-live="polite"></h1>
    <div class="dr-after"></div></div>`;
  document.body.appendChild(el);
  document.body.classList.add("dr-lock");

  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const bubble = $(".dr-bubble"), gary = $(".dr-gary"), headline = $(".dr-headline");
  const counts = [$<HTMLElement>('[data-c="0"]'), $<HTMLElement>('[data-c="1"]')];
  const cards = [...el.querySelectorAll<HTMLElement>(".dr-card")];
  let dead = false, fast = !!opts.instant, lineTimer = 0;
  const timers = new Set<number>();
  const wait = (ms: number) => new Promise<void>((res) => { if (fast || dead) return res(); const t = window.setTimeout(() => { timers.delete(t); res(); }, ms); timers.add(t); });

  const say = (line: string) => {
    bubble.textContent = line;
    bubble.classList.remove("on"); void bubble.offsetWidth; bubble.classList.add("on");
    gary.classList.add("talk");
    const t = window.setTimeout(() => gary.classList.remove("talk"), Math.min(2400, 300 + line.length * 35));
    timers.add(t);
  };
  const bang = () => {
    gary.classList.remove("bang"); void gary.offsetWidth; gary.classList.add("bang");
    if (!fast) { ctx.sound.tone(110, 0.06, 0.12, "square", 0.25); ctx.sound.tone(70, 0.08, 0.18, "triangle", 0.3); }
    el.classList.remove("shakescreen"); void el.offsetWidth; el.classList.add("shakescreen");
  };
  const tally = [0, 0];
  const flip = (i: number) => {
    const card = cards[i], s = order[i].winner;
    card.classList.add("flipped");
    tally[s]++;
    counts[s].textContent = String(tally[s]);
    counts[s].classList.remove("pop"); void counts[s].offsetWidth; counts[s].classList.add("pop");
    if (!fast) ctx.sound.tone(s === 0 ? 523 : 392, 0, 0.18, "square", 0.18);
  };

  const finish = () => {
    for (let i = 0; i < cards.length; i++) if (!cards[i].classList.contains("flipped")) flip(i);
    headline.textContent = r.headline;
    headline.classList.add("on");
    el.classList.add("decided");
    if (r.winner !== null) el.querySelector(`.dr-team.s${r.winner}`)?.classList.add("win");
    $(".dr-after").innerHTML = resultsHTML(room, r);
    $<HTMLButtonElement>("[data-skip]").hidden = true;
    let li = 0;
    say(r.garyLines[0] ?? "That's the decision.");
    window.clearInterval(lineTimer);
    if (r.garyLines.length > 1) lineTimer = window.setInterval(() => { li = (li + 1) % r.garyLines.length; say(r.garyLines[li]); }, 4200);
  };

  async function run() {
    if (fast) { gary.classList.add("here"); finish(); return; }
    ctx.sound.unlock();
    gary.classList.add("walk");
    await wait(1300); if (dead || fast) return;
    gary.classList.add("here");
    say("Order! Order! The panel has spoken.");
    await wait(1700); if (dead || fast) return;
    bang();
    await wait(600); if (dead || fast) return;
    say(cards.length === 1 ? "One ballot. Let's see it." : `${cards.length} ballots. Let's open them.`);
    await wait(1300);
    for (let i = 0; i < cards.length; i++) {
      if (dead || fast) return;
      if (i === cards.length - 1 && cards.length > 1) { say("And the last ballot…"); await wait(1500); if (dead || fast) return; }
      flip(i);
      await wait(1100);
    }
    if (dead || fast) return;
    bang();
    // Type the headline out
    headline.classList.add("on");
    for (let i = 1; i <= r.headline.length; i++) {
      if (dead || fast) return;
      headline.textContent = r.headline.slice(0, i);
      if (i % 2 === 0) ctx.sound.tick();
      await wait(32);
    }
    ctx.world.burst(4);
    ctx.sound.reward(r.unanimous ? 4 : 3);
    finish();
  }

  const close = () => { cleanup(); opts.onClose(); };
  $<HTMLButtonElement>("[data-skip]").onclick = () => { if (!fast) { fast = true; for (const t of timers) clearTimeout(t); finish(); } };
  $<HTMLButtonElement>("[data-close]").onclick = close;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  window.addEventListener("keydown", onKey);
  run();

  function cleanup() {
    if (dead) return;
    dead = true;
    for (const t of timers) clearTimeout(t);
    window.clearInterval(lineTimer);
    window.removeEventListener("keydown", onKey);
    document.body.classList.remove("dr-lock");
    el.remove();
  }
  return cleanup;
}

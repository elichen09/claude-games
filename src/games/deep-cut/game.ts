/* Deep Cut — the in-browser game. Renders into the root element the arcade hands it. */
import type { GameContext } from "@/lib/games/types";
import type { WorldId } from "@/lib/worlds/meta";
import {
  CATEGORIES, MODES, PROMPTS, catName, comboMult, dailySet, key, match, pct, pointsFor, pool, shuffle, tierFor, today, wasCorrected,
  type Prompt,
} from "./logic";

/** How each world flavors the game: score units, verbs, tier names. */
const FLAVOR: Record<WorldId, { mul: number; go: string; tiers: string[]; lost: string; depthWord: string; hint: string }> = {
  abyss: { mul: 10, go: "Dive", tiers: ["Surface", "Sunlit zone", "Twilight zone", "Midnight zone", "Hadal zone"], lost: "Surfaced", depthWord: "deep", hint: "rarer answers sink deeper" },
  core: { mul: 5, go: "Drill", tiers: ["Topsoil", "Crust", "Mantle", "Outer core", "Inner core"], lost: "Cooled off", depthWord: "down", hint: "rarer answers drill hotter" },
  collage: { mul: 50, go: "Float", tiers: ["Grounded", "Treetops", "Cloud nine", "Jet stream", "Over the moon"], lost: "Popped", depthWord: "up", hint: "rarer answers float higher" },
  orbit: { mul: 60, go: "Launch", tiers: ["Launchpad", "Stratosphere", "Low orbit", "Deep space", "Moonshot"], lost: "Splashdown", depthWord: "up", hint: "rarer answers fly higher" },
};
const TIER_EMOJI = ["⬜", "🟦", "🟩", "🟪", "🟨"];

interface Resolved { valid: boolean; name: string; share: number; rank?: number | null; corrected?: boolean }

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const tierColor = (t: number) => `var(--t${t})`;
const modeName = (id: string) => MODES.find((m) => m.id === id)!.name;

export function mountDeepCut(root: HTMLElement, ctx: GameContext) {
  const ls = ctx.storage;
  const S = Object.assign({ cat: "sports", mode: "daily" }, ls.get("settings", {} as Partial<{ cat: string; mode: string }>));
  const saveSettings = () => ls.set("settings", S);
  const fl = () => FLAVOR[ctx.world.current()];
  const fmt = (pts: number) => ctx.world.format(pts * fl().mul);
  const setDepth = (score: number) => ctx.world.setValue(score * fl().mul);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let G: any = null;
  let view = "home";
  let timerId: ReturnType<typeof setInterval> | null = null;
  let alive = true;

  function resolve(p: Prompt, input: string): Resolved {
    const m = match(p, input);
    return m ? { valid: true, name: m.name, share: m.share, rank: m.rank, corrected: wasCorrected(m, input) } : { valid: false, name: input, share: 0 };
  }

  /* ── ui helpers ── */
  function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function flash(text: string, color?: string) { document.querySelectorAll(".flash").forEach((x) => x.remove()); const f = document.createElement("div"); f.className = "flash"; f.textContent = text; if (color) f.style.color = color; document.body.appendChild(f); setTimeout(() => f.remove(), 1200); }
  function header() {
    return `<div class="toolbar">
      <button class="title-btn" id="dcHome" aria-label="Deep Cut menu">Deep Cut</button>
      <span class="sp"></span>
    </div>`;
  }
  function wireHeader() {
    const hb = $("dcHome");
    if (hb) hb.onclick = () => {
      if (view === "home") return;
      if (G && !G.over && view !== "end") {
        if (!hb.dataset.arm) { hb.dataset.arm = "1"; toast("Tap Deep Cut again to quit this game"); setTimeout(() => delete hb.dataset.arm, 2500); return; }
      }
      stopTimer(); G = null; go("home");
    };
  }
  function go(v: string) { view = v; render(); window.scrollTo({ top: 0 }); }
  function render() {
    if (!alive) return;
    ctx.world.follow(view !== "home");
    ({ home: renderHome, game: renderGame, end: renderEnd, partySetup: renderPartySetup, party: renderParty } as Record<string, () => void>)[view]();
    wireHeader();
  }
  const keepScroll = (fn: () => void) => { const y = window.scrollY; fn(); window.scrollTo({ top: y }); };

  /* ───────────── HOME ───────────── */
  function renderHome() {
    setDepth(0);
    const best = ls.get<Record<string, number>>("best", {});
    const done = ls.get<{ score: number } | null>("daily:" + today() + ":" + S.cat, null);
    const ex: [string, number][] = [["Apple", 26], ["Mango", 3], ["Lychee", 0.2]];
    const total = PROMPTS.reduce((n, p) => n + p.answers.length, 0);
    root.innerHTML = header() + `
    <div class="skyspace"></div>
    <section class="panel hero">
      <span class="eyebrow">Rarity word game · ${today()}</span>
      <h1 class="display">Say the answer <em>nobody</em> else would.</h1>
      <p>Every prompt has a crowd of obvious answers. Name something real that fits; the rarer it is, the more you score. Obvious picks barely count.</p>
      <div class="example"><span class="q">Name a fruit:</span>${ex.map(([n, s]) => `<span class="chip-ex">${n} <span class="note">${pct(s)}</span> <b style="color:${tierColor(tierFor(s))}">+${fmt(pointsFor(s))}</b></span>`).join("")}</div>
      <span class="hint">▼ ${fl().hint} ▼</span>
    </section>
    <section class="panel step"><h2><span class="n">1</span>Category</h2>
      <div class="cats">${CATEGORIES.map((c) => `<button class="cat" data-cat="${c.id}" aria-pressed="${S.cat === c.id}"><b>${c.name}</b><small>${c.blurb}</small></button>`).join("")}</div>
    </section>
    <section class="panel step"><h2><span class="n">2</span>Mode</h2>
      <div class="modes">${MODES.map((m) => `<button class="mode" data-mode="${m.id}" aria-pressed="${S.mode === m.id}"><b>${m.name}</b><small>${m.blurb}</small>${m.id === "daily" && done ? `<span class="best">Today: ${fmt(done.score)}</span>` : best[m.id] ? `<span class="best">Best: ${fmt(best[m.id])}</span>` : ""}</button>`).join("")}</div>
    </section>
    <section class="panel step"><h2><span class="n">3</span>World</h2>
      <div class="skins">${ctx.world.list().map((w) => `<button class="skin" data-world-id="${w.id}" aria-pressed="${ctx.world.current() === w.id}"><span class="sw" style="background:${w.swatch}"></span><span class="lbl"><b>${w.name}</b><small>${w.sub}</small></span></button>`).join("")}</div>
    </section>
    <section class="panel"><div class="row"><button class="go" id="start">${S.mode === "daily" && done ? "See today's dive" : "Start " + modeName(S.mode)}</button>
      <span class="note">${catName(S.cat)} · ${pool(S.cat).length} prompts</span></div></section>
    <footer class="footer"><span>Rarity figures are estimates.</span><span>${PROMPTS.length} prompts · ${total.toLocaleString("en-US")} answers</span></footer>`;
    root.querySelectorAll<HTMLElement>(".cat").forEach((b) => (b.onclick = () => keepScroll(() => { S.cat = b.dataset.cat!; saveSettings(); ctx.sound.click(); render(); })));
    root.querySelectorAll<HTMLElement>(".mode").forEach((b) => (b.onclick = () => keepScroll(() => { S.mode = b.dataset.mode!; saveSettings(); ctx.sound.click(); render(); })));
    root.querySelectorAll<HTMLElement>(".skin").forEach((b) => (b.onclick = () => keepScroll(() => { ctx.world.set(b.dataset.worldId as WorldId); render(); ctx.sound.reward(2); })));
    $("start").onclick = () => { ctx.sound.unlock(); start(); };
  }

  /* ───────────── GAME (daily / survival / blitz) ───────────── */
  function start() {
    const cat = S.cat, mode = S.mode;
    if (mode === "party") return go("partySetup");
    let prompts: Prompt[];
    if (mode === "daily") {
      const done = ls.get<{ score: number; results: unknown[] } | null>("daily:" + today() + ":" + cat, null);
      if (done) { G = { mode, cat, score: done.score, results: done.results, over: true, replayOf: true }; return go("end"); }
      prompts = dailySet(cat);
    } else prompts = shuffle(pool(cat));
    setDepth(0);
    G = { mode, cat, prompts, i: 0, score: 0, combo: 0, lives: 3, results: [], tries: 0, phase: "ask", time: 75, over: false };
    go("game");
    if (mode === "blitz") startTimer();
  }
  function startTimer() {
    stopTimer();
    let last = performance.now();
    timerId = setInterval(() => {
      const now = performance.now(); G.time -= (now - last) / 1000; last = now;
      const el = root.querySelector<HTMLElement>("#timer");
      if (el) { el.textContent = Math.max(0, G.time).toFixed(1) + "s"; el.classList.toggle("low", G.time < 10); }
      if (G.time < 10 && Math.floor(G.time) !== G.lastTick) { G.lastTick = Math.floor(G.time); ctx.sound.tick(); }
      if (G.time <= 0) { stopTimer(); finish(); }
    }, 100);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  const cur = (): Prompt => G.prompts[G.i % G.prompts.length];

  function hud() {
    let mid = "";
    if (G.mode === "daily") mid = `<div class="dots" aria-label="Progress">${G.prompts.map((_: unknown, i: number) => { const r = G.results[i]; return `<span class="dot ${i === G.i ? "cur" : ""}" style="${r ? `background:${r.valid ? tierColor(r.tier) : "transparent"}` : ""}"></span>`; }).join("")}</div>`;
    if (G.mode === "survival") mid = `<div class="hearts" aria-label="${G.lives} lives">${[0, 1, 2].map((i) => `<span class="${i < G.lives ? "" : "lost"}">♥</span>`).join("")}</div>`;
    if (G.mode === "blitz") mid = `<span class="timer" id="timer">${G.time.toFixed(1)}s</span>`;
    return `<div id="hudwrap"><div class="hud"><span class="tag">${modeName(G.mode)} · ${catName(G.cat)}</span>${mid}
      <span class="combo" ${G.combo >= 2 ? "" : "hidden"}>Combo ×${comboMult(G.combo)}</span>
      <span class="score" id="score">${fmt(G.score)}</span></div>
      <div class="meter"><i style="width:${Math.round(ctx.world.progress() * 100)}%"></i></div></div>`;
  }
  function renderGame() {
    const p = cur();
    const n = G.mode === "daily" ? `Prompt ${G.i + 1} of 7` : G.mode === "survival" ? `Prompt ${G.i + 1}` : `${G.results.filter((r: Resolved) => r.valid).length} answered`;
    const tryNote = G.mode === "daily" ? (G.tries ? "Last try" : "Two tries") : G.mode === "survival" ? "Obvious answers cost a life" : "Misses don't count. Keep typing.";
    root.innerHTML = header() + hud() + `
    <section class="card" id="qcard">
      <div class="eyebrow" id="eyebrow">${n} · ${catName(p.cat)}</div>
      <h1 class="prompt" id="ptext">${esc(p.q)}</h1>
      ${G.phase === "ask" ? `
      <form class="answer" id="form" autocomplete="off"><input class="field" id="ans" name="ans" maxlength="80" placeholder="Something nobody else would say…" aria-label="Your answer" autocapitalize="words" spellcheck="false">
        <button class="go" type="submit" id="goBtn">${fl().go}</button></form>
      <div class="helper"><span id="msg">${tryNote}</span>${G.mode === "blitz" ? `<button class="ghost" type="button" id="skip">Skip</button>` : `<span>${p.answers.length}+ answers on the board</span>`}</div>` : ""}
    </section>
    <section id="reveal"></section>`;
    if (G.phase === "ask") {
      const inp = $<HTMLInputElement>("ans");
      inp.focus();
      $("form").onsubmit = (e) => { e.preventDefault(); submit(inp.value); };
      const sk2 = root.querySelector<HTMLElement>("#skip");
      if (sk2) sk2.onclick = () => { G.combo = 0; G.i++; ctx.sound.click(); blitzNext("Skipped."); };
    } else showReveal();
  }
  function submit(raw: string) {
    const input = raw.trim(); if (!input) return;
    const p = cur(), msg = $("msg"), card = $("qcard");
    const shakeCard = () => { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); };
    if (G.mode === "blitz") {
      const m = match(p, input);
      if (!m) { ctx.sound.miss(); shakeCard(); msg.innerHTML = `<span class="err">Not on the board. Try another or skip.</span>`; $<HTMLInputElement>("ans").select(); return; }
      const t = tierFor(m.share); G.combo = t >= 2 ? G.combo + 1 : 0;
      const pts = Math.round(pointsFor(m.share) * comboMult(G.combo));
      G.score += pts; G.results.push({ q: p.q, input, valid: true, name: m.name, share: m.share, tier: t, pts });
      setDepth(G.score); ctx.sound.reward(t); if (t >= 3) ctx.world.burst(t);
      flash(`+${fmt(pts)} · ${m.name} ${pct(m.share)}`, tierColor(t));
      G.i++; blitzNext(""); return;
    }
    const r = resolve(p, input);
    if (!r.valid && G.mode === "daily" && G.tries === 0) {
      G.tries = 1; ctx.sound.miss(); shakeCard();
      const inp = $<HTMLInputElement>("ans"); inp.select(); inp.focus();
      msg.innerHTML = `<span class="err">Not on the board. One try left.</span>`; return;
    }
    const t = r.valid ? tierFor(r.share) : -1;
    let pts = 0;
    if (r.valid) { G.combo = t >= 2 ? G.combo + 1 : 0; pts = Math.round(pointsFor(r.share) * comboMult(G.combo)); }
    else G.combo = 0;
    let lifeLost = false;
    if (G.mode === "survival" && (!r.valid || t === 0)) { G.lives--; lifeLost = true; }
    G.score += pts;
    G.results.push({ q: p.q, pid: p.id, input, valid: r.valid, name: r.name, share: r.share, rank: r.rank, corrected: r.corrected, tier: t, pts, mult: comboMult(G.combo), lifeLost });
    G.phase = "reveal";
    setDepth(G.score);
    if (r.valid) { ctx.sound.reward(t); if (t >= 3) ctx.world.burst(t); if (t === 4) { document.body.classList.remove("shakescreen"); void document.body.offsetWidth; document.body.classList.add("shakescreen"); } }
    else ctx.sound.miss();
    renderGame();
  }
  function blitzNext(note: string) {
    const p = cur();
    $("hudwrap").outerHTML = hud();
    $("eyebrow").textContent = `${G.results.length} answered · ${catName(p.cat)}`;
    const pt = $("ptext"); pt.textContent = p.q; pt.classList.remove("pop"); void pt.offsetWidth; pt.classList.add("pop");
    const inp = $<HTMLInputElement>("ans"); inp.value = ""; inp.focus();
    $("msg").textContent = note || "Misses don't count. Keep typing.";
  }
  function barHTML(rank: number | "new", name: string, share: number, max: number, you: boolean) {
    return `<div class="bar ${you ? "you" : ""}"><span class="fill" data-w="${Math.max(2, (share / max) * 100)}"></span><span class="rk">${rank === "new" ? "+" : "#" + rank}</span><span>${esc(name)}${you ? " ← you" : ""}</span><span class="pc">${pct(share)}</span></div>`;
  }
  function boardHTML(p: Prompt, res: Resolved | null, n = 8) {
    const max = p.answers[0].share;
    let html = p.answers.slice(0, n).map((a) => barHTML(a.rank, a.name, a.share, max, !!(res && res.valid && a.name === res.name))).join("");
    if (res && res.valid) {
      if (res.rank && res.rank > n) html += `<div class="bar gap">· · · ${res.rank - n - 1 > 0 ? res.rank - n - 1 + " more" : ""}</div>` + barHTML(res.rank, res.name, res.share, max, true);
    }
    return `<div class="board"><h3>What the crowd said · ${p.answers.length} answers on the board</h3>${html}</div>`;
  }
  function animateBars(el: HTMLElement) { requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll<HTMLElement>(".fill").forEach((f, i) => setTimeout(() => (f.style.width = f.dataset.w + "%"), i * 60)))); }
  function showReveal() {
    const r = G.results[G.results.length - 1], p = cur(), el = $("reveal");
    const lastOne = (G.mode === "daily" && G.i >= 6) || (G.mode === "survival" && G.lives <= 0);
    const tierName = r.valid ? fl().tiers[r.tier] : "Not on the board";
    el.className = "card reveal";
    el.innerHTML = `
      <div class="verdict pop">
        <span class="tier" style="color:${r.valid ? tierColor(r.tier) : "var(--bad)"}">${tierName}</span>
        <span class="what">${r.valid ? `<b>${esc(r.name)}</b>: ${r.share >= 0.1 ? "about " : ""}${pct(r.share)} of players say this${r.rank ? ` (#${r.rank})` : ""}.${r.corrected ? ` <span class="note">Read “${esc(r.input)}” as ${esc(r.name)}.</span>` : ""}` : `“${esc(r.input)}” isn't on the board.`}</span>
        <span class="pts" style="color:${r.valid ? tierColor(r.tier) : "var(--muted)"}">+${fmt(r.pts)}${r.mult > 1 && r.valid ? ` <small class="note">combo ×${r.mult}</small>` : ""}</span>
        ${r.lifeLost ? `<span class="note" style="color:var(--bad)">${r.valid ? "Too obvious. " : ""}You lost a life.</span>` : ""}
      </div>
      ${boardHTML(p, r)}
      <div class="row"><button class="go" id="next">${lastOne ? "See results" : "Next prompt"}</button><span class="note">or press Enter</span></div>`;
    animateBars(el);
    const nx = $("next"); nx.focus();
    nx.onclick = () => {
      if (lastOne) return finish();
      G.i++; G.tries = 0; G.phase = "ask"; renderGame();
    };
  }
  function finish() {
    stopTimer(); G.over = true;
    const best = ls.get<Record<string, number>>("best", {});
    G.newBest = G.score > (best[G.mode] || 0) && G.score > 0;
    if (G.newBest) { best[G.mode] = G.score; ls.set("best", best); }
    if (G.mode === "daily") ls.set("daily:" + today() + ":" + G.cat, { score: G.score, results: G.results.map(({ q, input, valid, name, share, tier, pts }: Record<string, unknown>) => ({ q, input, valid, name, share, tier, pts })) });
    if (G.newBest) ctx.world.burst(4);
    go("end");
  }
  function shareText() {
    const sq = G.results.map((r: Record<string, number>) => (r.valid ? TIER_EMOJI[r.tier] : "⬛")).join("");
    const label = G.mode === "daily" ? `Daily · ${today()}` : modeName(G.mode);
    return `Deep Cut · ${catName(G.cat)} ${label}\n${sq}\n${fmt(G.score)} ${fl().depthWord}\n${window.location.origin}/games/deep-cut`;
  }
  function renderEnd() {
    setDepth(G.score);
    const valid = G.results.filter((r: Resolved) => r.valid);
    const rarest = valid.slice().sort((a: Resolved, b: Resolved) => a.share - b.share)[0];
    const head = G.mode === "survival" ? `${fl().lost} after ${G.results.length} prompts` : G.mode === "blitz" ? `${valid.length} answers in 75 seconds` : G.replayOf ? "You already took today's dive" : "Today's dive";
    root.innerHTML = header() + `
    <section class="card">
      <div class="eyebrow">${modeName(G.mode)} · ${catName(G.cat)}</div>
      <h1 class="prompt">${head}</h1>
      <div class="big">${fmt(G.score)}</div>
      ${G.newBest ? `<span class="pill">New personal best</span>` : ""}
      ${rarest ? `<p style="margin:0">Deepest cut: <b>${esc(rarest.name)}</b> at ${pct(rarest.share)}, a <span style="color:${tierColor(rarest.tier)}">${fl().tiers[rarest.tier]}</span> answer.</p>` : ""}
      <div class="row"><button class="go" id="again">${G.mode === "daily" ? "Play Survival" : "Play again"}</button><button class="ghost" id="copy">Copy result</button><button class="ghost" id="menu">Change category</button></div>
      <div class="sharebox" id="sharebox">${esc(shareText())}</div>
    </section>
    <section class="recap">${G.results.map((r: Record<string, never>) => `<div class="r"><span class="p">${esc(r.q)}</span><span class="a">${esc(r.valid ? r.name : r.input)} <span class="pill" style="background:${r.valid ? tierColor(r.tier) : "var(--bad)"}">${r.valid ? fl().tiers[r.tier] : "miss"}</span>${r.valid ? ` <span class="note">${pct(r.share)}</span>` : ""}</span><span class="s">+${fmt(r.pts)}</span></div>`).join("") || `<p class="note">No answers this time.</p>`}</section>`;
    $("again").onclick = () => { if (G.mode === "daily") { S.mode = "survival"; saveSettings(); } start(); };
    $("menu").onclick = () => { G = null; go("home"); };
    $("copy").onclick = async () => {
      try { await navigator.clipboard.writeText(shareText()); toast("Copied"); }
      catch { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents($("sharebox")); sel?.removeAllRanges(); sel?.addRange(rg); toast("Selected. Copy it from here."); }
    };
  }

  /* ───────────── PARTY ───────────── */
  function renderPartySetup() {
    const P = ls.get<{ names: string[]; rounds: number } | null>("party", null) || { names: ["Player 1", "Player 2", "Player 3"], rounds: 5 };
    root.innerHTML = header() + `
    <section class="card">
      <div class="eyebrow">Party · ${catName(S.cat)}</div>
      <h1 class="prompt">Who's playing?</h1>
      <p class="note" style="margin:0">Pass one device around. Everyone answers the same prompt in secret, then it's all revealed. If two people say the same thing, both score zero.</p>
      <div class="players">${P.names.map((n, i) => `<div class="pl"><input class="field" id="pl${i}" value="${esc(n)}" maxlength="18" aria-label="Player ${i + 1} name"><button class="ghost" data-rm="${i}" aria-label="Remove player">✕</button></div>`).join("")}</div>
      <div class="row"><button class="ghost" id="add">Add player</button><span class="note">2 to 6 players</span></div>
      <div class="row"><span class="note">Rounds</span><div class="seg">${[3, 5, 7].map((n) => `<button data-r="${n}" aria-pressed="${P.rounds === n}">${n}</button>`).join("")}</div></div>
      <div class="row"><button class="go" id="pstart">Start party</button></div>
    </section>`;
    const read = () => { P.names = [...root.querySelectorAll<HTMLInputElement>(".players input")].map((i, k) => i.value.trim() || "Player " + (k + 1)); };
    const rerender = () => { ls.set("party", P); renderPartySetup(); wireHeader(); };
    root.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) => (b.onclick = () => { read(); if (P.names.length > 2) { P.names.splice(+b.dataset.rm!, 1); rerender(); } }));
    $("add").onclick = () => { read(); if (P.names.length < 6) { P.names.push("Player " + (P.names.length + 1)); rerender(); } };
    root.querySelectorAll<HTMLElement>("[data-r]").forEach((b) => (b.onclick = () => { read(); P.rounds = +b.dataset.r!; rerender(); }));
    $("pstart").onclick = () => {
      read(); ls.set("party", P); ctx.sound.unlock(); setDepth(0);
      G = { mode: "party", cat: S.cat, prompts: shuffle(pool(S.cat)).slice(0, P.rounds), round: 0, turn: 0, turnCount: 0, players: P.names.map((name) => ({ name, score: 0 })), answers: [], step: "handoff", over: false, results: [] };
      go("party");
    };
  }
  function renderParty() {
    const p: Prompt = G.prompts[G.round], pl = G.players[G.turn];
    const tag = `<div class="hud"><span class="tag">Party · Round ${G.round + 1} of ${G.prompts.length}</span><span class="score" style="font-size:calc(15px * var(--dsize))">${G.players.map((x: { name: string; score: number }) => esc(x.name) + " " + Math.round(x.score * fl().mul).toLocaleString("en-US")).join(" · ")}</span></div>`;
    const again = () => { renderParty(); wireHeader(); };
    if (G.step === "handoff") {
      root.innerHTML = header() + tag + `<section class="card"><div class="eyebrow">Pass the device</div><h1 class="prompt">${esc(pl.name)}, you're up.</h1><p class="note" style="margin:0">Nobody else looks. Your answer stays hidden until everyone's in.</p><div class="row"><button class="go" id="ready">I'm ${esc(pl.name)}</button></div></section>`;
      $("ready").onclick = () => { G.step = "answer"; ctx.sound.click(); again(); };
      $("ready").focus();
    } else if (G.step === "answer") {
      root.innerHTML = header() + tag + `<section class="card" id="qcard"><div class="eyebrow">${esc(pl.name)} · secret answer</div><h1 class="prompt">${esc(p.q)}</h1>
        <form class="answer" id="form" autocomplete="off"><input class="field" id="ans" maxlength="80" placeholder="Go deep…" aria-label="Your answer" spellcheck="false"><button class="go" type="submit">${fl().go}</button></form>
        <div class="helper"><span id="msg">Rare answers score big. Matching someone else scores zero.</span></div></section>`;
      const inp = $<HTMLInputElement>("ans"); inp.focus();
      $("form").onsubmit = (e) => {
        e.preventDefault(); const v = inp.value.trim(); if (!v) return;
        G.answers.push({ player: G.turn, input: v }); ctx.sound.click();
        G.turnCount++; // seats rotate each round so nobody always goes first
        if (G.turnCount < G.players.length) { G.turn = (G.round + G.turnCount) % G.players.length; G.step = "handoff"; } else resolveRound();
        again();
      };
    } else if (G.step === "reveal") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = G.answers.slice().sort((a: any, b: any) => b.pts - a.pts);
      const lastRound = G.round >= G.prompts.length - 1;
      root.innerHTML = header() + tag + `<section class="card reveal"><div class="eyebrow">Round ${G.round + 1} reveal</div><h1 class="prompt">${esc(p.q)}</h1>
        <div class="recap">${rows.map((a: Record<string, never>) => `<div class="pa pop"><span class="who">${esc(G.players[a.player].name)}</span><span class="s" style="text-align:right">+${fmt(a.pts)}</span>
          <span><b>${esc(a.valid ? a.name : a.input)}</b> ${a.jinx ? `<span class="pill" style="background:var(--bad)">Jinx</span>` : a.valid ? `<span class="pill" style="background:${tierColor(a.tier)}">${fl().tiers[a.tier]}</span> <span class="note">${pct(a.share)}</span>` : `<span class="pill" style="background:var(--bad)">miss</span>`}</span></div>`).join("")}</div>
        ${boardHTML(p, null, 6)}
        <div class="row"><button class="go" id="pnext">${lastRound ? "Final scores" : "Next round"}</button></div></section>`;
      animateBars(root);
      $("pnext").onclick = () => {
        if (lastRound) { G.step = "final"; G.over = true; ctx.world.burst(4); ctx.sound.reward(4); }
        else { G.round++; G.turn = G.round % G.players.length; G.answers = []; G.step = "handoff"; G.turnCount = 0; }
        again();
      };
    } else if (G.step === "final") {
      const ranked = G.players.slice().sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      root.innerHTML = header() + `<section class="card"><div class="eyebrow">Party · ${catName(G.cat)} · final</div><h1 class="prompt">${esc(ranked[0].name)} goes deepest.</h1>
        <div class="scoreboard">${ranked.map((x: { name: string; score: number }, i: number) => `<div class="sb ${i === 0 ? "lead" : ""}"><span>${i + 1}</span><span>${esc(x.name)}</span><b>${fmt(x.score)}</b></div>`).join("")}</div>
        <div class="row"><button class="go" id="prematch">Rematch</button><button class="ghost" id="pmenu">Menu</button></div></section>`;
      $("prematch").onclick = () => go("partySetup");
      $("pmenu").onclick = () => { G = null; go("home"); };
    }
  }
  /** Scores the round's answers, applies jinxes and moves the party to the reveal. */
  function resolveRound() {
    const p: Prompt = G.prompts[G.round];
    for (const a of G.answers) {
      Object.assign(a, resolve(p, a.input));
      a.tier = a.valid ? tierFor(a.share) : -1; a.pts = a.valid ? pointsFor(a.share) : 0;
    }
    const seen = new Map<string, number>();
    for (const a of G.answers) if (a.valid) { const k = key(a.name); seen.set(k, (seen.get(k) || 0) + 1); }
    for (const a of G.answers) if (a.valid && (seen.get(key(a.name)) || 0) > 1) { a.jinx = true; a.pts = 0; }
    for (const a of G.answers) G.players[a.player].score += a.pts;
    const bestT = Math.max(-1, ...G.answers.map((a: { jinx?: boolean; tier: number }) => (a.jinx ? -1 : a.tier)));
    if (bestT >= 0) ctx.sound.reward(bestT); else ctx.sound.miss();
    if (bestT >= 3) ctx.world.burst(bestT);
    setDepth(Math.max(...G.players.map((x: { score: number }) => x.score)));
    G.step = "reveal";
  }

  /* keyboard: Enter advances reveal screens */
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.key !== "Enter" || t?.tagName === "INPUT" || t?.tagName === "BUTTON") return;
    const b = root.querySelector<HTMLElement>("#next") || root.querySelector<HTMLElement>("#pnext");
    if (b) { e.preventDefault(); b.click(); }
  };
  window.addEventListener("keydown", onKey);
  render();

  return () => {
    alive = false;
    stopTimer();
    window.removeEventListener("keydown", onKey);
    document.querySelectorAll(".flash,.toast").forEach((x) => x.remove());
    ctx.world.setValue(0);
    ctx.world.follow(false);
    root.innerHTML = "";
  };
}

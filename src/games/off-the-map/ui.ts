/* Off the Map: the round runner (HUD → rounds → results) and the country-guess input shared by the modes. */
import type { GameContext } from "@/lib/games/types";
import { COUNTRIES, hashStr, matchCountry, norm, seeded, today, type Country } from "./geo";

export interface RoundResult { points: number; label: string }
export interface RoundEnv {
  ctx: GameContext; rnd: () => number; round: number; rounds: number;
  /** Show (or clear with null) a small badge in the HUD, e.g. a streak multiplier. */
  badge(text: string | null): void;
}
/** Renders one round into `stage`; calls finish() once the round is scored. Returns a cleanup function. */
export type RoundFn<S> = (stage: HTMLElement, spec: S, env: RoundEnv, finish: (r: RoundResult) => void) => () => void;

export interface ModeDef<S = unknown> {
  id: string;
  name: string;
  tagline: string;
  how: string;
  rounds: number;
  /** Build every round's puzzle up front from the seeded random source. */
  prepare(rnd: () => number): Promise<S[]> | S[];
  round: RoundFn<S>;
  /** Called once when a game starts, so a mode can reset state that spans rounds (like a streak). */
  start?(): void;
}

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const tierFor = (p: number) => (p >= 900 ? 4 : p >= 700 ? 3 : p >= 450 ? 2 : p >= 200 ? 1 : 0);
export const pts = (n: number) => Math.round(n).toLocaleString("en-US");
const TIER_EMOJI = ["⬜", "🟦", "🟩", "🟪", "🟨"];

/** Plays a whole mode: HUD, each round, then results. Returns a cleanup function. */
export function runMode<S>(root: HTMLElement, ctx: GameContext, mode: ModeDef<S>, daily: boolean, onMenu: () => void, onAgain: () => void): () => void {
  const date = today();
  const rnd = seeded(daily ? hashStr(`otm:${mode.id}:${date}`) : (Math.random() * 2 ** 32) >>> 0);
  const results: RoundResult[] = [];
  let i = 0, total = 0, cleanup: (() => void) | null = null, alive = true;
  mode.start?.();

  root.innerHTML = `
    <div class="otm-hud panel"><button class="otm-back" id="otmBack" aria-label="Back to modes">◀ Modes</button>
      <span class="otm-hud-mode">${esc(mode.name)}${daily ? " · Daily" : ""}</span><span class="sp"></span>
      <span class="otm-badge" id="otmBadge" hidden></span><span class="otm-round" id="otmRound"></span><span class="otm-total" id="otmTotal">0</span></div>
    <div id="otmStage" class="otm-stage"><section class="panel otm-loading"><span class="spinner"></span> Loading the map…</section></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  $("otmBack").onclick = () => { ctx.sound.click(); onMenu(); };
  const hud = () => { $("otmRound").textContent = i < mode.rounds ? `Round ${i + 1}/${mode.rounds}` : "Done"; $("otmTotal").textContent = pts(total) + " pts"; };
  const badge = (t: string | null) => { const b = $("otmBadge"); b.hidden = !t; b.textContent = t || ""; if (t) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } };

  Promise.resolve(mode.prepare(rnd)).then((specs) => { if (alive) next(specs); });

  function next(specs: S[]) {
    hud();
    const stage = $("otmStage");
    stage.innerHTML = "";
    const host = document.createElement("div"); host.className = "otm-round-host"; stage.appendChild(host);
    cleanup = mode.round(host, specs[i], { ctx, rnd, round: i, rounds: mode.rounds, badge }, (r) => {
      if (!alive) return;
      results.push(r); total += r.points; hud();
      ctx.world.setValue(total); ctx.sound.reward(tierFor(r.points)); if (r.points >= 900) ctx.world.burst(4); else if (r.points >= 700) ctx.world.burst(3);
      const bar = document.createElement("section"); bar.className = "panel otm-next";
      const last = i + 1 >= mode.rounds;
      bar.innerHTML = `<div class="otm-earn"><b>+${pts(r.points)}</b> <span class="note">${esc(r.label)}</span></div><button class="go" id="otmNext">${last ? "See results" : "Next round"}</button>`;
      stage.appendChild(bar);
      bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
      bar.querySelector<HTMLButtonElement>("#otmNext")!.onclick = () => { ctx.sound.click(); cleanup?.(); cleanup = null; i++; if (i < mode.rounds) next(specs); else finishGame(); };
    });
  }

  function finishGame() {
    hud(); badge(null);
    const best = ctx.storage.get<Record<string, number>>("best", {});
    const isBest = total > (best[mode.id] || 0);
    if (isBest) { best[mode.id] = total; ctx.storage.set("best", best); }
    if (daily) ctx.storage.set(`daily:${mode.id}:${date}`, { total, tiers: results.map((r) => tierFor(r.points)) });
    const share = `Off the Map · ${mode.name}${daily ? " · " + date : ""}\n${results.map((r) => TIER_EMOJI[tierFor(r.points)]).join("")} ${pts(total)} pts`;
    $("otmStage").innerHTML = `
      <section class="panel otm-results">
        <span class="eyebrow">${esc(mode.name)}${daily ? " · Daily " + date : " · Practice"}</span>
        <h1 class="display">${pts(total)} <small>pts</small></h1>
        ${isBest ? `<p class="otm-best">New best!</p>` : `<p class="note">Best: ${pts(best[mode.id] || 0)}</p>`}
        <ol class="otm-recap">${results.map((r) => `<li><span>${TIER_EMOJI[tierFor(r.points)]}</span><span>${esc(r.label)}</span><b>${pts(r.points)}</b></li>`).join("")}</ol>
        <div class="row"><button class="go" id="otmShare">Copy result</button><button class="ghost" id="otmAgain">${daily ? "Practice round" : "Play again"}</button><button class="ghost" id="otmMenu">Modes</button></div>
      </section>`;
    if (total >= mode.rounds * 700) ctx.world.burst(4);
    $("otmShare").onclick = () => { navigator.clipboard?.writeText(share).then(() => ($("otmShare").textContent = "Copied!"), () => {}); };
    $("otmAgain").onclick = () => { ctx.sound.click(); onAgain(); };
    $("otmMenu").onclick = () => { ctx.sound.click(); onMenu(); };
  }

  return () => { alive = false; cleanup?.(); cleanup = null; };
}

let listId = 0;
/** Countries whose name (or a nickname) starts with what's been typed: name starts first, then word starts. */
function suggest(q: string, limit = 6): Country[] {
  const n = norm(q), k = n.replace(/ /g, "");
  if (!k) return [];
  const scored: [number, Country][] = [];
  for (const c of COUNTRIES) {
    if (c.key === "Antarctica") continue;
    const name = norm(c.name);
    const score = name.replace(/ /g, "").startsWith(k) ? 0 : name.split(" ").some((w) => w.startsWith(n)) ? 1 : c.keys.some((ck) => ck.startsWith(k)) ? 2 : -1;
    if (score >= 0) scored.push([score, c]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, c]) => c);
}

/**
 * A country guess box with its own suggestion list (the browser's datalist matches letters anywhere and doesn't
 * submit on pick). Arrow keys move, Enter or a tap guesses the highlighted country, Esc closes the list.
 * onGuess gets the matched country (or null) and the raw text.
 */
export function guessBox(onGuess: (c: Country | null, raw: string) => void, placeholder = "Type a country…") {
  const id = `otm-suggest-${++listId}`;
  const el = document.createElement("form");
  el.className = "otm-guess"; el.autocomplete = "off";
  el.innerHTML = `<div class="otm-ac"><input class="field" maxlength="60" placeholder="${esc(placeholder)}" aria-label="Your guess" spellcheck="false" autocapitalize="words" autocomplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}"><ul class="otm-suggest" id="${id}" role="listbox" hidden></ul></div>
    <button class="go" type="submit">Go</button>
    <div class="otm-msg" aria-live="polite"></div>`;
  const input = el.querySelector("input")!, list = el.querySelector<HTMLUListElement>(".otm-suggest")!, msg = el.querySelector<HTMLElement>(".otm-msg")!;
  let items: Country[] = [], active = -1;

  const close = () => { list.hidden = true; items = []; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
  function render() {
    items = suggest(input.value);
    if (!items.length) return close();
    const typed = norm(input.value);
    list.innerHTML = items.map((c, i) => {
      // bold the part that matched when the name starts with what was typed
      const lead = norm(c.name).startsWith(typed) ? c.name.slice(0, input.value.trim().length) : "";
      return `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === active}" class="${i === active ? "on" : ""}">${lead ? `<b>${esc(lead)}</b>${esc(c.name.slice(lead.length))}` : esc(c.name)}</li>`;
    }).join("");
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", `${id}-${active}`); else input.removeAttribute("aria-activedescendant");
  }
  function choose(c: Country) { close(); input.value = ""; onGuess(c, c.name); input.focus({ preventScroll: true }); }

  input.addEventListener("input", () => { active = -1; render(); });
  input.addEventListener("keydown", (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = active >= items.length - 1 ? -1 : active + 1; render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = active < 0 ? items.length - 1 : active - 1; render(); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Tab" && active >= 0) { e.preventDefault(); input.value = items[active].name; active = -1; render(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  // pointerdown (not click) so the input doesn't lose focus first
  list.addEventListener("pointerdown", (e) => { const li = (e.target as HTMLElement).closest("li"); if (!li) return; e.preventDefault(); choose(items[+li.dataset.i!]); });
  input.addEventListener("blur", () => setTimeout(close, 120));
  el.onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); close(); if (!v) return; onGuess(matchCountry(v), v); input.value = ""; };

  return {
    el, input,
    say(html: string, kind: "" | "good" | "bad" = "") { msg.innerHTML = html; msg.className = "otm-msg " + kind; },
    lock() { close(); input.disabled = true; el.querySelector("button")!.disabled = true; },
    shake() { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); },
  };
}

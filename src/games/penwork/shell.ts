/*
 * Penwork: the frame around every puzzle (header, timer, rules, Undo/Clear/Check, the solved panel) and puzzle
 * generation in a Web Worker so hard puzzles don't freeze the page.
 */
import type { GameContext } from "@/lib/games/types";
import { makePuzzle, type Kind, type Puzzle } from "./logic/generate";

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const PRACTICE: { name: string; level: number }[] = [{ name: "Easy", level: 0 }, { name: "Medium", level: 3 }, { name: "Hard", level: 5 }];
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** Monday = 0 … Sunday = 6, the day's difficulty. */
export const todayLevel = () => (new Date().getDay() + 6) % 7;
export const fmtTime = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* ── generation ── */
let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, (p: Puzzle) => void>();
function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; puzzle: Puzzle }>) => { waiting.get(e.data.id)?.(e.data.puzzle); waiting.delete(e.data.id); };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}
/** Build a puzzle off the main thread when possible; daily puzzles are cached for the day. */
export function puzzleFor(ctx: GameContext, kind: Kind, level: number, seed: number, cacheKey?: string): Promise<Puzzle> {
  if (cacheKey) { const hit = ctx.storage.get<Puzzle | null>(cacheKey, null); if (hit) return Promise.resolve(hit); }
  const save = (p: Puzzle) => { if (cacheKey) ctx.storage.set(cacheKey, p); return p; };
  const w = getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(save(makePuzzle(kind, level, seed))), 30));
  return new Promise((res) => {
    const id = ++nextId;
    waiting.set(id, (p) => res(save(p)));
    w.postMessage({ id, kind, level, seed });
  });
}

/* ── the frame ── */
export interface Board {
  /** The board element to show. */
  el: HTMLElement;
  undo(): void;
  clear(): void;
  /** Flash mistakes against the solution; returns how many there were. */
  check(): number;
  destroy(): void;
}
export interface Frame {
  title: string;
  label: string; // "Monday" or "Practice · Hard"
  rules: string; // HTML
  shareIcon: string;
  recordKey: string; // where the best time for this size lives
  dailyKey?: string; // set for the daily puzzle
}

/** Shows a puzzle board in the standard frame. makeBoard gets a `solved` callback to call when it's done. */
export function runFrame(root: HTMLElement, ctx: GameContext, f: Frame, makeBoard: (solved: () => void, changed: () => void) => Board, onMenu: () => void, onAnother: () => void) {
  root.innerHTML = `
    <div class="pw-bar panel"><button class="pw-back" id="pwBack">◀ Puzzles</button><b class="pw-title">${esc(f.title)}</b><span class="pw-label">${esc(f.label)}</span><span class="sp"></span><span class="pw-timer" id="pwTimer">0:00</span></div>
    <section class="panel pw-play">
      <details class="pw-rules"><summary>How to play</summary><div>${f.rules}</div></details>
      <div class="pw-board-host" id="pwHost"></div>
      <div class="pw-tools"><button class="ghost" id="pwUndo">Undo</button><button class="ghost" id="pwClear">Clear</button><span class="sp"></span><button class="ghost" id="pwCheck">Check</button></div>
      <p class="pw-msg" id="pwMsg" aria-live="polite"></p>
    </section>
    <div id="pwDone"></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  const t0 = performance.now();
  let done = false;
  const timer = setInterval(() => { if (!done) $("pwTimer").textContent = fmtTime(performance.now() - t0); }, 500);
  const say = (s: string, kind = "") => { $("pwMsg").textContent = s; $("pwMsg").className = "pw-msg " + kind; };

  const board = makeBoard(() => {
    if (done) return;
    done = true; clearInterval(timer);
    const ms = performance.now() - t0, best = ctx.storage.get<number | null>(f.recordKey, null), isBest = best === null || ms < best;
    if (isBest) ctx.storage.set(f.recordKey, ms);
    if (f.dailyKey) ctx.storage.set(f.dailyKey, { ms });
    $("pwTimer").textContent = fmtTime(ms);
    ctx.sound.reward(4); ctx.world.burst(4);
    const share = `Penwork ${f.title} · ${f.label}${f.dailyKey ? " · " + today() : ""}\n${f.shareIcon} solved in ${fmtTime(ms)}`;
    root.querySelector(".pw-play")!.classList.add("solved");
    $("pwDone").innerHTML = `<section class="panel pw-win"><span class="eyebrow">${esc(f.title)} · ${esc(f.label)}</span>
      <h2 class="display">Solved in <em>${fmtTime(ms)}</em></h2>
      <p class="note">${isBest ? "A new best time for this size." : `Best: ${fmtTime(best!)}`}</p>
      <div class="row"><button class="go" id="pwShare">Copy result</button><button class="ghost" id="pwAnother">Another puzzle</button><button class="ghost" id="pwMenu">All puzzles</button></div></section>`;
    $("pwShare").onclick = () => navigator.clipboard?.writeText(share).then(() => ($("pwShare").textContent = "Copied!"), () => {});
    $("pwAnother").onclick = () => { ctx.sound.click(); onAnother(); };
    $("pwMenu").onclick = () => { ctx.sound.click(); onMenu(); };
    $("pwDone").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, () => { if (!done) say(""); });
  $("pwHost").appendChild(board.el);
  $("pwBack").onclick = () => { ctx.sound.click(); onMenu(); };
  $("pwUndo").onclick = () => { if (!done) board.undo(); };
  $("pwClear").onclick = () => { if (!done) { board.clear(); say("Cleared."); } };
  $("pwCheck").onclick = () => {
    if (done) return;
    const n = board.check();
    if (n) ctx.sound.miss(); else ctx.sound.click();
    say(n ? `${n} ${n === 1 ? "mark is" : "marks are"} wrong (flashing).` : "No mistakes so far.", n ? "bad" : "good");
  };
  return () => { done = true; clearInterval(timer); board.destroy(); };
}

/** Undo history for any board state. */
export class History<T> {
  private stack: T[] = [];
  constructor(private copy: (t: T) => T) {}
  push(t: T) { this.stack.push(this.copy(t)); if (this.stack.length > 300) this.stack.shift(); }
  pop(): T | undefined { return this.stack.pop(); }
}

/** Is the active world a light one? Boards pick their palette from this. */
export const lightWorld = () => getComputedStyle(document.documentElement).getPropertyValue("color-scheme").includes("light");

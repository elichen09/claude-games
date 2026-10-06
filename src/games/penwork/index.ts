/*
 * Penwork: three daily pen-and-paper logic puzzles (inspired by Inkwell Games).
 *   Stars · Fields · River
 * Daily puzzles get harder from Monday to Sunday and are the same for everyone. Puzzles are generated in a worker
 * (./worker.ts) by the solvers in ./logic, each checked to have exactly one solution.
 */
import type { GameModule } from "@/lib/games/types";
import { fieldsBoard } from "./boards/fields";
import { riverBoard } from "./boards/river";
import { starsBoard } from "./boards/stars";
import { hashStr, LEVELS, type Kind, type Puzzle } from "./logic/generate";
import { DAYS, esc, fmtTime, PRACTICE, puzzleFor, runFrame, today, todayLevel } from "./shell";
import "./style.css";

interface Info { kind: Kind; name: string; tagline: string; rules: (level: number) => string; icon: string; size: (level: number) => string; art: string }

const INFO: Info[] = [
  {
    kind: "stars", name: "Stars", tagline: "Sudoku meets Minesweeper", icon: "⭐",
    size: (l) => { const [n, k] = LEVELS.stars[l]; return `${n}×${n} · ${k} ${k === 1 ? "star" : "stars"} each`; },
    rules: (l) => { const [, k] = LEVELS.stars[l]; return `<p>Place <b>${k} ${k === 1 ? "star" : "stars"}</b> in every row, every column and every outlined region.</p><p>Stars never touch, not even diagonally.</p><p><b>Tap</b> a cell to mark it with a dot, tap again for a star, again to clear. <b>Drag</b> from an empty cell to dot several at once. <b>Right-click</b> or <b>long-press</b> to place a star directly.</p>`; },
    art: `<svg viewBox="0 0 50 50"><rect width="50" height="50" fill="#f6d3a8"/><rect x="25" width="25" height="25" fill="#b7d9f2"/><rect y="25" width="25" height="25" fill="#c9e7b5"/><rect x="25" y="25" width="25" height="25" fill="#f2b8c9"/><path d="M0 25H50M25 0V50" stroke="#1d1a2e" stroke-width="2.5"/><text x="12.5" y="17" font-size="13" text-anchor="middle">★</text><text x="37.5" y="42" font-size="13" text-anchor="middle">★</text></svg>`,
  },
  {
    kind: "fields", name: "Fields", tagline: "Paint the meadows by number", icon: "🟩",
    size: (l) => `${LEVELS.fields[l]}×${LEVELS.fields[l]}`,
    rules: () => `<p>Colour every cell <b class="pw-g">green</b> or <b class="pw-u">blue</b>.</p><p>A <b>field</b> is a connected patch of one colour. Every field holds <b>exactly one number</b>, and that number is how many cells the field has.</p><p><b>Tap</b> to cycle blank → green → blue. <b>Drag</b> to paint. Cells with a small dot were coloured for you.</p>`,
    art: `<svg viewBox="0 0 50 50"><rect width="50" height="50" fill="#5b9bd5"/><path d="M0 0H30V20H20V50H0Z" fill="#6fbf73"/><path d="M38 30H50V50H38Z" fill="#6fbf73"/><text x="10" y="15" font-size="11" fill="#14301a" text-anchor="middle" font-weight="700">5</text><text x="40" y="15" font-size="11" fill="#0d2741" text-anchor="middle" font-weight="700">7</text><text x="44" y="44" font-size="11" fill="#14301a" text-anchor="middle" font-weight="700">2</text></svg>`,
  },
  {
    kind: "river", name: "River", tagline: "One loop through every cell", icon: "🌊",
    size: (l) => `${LEVELS.river[l]}×${LEVELS.river[l]}`,
    rules: () => `<p>Draw a single river that flows through <b>every cell exactly once</b> and joins back up with itself.</p><p>The dark stretches are given. The river never branches or crosses.</p><p><b>Drag</b> through cells to draw; drag back over a stretch to erase it. <b>Tap</b> between two dots to toggle a single stretch.</p>`,
    art: `<svg viewBox="0 0 50 50"><rect width="50" height="50" fill="#eaf4fb"/><path d="M8 8H42V24H24V42H8Z" fill="none" stroke="#3b82c4" stroke-width="4" stroke-linejoin="round"/><path d="M8 8H24" stroke="#1d1a2e" stroke-width="5"/><g fill="#1d1a2e"><circle cx="8" cy="8" r="2"/><circle cx="24" cy="8" r="2"/><circle cx="42" cy="8" r="2"/><circle cx="42" cy="24" r="2"/><circle cx="24" cy="24" r="2"/><circle cx="24" cy="42" r="2"/><circle cx="8" cy="42" r="2"/><circle cx="8" cy="24" r="2"/></g></svg>`,
  },
];

const game: GameModule = {
  mount(root, ctx) {
    root.classList.add("pw");
    ctx.world.follow(false);
    let stop: (() => void) | null = null;

    function menu() {
      stop?.(); stop = null;
      const level = todayLevel(), date = today();
      root.innerHTML = `
        <section class="panel pw-hero"><span class="eyebrow">Daily logic · ${DAYS[level]}</span>
          <h1 class="display">Pen<em>work</em></h1>
          <p>Three pen-and-paper puzzles with one solution each, reachable by pure logic. They start gentle on Monday and get tougher through to Sunday. Today is ${DAYS[level]}.</p></section>
        <div class="pw-cards">${INFO.map((g) => {
          const done = ctx.storage.get<{ ms: number } | null>(`daily:${g.kind}:${date}`, null);
          return `<article class="panel pw-card" data-kind="${g.kind}"><div class="pw-art">${g.art}</div>
            <div class="pw-card-txt"><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small>
              <span class="pw-meta">${done ? `✓ Solved today in ${fmtTime(done.ms)}` : `Today: ${esc(g.size(level))}`}</span></div>
            <div class="pw-card-btns"><button class="go" data-play="daily">${done ? "Replay" : "Daily"}</button>
              <div class="pw-practice">${PRACTICE.map((p) => `<button class="ghost" data-play="${p.level}">${p.name}</button>`).join("")}</div></div></article>`;
        }).join("")}</div>
        <footer class="footer"><span>Inspired by the daily puzzles at Inkwell Games.</span><span>Every puzzle has exactly one solution.</span></footer>`;
      root.querySelectorAll<HTMLElement>(".pw-card").forEach((card) => {
        const g = INFO.find((x) => x.kind === card.dataset.kind)!;
        card.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) => (b.onclick = () => {
          ctx.sound.unlock(); ctx.sound.click();
          const daily = b.dataset.play === "daily";
          play(g, daily ? level : +b.dataset.play!, daily);
        }));
      });
      window.scrollTo({ top: 0 });
    }

    async function play(g: Info, level: number, daily: boolean) {
      stop?.(); stop = null;
      const date = today();
      root.innerHTML = `<section class="panel pw-loading"><span class="spinner"></span> Inking a ${esc(g.size(level))} ${esc(g.name)} puzzle…</section>`;
      const seed = daily ? hashStr(`penwork:${g.kind}:${date}`) : (Math.random() * 2 ** 31) >>> 0;
      let cancelled = false;
      stop = () => { cancelled = true; };
      const puzzle: Puzzle = await puzzleFor(ctx, g.kind, level, seed, daily ? `puzzle:${g.kind}:${date}` : undefined);
      if (cancelled) return;
      const label = daily ? DAYS[level] : `Practice · ${PRACTICE.find((p) => p.level === level)?.name ?? "Custom"}`;
      stop = runFrame(root, ctx, { title: g.name, label, rules: g.rules(level), shareIcon: g.icon, recordKey: `best:${g.kind}:${level}`, dailyKey: daily ? `daily:${g.kind}:${date}` : undefined },
        (solved, changed) => (puzzle.kind === "stars" ? starsBoard(puzzle.p, solved, changed) : puzzle.kind === "fields" ? fieldsBoard(puzzle.p, solved, changed) : riverBoard(puzzle.p, solved, changed)),
        menu, () => play(g, daily ? Math.min(level, 6) : level, false));
      window.scrollTo({ top: 0 });
    }

    menu();
    return () => { stop?.(); root.innerHTML = ""; root.classList.remove("pw"); };
  },
};

export default game;

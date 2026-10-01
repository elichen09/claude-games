/* Deep Cut rules: prompt index, answer matching and scoring. Pure functions, used by the browser and the server. */
import { PROMPT_BANK } from "./data/prompts";

export const CATEGORIES = [
  { id: "sports", name: "Sports", blurb: "Athletes, teams, gear" },
  { id: "movies", name: "Movies", blurb: "Films, villains, directors" },
  { id: "music", name: "Music", blurb: "Songs, bands, rappers" },
  { id: "tv", name: "TV", blurb: "Sitcoms, cartoons, shows" },
  { id: "food", name: "Food", blurb: "Snacks, toppings, cereal" },
  { id: "geography", name: "Geography", blurb: "Countries, rivers, islands" },
  { id: "animals", name: "Animals", blurb: "Mammals, birds, dinosaurs" },
  { id: "games", name: "Video Games", blurb: "Pokémon, Zelda, Roblox" },
  { id: "internet", name: "Internet", blurb: "Apps, memes, YouTubers" },
  { id: "brands", name: "Brands", blurb: "Cars, clothes, mascots" },
  { id: "mixed", name: "Everything", blurb: "Every category, shuffled" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const MODES = [
  { id: "daily", name: "Daily Dive", blurb: "Seven prompts, the same for everyone today. Two tries each." },
  { id: "survival", name: "Survival", blurb: "Endless prompts. A wrong or obvious answer costs a life." },
  { id: "blitz", name: "Blitz", blurb: "75 seconds. Answer fast, retry misses, skip freely." },
  { id: "party", name: "Party", blurb: "2–6 players on one device. Matching answers score zero." },
] as const;
export type ModeId = (typeof MODES)[number]["id"];

export interface Answer { name: string; share: number; keys: string[]; rank: number }
export interface Prompt { id: string; cat: string; q: string; answers: Answer[]; index: Map<string, Answer> }

/* text normalisation: case, accents, punctuation, leading articles */
export function norm(s: string) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/['’`.!?]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(the|a|an) /, "");
}
/** Matching key. Emoji-only answers keep their glyph. */
export const key = (s: string) => norm(s).replace(/ /g, "") || String(s).replace(/[️\s]/g, "");

function lev(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function buildPrompts(): Prompt[] {
  const out: Prompt[] = [];
  for (const cat in PROMPT_BANK) for (const [id, q, people, raw] of PROMPT_BANK[cat]) {
    const p: Prompt = { id: cat + ":" + id, cat, q, answers: [], index: new Map() };
    for (const item of raw.split("|")) {
      const [names, sh] = item.split("=");
      const share = sh === undefined ? 0.4 : parseFloat(sh);
      if (!(share > 0)) continue;
      const parts = names.split("/").map((x) => x.trim()).filter(Boolean);
      const display = parts[0];
      if (!display || p.index.has(key(display))) continue; // duplicate entry
      const a: Answer = { name: display, share, keys: [], rank: 0 };
      for (const n of parts) { const k = key(n); if (k && !p.index.has(k)) { p.index.set(k, a); a.keys.push(k); } }
      p.answers.push(a);
    }
    if (people) { // a surname counts on people prompts when it's unambiguous
      const counts = new Map<string, number>();
      for (const a of p.answers) { const w = norm(a.name).split(" "); if (w.length > 1) { const l = w[w.length - 1]; counts.set(l, (counts.get(l) || 0) + 1); } }
      for (const a of p.answers) { const w = norm(a.name).split(" "); const l = w[w.length - 1]; if (w.length > 1 && l.length >= 4 && counts.get(l) === 1 && !p.index.has(l)) { p.index.set(l, a); a.keys.push(l); } }
    }
    p.answers.sort((x, y) => y.share - x.share);
    p.answers.forEach((a, i) => (a.rank = i + 1));
    out.push(p);
  }
  return out;
}

export const PROMPTS = buildPrompts();
const BY_ID = new Map(PROMPTS.map((p) => [p.id, p]));
export const getPrompt = (id: string) => BY_ID.get(id);

/** Find the board answer a player meant: exact key, plural, then a small typo allowance. */
export function match(p: Prompt, input: string): Answer | null {
  const k = key(input);
  if (!k) return null;
  if (p.index.has(k)) return p.index.get(k)!;
  if (k.endsWith("s") && p.index.has(k.slice(0, -1))) return p.index.get(k.slice(0, -1))!;
  if (p.index.has(k + "s")) return p.index.get(k + "s")!;
  if (k.length < 5) return null;
  const max = k.length >= 9 ? 2 : 1;
  let best: Answer | null = null, bd = max + 1;
  for (const [kk, a] of p.index) { if (kk.length < 4) continue; const d = lev(k, kk, max); if (d < bd) { bd = d; best = a; } }
  return bd <= max ? best : null;
}

/** 40% of players → 5 points; 0.3% or rarer → 150. */
export const pointsFor = (share: number) =>
  Math.round(5 + 145 * Math.max(0, Math.min(1, Math.log(40 / Math.max(share, 0.05)) / Math.log(40 / 0.3))) ** 1.25);
export const tierFor = (share: number) => (share >= 15 ? 0 : share >= 6 ? 1 : share >= 2 ? 2 : share >= 0.7 ? 3 : 4);
export const comboMult = (c: number) => (c >= 2 ? 1 + 0.25 * Math.min(c - 1, 4) : 1);
export const pct = (s: number) => (s >= 9.95 ? s.toFixed(0) : s >= 0.995 ? s.toFixed(1).replace(/\.0$/, "") : s >= 0.1 ? s.toFixed(1) : "<0.1") + "%";

/* seeded randomness for the daily set */
export function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seeded(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffle<T>(arr: T[], r: () => number = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const pool = (cat: string) => (cat === "mixed" ? PROMPTS : PROMPTS.filter((p) => p.cat === cat));
export const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
export const dailySet = (cat: string, date = today()) => shuffle(pool(cat), seeded(hashStr("deepcut:" + date + ":" + cat))).slice(0, 7);
export const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

/** World facts that are safe to use anywhere (server or client, no canvas code). */
export type WorldId = "abyss" | "core" | "collage" | "orbit";

export interface WorldMeta {
  id: WorldId;
  name: string;
  /** Short description for pickers. */
  sub: string;
  /** 1 = you go down into it, -1 = you go up through it. */
  dir: 1 | -1;
  unit: string;
  /** CSS background used for small previews (cards, pickers). */
  swatch: string;
}

export const WORLD_META: WorldMeta[] = [
  { id: "abyss", name: "Abyss", sub: "Sink to the trench", dir: 1, unit: "m", swatch: "linear-gradient(180deg,#f4f7f6 0 32%,#4f8ab2 32% 46%,#336a96 46% 60%,#21507a 60% 74%,#132f4f 74% 88%,#0a1b31 88%)" },
  { id: "core", name: "Core", sub: "Thermal drill to the center", dir: 1, unit: "km", swatch: "linear-gradient(180deg,#16052e 0 25%,#5b0d84 25% 40%,#c41f62 40% 55%,#f7731a 55% 70%,#ffd447 70% 85%,#fff09e 85%)" },
  { id: "collage", name: "Collage", sub: "Paper balloon ride", dir: -1, unit: "ft", swatch: "radial-gradient(circle at 72% 38%,#ffcf3f 0 11px,#fffaf0 11px 12px,transparent 13px),linear-gradient(180deg,#a8c4f0 0 35%,#f0b9cb 35% 60%,#f9d9ae 60% 76%,#7fb069 76%)" },
  { id: "orbit", name: "Orbit", sub: "Neon launch to the Moon", dir: -1, unit: "km", swatch: "linear-gradient(180deg,#03030c 0 25%,#260f5c 25% 45%,#5a1a86 45% 60%,#b42e8f 60% 72%,#ff7a6b 72% 78%,#160632 78%)" },
];

export const DEFAULT_WORLD: WorldId = "abyss";
export const isWorldId = (v: unknown): v is WorldId => WORLD_META.some((w) => w.id === v);
export const worldMeta = (id: WorldId) => WORLD_META.find((w) => w.id === id)!;
/** localStorage key for the player's chosen world (read before paint in layout.tsx). */
export const WORLD_STORAGE_KEY = "offbeat:world";

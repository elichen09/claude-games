import type { WorldId, WorldMeta } from "@/lib/worlds/meta";

/** What the arcade knows about a game without loading its code. Lives in src/games/registry.ts. */
export interface GameManifest {
  /** URL segment: /games/<slug>. Must match the folder name in src/games. */
  slug: string;
  title: string;
  /** One line for the arcade card. */
  tagline: string;
  /** A sentence or two for the game page's meta description. */
  description: string;
  /** live = listed and playable; soon = listed as coming soon; hidden = playable by URL only (for testing). */
  status: "live" | "soon" | "hidden";
  /** The world shown behind the card's cover art. */
  coverWorld: WorldId;
  tags: string[];
  /** Short labels such as "Daily" or "1–6 players". */
  badges?: string[];
}

/** Namespaced localStorage: every key is prefixed with the game's slug. Never throws. */
export interface GameStorage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export interface GameSound {
  /** Unlocks audio; call from a click handler before the first sound. */
  unlock(): void;
  enabled(): boolean;
  /** A rising arpeggio, 0 (meh) to 4 (incredible). */
  reward(tier: number): void;
  miss(): void;
  tick(): void;
  click(): void;
  tone(freq: number, delay: number, duration: number, type?: OscillatorType, volume?: number): void;
}

/** Control over the pixel world drawn behind every page. */
export interface GameWorld {
  current(): WorldId;
  /** Switch worlds (also saved as the player's preference for the whole arcade). */
  set(id: WorldId): void;
  list(): WorldMeta[];
  /** The world's own measurement (metres, km, ft…). Higher = further into the world. */
  setValue(value: number): void;
  /** true: the camera follows the value. false: the camera follows page scroll. */
  follow(on: boolean): void;
  /** Confetti-style pixel burst, 0–4. */
  burst(tier: number): void;
  /** How far the value is toward the world's end, 0–1. */
  progress(): number;
  /** Format a world value with its unit, e.g. "1,240 m". */
  format(value: number): string;
}

export interface GameContext {
  slug: string;
  storage: GameStorage;
  sound: GameSound;
  world: GameWorld;
  /** Call this game's server actions: POST /api/games/<slug>/<action>. Rejects with ApiError. */
  api<T = unknown>(action: string, body?: unknown): Promise<T>;
  /** Client-side navigation within the site. */
  navigate(href: string): void;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

/** Every game's client entry point (src/games/<slug>/index.ts) default-exports one of these. */
export interface GameModule {
  /** Render into `root` and return a cleanup function. Called once per visit to the game page. */
  mount(root: HTMLElement, ctx: GameContext): () => void;
}

/** Server-side actions a game exposes at /api/games/<slug>/<action>. */
export type ServerAction = (input: { body: unknown; request: Request; ip: string }) => Promise<unknown> | unknown;
export type ServerActions = Record<string, ServerAction>;

/** Throw from a server action to send a specific HTTP status and error code. */
export class ActionError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

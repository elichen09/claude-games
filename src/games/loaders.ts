import type { GameModule } from "@/lib/games/types";

/**
 * Client code for each game, loaded only when someone opens that game.
 * Keys must match the slugs in registry.ts.
 */
export const GAME_LOADERS: Record<string, () => Promise<{ default: GameModule }>> = {
  "deep-cut": () => import("./deep-cut"),
  "off-the-map": () => import("./off-the-map"),
  "penwork": () => import("./penwork"),
  // @new-game:loader (keep this line)
};

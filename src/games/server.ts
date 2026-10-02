import "server-only";
import type { ServerActions } from "@/lib/games/types";
// @new-game:server-import (keep this line)

/**
 * Server actions for each game, reachable at /api/games/<slug>/<action>.
 * Games without server code can be left out.
 */
export const GAME_SERVER_ACTIONS: Record<string, ServerActions> = {
  // @new-game:server (keep this line)
};

import "server-only";
import type { ServerActions } from "@/lib/games/types";
import decisionRoom from "./decision-room/server";
// @new-game:server-import (keep this line)

/**
 * Server actions for each game, reachable at /api/games/<slug>/<action>.
 * Games without server code can be left out.
 */
export const GAME_SERVER_ACTIONS: Record<string, ServerActions> = {
  "decision-room": decisionRoom,
  // @new-game:server (keep this line)
};

/**
 * Requests per minute per IP, for games that need more than the default 40.
 * Decision Room polls, and a whole judging panel on one school network shares an IP.
 */
export const GAME_RATE_LIMITS: Record<string, number> = {
  "decision-room": 400,
};

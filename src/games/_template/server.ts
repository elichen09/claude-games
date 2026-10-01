import "server-only";
import type { ServerActions } from "@/lib/games/types";

/** Server actions for __TITLE__, reachable at /api/games/__SLUG__/<action>. Delete this file if the game needs none. */
const actions: ServerActions = {
  ping: () => ({ message: "Hello from the __TITLE__ server at " + new Date().toISOString() }),
};

export default actions;

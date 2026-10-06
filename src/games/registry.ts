import type { GameManifest } from "@/lib/games/types";

/**
 * Every game in the arcade. Order here is the order on the home page.
 * `npm run new-game <slug> "<Title>"` adds entries here, in loaders.ts and in server.ts.
 */
export const GAMES: GameManifest[] = [
  {
    slug: "deep-cut",
    title: "Deep Cut",
    tagline: "Say the answer nobody else would. Rare answers sink you deeper.",
    description:
      "A rarity word game: name something that fits the prompt, and the less common your answer, the more you score. Daily, Survival, Blitz and Party modes across 11 categories.",
    status: "live",
    coverWorld: "abyss",
    tags: ["Word", "Trivia", "Party"],
    badges: ["Daily", "1–6 players"],
  },
  {
    slug: "off-the-map",
    title: "Off the Map",
    tagline: "Geography, but strange. Hunt hidden countries, catch maps lying about size, dig through the core.",
    description:
      "Six geography games on a lit pixel globe: hot-and-cold country hunts, true-size showdowns, speed pinning, border hopping, digging to the antipode and racing a line of latitude.",
    status: "live",
    coverWorld: "orbit",
    tags: ["Geography", "Maps", "Puzzle"],
    badges: ["Daily", "6 modes"],
  },
  // @new-game:manifest (keep this line: the scaffolder inserts new games above it)
];

export const listedGames = () => GAMES.filter((g) => g.status !== "hidden");
export const getGame = (slug: string) => GAMES.find((g) => g.slug === slug);

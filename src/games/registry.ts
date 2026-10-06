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
    tagline: "Geography, but strange. Resize countries to their true size, dig through the core, race a line of latitude.",
    description:
      "Three geography games: resize a country to its true size next to another, find where you'd pop out if you dug through the Earth, and name every country on a line of latitude against the clock.",
    status: "live",
    coverWorld: "orbit",
    tags: ["Geography", "Maps", "Puzzle"],
    badges: ["Daily", "3 modes"],
  },
  {
    slug: "penwork",
    title: "Penwork",
    tagline: "Daily pen-and-paper logic: place the stars, paint the fields, draw the river.",
    description:
      "Three daily logic puzzles, easy on Monday and tough by Sunday: Stars (stars in every row, column and region, never touching), Fields (green and blue fields sized by their numbers) and River (one loop through every cell). Inspired by Inkwell Games.",
    status: "live",
    coverWorld: "collage",
    tags: ["Logic", "Puzzle", "Daily"],
    badges: ["Daily", "3 puzzles"],
  },
  // @new-game:manifest (keep this line: the scaffolder inserts new games above it)
];

export const listedGames = () => GAMES.filter((g) => g.status !== "hidden");
export const getGame = (slug: string) => GAMES.find((g) => g.slug === slug);

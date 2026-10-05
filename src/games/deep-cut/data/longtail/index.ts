/**
 * Long-tail answers, keyed by full prompt id ("category:id"). These deepen each board with rare but
 * valid answers so niche picks count. Same format as ../prompts.ts; entries without "=share" are
 * treated as very rare. Duplicates of board answers are ignored, and anything a board marks "=0"
 * stays rejected.
 */
import { ANIMALS } from "./animals";
import { BRANDS } from "./brands";
import { FOOD } from "./food";
import { GAMES } from "./games";
import { GEOGRAPHY } from "./geography";
import { INTERNET } from "./internet";
import { MOVIES } from "./movies";
import { MUSIC } from "./music";
import { SPORTS } from "./sports";
import { TV } from "./tv";

export const LONG_TAIL: Record<string, string> = { ...SPORTS, ...MOVIES, ...MUSIC, ...TV, ...FOOD, ...GEOGRAPHY, ...ANIMALS, ...GAMES, ...INTERNET, ...BRANDS };

// Every Pokémon from Chikorita (#152) on is a valid "not one of the original 151" answer.
const allPokemon = GAMES["games:pokemon"].split("|");
LONG_TAIL["games:newpoke"] = allPokemon.slice(allPokemon.indexOf("Chikorita")).join("|");

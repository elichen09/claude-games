/* Puzzle generation off the main thread, so the page stays responsive while a hard puzzle is built. */
import { makePuzzle, type Kind } from "./logic/generate";

self.onmessage = (e: MessageEvent<{ id: number; kind: Kind; level: number; seed: number }>) => {
  const { id, kind, level, seed } = e.data;
  (self as unknown as Worker).postMessage({ id, puzzle: makePuzzle(kind, level, seed) });
};

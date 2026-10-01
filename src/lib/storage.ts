import type { GameStorage } from "@/lib/games/types";

/** localStorage that never throws (private windows, blocked storage, server rendering). */
export function createStorage(namespace: string): GameStorage {
  const k = (key: string) => `${namespace}:${key}`;
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const v = window.localStorage.getItem(k(key));
        return v == null ? fallback : (JSON.parse(v) as T);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { window.localStorage.setItem(k(key), JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
    remove(key) {
      try { window.localStorage.removeItem(k(key)); } catch { /* storage unavailable */ }
    },
  };
}

export const siteStorage = createStorage("offbeat");

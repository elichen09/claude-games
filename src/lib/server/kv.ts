import "server-only";

/**
 * Tiny shared key-value store for games that need state across players (rooms, ballots).
 *
 * With KV_REST_API_URL + KV_REST_API_TOKEN (what Vercel's Upstash/KV integration sets) or
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, data lives in Redis and every server instance sees it.
 * Without them it falls back to memory: fine for `npm run dev` and a single server, but on Vercel
 * different requests can land on different instances, so set up a store before using it for real.
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const kvPersistent = () => !!(url && token);

type Entry = { v: unknown; exp: number };
const g = globalThis as unknown as { __offbeatKv?: Map<string, Entry> };
const mem = (g.__offbeatKv ??= new Map<string, Entry>());

function memGet(key: string) {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.exp < Date.now()) { mem.delete(key); return undefined; }
  return e.v;
}

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`KV ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const err = out.find((r) => r.error);
  if (err) throw new Error(`KV error: ${err.error}`);
  return out.map((r) => r.result);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!kvPersistent()) return memGet(key) as T | undefined;
  const [raw] = await redis([["GET", key]]);
  return typeof raw === "string" ? (JSON.parse(raw) as T) : undefined;
}

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  if (!kvPersistent()) { mem.set(key, { v: structuredClone(value), exp: Date.now() + ttlSec * 1000 }); return; }
  await redis([["SET", key, JSON.stringify(value), "EX", ttlSec]]);
}

/** Set one field of a hash (e.g. one judge's ballot) without rewriting the others. */
export async function kvHSet(key: string, field: string, value: unknown, ttlSec: number): Promise<void> {
  if (!kvPersistent()) {
    const cur = (memGet(key) as Record<string, unknown> | undefined) ?? {};
    mem.set(key, { v: { ...cur, [field]: structuredClone(value) }, exp: Date.now() + ttlSec * 1000 });
    return;
  }
  await redis([["HSET", key, field, JSON.stringify(value)], ["EXPIRE", key, ttlSec]]);
}

export async function kvHGetAll<T>(key: string): Promise<Record<string, T>> {
  if (!kvPersistent()) return structuredClone((memGet(key) as Record<string, T> | undefined) ?? {});
  const [raw] = await redis([["HGETALL", key]]);
  const out: Record<string, T> = {};
  if (Array.isArray(raw)) for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = JSON.parse(String(raw[i + 1])) as T;
  else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) out[k] = JSON.parse(String(v)) as T;
  return out;
}

import "server-only";

/**
 * Best-effort sliding-window limiter, kept in memory per server instance.
 * Good enough to stop a runaway loop from burning API credit; for hard guarantees
 * across many instances, swap in a shared store (Vercel KV / Upstash) behind the same function.
 */
const hits = new Map<string, number[]>();

export function rateLimit(id: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(id, list);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

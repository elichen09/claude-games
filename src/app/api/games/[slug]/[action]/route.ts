import { NextResponse } from "next/server";
import { GAME_SERVER_ACTIONS } from "@/games/server";
import { ActionError } from "@/lib/games/types";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; action: string }> };

/** One endpoint for every game: /api/games/<slug>/<action> runs that game's server action. */
async function handle(request: Request, { params }: Params) {
  const { slug, action } = await params;
  const fn = GAME_SERVER_ACTIONS[slug]?.[action];
  if (!fn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ip = clientIp(request);
  const rl = rateLimit(`${slug}:${ip}`, 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfter) } });

  let body: unknown = undefined;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 10_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    try { body = text ? JSON.parse(text) : undefined; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  }

  try {
    const result = await fn({ body, request, ip });
    return result instanceof Response ? result : NextResponse.json(result ?? null);
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    console.error(`[api] ${slug}/${action} failed:`, e);
    return NextResponse.json({ error: "server_error" }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;

import "server-only";

/** True when ANTHROPIC_API_KEY is set (in .env.local or the Vercel project settings). */
export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * Ask Claude for a small JSON answer. Server-only: the API key never reaches the browser.
 * Throws on network errors, timeouts or unparseable replies; callers decide how to degrade.
 */
export async function askClaudeJSON<T>({ system, prompt, maxTokens = 300, timeoutMs = 12000 }: { system?: string; prompt: string; maxTokens?: number; timeoutMs?: number }): Promise<T> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return parseJSON<T>(text);
}

/** Tolerant JSON extraction: whole reply, a ```json fence, or the first {...} / [...] span. */
export function parseJSON<T>(text: string): T {
  const attempts = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.slice(text.search(/[[{]/), Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1)];
  for (const a of attempts) {
    if (!a) continue;
    try { return JSON.parse(a) as T; } catch { /* try the next shape */ }
  }
  throw new Error("Claude reply was not JSON");
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GAME_LOADERS } from "@/games/loaders";
import { ApiError, type GameContext } from "@/lib/games/types";
import { createStorage } from "@/lib/storage";
import { sound } from "@/lib/sound";
import { worldEngine } from "@/lib/worlds/engine";
import { WORLD_META } from "@/lib/worlds/meta";
import { useWorld } from "./WorldProvider";

/** Loads a game's client code and mounts it with the shared arcade services. */
export function GameHost({ slug }: { slug: string }) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setWorld } = useWorld();
  const setWorldRef = useRef(setWorld);
  setWorldRef.current = setWorld;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    const loader = GAME_LOADERS[slug];
    if (!loader) { setState("error"); return; }

    const ctx: GameContext = {
      slug,
      storage: createStorage(slug),
      sound,
      world: {
        current: () => worldEngine.current(),
        set: (id) => setWorldRef.current(id),
        list: () => WORLD_META,
        setValue: (v) => worldEngine.setValue(v),
        follow: (on) => worldEngine.follow(on),
        burst: (t) => worldEngine.burst(t),
        progress: () => worldEngine.progress(),
        format: (v) => worldEngine.format(v),
      },
      async api<T>(action: string, body?: unknown) {
        const res = await fetch(`/api/games/${slug}/${action}`, {
          method: body === undefined ? "GET" : "POST",
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, data.error || "request_failed", data.message);
        return data as T;
      },
      navigate: (href) => router.push(href),
    };

    loader()
      .then((mod) => {
        if (cancelled || !root.current) return;
        cleanup = mod.default.mount(root.current, ctx);
        setState("ready");
      })
      .catch((e) => { console.error(e); if (!cancelled) setState("error"); });

    return () => { cancelled = true; cleanup?.(); };
  }, [slug, router]);

  return (
    <>
      {state === "loading" && <div className="panel loading">Loading…</div>}
      {state === "error" && <div className="panel"><p>This game didn&apos;t load. Refresh the page to try again.</p></div>}
      <div ref={root} />
    </>
  );
}

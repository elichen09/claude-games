"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { worldEngine, type GaugeInfo } from "@/lib/worlds/engine";
import { DEFAULT_WORLD, WORLD_STORAGE_KEY, isWorldId, type WorldId } from "@/lib/worlds/meta";

interface WorldCtx { world: WorldId; setWorld(id: WorldId): void }
const Ctx = createContext<WorldCtx | null>(null);

export const useWorld = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorld must be used inside <WorldProvider>");
  return c;
};

function readSaved(): WorldId {
  try { const v = JSON.parse(localStorage.getItem(WORLD_STORAGE_KEY) || "null"); return isWorldId(v) ? v : DEFAULT_WORLD; } catch { return DEFAULT_WORLD; }
}

/** Owns the full-screen pixel world behind every page and the player's chosen world. */
export function WorldProvider({ children }: { children: React.ReactNode }) {
  const [world, setWorldState] = useState<WorldId>(DEFAULT_WORLD);
  const bg = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);

  const setWorld = useCallback((id: WorldId) => {
    setWorldState(id);
    worldEngine.setWorld(id);
    document.documentElement.dataset.world = id;
    try { localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(id)); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    const saved = readSaved();
    worldEngine.setWorld(saved);
    setWorldState(saved);
    document.documentElement.dataset.world = saved;
    worldEngine.attach(bg.current!, fx.current!);
    return () => worldEngine.detach();
  }, []);

  return (
    <Ctx.Provider value={{ world, setWorld }}>
      <canvas ref={bg} className="bgfx" aria-hidden="true" />
      <div className="scan" aria-hidden="true" />
      {children}
      <Gauge />
      <canvas ref={fx} className="fxfx" aria-hidden="true" />
    </Ctx.Provider>
  );
}

function Gauge() {
  const [g, setG] = useState<GaugeInfo | null>(null);
  useEffect(() => worldEngine.onGauge(setG), []);
  if (!g) return null;
  return (
    <div className="gauge" aria-hidden="true">
      <b>{g.value}</b>
      <span>{g.zone}</span>
      <small>{g.readout}{g.atEnd ? " · end of the line" : ""}</small>
    </div>
  );
}

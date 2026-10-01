/* The render loop: draws the current world into a low-res canvas every frame and moves the camera. */
import { P, R, interp, onScreen, sy, txt } from "./pixel";
import { WORLDS, type World } from "./worlds";
import { DEFAULT_WORLD, type WorldId } from "./meta";

export interface GaugeInfo {
  value: string;
  zone: string;
  readout: string;
  atEnd: boolean;
}

let WORLD: World = WORLDS[DEFAULT_WORLD];
let worldId: WorldId = DEFAULT_WORLD;
let bgCanvas: HTMLCanvasElement | null = null;
let fxCanvas: HTMLCanvasElement | null = null;
let fxx: CanvasRenderingContext2D | null = null;
let raf = 0;
let parts: { x: number; y: number; vx: number; vy: number; g: number; r: number; c: string; life: number }[] = [];
let lastGauge = "";
const gaugeListeners = new Set<(g: GaugeInfo) => void>();
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const format = (v: number) => Math.round(v).toLocaleString("en-US") + WORLD.unit;
const zoneFor = (v: number) => { let z = WORLD.zones[0][1]; for (const [a, n] of WORLD.zones) if (v >= a) z = n; return z; };

function targetCam() {
  const LH = P.LH;
  if (!P.follow && P.v < 1) return (WORLD.dir > 0 ? -LH * 0.36 : -LH * 0.8) + (WORLD.dir * P.scroll) / P.PX * 0.6;
  const py = interp(WORLD.stops, Math.min(P.v, WORLD.max));
  return py - LH * (WORLD.dir > 0 ? 0.36 : 0.64);
}

function resize() {
  if (!bgCanvas) return;
  P.PX = window.innerWidth < 640 ? 3 : 4;
  P.LW = Math.ceil(window.innerWidth / P.PX);
  P.LH = Math.ceil(window.innerHeight / P.PX);
  bgCanvas.width = P.LW; bgCanvas.height = P.LH;
  P.img = P.ctx.createImageData(P.LW, P.LH);
  P.buf = new Uint32Array(P.img.data.buffer);
  if (fxCanvas) { fxCanvas.width = window.innerWidth; fxCanvas.height = window.innerHeight; }
  WORLD.init();
}
const onScroll = () => { P.scroll = window.scrollY; };

function frame() {
  raf = requestAnimationFrame(frame);
  const reduce = reduceMotion();
  P.t++;
  P.v += (P.vT - P.v) * (reduce ? 1 : 0.035);
  if (Math.abs(P.vT - P.v) < 0.5) P.v = P.vT;
  P.camT = targetCam();
  P.cam += (P.camT - P.cam) * (reduce ? 1 : 0.08);

  WORLD.bg();
  P.ctx.putImageData(P.img, 0, 0);
  // zone markers written into the world, right-aligned so they stay clear of the player marker
  const labelCol = worldId === "collage" ? "rgba(29,26,46,.75)" : "rgba(255,255,255,.55)";
  P.ctx.font = "8px Silkscreen, monospace";
  for (const [v, name] of WORLD.zones) {
    const s = sy(interp(WORLD.stops, v));
    if (v === 0 || !onScreen(s, 12)) continue;
    for (let x = Math.round(P.LW * 0.7); x < P.LW - 2; x += 4) R(x, s, 2, 1, labelCol);
    const label = `${format(v)} · ${name.toUpperCase()}`;
    txt(label, P.LW - 3 - P.ctx.measureText(label).width, s + 3, labelCol);
  }
  WORLD.draw();

  // burst particles on the full-res layer, snapped to the pixel grid
  if (fxx && fxCanvas) {
    fxx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    parts = parts.filter((p) => (p.life -= 1) > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98;
      fxx.globalAlpha = Math.min(1, p.life / 25); fxx.fillStyle = p.c;
      fxx.fillRect(Math.round(p.x / P.PX) * P.PX, Math.round(p.y / P.PX) * P.PX, p.r, p.r);
    }
    fxx.globalAlpha = 1;
  }

  if (P.t % 6 === 0 && gaugeListeners.size) {
    const v = Math.min(P.v, WORLD.max);
    const g: GaugeInfo = { value: format(v), zone: zoneFor(v), readout: WORLD.readout(v), atEnd: P.vT >= WORLD.max };
    const key = JSON.stringify(g);
    if (key !== lastGauge) { lastGauge = key; gaugeListeners.forEach((fn) => fn(g)); }
  }
}

/** The singleton that the WorldProvider attaches to the page's canvases. */
export const worldEngine = {
  attach(bg: HTMLCanvasElement, fx: HTMLCanvasElement) {
    if (bgCanvas === bg && raf) return;
    this.detach();
    bgCanvas = bg; fxCanvas = fx;
    P.ctx = bg.getContext("2d")!;
    fxx = fx.getContext("2d");
    resize();
    P.scroll = window.scrollY;
    P.cam = P.camT = targetCam();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(frame);
  },
  detach() {
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", onScroll);
    bgCanvas = fxCanvas = null; fxx = null;
  },
  setWorld(id: WorldId) {
    if (id === worldId && WORLD) return;
    worldId = id; WORLD = WORLDS[id] || WORLDS[DEFAULT_WORLD];
    lastGauge = "";
    if (bgCanvas) { WORLD.init(); P.cam = P.camT = targetCam(); }
  },
  current: () => worldId,
  setValue(v: number) { P.vT = Math.max(0, v); },
  follow(on: boolean) { P.follow = on; },
  progress: () => Math.min(1, P.vT / WORLD.max),
  format,
  burst(t: number) {
    if (reduceMotion() || typeof window === "undefined") return;
    const css = getComputedStyle(document.documentElement);
    const cols = ["--t" + t, "--accent", "--accent2", "--t3"].map((v) => css.getPropertyValue(v).trim() || "#fff");
    const n = t >= 4 ? 140 : 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 3 + Math.random() * (t >= 4 ? 10 : 7);
      parts.push({ x: window.innerWidth / 2, y: window.innerHeight * 0.38, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, g: WORLD.dir > 0 ? -0.05 : 0.16, r: P.PX * (1 + ((Math.random() * 2) | 0)), c: cols[i % cols.length], life: 60 + Math.random() * 50 });
    }
  },
  onGauge(fn: (g: GaugeInfo) => void) {
    gaugeListeners.add(fn); lastGauge = "";
    return () => { gaugeListeners.delete(fn); };
  },
};

/*
 * Pixel rendering for Off the Map: low-resolution canvases scaled up with hard edges (to match the arcade's
 * pixel worlds), colors taken from the active world's CSS tokens, and a draggable orthographic globe.
 */
import { geoGraticule10, geoOrthographic, geoPath, type GeoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { BORDERS, COUNTRIES, type Country, type LonLat } from "./geo";

export interface Palette { bg: string; panel: string; panel2: string; fg: string; muted: string; line: string; accent: string; accent2: string; good: string; bad: string; t: string[]; ocean: string; land: string; landDim: string }

/** Colors for the current world, read fresh so a world switch is picked up on the next frame. */
export function palette(): Palette {
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim() || "#888";
  const light = cs.getPropertyValue("color-scheme").includes("light");
  return {
    bg: v("--bg"), panel: v("--panel"), panel2: v("--panel2"), fg: v("--fg"), muted: v("--muted"), line: v("--line"),
    accent: v("--accent"), accent2: v("--accent2"), good: v("--good"), bad: v("--bad"), t: [0, 1, 2, 3, 4].map((i) => v("--t" + i)),
    ocean: light ? "#a9c7e8" : "#0d2a4a", land: light ? "#e9dcc0" : "#3d5a73", landDim: light ? "#d6c9ad" : "#2a4257",
  };
}

/** A hex color scaled toward black (k = 1 keeps it, 0 is black). Non-hex colors come back unchanged. */
export function darken(color: string, k: number) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return "#" + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("");
}

export interface PixelCanvas { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }

/** A w×h canvas drawn at low resolution and shown scaled up with crisp pixels. */
export function pixelCanvas(w: number, h: number, className = "otm-canvas"): PixelCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h; canvas.className = className;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx, w, h };
}

/** Canvas pixel position for a pointer event. */
export function canvasPoint(pc: PixelCanvas, e: { clientX: number; clientY: number }): [number, number] {
  const r = pc.canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * pc.w, ((e.clientY - r.top) / r.height) * pc.h];
}

/** A chunky pixel marker: a square with an outline, optionally pulsing. */
export function pin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, outline: string, size = 3) {
  const s = Math.round(size);
  ctx.fillStyle = outline; ctx.fillRect(Math.round(x) - s - 1, Math.round(y) - s - 1, s * 2 + 3, s * 2 + 3);
  ctx.fillStyle = color; ctx.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2 + 1, s * 2 + 1);
}

/** Pixel-font-free text: small canvas labels with a dark halo so they read on any map. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: string, size = 8, align: CanvasTextAlign = "left") {
  ctx.font = `${size}px "Silkscreen", monospace`; ctx.textBaseline = "middle";
  // keep the label inside the canvas
  const tw = ctx.measureText(text).width, W = ctx.canvas.width, left = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
  x += Math.max(0, 3 - left) - Math.max(0, left + tw - (W - 3)); y = Math.max(size / 2 + 2, Math.min(ctx.canvas.height - size / 2 - 2, y));
  ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const ease = easeInOut;

/** Run fn(t) for t from 0 to 1 over ms milliseconds. Resolves when done; stop() ends it early. */
export function animate(ms: number, fn: (t: number) => void): { done: Promise<void>; stop: () => void } {
  let raf = 0, stopped = false, resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r)), start = performance.now();
  const step = (now: number) => {
    if (stopped) return;
    const t = Math.min(1, (now - start) / ms);
    fn(t);
    if (t < 1) raf = requestAnimationFrame(step); else resolve();
  };
  raf = requestAnimationFrame(step);
  return { done, stop: () => { stopped = true; cancelAnimationFrame(raf); resolve(); } };
}

/* ── globe ── */
export interface GlobeStyle {
  /** Fill for a country, or null for the default land color. */
  fill?: (c: Country, pal: Palette) => string | null;
  /** Draw extra layers on top (lines, pins, labels). */
  overlay?: (ctx: CanvasRenderingContext2D, path: GeoPath, proj: GeoProjection, pal: Palette) => void;
  /** Draw extra layers under the land (glows). */
  underlay?: (ctx: CanvasRenderingContext2D, path: GeoPath, proj: GeoProjection, pal: Palette) => void;
}

/**
 * An orthographic globe on a pixel canvas. Drag to spin; a tap (no drag) calls onTap with the lon/lat under the
 * pointer. Call draw() after changing rotation or style.
 */
export class Globe {
  pc: PixelCanvas; proj: GeoProjection; path: GeoPath; style: GlobeStyle = {};
  onTap?: (p: LonLat) => void;
  interactive = true;
  private drag: { x: number; y: number; rot: [number, number, number]; moved: boolean } | null = null;
  private listeners: [string, EventListener][] = [];

  constructor(size: number) {
    this.pc = pixelCanvas(size, size, "otm-canvas otm-globe");
    this.proj = geoOrthographic().scale(size * 0.46).translate([size / 2, size / 2]).clipAngle(90).precision(0.6);
    this.path = geoPath(this.proj, this.pc.ctx);
    const c = this.pc.canvas;
    c.style.touchAction = "none";
    this.on("pointerdown", (e) => {
      if (!this.interactive) return;
      const p = e as PointerEvent;
      c.setPointerCapture(p.pointerId);
      this.drag = { x: p.clientX, y: p.clientY, rot: this.proj.rotate() as [number, number, number], moved: false };
    });
    this.on("pointermove", (e) => {
      const p = e as PointerEvent;
      if (!this.drag) return;
      const dx = p.clientX - this.drag.x, dy = p.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      if (!this.drag.moved) return;
      const k = 180 / (c.getBoundingClientRect().width * 0.92);
      this.proj.rotate([this.drag.rot[0] + dx * k, Math.max(-85, Math.min(85, this.drag.rot[1] - dy * k)), this.drag.rot[2]]);
      this.draw();
    });
    this.on("pointerup", (e) => {
      const p = e as PointerEvent, d = this.drag;
      this.drag = null;
      if (!d || d.moved || !this.onTap) return;
      const [x, y] = canvasPoint(this.pc, p), r = this.proj.scale(), [cx, cy] = this.proj.translate();
      if (Math.hypot(x - cx, y - cy) > r) return;
      const ll = this.proj.invert!([x, y]);
      if (ll) this.onTap(ll as LonLat);
    });
    this.on("pointercancel", () => (this.drag = null));
  }
  private on(type: string, fn: EventListener) { this.pc.canvas.addEventListener(type, fn); this.listeners.push([type, fn]); }
  destroy() { for (const [t, f] of this.listeners) this.pc.canvas.removeEventListener(t, f); }

  /** Point the globe's center at a lon/lat. */
  center(p: LonLat, tilt = 0) { this.proj.rotate([-p[0], -p[1], tilt]); }
  centerOf(): LonLat { const r = this.proj.rotate(); return [-r[0], -r[1]]; }
  /** Whether a lon/lat is on the visible hemisphere. */
  visible(p: LonLat) { const c = this.centerOf(), toR = Math.PI / 180; return Math.sin(c[1] * toR) * Math.sin(p[1] * toR) + Math.cos(c[1] * toR) * Math.cos(p[1] * toR) * Math.cos((p[0] - c[0]) * toR) > 0; }

  draw() {
    const { ctx, w, h } = this.pc, pal = palette(), path = this.path, r = this.proj.scale(), [cx, cy] = this.proj.translate();
    ctx.clearRect(0, 0, w, h);
    // atmosphere: a few stepped rings
    for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx, cy, r + i * 2, 0, Math.PI * 2); ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.08 * (4 - i); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = pal.ocean; ctx.fill();
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.stroke();
    this.style.underlay?.(ctx, path, this.proj, pal);
    for (const c of COUNTRIES) {
      ctx.beginPath(); path(c.shape);
      ctx.fillStyle = this.style.fill?.(c, pal) || pal.land; ctx.fill();
    }
    ctx.beginPath(); path(BORDERS as GeoPermissibleObjects); ctx.strokeStyle = pal.ocean; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    this.style.overlay?.(ctx, path, this.proj, pal);
    // terminator-style shading on the lower right edge for a bit of roundness
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.2, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.06)"); g.addColorStop(0.7, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = g; ctx.fill();
  }
}

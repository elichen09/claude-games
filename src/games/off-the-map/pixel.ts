/*
 * Pixel rendering for Off the Map: low-resolution canvases scaled up with hard edges (to match the arcade's
 * pixel worlds), colors taken from the active world's CSS tokens, and a lit, cloudy, draggable pixel globe.
 */
import { geoGraticule10, geoOrthographic, geoPath, type GeoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { BORDERS, COUNTRIES, type Country, type LonLat } from "./geo";

export interface Palette { bg: string; panel: string; panel2: string; fg: string; muted: string; line: string; accent: string; accent2: string; good: string; bad: string; t: string[]; ocean: string; land: string; light: boolean }

/** Colors for the current world, read fresh so a world switch is picked up on the next frame. */
export function palette(): Palette {
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim() || "#888";
  const light = cs.getPropertyValue("color-scheme").includes("light");
  return {
    bg: v("--bg"), panel: v("--panel"), panel2: v("--panel2"), fg: v("--fg"), muted: v("--muted"), line: v("--line"),
    accent: v("--accent"), accent2: v("--accent2"), good: v("--good"), bad: v("--bad"), t: [0, 1, 2, 3, 4].map((i) => v("--t" + i)),
    ocean: light ? "#5f97cf" : "#1a4f86", land: light ? "#b9c98a" : "#6f9a6a", light,
  };
}

/** A hex color scaled toward black (k = 1 keeps it, 0 is black). Non-hex colors come back unchanged. */
export function darken(color: string, k: number) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return "#" + [0, 2, 4].map((i) => Math.round(Math.min(255, parseInt(h.slice(i, i + 2), 16) * k)).toString(16).padStart(2, "0")).join("");
}

export interface PixelCanvas { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }

/** A w×h canvas drawn at low resolution and shown scaled up with crisp pixels. */
export function pixelCanvas(w: number, h: number, className = "otm-canvas", readBack = false): PixelCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h; canvas.className = className;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext("2d", { willReadFrequently: readBack })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx, w, h };
}

/** Canvas pixel position for a pointer event. */
export function canvasPoint(pc: PixelCanvas, e: { clientX: number; clientY: number }): [number, number] {
  const r = pc.canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * pc.w, ((e.clientY - r.top) / r.height) * pc.h];
}

/** A chunky pixel marker: a square with an outline. */
export function pin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, outline: string, size = 3) {
  const s = Math.round(size);
  ctx.fillStyle = outline; ctx.fillRect(Math.round(x) - s - 1, Math.round(y) - s - 1, s * 2 + 3, s * 2 + 3);
  ctx.fillStyle = color; ctx.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2 + 1, s * 2 + 1);
}

/** A pixel flag on a pole, planted at x,y. */
export function flag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, outline: string) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = outline; ctx.fillRect(x - 1, y - 14, 3, 15); ctx.fillRect(x + 1, y - 15, 9, 8);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y - 13, 1, 13);
  ctx.fillStyle = color; ctx.fillRect(x + 1, y - 14, 7, 6);
}

/** Small canvas labels with a dark halo so they read on any map; kept inside the canvas. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: string, size = 8, align: CanvasTextAlign = "left") {
  ctx.font = `${size}px "Silkscreen", monospace`; ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width, W = ctx.canvas.width, left = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
  x += Math.max(0, 3 - left) - Math.max(0, left + tw - (W - 3)); y = Math.max(size / 2 + 2, Math.min(ctx.canvas.height - size / 2 - 2, y));
  ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
}

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Run fn(t) for t from 0 to 1 over ms milliseconds. Resolves when done; stop() jumps to the end (t = 1). */
export function animate(ms: number, fn: (t: number) => void): { done: Promise<void>; stop: () => void } {
  let raf = 0, finished = false, resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r)), start = performance.now();
  const end = () => { if (finished) return; finished = true; cancelAnimationFrame(raf); fn(1); resolve(); };
  const step = (now: number) => {
    if (finished) return;
    const t = Math.min(1, (now - start) / ms);
    if (t >= 1) return end();
    fn(t); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { done, stop: end };
}
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ── cloud texture: wrapping value noise, built once ── */
const CW = 192, CH = 96;
let clouds: Float32Array | null = null;
function cloudTexture() {
  if (clouds) return clouds;
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(CW * CH);
  for (const [cell, amp] of [[16, 0.5], [8, 0.3], [4, 0.2]] as const) {
    const gw = CW / cell, gh = Math.ceil(CH / cell) + 1, grid = Array.from({ length: gw * gh }, rnd);
    const at = (i: number, j: number) => grid[(j % gh) * gw + (i % gw)];
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const s = (t: number) => t * t * (3 - 2 * t), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      out[y * CW + x] += amp * (a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v));
    }
  }
  return (clouds = out);
}

function parseHex(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(darken(c, 1));
  return m ? ([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number]) : [128, 128, 128];
}

/* ── globe ── */
export interface GlobeStyle {
  /** Fill for a country, or null for the default land color. */
  fill?: (c: Country, pal: Palette) => string | null;
  /** Drawn on the map before lighting (glowing lines that should sit on the surface). */
  underlay?: (ctx: CanvasRenderingContext2D, path: GeoPath, proj: GeoProjection, pal: Palette) => void;
  /** Drawn on top of everything, unlit (pins, labels, beams). */
  overlay?: (ctx: CanvasRenderingContext2D, path: GeoPath, proj: GeoProjection, pal: Palette) => void;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

/**
 * A lit orthographic pixel globe: banded sun shading with a night side, drifting clouds, ocean glint, stars and an
 * atmosphere. Drag to spin; a tap calls onTap with the lon/lat under the pointer. It redraws itself every frame
 * while mounted; onFrame runs first each frame for animation.
 */
export class Globe {
  pc: PixelCanvas; proj: GeoProjection; path: GeoPath; style: GlobeStyle = {};
  onTap?: (p: LonLat) => void;
  onFrame?: (dt: number, now: number) => void;
  interactive = true;
  clouds = true;
  shake = 0;
  lastDrag = 0;
  /** Minimum milliseconds between re-renders of the lit planet while it's moving (dragging always renders). */
  frameMs = 30;
  private base: PixelCanvas; private basePath: GeoPath;
  private drag: { x: number; y: number; rot: [number, number, number]; moved: boolean } | null = null;
  private listeners: [string, EventListener][] = [];
  private stars: [number, number, number][];
  private particles: Particle[] = [];
  private raf = 0; private last = performance.now();
  private baseKey = ""; private baseAt = 0; private dirty = true;

  constructor(size: number, private pad = 1.18) {
    const w = Math.round(size * pad);
    this.pc = pixelCanvas(w, w, "otm-canvas otm-globe");
    this.base = pixelCanvas(w, w, "", true);
    this.proj = geoOrthographic().scale(size * 0.47).translate([w / 2, w / 2]).clipAngle(90).precision(1);
    this.path = geoPath(this.proj, this.pc.ctx);
    this.basePath = geoPath(this.proj, this.base.ctx);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.stars = Array.from({ length: Math.round(w * 0.5) }, () => [Math.floor(rnd() * w), Math.floor(rnd() * w), rnd()]);
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
      if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.lastDrag = performance.now();
      const k = 180 / ((c.getBoundingClientRect().width * 0.94) / this.pad);
      this.proj.rotate([this.drag.rot[0] + dx * k, Math.max(-85, Math.min(85, this.drag.rot[1] - dy * k)), this.drag.rot[2]]);
    });
    this.on("pointerup", (e) => {
      const p = e as PointerEvent, d = this.drag;
      this.drag = null;
      if (!d || d.moved || !this.onTap || !this.interactive) return;
      const [x, y] = canvasPoint(this.pc, p), r = this.proj.scale(), [cx, cy] = this.proj.translate();
      if (Math.hypot(x - cx, y - cy) > r) return;
      const ll = this.proj.invert!([x, y]);
      if (ll) this.onTap(ll as LonLat);
    });
    this.on("pointercancel", () => (this.drag = null));
    const loop = (now: number) => {
      const dt = Math.min(64, now - this.last); this.last = now;
      this.onFrame?.(dt, now);
      this.draw(now, dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private on(type: string, fn: EventListener) { this.pc.canvas.addEventListener(type, fn); this.listeners.push([type, fn]); }
  destroy() { cancelAnimationFrame(this.raf); for (const [t, f] of this.listeners) this.pc.canvas.removeEventListener(t, f); }
  get dragging() { return !!this.drag?.moved; }
  /** Ask for the planet to be re-rendered on the next frame (after changing fills or underlays). */
  invalidate() { this.dirty = true; }

  /** Point the globe's center at a lon/lat. */
  center(p: LonLat, tilt = 0) { this.proj.rotate([-p[0], -p[1], tilt]); }
  centerOf(): LonLat { const r = this.proj.rotate(); return [-r[0], -r[1]]; }
  /** Whether a lon/lat is on the visible hemisphere. */
  visible(p: LonLat) { const c = this.centerOf(), toR = Math.PI / 180; return Math.sin(c[1] * toR) * Math.sin(p[1] * toR) + Math.cos(c[1] * toR) * Math.cos(p[1] * toR) * Math.cos((p[0] - c[0]) * toR) > 0.02; }
  /** A burst of pixel particles at a canvas position. */
  burst(x: number, y: number, colors: string[], n = 28, speed = 1.6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random()); this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, life: 1, color: colors[i % colors.length] }); }
  }

  draw(now = performance.now(), dt = 16) {
    const pal = palette(), { ctx, w, h } = this.pc, r = this.proj.scale(), [cx, cy] = this.proj.translate();
    // The lit planet is cached: re-render it when the view moves (at most ~30 fps unless dragging), when asked,
    // or every 150 ms so the clouds keep drifting (previews use a longer frameMs). Stars, overlays and particles still update every frame.
    const key = this.proj.rotate().map((v) => v.toFixed(2)).join(","), since = now - this.baseAt;
    if (this.dirty || since > 150 || (key !== this.baseKey && (since > this.frameMs || this.dragging))) {
      this.renderBase(pal, now); this.baseKey = key; this.baseAt = now; this.dirty = false;
    }
    this.compose(pal, now, dt, ctx, w, h, r, cx, cy);
  }

  private renderBase(pal: Palette, now: number) {
    const { w, h } = this.base;
    // 1. the flat map, unlit, on the base canvas
    const b = this.base.ctx, bp = this.basePath;
    b.clearRect(0, 0, w, h);
    b.beginPath(); bp({ type: "Sphere" }); b.fillStyle = pal.ocean; b.fill();
    b.beginPath(); bp(geoGraticule10()); b.strokeStyle = "rgba(255,255,255,0.07)"; b.lineWidth = 1; b.stroke();
    this.style.underlay?.(b, bp, this.proj, pal);
    for (const c of COUNTRIES) { b.beginPath(); bp(c.shape); b.fillStyle = this.style.fill?.(c, pal) || (c.key === "Antarctica" ? "#e8eef2" : pal.land); b.fill(); }
    b.beginPath(); bp(BORDERS as GeoPermissibleObjects); b.strokeStyle = "rgba(0,0,0,0.28)"; b.lineWidth = 1; b.stroke();
    // 2. light it pixel by pixel
    this.shade(pal, now);
  }

  private compose(pal: Palette, now: number, dt: number, ctx: CanvasRenderingContext2D, w: number, h: number, r: number, cx: number, cy: number) {
    // 3. compose: space, atmosphere, planet, overlays, particles
    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake * 4) : 0, sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake * 4) : 0;
    ctx.clearRect(0, 0, w, h);
    for (const [x, y, k] of this.stars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + k * 40));
      ctx.fillStyle = pal.light ? `rgba(60,60,110,${0.25 * tw})` : `rgba(255,255,255,${0.75 * tw})`;
      ctx.fillRect(x, y, k > 0.93 ? 2 : 1, k > 0.93 ? 2 : 1);
    }
    for (let i = 4; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx + sx, cy + sy, r + i * 2.2, 0, Math.PI * 2); ctx.fillStyle = pal.light ? "#9fd3ff" : "#6fc3ff"; ctx.globalAlpha = 0.07 * (5 - i); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base.canvas, sx, sy);
    ctx.save(); ctx.translate(sx, sy);
    this.style.overlay?.(ctx, this.path, this.proj, pal);
    ctx.restore();
    if (this.particles.length) {
      const k = dt / 16;
      this.particles = this.particles.filter((p) => (p.life -= 0.022 * k) > 0);
      for (const p of this.particles) {
        p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.05 * k;
        ctx.globalAlpha = Math.min(1, p.life * 1.6); ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.life > 0.5 ? 2 : 1, p.life > 0.5 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt / 300);
  }

  /** Banded sun shading, night side, ocean glint, clouds and an atmosphere rim, computed per pixel. */
  private shade(pal: Palette, now: number) {
    const { ctx, w, h } = this.base, r = this.proj.scale(), [cx, cy] = this.proj.translate();
    const x0 = Math.max(0, Math.floor(cx - r - 1)), y0 = Math.max(0, Math.floor(cy - r - 1)), size = Math.min(w - x0, Math.ceil(2 * r + 3));
    const img = ctx.getImageData(x0, y0, size, Math.min(h - y0, size)), d = img.data, iw = img.width, ih = img.height;
    const [ro, go, bo] = parseHex(pal.ocean), night = pal.light ? [60, 70, 120] : [8, 14, 40];
    // d3 rotates (lon + λ) about y by φ, then about x by γ; undo that with the transposed matrix below
    const [lam, phi, gam] = this.proj.rotate().map((v) => (v * Math.PI) / 180);
    const cP = Math.cos(phi), sP = Math.sin(phi), cG = Math.cos(gam), sG = Math.sin(gam);
    // light in view space (toward viewer, right, up): from the upper left, a little in front
    let Lt = 0.62, Lr = -0.55, Lu = 0.56; const ln = Math.hypot(Lt, Lr, Lu); Lt /= ln; Lr /= ln; Lu /= ln;
    const tex = this.clouds ? cloudTexture() : null, drift = (now / 1000) * 1.2;
    for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
      const X = (x0 + i + 0.5 - cx) / r, Y = -(y0 + j + 0.5 - cy) / r, d2 = X * X + Y * Y;
      if (d2 > 1) continue;
      const o = (j * iw + i) * 4;
      if (d[o + 3] === 0) continue;
      const Z = Math.sqrt(1 - d2);
      const dotL = Z * Lt + X * Lr + Y * Lu, lit = Math.max(0, dotL);
      const band = Math.min(1, Math.round((0.18 + 0.95 * lit) * 5) / 5); // five flat light bands
      let R = d[o], G = d[o + 1], B = d[o + 2];
      const isOcean = Math.abs(R - ro) + Math.abs(G - go) + Math.abs(B - bo) < 24;
      let cloud = 0;
      if (tex) {
        const x = cP * Z - sG * sP * X + cG * sP * Y, y = cG * X + sG * Y, z = -sP * Z - sG * cP * X + cG * cP * Y;
        const lon = Math.atan2(y, x) - lam, lat = Math.asin(Math.max(-1, Math.min(1, z)));
        let u = ((lon / (Math.PI * 2)) * CW + drift) % CW; if (u < 0) u += CW;
        const n = tex[Math.min(CH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * CH))) * CW + Math.floor(u)];
        cloud = n > 0.7 ? 0.62 : n > 0.65 && (i + j) & 1 ? 0.38 : 0; // wispy, dithered at the edges
        if (Math.abs(lat) > 1.25) cloud *= 0.4;
      }
      R *= band; G *= band; B *= band;
      if (dotL < 0.05) { const k = Math.min(1, (0.05 - dotL) * 3) * 0.85; R += (night[0] - R) * k; G += (night[1] - G) * k; B += (night[2] - B) * k; }
      if (isOcean && lit > 0.93 && !cloud) { R += 60; G += 70; B += 70; } // sun glint on water
      if (cloud) { const cl = 235 * Math.max(0.3, band); R += (cl - R) * cloud; G += (cl - G) * cloud; B += (cl + 10 - B) * cloud; }
      if (d2 > 0.93) { const k = (d2 - 0.93) * 3; R += (150 - R) * k; G += (210 - G) * k; B += (255 - B) * k; } // atmosphere rim
      d[o] = R; d[o + 1] = G; d[o + 2] = B;
    }
    ctx.putImageData(img, x0, y0);
  }
}

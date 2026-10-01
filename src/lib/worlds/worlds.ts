/* The four pixel worlds. Each one is a tall vertical scene; a world "value" (metres, km, ft) maps to a camera height. */
import type { WorldId } from "./meta";
import { BAYER, P, R, SP, disc, fillGrad, h2, hexRGB, interp, lerpC, line, mkGrad, nz, onScreen, pk, poly, spr, srand, sy } from "./pixel";

export interface World {
  /** 1 = values go down the screen (dive, drill); -1 = values go up (balloon, rocket). */
  dir: 1 | -1;
  /** The value at which the world ends. */
  max: number;
  unit: string;
  /** [value, worldY] pairs: how world values map to pixel heights. */
  stops: number[][];
  zones: [number, string][];
  readout(v: number): string;
  init(): void;
  bg(): void;
  draw(): void;
  // worlds keep their own entity lists and helpers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extra: string]: any;
}


export const WORLDS = {} as Record<WorldId, World>;

WORLDS.abyss = {
  dir: 1, max: 10935, unit: " m",
  stops: [[0, 0], [200, 360], [1000, 820], [4000, 1350], [6000, 1750], [10935, 2300]],
  zones: [[0, "Sunlight zone"], [200, "Twilight zone"], [1000, "Midnight zone"], [4000, "Abyssal zone"], [6000, "Hadal zone"], [10935, "Challenger Deep"]],
  grad: mkGrad([[-600, "#f6f8f7"], [-1, "#dbe8eb"], [0, "#4f8ab2"], [140, "#336a96"], [360, "#21507a"], [820, "#132f4f"], [1350, "#0a1b31"], [1750, "#061122"], [2330, "#03070f"], [2340, "#17141b"], [2600, "#0c0a10"]]),
  readout(v) {
    const t = interp([[0, 22], [200, 14], [1000, 5], [4000, 2], [11000, 1.5]], v);
    return `${Math.round(1 + v / 10).toLocaleString()} atm · ${t.toFixed(t < 10 ? 1 : 0)}°C · light ${v < 200 ? Math.max(1, Math.round(100 * Math.exp(-v / 45))) + "%" : "none"}`;
  },
  init() {
    const r = srand(11), e = [];
    for (let i = 0; i < 9; i++) { const n = 3 + ((r() * 5) | 0), y = 40 + r() * 290, x = r(), vx = (0.0004 + r() * 0.0006) * (r() < 0.5 ? -1 : 1); for (let k = 0; k < n; k++) e.push({ k: "fish", x: x + (r() - 0.5) * 0.06, wy: y + (r() - 0.5) * 14, vx, ph: r() * 6 }); }
    e.push({ k: "turtle", x: 0.7, wy: 170, vx: -0.0003, ph: 0 }, { k: "whale", x: 0.15, wy: 290, vx: 0.00018, ph: 0 });
    for (let i = 0; i < 9; i++) e.push({ k: "jelly", x: r(), wy: 400 + r() * 380, vx: (r() - 0.5) * 0.0002, ph: r() * 6 });
    for (let i = 0; i < 14; i++) e.push({ k: "lantern", x: r(), wy: 860 + r() * 440, vx: (0.0003 + r() * 0.0005) * (r() < 0.5 ? -1 : 1), ph: r() * 6 });
    for (let i = 0; i < 3; i++) e.push({ k: "squid", x: r(), wy: 950 + r() * 300, vx: 0, ph: r() * 6 });
    for (let i = 0; i < 4; i++) e.push({ k: "angler", x: r(), wy: 1420 + r() * 300, vx: (0.0002 + r() * 0.0002) * (r() < 0.5 ? -1 : 1), ph: r() * 6 });
    for (let i = 0; i < 6; i++) e.push({ k: "snail", x: 0.25 + r() * 0.5, wy: 1850 + r() * 420, vx: (r() - 0.5) * 0.0004, ph: r() * 6 });
    for (let i = 0; i < 7; i++) e.push({ k: "vent", x: 0.12 + i * 0.13 + r() * 0.04, wy: 2330, h: 6 + ((r() * 14) | 0), ph: r() * 6 });
    for (let i = 0; i < 24; i++) e.push({ k: "worm", x: r(), wy: 2330, h: 2 + ((r() * 5) | 0), ph: r() * 6 });
    for (let i = 0; i < 6; i++) e.push({ k: "cloud", x: r(), wy: -60 - r() * 160, w: 10 + ((r() * 20) | 0), vx: 0.00006 + r() * 0.00008 });
    this.ents = e;
    this.snow = Array.from({ length: 140 }, () => ({ x: r(), y: r(), s: r() }));
  },
  bg() {
    const shift = (P.t * 0.15) | 0;
    fillGrad(this.grad, (y, wy, row) => {
      if (wy > 0 && wy < 320) { // sun shafts, dithered
        const k = (1 - wy / 320) * 0.2, light = pk([110, 165, 200]);
        for (let x = 0; x < P.LW; x++) if (((x + (wy >> 2) + shift) & 63) < 9 && BAYER[(y & 3) * 4 + (x & 3)] < k) P.buf[row + x] = light;
      }
    });
  },
  draw() {
    const { LW, LH, t } = P;
    // trench walls close in below 1400
    for (let y = 0; y < LH; y++) {
      const wy = y + Math.round(P.cam); if (wy < 1380) continue;
      const k = Math.min(1, (wy - 1380) / 950), j = nz(3, wy * 0.35) * 18;
      const wl = Math.round(k * LW * 0.24 + j * k), wr = Math.round(k * LW * 0.2 + nz(60, wy * 0.35) * 18 * k);
      R(0, y, wl, 1, "#04080f"); R(wl, y, 1, 1, "#0f1d2c"); R(LW - wr, y, wr, 1, "#04080f"); R(LW - wr - 1, y, 1, 1, "#0f1d2c");
    }
    for (const e of this.ents) {
      if (e.vx) { e.x += e.vx; if (e.x > 1.15) e.x = -0.15; if (e.x < -0.15) e.x = 1.15; }
      const s = sy(e.wy); if (!onScreen(s, 60)) continue; const x = e.x * LW;
      if (e.k === "cloud") { R(x, s, e.w, 2, "#ffffff"); R(x + 3, s - 2, e.w - 8, 2, "#ffffff"); R(x + 2, s + 2, e.w - 2, 1, "#e3ecee"); }
      else if (e.k === "fish") spr(SP.fish, x, s + Math.sin(t / 20 + e.ph), { x: "#183a5c" }, e.vx < 0);
      else if (e.k === "turtle") spr(SP.turtle, x, s + Math.sin(t / 40), { g: "#1d4d4a", h: "#2f6b5e" }, e.vx < 0);
      else if (e.k === "whale") spr(SP.whale, x, s + Math.sin(t / 70) * 2, { w: "#163a5b", b: "#1e4a70", e: "#0c2238" });
      else if (e.k === "jelly") {
        const p = Math.sin(t / 25 + e.ph), yy = s + p * 3;
        R(x - 1, yy - 1, 9, 5, "rgba(255,120,190,.12)"); R(x, yy, 7, 2, "#ff8fc8"); R(x + 1, yy - 1, 5, 1, "#ffb3db"); R(x, yy + 2, 7, 1, "#d9609f");
        for (let k = 0; k < 4; k++) { const tx = x + 1 + k * 1.7; for (let q = 0; q < 6; q++) R(tx + Math.sin(t / 12 + q * 0.8 + k) * 0.8, yy + 3 + q, 1, 1, q % 2 ? "#a8457a" : "#ff8fc8"); }
      } else if (e.k === "lantern") { spr(SP.fish, x, s, { x: "#0e1a28" }, e.vx < 0); if ((t / 8 + e.ph * 10) % 30 > 4) R(x + (e.vx < 0 ? 5 : 0), s + 1, 1, 1, "#7ef2d2"); }
      else if (e.k === "squid") spr(SP.squid, x, s + Math.sin(t / 30 + e.ph) * 6, { s: "#5a2333", e: "#ffde7a" });
      else if (e.k === "angler") { const fl = e.vx < 0; spr(SP.angler, x, s, { d: "#120d16", e: "#6b4e2e", t: "#e9e3d0", y: "#3b3214" }, fl); const lx = fl ? x + 10 : x; const g = 0.6 + 0.4 * Math.sin(t / 10 + e.ph); R(lx - 2, s - 2, 5, 5, `rgba(255,230,120,${0.18 * g})`); R(lx, s, 1, 1, "#fff2a8"); }
      else if (e.k === "snail") spr(SP.snail, x, s + Math.sin(t / 35 + e.ph) * 2, { p: "#e7c3cf", e: "#3a2a33" }, e.vx < 0);
      else if (e.k === "vent") { R(x, s - e.h, 4, e.h, "#2a2328"); R(x + 1, s - e.h, 2, 1, "#ff7a3d"); for (let q = 0; q < 10; q++) { const yy = s - e.h - ((t * 0.3 + q * 9 + e.ph * 20) % 70); R(x + 1 + Math.sin(yy * 0.2 + q) * 2, yy, 2, 1, `rgba(150,140,160,${0.5 - ((t * 0.3 + q * 9) % 70) / 140})`); } }
      else if (e.k === "worm") { R(x, s - e.h, 1, e.h, "#e8e1d5"); R(x, s - e.h - 1, 1, 1, "#ff3b4e"); }
    }
    // surface + ship + cable
    const s0 = sy(0);
    if (onScreen(s0, 30)) {
      for (let x = 0; x < LW; x++) { const w = Math.round(Math.sin(x * 0.11 + t * 0.04) * 1.2); R(x, s0 + w - 1, 1, 1, "#d6ecf2"); R(x, s0 + w, 1, 1, "#7fb3cf"); }
    }
    const sx = Math.round(LW * (LW < 200 ? 0.06 : 0.14)), bob = Math.round(Math.sin(t / 30));
    const ship = { f: "#ff9f1c", m: "#14202c", a: "#2b3f52", w: "#1c2a39", g: "#9ec7d8", h: "#16212d", r: "#7a2c2c" };
    const bx = sx + 18; // crane tip x
    const by = sy(interp(this.stops, Math.min(P.v, this.max)));
    if (onScreen(s0, 40)) spr(SP.ship, sx, s0 - 10 + bob, ship);
    line(bx, s0 - 6 + bob, bx, by, "rgba(20,30,40,.75)");
    // snow drifts past (you're sinking)
    for (const p of this.snow) { p.y -= 0.0007 + p.s * 0.0006; if (p.y < 0) p.y += 1; const yy = p.y * LH, wy = yy + P.cam; if (wy < 0) continue; R(p.x * LW, yy, 1, 1, wy < 360 ? "rgba(220,240,250,.45)" : "rgba(170,190,210,.35)"); }
    // the bathysphere and its lamp
    const deep = P.v > 300;
    if (deep) for (let k = 6; k < 64; k++) { const w = Math.round(k * 0.28), yy = by + k; if (yy < 0 || yy >= LH) continue; const a = 0.5 * (1 - k / 64); for (let xx = -w; xx <= w; xx++) if (BAYER[(yy & 3) * 4 + ((bx + xx) & 3)] < a * (1 - Math.abs(xx) / (w + 1))) R(bx + 1 + xx, yy, 1, 1, "#e8dfa0"); }
    spr(SP.bell, bx - 4, by - 4, { k: "#0d151d", o: "#4d6474", y: "#ffd166", l: deep ? "#fff4c0" : "#ffd166" });
  },
};

WORLDS.core = {
  dir: 1, max: 6371, unit: " km",
  stops: [[0, 0], [35, 420], [660, 900], [2890, 1450], [5150, 1950], [6371, 2350]],
  zones: [[0, "Crust"], [35, "Upper mantle"], [660, "Lower mantle"], [2890, "Outer core"], [5150, "Inner core"], [6371, "Center of the Earth"]],
  pal: ["#000000", "#16052e", "#33095e", "#5b0d84", "#8e1182", "#c41f62", "#e8433a", "#f7731a", "#fca70f", "#ffd447", "#fff09e", "#ffffff"].map((h) => pk(hexRGB(h))),
  readout(v) {
    const T = interp([[0, 15], [35, 500], [660, 1900], [2890, 3700], [5150, 4400], [6371, 5400]], v), G = interp([[0, 0], [35, 1], [660, 24], [2890, 136], [5150, 330], [6371, 360]], v);
    return `${Math.round(T).toLocaleString()}°C · ${G < 10 ? G.toFixed(1) : Math.round(G)} GPa`;
  },
  init() {
    const r = srand(5);
    this.blobs = Array.from({ length: 7 }, () => ({ x: r(), wy: 120 + r() * 330, r: 10 + r() * 22 }));
    this.bld = []; let x = 0; while (x < 1) { const w = 0.03 + r() * 0.06; this.bld.push({ x, w, h: 8 + ((r() * 30) | 0), tree: r() < 0.3 }); x += w + 0.01; }
    this.sparks = Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: r() }));
    this.gems = Array.from({ length: 10 }, () => ({ x: r(), wy: 480 + r() * 120 }));
    this.prev = new Int8Array(2000);
  },
  heat(x: number, wy: number) {
    if (wy < 0) return 0.06 + nz(x * 0.3, wy * 0.3) * 0.05;
    const d = Math.min(1, wy / 2350);
    let h = 0.16 + 0.8 * Math.pow(d, 0.9);
    const flow = wy > 900 ? P.t * 0.35 : P.t * 0.06;
    h += (nz(x * 0.32, wy * 0.32 + flow * 0.5) - 0.5) * (wy < 420 ? 0.34 : 0.42);
    if (wy < 480) for (const b of this.blobs) { const dx = x - b.x * P.LW, dy = wy - b.wy; const q = (dx * dx + dy * dy) / (b.r * b.r); if (q < 4) h += 0.42 * Math.exp(-q); }
    return h;
  },
  bg() {
    const { LW, LH, buf } = P; const c0 = Math.round(P.cam), prev = this.prev;
    for (let y = 0; y < LH; y++) {
      const wy = y + c0, row = y * LW, by = (y & 3) * 4; let left = -1;
      for (let x = 0; x < LW; x++) {
        const h = Math.max(0, Math.min(0.999, this.heat(x, wy)));
        const lvl = (h * 5) | 0; let col;
        if (wy > 2 && ((left >= 0 && lvl !== left) || (y > 0 && lvl !== prev[x])) && lvl >= 1) col = 0xffffe63f; // cyan isotherm (ABGR)
        else { const f = h * 11; const i = f | 0; col = this.pal[Math.min(11, BAYER[by + (x & 3)] < f - i ? i + 1 : i)]; }
        buf[row + x] = col; prev[x] = lvl; left = lvl;
      }
    }
  },
  draw() {
    const { LW, t } = P; const s0 = sy(0);
    if (onScreen(s0, 60)) {
      for (const b of this.bld) { const x = b.x * LW, w = Math.max(3, b.w * LW); if (b.tree) { disc(x + w / 2, s0 - b.h * 0.5, Math.max(2, (w / 2) | 0), "#2a0a52"); R(x + w / 2, s0 - b.h * 0.3, 1, b.h * 0.3, "#3b0b6e"); } else { R(x, s0 - b.h, w, b.h, "#5b0d84"); for (let yy = s0 - b.h + 2; yy < s0 - 2; yy += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) if (h2(xx, yy) < 0.5) R(xx, yy, 1, 1, h2(yy, xx) < 0.3 ? "#ffd447" : "#e8433a"); } }
      for (let i = 0; i < 5; i++) { const x = ((i * 0.21 + t * 0.0004) % 1) * LW; R(x, s0 - 4, 2, 4, "#fca70f"); R(x, s0 - 5, 2, 1, "#fff09e"); }
    }
    for (const g of this.gems) { const s = sy(g.wy); if (onScreen(s)) { const on = (t / 6 + g.x * 50) % 20 < 3; R(g.x * LW, s, 1, 1, "#ffffff"); if (on) { R(g.x * LW - 1, s, 3, 1, "#bff8ff"); R(g.x * LW, s - 1, 1, 3, "#bff8ff"); } } }
    for (const p of this.sparks) { p.y -= 0.001 + p.s * 0.002; if (p.y < 0) p.y += 1; const yy = p.y * P.LH; if (yy + P.cam > 700) R(p.x * LW + Math.sin(yy * 0.1) * 2, yy, 1, 1, p.s > 0.6 ? "#ffffff" : "#fff09e"); }
    const bx = Math.round(LW * (LW < 200 ? 0.1 : 0.16)), by = sy(interp(this.stops, Math.min(P.v, this.max)));
    R(bx + 1, Math.max(s0, -2), 4, Math.max(0, by - Math.max(s0, -2)), "#16052e"); // borehole
    R(bx, Math.max(s0, -2), 1, Math.max(0, by - Math.max(s0, -2)), "#39e6ff");
    spr(SP.drill, bx, by - 4 + (P.v > 0 ? Math.round(Math.sin(t)) * 0 : 0), { w: "#ffffff", g: "#39e6ff", o: "#fca70f", y: (t >> 2) % 2 ? "#ffffff" : "#ffd447" });
    // crosshair HUD, like a thermal camera
    const cx = LW / 2, cy = P.LH / 2; const c = "rgba(255,255,255,.5)";
    R(cx - 6, cy, 4, 1, c); R(cx + 3, cy, 4, 1, c); R(cx, cy - 6, 1, 4, c); R(cx, cy + 3, 1, 4, c);
    for (const [ax, ay, dx, dy] of [[6, 6, 1, 1], [LW - 7, 6, -1, 1], [6, P.LH - 7, 1, -1], [LW - 7, P.LH - 7, -1, -1]]) { R(Math.min(ax, ax + dx * 8), ay, 9, 1, c); R(ax, Math.min(ay, ay + dy * 8), 1, 9, c); }
  },
};

WORLDS.collage = {
  dir: -1, max: 120000, unit: " ft",
  stops: [[0, 0], [500, -260], [3000, -620], [14000, -1050], [30000, -1550], [60000, -2000], [120000, -2450]],
  zones: [[0, "Meadow"], [500, "Treetops"], [3000, "Cloud base"], [14000, "Mountain peaks"], [30000, "Jet stream"], [60000, "Edge of the sky"], [120000, "The Moon, more or less"]],
  grad: mkGrad([[-2700, "#0b0f2e"], [-2100, "#18235f"], [-1600, "#2f4fa6"], [-1100, "#6b96dd"], [-650, "#a8c4f0"], [-300, "#f0b9cb"], [-60, "#f9c99e"], [0, "#f9d9ae"], [1, "#7fb069"], [80, "#5c9150"], [500, "#3a6636"]], 30),
  readout(v) { const F = v < 36000 ? 59 - (3.56 * v) / 1000 : -69; const p = Math.round(100 * Math.exp(-v / 27700)); return `${Math.round(F)}°F · air ${p}%`; },
  init() {
    const r = srand(23), jag = (n: number) => Array.from({ length: n }, () => r());
    this.far = Array.from({ length: 7 }, (_, i) => ({ x: i / 6 - 0.08 + r() * 0.05, w: 0.22 + r() * 0.15, h: 45 + r() * 40 }));
    this.mid = Array.from({ length: 6 }, (_, i) => ({ x: i / 5 - 0.1 + r() * 0.05, w: 0.25 + r() * 0.12, h: 25 + r() * 25 }));
    this.houses = Array.from({ length: 6 }, (_, i) => ({ x: 0.35 + i * 0.1 + r() * 0.03, w: 7 + ((r() * 5) | 0), h: 6 + ((r() * 5) | 0), c: ["#e85d75", "#f2c14e", "#5fb7c9", "#f7f3e8", "#b388eb"][(r() * 5) | 0] }));
    this.trees = Array.from({ length: 9 }, () => ({ x: r(), h: 14 + r() * 16, palm: r() < 0.5 }));
    this.clouds = Array.from({ length: 9 }, () => ({ x: r(), wy: -560 - r() * 420, w: 18 + r() * 26, vx: 0.00005 + r() * 0.0001, j: jag(8) }));
    this.birds = Array.from({ length: 7 }, () => ({ x: r(), wy: -280 - r() * 260, vx: 0.0004 + r() * 0.0004, ph: r() * 6 }));
    this.stars = Array.from({ length: 26 }, () => ({ x: r(), wy: -1700 - r() * 900 }));
    this.fruit = [{ x: 0.86, wy: -1240, k: "cherry" }, { x: 0.88, wy: -1880, k: "planet" }, { x: 0.86, wy: -760, k: "sun" }];
    this.kites = Array.from({ length: 4 }, (_, i) => ({ x: [0.05, 0.9, 0.82, 0.08][i], wy: -330 - i * 70, c: ["#ff5a36", "#3557d6", "#1f9e6e", "#c2378a"][i], ph: r() * 6 }));
    this.others = Array.from({ length: 4 }, (_, i) => ({ x: [0.9, 0.04, 0.84, 0.94][i], wy: -480 - i * 260, c: ["#3557d6", "#1f9e6e", "#c2378a", "#ff8a00"][i], ph: r() * 6 }));
    this.grainSeed = 3;
  },
  bg() {
    fillGrad(this.grad, (y, wy, row) => { // paper fibre speckle, fixed to the world
      for (let x = 0; x < P.LW; x++) { const h = h2(x * 7 + 3, wy * 13); if (h < 0.01) { const c = P.buf[row + x]; P.buf[row + x] = h < 0.005 ? (c | 0x101010) : (c & 0xfff0f0f0); } }
    });
  },
  cut(pts: number[][], col: string, shadow = true) { // paper cut-out: drop shadow, white edge, then the colour
    if (shadow) poly(pts.map(([x, y]) => [x + 2, y + 2]), "rgba(40,20,70,.28)");
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) poly(pts.map(([x, y]) => [x + dx, y + dy]), "#fffaf0");
    poly(pts, col);
  },
  draw() {
    const { LW, LH, t } = P; const c0 = -LH * 0.8;
    const par = (wy: number, p: number) => wy - (c0 + (Math.round(P.cam) - c0) * p);
    // far and mid mountain layers drift slower: parallax
    for (const m of this.far) { const b = par(-10, 0.45); if (b < -10 || b - m.h > LH + 10) continue; const x = m.x * LW, w = m.w * LW; this.cut([[x, b], [x + w * 0.45, b - m.h], [x + w * 0.55, b - m.h + 4], [x + w, b]], "#9c8fd3"); poly([[x + w * 0.45, b - m.h], [x + w * 0.38, b - m.h + 10], [x + w * 0.5, b - m.h + 7], [x + w * 0.6, b - m.h + 11], [x + w * 0.55, b - m.h + 4]], "#fffaf0"); }
    const sun = this.fruit[2]; { const s = par(sun.wy, 0.6); if (onScreen(s, 40)) { disc(sun.x * LW + 2, s + 2, 16, "rgba(40,20,70,.25)"); disc(sun.x * LW, s, 17, "#fffaf0"); disc(sun.x * LW, s, 16, "#ffcf3f"); for (let yy = -14; yy < 14; yy += 3) for (let xx = -14; xx < 14; xx += 3) if (xx * xx + yy * yy < 180 && xx + yy > 4) R(sun.x * LW + xx, s + yy, 1, 1, "#f59e0b"); } }
    for (const m of this.mid) { const b = par(0, 0.75); if (b < -10 || b - m.h > LH + 10) continue; const x = m.x * LW, w = m.w * LW; this.cut([[x, b], [x + w * 0.3, b - m.h * 0.7], [x + w * 0.5, b - m.h], [x + w * 0.8, b - m.h * 0.5], [x + w, b]], "#4f8f7b"); }
    const s0 = sy(0);
    if (onScreen(s0, 80)) {
      for (const tr of this.trees) { const x = tr.x * LW; if (tr.palm) { R(x, s0 - tr.h, 2, tr.h, "#8a5a3b"); for (const a of [-1, 1]) this.cut([[x + 1, s0 - tr.h], [x + 1 + a * 9, s0 - tr.h + 3], [x + 1 + a * 5, s0 - tr.h - 2]], "#2f8f4e", false); } else { R(x, s0 - 5, 2, 5, "#6b4430"); this.cut([[x - 5, s0 - 4], [x + 1, s0 - tr.h], [x + 7, s0 - 4]], "#3c7d3f"); } }
      for (const hs of this.houses) { const x = hs.x * LW; this.cut([[x, s0], [x, s0 - hs.h], [x + hs.w / 2, s0 - hs.h - 5], [x + hs.w, s0 - hs.h], [x + hs.w, s0]], hs.c); R(x + hs.w / 2 - 1, s0 - 3, 2, 3, "#3b2a40"); }
      R(0, s0, LW, 1, "#fffaf0");
    }
    for (const b of this.birds) { b.x += b.vx; if (b.x > 1.1) b.x = -0.1; const s = sy(b.wy); if (!onScreen(s)) continue; const x = b.x * LW, f = Math.sin(t / 6 + b.ph) > 0 ? 1 : -1; R(x, s, 1, 1, "#2a2140"); R(x - 1, s - f, 1, 1, "#2a2140"); R(x + 1, s - f, 1, 1, "#2a2140"); R(x - 2, s - f * 2, 1, 1, "#2a2140"); R(x + 2, s - f * 2, 1, 1, "#2a2140"); }
    for (const c of this.clouds) { c.x += c.vx; if (c.x > 1.2) c.x = -0.2; const s = sy(c.wy); if (!onScreen(s, 30)) continue; const x = c.x * LW, w = c.w; const pts = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push([x + Math.cos(a) * w * (0.5 + c.j[i] * 0.15), s + Math.sin(a) * w * 0.22 * (0.7 + c.j[i] * 0.6)]); } this.cut(pts, "#ffffff"); R(x - 4, s - w * 0.22 - 2, 9, 3, "rgba(242,226,150,.8)"); }
    for (const k of this.kites) { const s = sy(k.wy); if (!onScreen(s, 40)) continue; const x = k.x * LW + Math.sin(t / 40 + k.ph) * 3, yy = s + Math.cos(t / 50 + k.ph) * 2; line(x, yy + 8, x - 6 + Math.sin(t / 30) * 2, yy + 40, "rgba(29,26,46,.5)"); this.cut([[x, yy - 8], [x + 6, yy], [x, yy + 8], [x - 6, yy]], k.c); R(x, yy - 7, 1, 14, "#fffaf0"); }
    for (const o of this.others) { const s = sy(o.wy) + Math.sin(t / 60 + o.ph) * 3; if (!onScreen(s, 30)) continue; const x = o.x * LW; disc(x + 1, s + 1, 6, "rgba(40,20,70,.25)"); disc(x, s, 7, "#fffaf0"); disc(x, s, 6, o.c); R(x - 1, s - 6, 2, 12, "#fffaf0"); line(x - 3, s + 6, x - 1, s + 10, "#3b2a40"); line(x + 3, s + 6, x + 1, s + 10, "#3b2a40"); R(x - 2, s + 10, 4, 3, "#a8643c"); }
    const pk2 = sy(-1050); if (onScreen(pk2, 160)) { const x = LW * 0.74; this.cut([[x, pk2 + 120], [x + 40, pk2], [x + 52, pk2 + 12], [x + 64, pk2 + 6], [LW + 10, pk2 + 120]], "#6f7da8"); poly([[x + 40, pk2], [x + 30, pk2 + 30], [x + 44, pk2 + 22], [x + 58, pk2 + 30], [x + 52, pk2 + 12]], "#fffaf0"); for (let yy = 30; yy < 120; yy += 3) for (let xx = 0; xx < 60; xx += 3) if (h2(xx, yy) < 0.5 && xx > yy * 0.4) R(x + 40 + xx, pk2 + yy, 1, 1, "#4d5a85"); }
    const pl = sy(-1340); if (onScreen(pl)) { const x = ((t * 0.0008) % 1.3 - 0.15) * LW; this.cut([[x, pl], [x + 14, pl + 3], [x, pl + 6], [x + 4, pl + 3]], "#ffffff"); }
    const jt = sy(-1560); if (onScreen(jt)) { const x = ((t * 0.0012) % 1.4 - 0.2) * LW; R(0, jt + 2, Math.max(0, x), 2, "rgba(255,255,255,.55)"); spr(SP.plane, x, jt, { w: "#f7f3e8" }); }
    for (const st of this.stars) { const s = sy(st.wy); if (onScreen(s)) { R(st.x * LW + 1, s + 1, 5, 5, "rgba(10,10,40,.0)"); spr(SP.star, st.x * LW, s, { y: (st.x * 100 + t / 20) % 7 < 1 ? "#fff6c8" : "#ffd84d" }); } }
    const ch = this.fruit[0], cs = sy(ch.wy); if (onScreen(cs, 40)) { const x = ch.x * LW; line(x, cs - 18, x - 6, cs, "#3c7d3f"); line(x, cs - 18, x + 7, cs + 2, "#3c7d3f"); disc(x - 6 + 2, cs + 2, 6, "rgba(40,20,70,.25)"); disc(x - 6, cs, 6, "#e0233f"); disc(x + 7, cs + 2, 6, "#c81d38"); R(x - 8, cs - 3, 2, 2, "#ffb3bf"); }
    const pn = this.fruit[1], ps = sy(pn.wy); if (onScreen(ps, 40)) { const x = pn.x * LW; disc(x, ps, 12, "#fffaf0"); disc(x, ps, 11, "#f28c8c"); poly([[x - 22, ps + 3], [x + 22, ps - 5], [x + 22, ps - 3], [x - 22, ps + 5]], "#ffd84d"); }
    const mn = sy(-2470); if (onScreen(mn, 70)) { const x = LW * 0.86; disc(x + 3, mn + 3, 36, "rgba(0,0,20,.35)"); disc(x, mn, 37, "#fffaf0"); disc(x, mn, 36, "#f3ecd2"); disc(x + 14, mn - 8, 33, "#0e1236"); R(x - 30, mn - 4, 22, 5, "rgba(242,226,150,.85)"); }
    // the balloon
    const bx = Math.round(LW * (LW < 200 ? 0.12 : 0.16) + Math.sin(t / 50) * 2), by = sy(interp(this.stops, Math.min(P.v, this.max)));
    disc(bx + 2, by - 18, 11, "rgba(40,20,70,.25)"); disc(bx, by - 20, 12, "#fffaf0");
    const c = P.ctx; for (let dy = -11; dy <= 11; dy++) { const w = Math.floor(Math.sqrt(121 - dy * dy + 8)); for (let dx = -w; dx <= w; dx++) { c.fillStyle = ((dx + 11) / 4 | 0) % 2 ? "#ff5a36" : "#ffd23f"; c.fillRect(bx + dx, by - 20 + dy, 1, 1); } }
    line(bx - 6, by - 11, bx - 3, by - 2, "#3b2a40"); line(bx + 6, by - 11, bx + 3, by - 2, "#3b2a40");
    R(bx - 4, by - 2, 9, 5, "#fffaf0"); R(bx - 3, by - 1, 7, 4, "#a8643c"); R(bx - 3, by, 7, 1, "#7a4426");
  },
};

WORLDS.orbit = {
  dir: -1, max: 384400, unit: " km",
  stops: [[0, 0], [12, -380], [50, -700], [100, -980], [408, -1300], [2000, -1600], [35786, -1950], [384400, -2450]],
  zones: [[0, "Troposphere"], [12, "Stratosphere"], [50, "Mesosphere"], [100, "Kármán line"], [408, "Space station orbit"], [2000, "Medium Earth orbit"], [35786, "Geostationary orbit"], [384400, "The Moon"]],
  grad: mkGrad([[-2700, "#000003"], [-1500, "#03030c"], [-950, "#0d0830"], [-560, "#260f5c"], [-260, "#5a1a86"], [-80, "#b42e8f"], [-1, "#ff7a6b"], [0, "#160632"], [60, "#0d0320"], [400, "#06010f"]], 28),
  readout(v) { const g = 100 * Math.pow(6371 / (6371 + v), 2); return `gravity ${g < 10 ? g.toFixed(1) : Math.round(g)}% · ${v < 100 ? "air thinning" : "vacuum"}`; },
  init() {
    const r = srand(41);
    this.bld = []; let x = 0; while (x < 1.02) { const w = 0.025 + r() * 0.05; this.bld.push({ x, w, h: 10 + ((r() * 46) | 0), ant: r() < 0.25 }); x += w; }
    this.clouds = Array.from({ length: 8 }, () => ({ x: r(), wy: -140 - r() * 280, w: 14 + ((r() * 24) | 0), vx: 0.0001 + r() * 0.0002 }));
    this.sats = Array.from({ length: 5 }, () => ({ x: r(), wy: -1450 - r() * 500, vx: (0.0004 + r() * 0.0006) * (r() < 0.5 ? -1 : 1) }));
    this.trail = [];
  },
  bg() {
    fillGrad(this.grad, (y, wy, row) => {
      if (wy < -40) { const dens = Math.min(0.0045, (-wy - 40) / 90000); for (let x = 0; x < P.LW; x++) { const h = h2(x, wy); if (h < dens) { const tw = (h * 9973 + P.t / 14) % 9 < 1; P.buf[row + x] = tw ? 0xff7a5a8a : h < dens * 0.15 ? 0xffffffb0 : h < dens * 0.25 ? 0xffd63dff : 0xffffffff; } } }
    });
  },
  draw() {
    const { LW, LH, t } = P; const s0 = sy(0); const c0 = -LH * 0.8;
    // synthwave sun sits behind the skyline (parallax)
    const ss = s0 - (Math.round(P.cam) - c0) * -0.0 - 10; const sunY = s0 - 8 - (Math.round(P.cam) - c0) * 0.7;
    if (onScreen(sunY, 50)) { const r = Math.min(40, LW * 0.16); for (let dy = -r; dy <= 0; dy++) { const yy = sunY + dy; if (yy > s0) continue; const gap = dy > -r * 0.45 && ((dy + 200) % 4 < 1 + (dy + r) / 14); if (gap) continue; const w = Math.floor(Math.sqrt(r * r - dy * dy)); const c = lerpC([255, 214, 70], [255, 41, 117], (dy + r) / r); R(LW * 0.66 - w, yy, w * 2, 1, `rgb(${c})`); } }
    if (onScreen(s0, 70)) {
      for (const b of this.bld) { const x = Math.round(b.x * LW), w = Math.max(3, Math.round(b.w * LW)); R(x, s0 - b.h, w, b.h, "#1b0a36"); R(x, s0 - b.h, w, 1, "#3d1d6e"); for (let yy = s0 - b.h + 3; yy < s0 - 2; yy += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) { const h = h2(xx, yy); if (h < 0.35) R(xx, yy, 1, 1, h < 0.12 ? "#29f3ff" : "#ffd36b"); } if (b.ant) { R(x + (w >> 1), s0 - b.h - 6, 1, 6, "#3d1d6e"); if ((t >> 5) % 2) R(x + (w >> 1), s0 - b.h - 7, 1, 1, "#ff3355"); } }
      for (let k = 1; k < 12; k++) { const yy = s0 + Math.round(Math.pow(k / 11, 2) * 60 + ((t * 0.3) % 6) * (k / 11)); R(0, yy, LW, 1, "rgba(255,61,214,.55)"); }
      for (let k = -16; k <= 16; k++) line(LW / 2 + k * 6, s0 + 1, LW / 2 + k * 30, s0 + 70, "rgba(255,61,214,.35)");
    }
    for (const c of this.clouds) { c.x += c.vx; if (c.x > 1.2) c.x = -0.2; const s = sy(c.wy); if (!onScreen(s)) continue; const x = c.x * LW; R(x, s, c.w, 2, "#ff9ad5"); R(x + 4, s - 2, c.w - 9, 2, "#ffc2e6"); R(x + 2, s + 2, c.w - 3, 1, "#b04aa0"); }
    const ap = sy(-330); if (onScreen(ap)) { const x = ((t * 0.0009) % 1.3 - 0.15) * LW; spr(SP.plane, x, ap, { w: "#29203f" }); if ((t >> 4) % 2) R(x + 9, ap, 1, 1, "#ff3355"); }
    const wb = sy(-660); if (onScreen(wb, 20)) { const x = LW * 0.78 + Math.sin(t / 60) * 3; disc(x, wb, 4, "#f1e9ff"); line(x, wb + 4, x, wb + 12, "#c4a3e0"); R(x - 1, wb + 12, 3, 2, "#c4a3e0"); }
    // aurora curtains above the Kármán line
    for (let y = 0; y < LH; y++) { const wy = y + Math.round(P.cam); if (wy > -900 || wy < -1180) continue; const k = 1 - Math.abs(wy + 1040) / 140; for (let x = 0; x < LW; x += 1) { const v = Math.sin(x * 0.07 + t * 0.02) + Math.sin(x * 0.023 - t * 0.013 + wy * 0.01); if (v > 1.1 - k * 0.6 && BAYER[(y & 3) * 4 + (x & 3)] < k * 0.7) R(x, y, 1, 1, v > 1.5 ? "#7dffb2" : "#29f3c0"); } }
    const is = sy(-1300); if (onScreen(is)) spr(SP.iss, ((t * 0.0006) % 1.3 - 0.15) * LW, is, { b: "#4a6fd1", w: "#e6e6f0" });
    for (const s of this.sats) { s.x += s.vx; if (s.x > 1.1) s.x = -0.1; if (s.x < -0.1) s.x = 1.1; const yy = sy(s.wy); if (onScreen(yy)) spr(SP.sat, s.x * LW, yy, { b: "#3b5bdb", w: "#f1f1ff" }); }
    const mn = sy(-2480); if (onScreen(mn, 80)) { const x = LW * 0.84; disc(x, mn, 44, "#cfcbd8"); for (const [dx, dy, r] of [[-14, -10, 7], [10, 6, 9], [-6, 18, 5], [20, -16, 4], [-24, 8, 4]]) disc(x + dx, mn + dy, r, "#a9a3b8"); poly([[x + 44, mn - 44], [x + 10, mn + 44], [x + 60, mn + 44]], "rgba(0,0,8,.25)"); }
    // rocket
    const bx = Math.round(LW * (LW < 200 ? 0.12 : 0.16)), by = sy(interp(this.stops, Math.min(P.v, this.max)));
    const moving = Math.abs(P.vT - P.v) > 1;
    if (moving || t % 3 === 0) this.trail.push({ x: bx + 2 + (Math.random() - 0.5) * 2, wy: by + Math.round(P.cam) + 9, life: 40 });
    this.trail = this.trail.filter((p: { life: number }) => (p.life -= 1) > 0);
    for (const p of this.trail) R(p.x, sy(p.wy), 1, 1, p.life > 30 ? "#ffd319" : p.life > 15 ? "#ff3dd6" : "rgba(196,163,224,.5)");
    spr(SP.rocket, bx, by - 3, { w: "#f4f0ff", r: "#ff3dd6", b: "#29f3ff" });
    const fl = moving ? 4 + (t % 3) : 1 + (t % 2); R(bx + 1, by + 6, 3, fl, "#ffd319"); R(bx + 2, by + 6 + fl, 1, 2, "#ff3dd6");
    if (P.v < 1) { R(bx + 7, s0 - 40, 2, 40, "#3d1d6e"); for (let k = 0; k < 40; k += 4) R(bx + 5, s0 - 40 + k, 4, 1, "#3d1d6e"); }
  },
};


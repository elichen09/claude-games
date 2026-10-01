/* Pixel-art drawing toolkit: a low-res canvas, dithered gradients, sprites and scanline-filled shapes. */
export type GradStop = [y: number, packed: number, rgb: number[]];

export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const hexRGB = (h: string): number[] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const pk = (c: number[]): number => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
export const lerpC = (a: number[], b: number[], t: number): number[] => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export function interp(stops: number[][], v: number): number {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ya] = stops[i - 1], [b, yb] = stops[i]; return ya + ((yb - ya) * (v - a)) / (b - a); }
  return stops[stops.length - 1][1];
}
// gradient → many short bands, each dithered into the next: the stepped, rasterized look
export function mkGrad(stops: [number, string][], step = 26): GradStop[] {
  const out: GradStop[] = []; const s = stops.map(([y, h]) => [y, hexRGB(h)] as [number, number[]]);
  for (let i = 0; i < s.length - 1; i++) {
    const [y0, c0] = s[i], [y1, c1] = s[i + 1]; const n = Math.max(1, Math.round((y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([y0 + ((y1 - y0) * k) / n, pk(lerpC(c0, c1, k / n)), lerpC(c0, c1, k / n)]);
  }
  const l = s[s.length - 1]; out.push([l[0], pk(l[1]), l[1]]);
  return out;
}
export function gradAt(g: GradStop[], wy: number): [number, number, number] { // → [colorA, colorB, t]
  if (wy <= g[0][0]) return [g[0][1], g[0][1], 0];
  let lo = 0, hi = g.length - 1;
  if (wy >= g[hi][0]) return [g[hi][1], g[hi][1], 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m][0] <= wy) lo = m; else hi = m; }
  return [g[lo][1], g[hi][1], (wy - g[lo][0]) / (g[hi][0] - g[lo][0])];
}
export function srand(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const h2 = (x: number, y: number): number => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// tileable value noise
const NZ = 128, NOISE = (() => {
  const out = new Float32Array(NZ * NZ), r = srand(7);
  for (const [cell, amp] of [[16, 0.55], [8, 0.3], [4, 0.15]]) {
    const g = NZ / cell, lat = Array.from({ length: g * g }, r);
    for (let y = 0; y < NZ; y++) for (let x = 0; x < NZ; x++) {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const L = (i: number, j: number) => lat[((j % g) + g) % g * g + (((i % g) + g) % g)];
      out[y * NZ + x] += amp * (L(x0, y0) * (1 - sx) * (1 - sy) + L(x0 + 1, y0) * sx * (1 - sy) + L(x0, y0 + 1) * (1 - sx) * sy + L(x0 + 1, y0 + 1) * sx * sy);
    }
  }
  return out;
})();
export const nz = (x: number, y: number): number => NOISE[((y | 0) & (NZ - 1)) * NZ + ((x | 0) & (NZ - 1))];

/** Shared renderer state. One pixel world is drawn per page, so this is a module singleton. */
export interface PixelState {
  ctx: CanvasRenderingContext2D; LW: number; LH: number; PX: number; img: ImageData; buf: Uint32Array;
  cam: number; camT: number; t: number; v: number; vT: number; scroll: number; follow: boolean;
}
export const P: PixelState = {
  ctx: null as unknown as CanvasRenderingContext2D, LW: 0, LH: 0, PX: 4, img: null as unknown as ImageData, buf: new Uint32Array(0),
  cam: 0, camT: 0, t: 0, v: 0, vT: 0, scroll: 0, follow: false,
};
export const R = (x: number, y: number, w: number, h: number, c: string) => { const c2 = P.ctx; c2.fillStyle = c; c2.fillRect(Math.round(x), Math.round(y), w, h); };
export function spr(rows: string[], x: number, y: number, pal: Record<string, string>, flip = false) {
  const c = P.ctx; x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < rows.length; j++) { const r = rows[j]; for (let i = 0; i < r.length; i++) { const ch = r[flip ? r.length - 1 - i : i]; if (ch !== ".") { c.fillStyle = pal[ch]; c.fillRect(x + i, y + j, 1, 1); } } }
}
export function poly(pts: number[][], col: string) {
  const c = P.ctx; c.fillStyle = col; let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(Math.ceil(y0), 0); y1 = Math.min(Math.floor(y1), P.LH - 1);
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.round(xs[k]), b = Math.round(xs[k + 1]); if (b > a) c.fillRect(a, y, b - a, 1); }
  }
}
export function disc(cx: number, cy: number, r: number, col: string) { const c = P.ctx; c.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy); for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8)); c.fillRect(cx - w, cy + dy, w * 2 + 1, 1); } }
export function txt(s: string, x: number, y: number, col: string, size = 8) { const c = P.ctx; c.font = `${size}px Silkscreen, "Press Start 2P", monospace`; c.fillStyle = col; c.textBaseline = "top"; c.fillText(s, Math.round(x), Math.round(y)); }
export function line(x0: number, y0: number, x1: number, y1: number, col: string) { const c = P.ctx; c.fillStyle = col; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0; for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), 1, 1); }
export function fillGrad(g: GradStop[], extra?: (y: number, wy: number, row: number) => void) {
  const { LW, LH, buf, cam } = P; const c0 = Math.round(cam);
  for (let y = 0; y < LH; y++) {
    const wy = y + c0; const [a, b, t] = gradAt(g, wy); const row = y * LW, by = (y & 3) * 4;
    if (a === b) buf.fill(a, row, row + LW);
    else for (let x = 0; x < LW; x++) buf[row + x] = BAYER[by + (x & 3)] < t ? b : a;
    if (extra) extra(y, wy, row);
  }
}
export const sy = (wy: number) => wy - Math.round(P.cam); // world → screen
export const onScreen = (s: number, pad = 40) => s > -pad && s < P.LH + pad;

/* sprites */
export const SP: Record<string, string[]> = {
  ship: ["..........ff..............", "..........fff.............", "..........ffff............", "..........m.......a.......", "..........m......a.a......", "......wwwwwww...a...a.....", "......wgwgwgw..a.....a....", "...hhhhhhhhhhhhhhhhhhhhh..", "..hhhhhhhhhhhhhhhhhhhhhhh.", "...hhhhhhhhhhhhhhhhhhhhh..", "....rrrrrrrrrrrrrrrrrrr..."],
  bell: ["...kkk...", "..koook..", ".koooook.", "kooylyook", "kooyyyook", "kooylyook", ".koooook.", "..koook..", "...k.k..."],
  fish: ["..xx.x", ".xxxxx", "x.xx.x"],
  turtle: ["...ggg...", ".gghhhgg.", "gghhhhhgg", ".ghhhhhg.", "g.g...g.g"],
  whale: ["...........................wwww.", "....wwwwwwwwwwwwwwwwwwwww...www.", "..wwwwwwwwwwwwwwwwwwwwwwwwwwww..", ".wwwwwwwwwwwwwwwwwwwwwwwwwwww...", "wwewwwwwwwwwwwwwwwwwwwwwwww.....", "wwwwwwwwwwwwwwwwwwwwwwwwww......", ".bbbbbbbbbbbbbbbbbbbbbbbbw......", "..bbbbbbbbbbbbbbbbbbbb..........", "....bbbb..........bbb..........."],
  squid: ["..ss..", ".ssss.", ".ssss.", "ssesss", ".ssss.", ".s.s.s", "s.s.s.", ".s.s.s"],
  angler: ["y..........", ".y.........", "..y........", "..dddddd...", ".dddddddd.d", "ddeddddddddd", "dtttdddddd.d", ".dddddddd...", "..dddddd...."],
  snail: [".ppp..", "pppppp", "pepppp", ".pppp.p"],
  iss: ["bbb.......bbb", "bbb.......bbb", "bbbwwwwwwwbbb", "bbb..www..bbb", "bbb.......bbb"],
  sat: ["bb.w.bb", "bbwwwbb", "bb.w.bb"],
  rocket: ["..w..", ".www.", ".wrw.", ".www.", ".www.", ".wbw.", ".www.", "rwwwr", "r.w.r"],
  plane: ["......w...", "wwwwwwwwww", ".....w....", "....w....."],
  drill: ["..ww..", ".wggw.", ".wggw.", ".wggw.", "wwwwww", ".oooo.", "..oo..", "..yy.."],
  star: ["..y..", ".yyy.", "yyyyy", ".yyy.", "y...y"],
};

/* ────────── WORLDS ────────── */

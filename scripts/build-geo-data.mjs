#!/usr/bin/env node
// Builds src/games/off-the-map/data/rivers.json: Natural Earth river centerlines clipped to each country.
//   node scripts/build-geo-data.mjs [path/to/ne_10m_rivers_lake_centerlines.geojson]
// Without a path it downloads the file from the Natural Earth repo on jsDelivr.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "src/games/off-the-map/data/rivers.json");
const SRC = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_rivers_lake_centerlines.geojson";

const rivers = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : await (await fetch(SRC)).json();
const atlas = JSON.parse(fs.readFileSync(path.join(root, "node_modules/world-atlas/countries-50m.json"), "utf8"));
const countries = feature(atlas, atlas.objects.countries).features;
const names110 = new Set(JSON.parse(fs.readFileSync(path.join(root, "node_modules/world-atlas/countries-110m.json"), "utf8")).objects.countries.geometries.map((g) => g.properties.name));

// Polygon rings with bounding boxes, for fast planar point-in-polygon tests on lon/lat.
const shapes = countries.filter((c) => names110.has(c.properties.name)).map((c) => {
  const polys = c.geometry.type === "Polygon" ? [c.geometry.coordinates] : c.geometry.coordinates;
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { name: c.properties.name, polys, box: [x0, y0, x1, y1] };
});
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const contains = (s, x, y) => {
  if (x < s.box[0] || x > s.box[2] || y < s.box[1] || y > s.box[3]) return false;
  return s.polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((hole) => inRing(x, y, hole)));
};
let last = null;
const countryAt = (x, y) => {
  if (last && contains(last, x, y)) return last.name;
  for (const s of shapes) if (contains(s, x, y)) { last = s; return s.name; }
  return null;
};

// Drop points closer than `tol` degrees to the previous kept point.
const simplify = (line, tol) => {
  const out = [line[0]];
  for (const p of line.slice(1, -1)) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) out.push(p); }
  out.push(line[line.length - 1]);
  return out;
};

const byCountry = {};
for (const f of rivers.features) {
  const rank = f.properties.scalerank ?? 10;
  if (rank > 10) continue;
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) {
    const pts = simplify(line, 0.02), owners = pts.map(([x, y]) => countryAt(x, y));
    // Border rivers flip between the two countries point by point; give short flips back to the surrounding owner.
    for (let i = 1; i < owners.length; i++) {
      if (owners[i] === owners[i - 1]) continue;
      let j = i; while (j < owners.length && owners[j] !== owners[i - 1] && j - i < 4) j++;
      if (j < owners.length && owners[j] === owners[i - 1]) for (let k = i; k < j; k++) owners[k] = owners[i - 1];
    }
    let run = [], owner = null;
    const flush = () => { if (owner && run.length > 1) (byCountry[owner] ||= []).push({ w: rank <= 4 ? 3 : rank <= 7 ? 2 : 1, pts: run }); run = []; };
    pts.forEach(([x, y], i) => {
      if (owners[i] !== owner) { const prev = run[run.length - 1]; flush(); owner = owners[i]; if (prev) run.push(prev); } // share the joint so lines meet
      run.push([x, y]);
    });
    flush();
  }
}

// Keep countries with enough river to recognise; store each line as "w|x,y x,y …" to keep the file small.
// Detail scales with the country's size, since every country is drawn at the same size on screen.
const out = {};
for (const [name, runs0] of Object.entries(byCountry)) {
  const b = shapes.find((sh) => sh.name === name).box, tol = Math.max(0.03, Math.hypot(b[2] - b[0], b[3] - b[1]) / 220);
  const dp = tol < 0.1 ? 100 : 10;
  const runs = runs0.map((r) => ({ w: r.w, pts: simplify(r.pts, tol).map(([x, y]) => [Math.round(x * dp) / dp, Math.round(y * dp) / dp]) }))
    .filter((r) => r.pts.length > 1 && r.pts.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0) > tol * 2);
  const len = runs.reduce((n, r) => n + r.pts.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0), 0);
  if (runs.length < 3 || len < 4) continue;
  out[name] = runs.map((r) => r.w + "|" + r.pts.map((p) => p.join(",")).join(" "));
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${Object.keys(out).length} countries, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${path.relative(root, OUT)}`);

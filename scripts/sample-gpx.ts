// Generuje przykładowy, realistyczny ślad GPX po prawdziwych ulicach (do testów i demo).
// Użycie: node scripts/sample-gpx.ts "Jeżyce" 4000 samples/jezyce.gpx [godzina]
import { readFile, writeFile } from 'node:fs/promises';
import { decodeCity, type RawCityData } from '../src/core/data.ts';
import { toGpx } from '../src/core/gpx.ts';
import { toLonLat, type XY } from '../src/core/geo.ts';
import type { TrackPoint } from '../src/core/match.ts';

const [districtName = 'Jeżyce', lenStr = '4000', out = 'samples/jezyce.gpx', hourStr = '19', seedStr = '7'] = process.argv.slice(2);
const city = decodeCity(JSON.parse(await readFile('public/data/poznan.json', 'utf8')) as RawCityData);
const di = city.districts.findIndex((d) => d.name === districtName);
if (di < 0) throw new Error('Nie ma osiedla ' + districtName);

let seed = +seedStr;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const k = (p: XY) => `${Math.round(p[0])}:${Math.round(p[1])}`;
const segs = city.segs.filter((s) => s.district === di && s.counted && s.cls < 3);
const adj = new Map<string, { id: number; rev: boolean }[]>();
for (const s of segs) {
  for (const [p, rev] of [[s.xy[0], false], [s.xy[s.xy.length - 1], true]] as const) {
    const kk = k(p);
    if (!adj.has(kk)) adj.set(kk, []);
    adj.get(kk)!.push({ id: s.id, rev });
  }
}
// start: najlepiej połączony węzeł blisko środka osiedla
const nodes = [...adj.entries()].filter(([, v]) => v.length >= 3);
let [node] = nodes[Math.floor(rnd() * nodes.length)];
const path: XY[] = [];
let total = 0;
const used = new Map<number, number>();
let last = -1;
while (total < +lenStr) {
  const all = adj.get(node) ?? [];
  let opts = all.filter((o) => o.id !== last);
  if (!opts.length) opts = all; // ślepa uliczka → zawracamy
  if (!opts.length) break;
  opts.sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) + (rnd() - 0.5) * 0.9);
  const o = opts[0];
  const s = city.segs[o.id];
  const pts = o.rev ? s.xy.slice().reverse() : s.xy;
  path.push(...(path.length ? pts.slice(1) : pts));
  total += s.len;
  used.set(o.id, (used.get(o.id) ?? 0) + 1);
  last = o.id;
  node = k(pts[pts.length - 1]);
}
// punkty co ~4 s marszu (1,35 m/s), przesunięcie na chodnik, szum GPS jak w telefonie:
// powolny dryf (skorelowany, do ~10 m) + drobne drgania ±2 m
let ex = 0, ey = 0;
const t0 = new Date(2026, 9, 14, +hourStr, 12).getTime();
const pts: TrackPoint[] = [];
let s = 0;
for (let i = 1; i < path.length; i++) {
  const [ax, ay] = path[i - 1], [bx, by] = path[i];
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
  for (let d = 0; d < len; d += 5.4) {
    ex = ex * 0.9 + (rnd() - 0.5) * 3;
    ey = ey * 0.9 + (rnd() - 0.5) * 3;
    const x = ax + ((bx - ax) * d) / len + nx * 7 + ex + (rnd() - 0.5) * 4;
    const y = ay + ((by - ay) * d) / len + ny * 7 + ey + (rnd() - 0.5) * 4;
    const [lon, lat] = toLonLat(x, y);
    pts.push({ lat, lon, t: t0 + (s / 1.35) * 1000 });
    s += 5.4;
  }
}
await writeFile(out, toGpx(`Wieczór na ${districtName === 'Jeżyce' ? 'Jeżycach' : districtName}`, pts));
console.log(`✓ ${out}: ${(total / 1000).toFixed(1)} km, ${pts.length} punktów`);

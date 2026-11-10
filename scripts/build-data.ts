// Przetwarza surowe dane z Overpass (data/raw/*.json) do kompaktowego public/data/poznan.json.
// Uruchom: npm run osm:build
import { readFile, writeFile } from 'node:fs/promises';
import {
  encodePolyline,
  linesIntersect,
  lineLength,
  pointInRings,
  ringArea,
  simplify,
  toLonLat,
  toXY,
  type LonLat,
  type XY,
} from '../src/core/geo.ts';
import type { RawArea, RawCityData, RawSeg, SegClass } from '../src/core/data.ts';

type OsmGeom = { lat: number; lon: number }[];
interface OsmEl {
  type: 'way' | 'relation' | 'node';
  id: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: OsmGeom;
  members?: { type: string; role: string; geometry?: OsmGeom }[];
}

const load = async (n: string): Promise<OsmEl[]> => JSON.parse(await readFile(`data/raw/${n}.json`, 'utf8')).elements;
const g2xy = (g: OsmGeom): XY[] => g.map((p) => toXY(p.lon, p.lat));
const xy2ll = (pts: XY[]): LonLat[] => pts.map((p) => toLonLat(p[0], p[1]));
const enc = (pts: XY[]) => encodePolyline(xy2ll(pts));

/** Skleja fragmenty dróg (np. członków relacji) w ciągi/pierścienie. */
export function joinWays(parts: XY[][]): XY[][] {
  const eq = (a: XY, b: XY) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  const left = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const out: XY[][] = [];
  while (left.length) {
    let cur = left.shift()!;
    let changed = true;
    while (changed && !eq(cur[0], cur[cur.length - 1])) {
      changed = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const end = cur[cur.length - 1];
        if (eq(end, w[0])) cur = cur.concat(w.slice(1));
        else if (eq(end, w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else if (eq(cur[0], w[w.length - 1])) cur = w.concat(cur.slice(1));
        else if (eq(cur[0], w[0])) cur = w.slice().reverse().concat(cur.slice(1));
        else continue;
        left.splice(i, 1);
        changed = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

function areaRings(el: OsmEl): XY[][] {
  if (el.type === 'way' && el.geometry) return [g2xy(el.geometry)];
  if (el.type === 'relation' && el.members) {
    const outer = el.members.filter((m) => m.geometry && m.role !== 'inner').map((m) => g2xy(m.geometry!));
    const inner = el.members.filter((m) => m.geometry && m.role === 'inner').map((m) => g2xy(m.geometry!));
    const closed = (r: XY[]) => r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 1;
    return [...joinWays(outer), ...joinWays(inner)].filter(closed);
  }
  return [];
}

// --- Które drogi liczymy jako „ulice” ---
const COUNTED: Record<string, SegClass> = {
  trunk: 0,
  primary: 0,
  secondary: 0,
  tertiary: 1,
  unclassified: 1,
  residential: 2,
  living_street: 2,
  pedestrian: 2,
  road: 2,
};
const PATHS = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'track', 'service']);

export function classify(t: Record<string, string>): { cls: SegClass; counted: boolean } | null {
  const h = t.highway;
  if (!h || t.area === 'yes') return null;
  if (['private', 'no'].includes(t.access ?? '') && !['yes', 'designated', 'permissive'].includes(t.foot ?? '')) return null;
  if (t.foot === 'no' || t.motorroad === 'yes') return null;
  if (h in COUNTED) return { cls: COUNTED[h], counted: true };
  if (!PATHS.has(h)) return null;
  if (h === 'footway' && ['sidewalk', 'crossing', 'traffic_island'].includes(t.footway ?? '')) return null;
  if (h === 'path' && t.path === 'sidewalk') return null;
  if (h === 'cycleway' && t.cycleway === 'crossing') return null;
  if (h === 'service' && ['parking_aisle', 'driveway', 'drive-through'].includes(t.service ?? '')) return null;
  // Nazwane alejki i drogi serwisowe liczymy (np. aleje w parkach), bezimienne tylko rysujemy.
  if (t.name && h !== 'track') return { cls: h === 'service' ? 2 : 3, counted: true };
  return { cls: 3, counted: false };
}

const MAX_SEG = 300;

/** Tnie drogi na odcinki między skrzyżowaniami (i co najwyżej MAX_SEG m). */
export function splitWays(ways: { nodes: number[]; xy: XY[] }[]): { wi: number; xy: XY[] }[] {
  const use = new Map<number, number>();
  for (const w of ways) for (const n of new Set(w.nodes)) use.set(n, (use.get(n) ?? 0) + 1);
  const out: { wi: number; xy: XY[] }[] = [];
  ways.forEach((w, wi) => {
    let start = 0;
    let acc = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      acc += Math.hypot(w.xy[i][0] - w.xy[i - 1][0], w.xy[i][1] - w.xy[i - 1][1]);
      const last = i === w.nodes.length - 1;
      if (last || (use.get(w.nodes[i]) ?? 0) > 1 || acc >= MAX_SEG) {
        out.push({ wi, xy: w.xy.slice(start, i + 1) });
        start = i;
        acc = 0;
      }
    }
  });
  return out;
}

/** Brzeg Warty: promień na zachód, parzystość przecięć z (przedłużoną) osią rzeki. */
export function bankOf(p: XY, river: XY[]): 0 | 1 {
  let c = 0;
  for (let i = 1; i < river.length; i++) {
    const a = river[i - 1],
      b = river[i];
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (x < p[0]) c++;
    }
  }
  return (c % 2) as 0 | 1;
}

function mid(xy: XY[]): XY {
  const half = lineLength(xy) / 2;
  let s = 0;
  for (let i = 1; i < xy.length; i++) {
    const d = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    if (s + d >= half) {
      const t = d ? (half - s) / d : 0;
      return [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t];
    }
    s += d;
  }
  return xy[0];
}

async function main() {
  const [cityEls, districtEls, highwayEls, waterEls, parkEls] = await Promise.all(
    ['city', 'districts', 'highways', 'water', 'parks'].map(load),
  );

  // Miasto
  const cityRel = cityEls.find((e) => e.type === 'relation')!;
  const cityRings = areaRings(cityRel);
  const inCity = (p: XY) => pointInRings(p[0], p[1], cityRings);

  // Osiedla: wybieramy poziom administracyjny z liczbą jednostek najbliższą 42
  const byLevel = new Map<string, OsmEl[]>();
  for (const e of districtEls) {
    const l = e.tags?.admin_level ?? '';
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(e);
  }
  const [level, dEls] = [...byLevel.entries()].sort((a, b) => Math.abs(a[1].length - 42) - Math.abs(b[1].length - 42))[0];
  console.log(`Osiedla: admin_level=${level}, ${dEls.length} szt. (poziomy: ${[...byLevel].map(([l, v]) => `${l}:${v.length}`).join(', ')})`);
  const districts = dEls
    .map((e) => ({ name: (e.tags!.name ?? '').replace(/^Osiedle\s+/i, ''), rings: areaRings(e) }))
    .filter((d) => d.rings.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

  // Warta
  const riverWays = waterEls.filter((e) => e.type === 'way' && e.tags?.waterway === 'river' && e.tags?.name === 'Warta');
  const chains = joinWays(riverWays.map((w) => g2xy(w.geometry!))).sort((a, b) => lineLength(b) - lineLength(a));
  const main = chains[0].slice();
  // orientacja S→N, przedłużenie końców daleko poza miasto
  if (main[0][1] > main[main.length - 1][1]) main.reverse();
  const extRiver: XY[] = [[main[0][0], main[0][1] - 50000], ...main, [main[main.length - 1][0], main[main.length - 1][1] + 50000]];

  // Drogi
  const ways: { nodes: number[]; xy: XY[]; tags: Record<string, string>; cls: SegClass; counted: boolean }[] = [];
  for (const e of highwayEls) {
    if (e.type !== 'way' || !e.tags || !e.geometry || !e.nodes) continue;
    const c = classify(e.tags);
    if (!c) continue;
    ways.push({ nodes: e.nodes, xy: g2xy(e.geometry), tags: e.tags, ...c });
  }
  const pieces = splitWays(ways);

  const names: string[] = [];
  const nameIdx = new Map<string, number>();
  const bridges: string[] = [];
  const bridgeIdx = new Map<string, number>();
  const segs: RawSeg[] = [];
  const dXY = districts.map((d) => d.rings);
  for (const pc of pieces) {
    const w = ways[pc.wi];
    const xy = simplify(pc.xy, 1);
    const m = mid(xy);
    if (!inCity(m)) continue;
    const name = w.tags.name ?? null;
    let ni = -1;
    if (name) {
      if (!nameIdx.has(name)) (nameIdx.set(name, names.length), names.push(name));
      ni = nameIdx.get(name)!;
    }
    let bi = -1;
    if ((w.tags.bridge && w.tags.bridge !== 'no') || w.tags.man_made === 'bridge') {
      if (chains.some((ch) => linesIntersect(xy, ch))) {
        const bn = w.tags['bridge:name'] ?? (name && /^most/i.test(name) ? name : name ? `Most w ciągu ${name}` : null);
        if (bn) {
          if (!bridgeIdx.has(bn)) (bridgeIdx.set(bn, bridges.length), bridges.push(bn));
          bi = bridgeIdx.get(bn)!;
        }
      }
    }
    const di = dXY.findIndex((r) => pointInRings(m[0], m[1], r));
    segs.push([ni, w.cls, di, bankOf(m, extRiver), bi, w.counted ? 1 : 0, enc(xy)]);
  }

  // Parki (nazwane, > 0,5 ha liczą się do osiągnięć; wszystkie rysujemy)
  const parks: RawArea[] = [];
  for (const e of parkEls) {
    const rings = areaRings(e).map((r) => simplify(r, 3));
    if (!rings.length) continue;
    const area = rings.reduce((s, r) => s + ringArea(r), 0);
    if (area < 2000) continue;
    const c = rings[0][0];
    if (!inCity(c)) continue;
    parks.push({ name: e.tags?.name ?? '', rings: rings.map(enc) });
  }

  // Woda: poligony (rzeka jako obszar, jeziora) + linia Warty
  const water: string[] = [];
  for (const e of waterEls) {
    if (e.tags?.waterway === 'river') continue;
    for (const r of areaRings(e)) if (ringArea(r) > 5000) water.push(enc(simplify(r, 3)));
  }
  const river = chains.map((c) => enc(simplify(c, 3)));

  const out: RawCityData = {
    v: 1,
    generated: new Date().toISOString(),
    source: '© OpenStreetMap contributors (ODbL)',
    city: cityRings.map((r) => enc(simplify(r, 5))),
    districts: districts.map((d) => ({ name: d.name, rings: d.rings.map((r) => enc(simplify(r, 4))) })),
    names,
    bridges,
    segs,
    parks,
    water,
    river,
  };
  const json = JSON.stringify(out);
  await writeFile('public/data/poznan.json', json);
  const counted = segs.filter((s) => s[5]).length;
  console.log(
    `✓ public/data/poznan.json: ${(json.length / 1e6).toFixed(2)} MB · ${segs.length} odcinków (${counted} liczonych) · ${names.length} nazw · ${districts.length} osiedli · ${parks.length} parków · mosty: ${bridges.join(', ')}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

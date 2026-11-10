// „Najbliżej do odsłonięcia” i „Losuj cel”: siatka komórek ~300 m z liczbą nowych ulic.
import type { CityData } from './data.ts';
import { compassBearing, dist, pointInRings, toLonLat, toXY, type LonLat, type XY } from './geo.ts';

const CELL = 300;

export interface Spot {
  center: LonLat;
  xy: XY;
  /** Nazwy nieodkrytych ulic w okolicy (najdłuższe pierwsze). */
  streets: string[];
  newLen: number;
  district: number;
  distance: number;
  bearing: number;
}

interface Cell {
  xy: XY;
  len: number;
  byName: Map<string, number>;
  district: Map<number, number>;
}

export function buildCells(city: CityData, discovered: Set<number>): Cell[] {
  const cells = new Map<string, Cell>();
  for (const s of city.segs) {
    if (!s.counted || discovered.has(s.id)) continue;
    const m = s.xy[Math.floor(s.xy.length / 2)];
    const k = `${Math.floor(m[0] / CELL)}:${Math.floor(m[1] / CELL)}`;
    let c = cells.get(k);
    if (!c) {
      const cx = (Math.floor(m[0] / CELL) + 0.5) * CELL,
        cy = (Math.floor(m[1] / CELL) + 0.5) * CELL;
      cells.set(k, (c = { xy: [cx, cy], len: 0, byName: new Map(), district: new Map() }));
    }
    c.len += s.len;
    if (s.name) c.byName.set(s.name, (c.byName.get(s.name) ?? 0) + s.len);
    if (s.district >= 0) c.district.set(s.district, (c.district.get(s.district) ?? 0) + s.len);
  }
  return [...cells.values()];
}

function toSpot(c: Cell, from: XY): Spot {
  const streets = [...c.byName.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const district = [...c.district.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  return {
    center: toLonLat(c.xy[0], c.xy[1]),
    xy: c.xy,
    streets,
    newLen: c.len,
    district,
    distance: dist(from, c.xy),
    bearing: compassBearing(from, c.xy),
  };
}

/** Miejsce z największą liczbą nowych ulic, z karą za odległość (bliżej = lepiej). */
export function nearestSpot(city: CityData, discovered: Set<number>, from: LonLat, maxDist = 4000): Spot | null {
  const f = toXY(from[0], from[1]);
  let best: { s: number; c: Cell } | null = null;
  for (const c of buildCells(city, discovered)) {
    const d = dist(f, c.xy);
    if (d > maxDist) continue;
    const score = c.byName.size / (1 + d / 700);
    if (!best || score > best.s) best = { s: score, c };
  }
  return best ? toSpot(best.c, f) : null;
}

/** Losowy nieodkryty cel 0,8–2,5 km od Ciebie, ważony ilością nowych ulic. */
export function randomTarget(
  city: CityData,
  discovered: Set<number>,
  from: LonLat,
  rnd: () => number = Math.random,
  range: [number, number] = [800, 2500],
): Spot | null {
  const f = toXY(from[0], from[1]);
  const inCity = (p: XY) => pointInRings(p[0], p[1], city.city.xy);
  let cand = buildCells(city, discovered).filter((c) => {
    const d = dist(f, c.xy);
    return d >= range[0] && d <= range[1] && c.len > 150 && inCity(c.xy);
  });
  if (!cand.length) cand = buildCells(city, discovered).filter((c) => c.len > 100);
  if (!cand.length) return null;
  const total = cand.reduce((s, c) => s + c.len, 0);
  let r = rnd() * total;
  for (const c of cand) {
    r -= c.len;
    if (r <= 0) return toSpot(c, f);
  }
  return toSpot(cand[cand.length - 1], f);
}

const DIRS = ['północ', 'północny wschód', 'wschód', 'południowy wschód', 'południe', 'południowy zachód', 'zachód', 'północny zachód'];
export const directionName = (bearing: number) => DIRS[Math.round(bearing / 45) % 8];

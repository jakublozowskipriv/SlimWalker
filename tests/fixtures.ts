import { encodePolyline, toLonLat, toXY, type XY } from '../src/core/geo.ts';
import { decodeCity, type RawCityData, type RawSeg } from '../src/core/data.ts';
import type { TrackPoint } from '../src/core/match.ts';

export const O = toXY(16.92, 52.4);
export const ll = (dx: number, dy: number) => toLonLat(O[0] + dx, O[1] + dy);
const enc = (pts: XY[]) => encodePolyline(pts.map(([x, y]) => ll(x, y)));

/**
 * Siatka 4×4 ulic co 100 m (odcinki 100 m między skrzyżowaniami).
 * Ulice poziome: „Pozioma 0..3” (y = 0..300), pionowe: „Pionowa 0..3” (x = 0..300).
 * Osiedle 0: x < 150, osiedle 1: x ≥ 150.
 */
export function gridCity() {
  const names: string[] = [];
  const segs: RawSeg[] = [];
  for (let k = 0; k < 4; k++) {
    names.push(`Pozioma ${k}`, `Pionowa ${k}`);
    for (let i = 0; i < 3; i++) {
      const h: XY[] = [[i * 100, k * 100], [(i + 1) * 100, k * 100]];
      const v: XY[] = [[k * 100, i * 100], [k * 100, (i + 1) * 100]];
      segs.push([2 * k, 2, i * 100 + 50 < 150 ? 0 : 1, 0, -1, 1, enc(h)]);
      segs.push([2 * k + 1, 2, k * 100 < 150 ? 0 : 1, 0, -1, 1, enc(v)]);
    }
  }
  const sq = (x0: number, x1: number) => [enc([[x0, -50], [x1, -50], [x1, 350], [x0, 350], [x0, -50]])];
  const raw: RawCityData = {
    v: 1,
    generated: 'test',
    source: 'test',
    city: sq(-50, 350),
    districts: [
      { name: 'Zachód', rings: sq(-50, 150) },
      { name: 'Wschód', rings: sq(150, 350) },
    ],
    names,
    bridges: [],
    segs,
    parks: [],
    water: [],
    river: [],
  };
  return decodeCity(raw);
}

/** Ślad wzdłuż łamanej w metrach względem O, punkt co `step` m, 1,4 m/s, z opcjonalnym szumem. */
export function walk(path: XY[], { step = 5, noise = 0, offset = 0, t0 = Date.UTC(2026, 5, 1, 10), speed = 1.4 } = {}): TrackPoint[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const out: TrackPoint[] = [];
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const len = Math.hypot(bx - ax, by - ay);
    // normalna do kierunku → przesunięcie (chodnik)
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let d = 0; d < len; d += step) {
      const x = ax + ((bx - ax) * d) / len + nx * offset + rnd() * noise;
      const y = ay + ((by - ay) * d) / len + ny * offset + rnd() * noise;
      const [lon, lat] = ll(x, y);
      out.push({ lat, lon, t: t0 + (s / speed) * 1000 });
      s += step;
    }
  }
  const [lon, lat] = ll(...path[path.length - 1]);
  out.push({ lat, lon, t: t0 + (s / speed) * 1000 });
  return out;
}

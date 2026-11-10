// Prosta geometria w lokalnym układzie metrycznym (equirectangular wokół Poznania).
// Dla obszaru miasta (~20 km) błąd względem Mercatora/geodezji jest < 0,1%,
// więc nie potrzebujemy Turf.js — liczymy w metrach na płaskim układzie.

export type LonLat = [number, number];
export type XY = [number, number];

export const LAT0 = 52.4;
export const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
export const KY = 110574;

export const toXY = (lon: number, lat: number): XY => [lon * KX, lat * KY];
export const toLonLat = (x: number, y: number): LonLat => [x / KX, y / KY];

export const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function haversine(a: LonLat, b: LonLat): number {
  const R = 6371008.8;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Kierunek osi (0–180°), bez zwrotu — ulicą można iść w obie strony. */
export function axisBearing(a: XY, b: XY): number {
  let d = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  d = ((d % 180) + 180) % 180;
  return d;
}

/** Kierunek z kompasu (0–360°, 0 = północ). */
export function compassBearing(a: XY, b: XY): number {
  const d = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return (d + 360) % 360;
}

/** Różnica dwóch kierunków osi w zakresie 0–90°. */
export function axisDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

export function lineLength(pts: XY[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

export function lineLengthLL(pts: LonLat[]): number {
  return lineLength(pts.map((p) => toXY(p[0], p[1])));
}

/** Punkt i kierunek osi w odległości s od początku linii. */
export function pointAlong(pts: XY[], cum: number[], s: number): { p: XY; i: number } {
  const total = cum[cum.length - 1];
  if (s <= 0) return { p: pts[0], i: 0 };
  if (s >= total) return { p: pts[pts.length - 1], i: pts.length - 2 };
  let lo = 0,
    hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  const a = pts[lo],
    b = pts[hi];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: lo };
}

export function cumulative(pts: XY[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}

export function pointInRing(x: number, y: number, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Wielokąt jako zbiór pierścieni (zewnętrzne i dziury) — reguła parzystości. */
export function pointInRings(x: number, y: number, rings: XY[][]): boolean {
  let inside = false;
  for (const r of rings) if (pointInRing(x, y, r)) inside = !inside;
  return inside;
}

export function ringArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

export function bboxOf(pts: XY[]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return [minX, minY, maxX, maxY];
}

function segDist2(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0],
    y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

export function pointLineDist(p: XY, line: XY[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, segDist2(p, line[i - 1], line[i]));
  return Math.sqrt(best);
}

/** Douglas–Peucker, tolerancja w metrach. */
export function simplify(pts: XY[], tol: number): XY[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0,
      idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist2(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > t2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const o = (p: XY, q: XY, r: XY) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a),
    d2 = o(c, d, b),
    d3 = o(a, b, c),
    d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function linesIntersect(l1: XY[], l2: XY[]): boolean {
  for (let i = 1; i < l1.length; i++)
    for (let j = 1; j < l2.length; j++) if (segmentsIntersect(l1[i - 1], l1[i], l2[j - 1], l2[j])) return true;
  return false;
}

// --- Google polyline (precyzja 5 → ~1 m), kompaktowy zapis współrzędnych ---

export function encodePolyline(pts: LonLat[], precision = 5): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0,
    pLon = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of pts) {
    const la = Math.round(lat * f),
      lo = Math.round(lon * f);
    enc(la - pLat);
    enc(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): LonLat[] {
  const f = 10 ** precision;
  const out: LonLat[] = [];
  let i = 0,
    lat = 0,
    lon = 0;
  const dec = () => {
    let result = 0,
      shift = 0,
      b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += dec();
    lon += dec();
    out.push([lon / f, lat / f]);
  }
  return out;
}

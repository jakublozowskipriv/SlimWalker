// Dopasowanie śladów GPS do odcinków ulic.
//
// Model: każdy odcinek ulicy (OSM way pocięty na skrzyżowaniach) jest próbkowany
// co SAMPLE_STEP metrów. Próbka jest „zaliczona”, gdy w promieniu BUFFER_M od niej
// przeszedł ślad GPS w kierunku zgodnym z osią ulicy (±MAX_ANGLE). Odcinek jest
// odkryty, gdy zaliczono ≥ DISCOVER_RATIO jego próbek. Zaliczone próbki sumują się
// między spacerami (bitset), więc pół ulicy dziś + pół jutro = odkryta ulica.
//
// Dlaczego takie liczby:
//  - BUFFER_M = 25 m: GPS telefonu w mieście ma zwykle 5–15 m błędu, w „kanionach”
//    kamienic do ~25 m; do tego idziesz chodnikiem, a oś ulicy w OSM jest na środku
//    jezdni (szerokie ulice: 8–15 m od chodnika). Równoległe ulice w Poznaniu są
//    zwykle ≥ 60–100 m od siebie, więc 25 m nie „przecieka” na sąsiednią ulicę.
//  - MAX_ANGLE = 40°: przejście w poprzek ulicy (na skrzyżowaniu, przez pasy) nie
//    zalicza jej — liczy się tylko marsz wzdłuż. Bez tego krótkie odcinki przy
//    skrzyżowaniach odkrywałyby się „przy okazji”.
//  - DISCOVER_RATIO = 0,6: trzeba przejść większość odcinka, ale wybaczamy dziury
//    GPS i to, że na końcach (skrzyżowania) ślad bywa przesunięty.
import { axisBearing, axisDiff, cumulative, dist, haversine, pointAlong, simplify, toXY, type XY } from './geo.ts';
import type { Seg } from './data.ts';

export const SAMPLE_STEP = 10;
export const BUFFER_M = 25;
export const MAX_ANGLE = 40;
export const DISCOVER_RATIO = 0.6;
export const DENSIFY_STEP = 5;
const ALONG_REACH = DENSIFY_STEP * 1.5;
/** Powyżej tej prędkości (tramwaj, rower szybki, auto) fragment nie jest liczony jako spacer. */
export const MAX_WALK_SPEED = 7; // m/s ≈ 25 km/h (obejmuje bieganie)
/** Przerwa w śladzie bez czasu dłuższa niż to — nie łączymy punktów. */
export const MAX_GAP_M = 150;
const CELL = 50;

export interface TrackPoint {
  lat: number;
  lon: number;
  t?: number; // ms epoch
  acc?: number; // dokładność w metrach (nagrywanie na żywo)
}

export interface SampleIndex {
  /** Liczba wszystkich próbek (rozmiar bitsetu). */
  total: number;
  /** Pierwsza próbka odcinka i (offset w bitsecie). */
  offset: Int32Array;
  count: Int32Array;
  x: Float64Array;
  y: Float64Array;
  axis: Float32Array;
  seg: Int32Array;
  grid: Map<number, number[]>;
}

const key = (cx: number, cy: number) => cx * 100003 + cy;

export function buildIndex(segs: Seg[]): SampleIndex {
  const offset = new Int32Array(segs.length);
  const count = new Int32Array(segs.length);
  let total = 0;
  for (const s of segs) {
    const n = Math.max(1, Math.round(s.len / SAMPLE_STEP));
    offset[s.id] = total;
    count[s.id] = n;
    total += n;
  }
  const x = new Float64Array(total),
    y = new Float64Array(total),
    axis = new Float32Array(total),
    seg = new Int32Array(total);
  const grid = new Map<number, number[]>();
  for (const s of segs) {
    const cum = cumulative(s.xy);
    const n = count[s.id];
    for (let i = 0; i < n; i++) {
      const at = ((i + 0.5) * s.len) / n;
      const { p, i: k } = pointAlong(s.xy, cum, at);
      const j = offset[s.id] + i;
      x[j] = p[0];
      y[j] = p[1];
      axis[j] = axisBearing(s.xy[k], s.xy[k + 1] ?? s.xy[k]);
      seg[j] = s.id;
      const kk = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
      let arr = grid.get(kk);
      if (!arr) grid.set(kk, (arr = []));
      arr.push(j);
    }
  }
  return { total, offset, count, x, y, axis, seg, grid };
}

/** Okno do oceny prędkości: pojedyncze pary punktów GPS są zbyt zaszumione. */
const SPEED_WINDOW_S = 30;
/** Pojedynczy skok dalej niż tyle i szybciej niż MAX_WALK_SPEED to „teleport” GPS. */
const JUMP_M = 80;

/**
 * Dzieli ślad na ciągłe kawałki „pieszo”:
 *  1. odrzuca słabe fixy (acc > maxAcc) i duplikaty,
 *  2. tnie na skokach GPS i długich przerwach,
 *  3. usuwa fragmenty, w których średnia prędkość w oknie ~30 s przekracza
 *     MAX_WALK_SPEED (tramwaj, auto). Średnia z okna, a nie z pary punktów,
 *     bo drgania GPS przy 1 punkcie/s dają chwilowo 7–10 m/s nawet na stojąco.
 */
export function cleanTrack(pts: TrackPoint[], maxAcc = 50): XY[][] {
  type P = { xy: XY; t?: number };
  const runs: P[][] = [];
  let cur: P[] = [];
  let prev: TrackPoint | null = null;
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.acc != null && p.acc > maxAcc) continue;
    if (prev) {
      const d = haversine([prev.lon, prev.lat], [p.lon, p.lat]);
      if (d < 0.5) continue;
      const dt = prev.t != null && p.t != null ? (p.t - prev.t) / 1000 : null;
      const jump = d > JUMP_M && (dt == null ? d > MAX_GAP_M : dt <= 0 || d / dt > MAX_WALK_SPEED);
      const gap = dt != null && dt > 300 && d > MAX_GAP_M;
      if (jump || gap) {
        if (cur.length > 1) runs.push(cur);
        cur = [];
      }
    }
    cur.push({ xy: toXY(p.lon, p.lat), t: p.t });
    prev = p;
  }
  if (cur.length > 1) runs.push(cur);

  const pieces: XY[][] = [];
  for (const run of runs) {
    const timed = run.every((q) => q.t != null);
    const fast = new Uint8Array(run.length);
    if (timed) {
      let j = 0;
      for (let i = 0; i < run.length; i++) {
        if (j < i) j = i;
        while (j < run.length - 1 && run[j].t! - run[i].t! < SPEED_WINDOW_S * 1000) j++;
        const dt = (run[j].t! - run[i].t!) / 1000;
        if (dt < 10) continue; // za krótko, by ocenić — zostawiamy
        const v = dist(run[i].xy, run[j].xy) / dt;
        if (v > MAX_WALK_SPEED) for (let k = i; k <= j; k++) fast[k] = 1;
      }
    }
    let piece: XY[] = [];
    run.forEach((q, i) => {
      if (fast[i]) {
        if (piece.length > 1) pieces.push(piece);
        piece = [];
      } else piece.push(q.xy);
    });
    if (piece.length > 1) pieces.push(piece);
  }
  return pieces;
}

export interface DensePoint {
  x: number;
  y: number;
  axis: number;
}

/** Zagęszcza kawałek śladu co DENSIFY_STEP m; kierunek liczony z okna ±10 m (wygładza drgania GPS). */
export function densify(piece: XY[]): DensePoint[] {
  const cum = cumulative(piece);
  const total = cum[cum.length - 1];
  const out: DensePoint[] = [];
  const W = 10;
  for (let s = 0; s <= total; s += DENSIFY_STEP) {
    const { p } = pointAlong(piece, cum, s);
    const a = pointAlong(piece, cum, Math.max(0, s - W)).p;
    const b = pointAlong(piece, cum, Math.min(total, s + W)).p;
    out.push({ x: p[0], y: p[1], axis: dist(a, b) > 1 ? axisBearing(a, b) : NaN });
  }
  return out;
}

/** Zwraca indeksy próbek zaliczonych przez ślad. */
export function matchPieces(index: SampleIndex, pieces: XY[][]): Set<number> {
  const hit = new Set<number>();
  const b2 = BUFFER_M * BUFFER_M;
  const r = Math.ceil(BUFFER_M / CELL);
  for (const piece of pieces) {
    for (const p of densify(piece)) {
      if (Number.isNaN(p.axis)) continue;
      const rad = (p.axis * Math.PI) / 180;
      const ux = Math.sin(rad),
        uy = Math.cos(rad);
      const cx = Math.floor(p.x / CELL),
        cy = Math.floor(p.y / CELL);
      for (let gx = cx - r; gx <= cx + r; gx++)
        for (let gy = cy - r; gy <= cy + r; gy++) {
          const arr = index.grid.get(key(gx, gy));
          if (!arr) continue;
          for (const j of arr) {
            const dx = index.x[j] - p.x,
              dy = index.y[j] - p.y;
            if (dx * dx + dy * dy > b2) continue;
            // bufor jest „korytarzem” wzdłuż śladu: szeroki w poprzek, krótki wzdłuż,
            // żeby koniec spaceru nie zaliczał 25 m ulicy dalej
            const along = Math.abs(dx * ux + dy * uy);
            if (along > ALONG_REACH) continue;
            if (axisDiff(index.axis[j], p.axis) > MAX_ANGLE) continue;
            hit.add(j);
          }
        }
    }
  }
  return hit;
}

// --- Bitset pokrycia (cała mapa: ~kilkaset tys. próbek → kilkadziesiąt KB) ---

export class Coverage {
  bits: Uint8Array;
  index: SampleIndex;
  constructor(index: SampleIndex, bits?: Uint8Array) {
    this.index = index;
    this.bits = bits && bits.length === Math.ceil(index.total / 8) ? bits : new Uint8Array(Math.ceil(index.total / 8));
  }
  has(j: number) {
    return (this.bits[j >> 3] & (1 << (j & 7))) !== 0;
  }
  set(j: number) {
    this.bits[j >> 3] |= 1 << (j & 7);
  }
  segRatio(id: number): number {
    const o = this.index.offset[id],
      n = this.index.count[id];
    let c = 0;
    for (let j = o; j < o + n; j++) if (this.has(j)) c++;
    return c / n;
  }
  isDiscovered(id: number) {
    return this.segRatio(id) >= DISCOVER_RATIO;
  }
  /** Dodaje zaliczone próbki; zwraca odcinki, które właśnie przekroczyły próg. */
  apply(hits: Iterable<number>): number[] {
    const touched = new Set<number>();
    for (const j of hits) touched.add(this.index.seg[j]);
    const before = new Map<number, boolean>();
    for (const id of touched) before.set(id, this.isDiscovered(id));
    for (const j of hits) this.set(j);
    const fresh: number[] = [];
    for (const id of touched) if (!before.get(id) && this.isDiscovered(id)) fresh.push(id);
    return fresh;
  }
  discoveredSet(): Set<number> {
    const out = new Set<number>();
    for (let id = 0; id < this.index.count.length; id++) if (this.isDiscovered(id)) out.add(id);
    return out;
  }
}

export function matchTrack(index: SampleIndex, pts: TrackPoint[]): Set<number> {
  return matchPieces(index, cleanTrack(pts));
}

/** Średnia krocząca (okno ±r punktów) — tłumi drgania GPS, zachowuje końce. */
export function smooth(pts: XY[], r: number): XY[] {
  if (pts.length <= 2 * r + 1) return pts;
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = Math.max(0, i - r),
      b = Math.min(pts.length - 1, i + r);
    let x = 0,
      y = 0;
    for (let j = a; j <= b; j++) ((x += pts[j][0]), (y += pts[j][1]));
    return [x / (b - a + 1), y / (b - a + 1)] as XY;
  });
}

/**
 * Długość śladu liczona jako spacer (po odfiltrowaniu przejazdów).
 * Ślad jest najpierw upraszczany (Douglas–Peucker, 6 m), bo drgania GPS
 * potrafią zawyżyć dystans o kilkadziesiąt procent.
 */
export function walkedDistance(pts: TrackPoint[]): number {
  let s = 0;
  for (const raw of cleanTrack(pts)) {
    const piece = simplify(smooth(raw, 2), 4);
    for (let i = 1; i < piece.length; i++) s += dist(piece[i - 1], piece[i]);
  }
  return s;
}

// Mgła: kłębiasty atramentowy dym na osobnym canvasie nad mapą.
// Przebyte trasy są z niej „wymazywane” (destination-out) kilkoma warstwami
// o rosnącej szerokości i malejącej sile — daje to miękkie, rozmyte brzegi
// (bez ctx.filter, którego Safari na iOS nie obsługuje).
import type { Map as MlMap } from 'maplibre-gl';
import type { LonLat } from '../core/geo.ts';

export const REVEAL_RADIUS_M = 40;

const merc = ([lon, lat]: LonLat): [number, number] => {
  const x = (lon + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
};

type MTrail = { pts: Float64Array; bbox: [number, number, number, number] };

function toMerc(pieces: LonLat[][]): MTrail[] {
  return pieces.map((pc) => {
    const pts = new Float64Array(pc.length * 2);
    let minX = 1,
      minY = 1,
      maxX = 0,
      maxY = 0;
    pc.forEach((p, i) => {
      const [x, y] = merc(p);
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    return { pts, bbox: [minX, minY, maxX, maxY] };
  });
}

/** Kafelkowalny szum (value noise + fBm) → tekstura dymu w odcieniach sepii. */
export function smokeTexture(size: number, seed: number, tint: [number, number, number], alpha: [number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const octaves = [4, 8, 16, 32];
  const grids = octaves.map((n) => Float32Array.from({ length: n * n }, rnd));
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0,
        amp = 0.55,
        tot = 0;
      octaves.forEach((n, o) => {
        const fx = (x / size) * n,
          fy = (y / size) * n;
        const x0 = Math.floor(fx),
          y0 = Math.floor(fy);
        const tx = sm(fx - x0),
          ty = sm(fy - y0);
        const g = grids[o];
        const at = (i: number, j: number) => g[((j % n) * n + (i % n)) | 0];
        const a = at(x0, y0),
          b = at(x0 + 1, y0),
          cc = at(x0, y0 + 1),
          d = at(x0 + 1, y0 + 1);
        v += amp * (a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty);
        tot += amp;
        amp *= 0.5;
      });
      v /= tot;
      const k = (y * size + x) * 4;
      const l = 0.55 + v * 0.9;
      img.data[k] = tint[0] * l;
      img.data[k + 1] = tint[1] * l;
      img.data[k + 2] = tint[2] * l;
      img.data[k + 3] = 255 * (alpha[0] + (alpha[1] - alpha[0]) * v);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class Fog {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private wisps: HTMLCanvasElement;
  private trails: MTrail[] = [];
  /** Trasa w trakcie animowanego odsłaniania (0..1 postępu). */
  private animating: { trail: MTrail[]; t: number } | null = null;
  private raf = 0;
  private lastDrift = 0;
  private drift = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private map: MlMap;

  constructor(map: MlMap) {
    this.map = map;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fog-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.base = smokeTexture(256, 7, [20, 15, 10], [0.86, 0.97]);
    this.wisps = smokeTexture(256, 99, [70, 55, 40], [0, 0.42]);
    const container = map.getCanvasContainer();
    container.insertBefore(this.canvas, map.getCanvas().nextSibling);
    const resize = () => this.resize();
    map.on('resize', resize);
    map.on('move', () => this.draw());
    resize();
    if (!this.reduced) this.loop(0);
  }

  private live: MTrail[] = [];
  /** Ślad nagrywany na żywo (nadpisywany przy każdym nowym punkcie). */
  setLive(pieces: LonLat[][]) {
    this.live = toMerc(pieces);
    this.draw();
  }

  setTrails(pieces: LonLat[][]) {
    this.trails = toMerc(pieces);
    this.draw();
  }

  /** Odsłania trasę z animacją „rozlewającego się światła”. */
  reveal(pieces: LonLat[][], ms = 2200): Promise<void> {
    const trail = toMerc(pieces);
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        this.animating = { trail, t: 1 - (1 - t) ** 2 };
        this.draw();
        if (t < 1) requestAnimationFrame(step);
        else {
          this.animating = null;
          this.trails.push(...trail);
          this.draw();
          res();
        }
      };
      requestAnimationFrame(step);
    });
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const c = this.map.getCanvas();
    const w = c.clientWidth,
      h = c.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.draw();
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden || now - this.lastDrift < 66) return; // ~15 kl./s wystarczy dla dymu
    this.drift += (now - this.lastDrift || 16) * 0.004;
    this.lastDrift = now;
    this.draw();
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  draw() {
    const { ctx, canvas, map } = this;
    const W = canvas.width,
      H = canvas.height;
    if (!W || !H) return;
    const dpr = W / (canvas.clientWidth || W);
    const zoom = map.getZoom();
    const world = 512 * 2 ** zoom * dpr;
    const c = map.getCenter();
    const [cx, cy] = merc([c.lng, c.lat]);
    const ox = W / 2 - cx * world,
      oy = H / 2 - cy * world;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Dym zakotwiczony w mapie (przesuwa się z nią), skala zależna od zoomu w ograniczonym zakresie
    const scale = dpr * (1.6 + (zoom % 1) * 0.6);
    const pat = ctx.createPattern(this.base, 'repeat')!;
    const ax = ox % (256 * scale),
      ay = oy % (256 * scale);
    pat.setTransform(new DOMMatrix([scale, 0, 0, scale, ax, ay]));
    // przy małym zoomie („imperium”) mgła rzednie, żeby było widać kolory osiedli
    const fa = Math.min(1, Math.max(0.35, 0.35 + ((zoom - 10.4) / 2.2) * 0.65));
    ctx.globalAlpha = fa;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    const pat2 = ctx.createPattern(this.wisps, 'repeat')!;
    const s2 = scale * 2.3;
    pat2.setTransform(new DOMMatrix([s2, 0, 0, s2, (ox * 0.9 + this.drift * 6) % (256 * s2), (oy * 0.9 + this.drift * 2.5) % (256 * s2)]));
    ctx.globalAlpha = 0.55 * fa;
    ctx.fillStyle = pat2;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Wymazywanie odkrytych tras
    const lat = (c.lat * Math.PI) / 180;
    const pxPerM = world / (40075016.686 * Math.cos(lat));
    const r = Math.max(REVEAL_RADIUS_M * pxPerM, 2.5 * dpr);
    const passes: [number, number][] = [
      [2.6, 0.12],
      [2.0, 0.2],
      [1.5, 0.32],
      [1.1, 0.55],
      [0.75, 1],
    ];
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = ctx.lineJoin = 'round';
    const view = [-ox / world, -oy / world, (W - ox) / world, (H - oy) / world];
    const pad = (r * 3) / world;
    const visible = (t: MTrail) =>
      t.bbox[2] >= view[0] - pad && t.bbox[0] <= view[2] + pad && t.bbox[3] >= view[1] - pad && t.bbox[1] <= view[3] + pad;
    const paths: Path2D[] = [];
    const addPath = (t: MTrail, upto = 1) => {
      const n = t.pts.length / 2;
      const last = Math.max(1, Math.floor((n - 1) * upto));
      const p = new Path2D();
      p.moveTo(t.pts[0] * world + ox, t.pts[1] * world + oy);
      for (let i = 1; i <= last; i++) p.lineTo(t.pts[i * 2] * world + ox, t.pts[i * 2 + 1] * world + oy);
      paths.push(p);
    };
    for (const t of this.trails) if (visible(t)) addPath(t);
    for (const t of this.live) if (visible(t)) addPath(t);
    if (this.animating) {
      const { trail, t } = this.animating;
      // kawałki odsłaniane po kolei, proporcjonalnie do liczby punktów
      const total = trail.reduce((s, x) => s + x.pts.length, 0);
      let budget = total * t;
      for (const tr of trail) {
        if (budget <= 0) break;
        const f = Math.min(1, budget / tr.pts.length);
        if (visible(tr)) addPath(tr, f);
        budget -= tr.pts.length;
      }
    }
    for (const [k, a] of passes) {
      ctx.globalAlpha = a;
      ctx.lineWidth = 2 * r * k;
      for (const p of paths) ctx.stroke(p);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

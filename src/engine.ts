// Stan aplikacji: dane miasta, pokrycie, spacery. Łączy rdzeń (core/) z zapisem (store.ts).
import { decodeCity, type CityData, type RawCityData } from './core/data.ts';
import { pointInRings, simplify, toLonLat, type LonLat, type XY } from './core/geo.ts';
import { buildIndex, cleanTrack, Coverage, matchPieces, walkedDistance, type SampleIndex, type TrackPoint } from './core/match.ts';
import { computeProgress, type ProgressReport } from './core/progress.ts';
import * as store from './store.ts';
import type { WalkMeta } from './store.ts';

export interface WalkInput {
  name: string;
  source: 'gpx' | 'live';
  points: TrackPoint[];
}

export interface WalkResult {
  walk: WalkMeta | null;
  duplicate?: boolean;
  empty?: boolean;
  freshSegs: number[];
}

export class Engine {
  city!: CityData;
  index!: SampleIndex;
  cov!: Coverage;
  walks: WalkMeta[] = [];
  /** Ślady spacerów jako kawałki lon/lat (do wycinania mgły). */
  trails = new Map<string, LonLat[][]>();
  progress!: ProgressReport;
  version = '';
  private listeners = new Set<() => void>();

  async init(url = `${import.meta.env.BASE_URL}data/poznan.json`) {
    const raw: RawCityData = await (await fetch(url)).json();
    this.version = raw.generated;
    this.city = decodeCity(raw);
    this.index = buildIndex(this.city.segs);
    this.walks = await store.loadWalks();
    const bits = await store.loadCoverage(this.version);
    this.cov = new Coverage(this.index, bits ?? undefined);
    const needRecompute = !bits && this.walks.length > 0;
    for (const w of this.walks) {
      const pts = await store.loadTrack(w.id);
      const pieces = cleanTrack(pts);
      this.trails.set(w.id, this.toTrail(pieces));
      // Nowa wersja danych OSM → przeliczamy pokrycie ze wszystkich zapisanych śladów
      if (needRecompute) this.cov.apply(matchPieces(this.index, pieces));
    }
    if (needRecompute) await store.saveCoverage(this.version, this.cov.bits);
    this.progress = computeProgress(this.city, this.cov);
  }

  private toTrail(pieces: ReturnType<typeof cleanTrack>): LonLat[][] {
    return pieces.map((pc) => simplify(pc, 2).map((p) => toLonLat(p[0], p[1])));
  }

  on(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) fn();
  }

  private fingerprint(pts: TrackPoint[]) {
    const a = pts[0],
      b = pts[pts.length - 1];
    return `${pts.length}:${a.lat.toFixed(5)},${a.lon.toFixed(5)}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}:${a.t ?? ''}`;
  }

  async addWalk(input: WalkInput): Promise<WalkResult> {
    const pts = input.points;
    if (pts.length < 2) return { walk: null, empty: true, freshSegs: [] };
    const fp = this.fingerprint(pts);
    if (this.walks.some((w) => w.id === fp)) return { walk: null, duplicate: true, freshSegs: [] };

    const pieces = cleanTrack(pts);
    const namesBefore = new Set(this.progress.streetNames);
    const fresh = this.cov.apply(matchPieces(this.index, pieces));
    const distance = walkedDistance(pts);
    const newStreets = [
      ...new Set(
        fresh
          .map((id) => this.city.segs[id])
          .filter((s) => s.counted && s.name && !namesBefore.has(s.name))
          .map((s) => s.name!),
      ),
    ];
    const times = pts.map((p) => p.t).filter((t): t is number => t != null);
    const walk: WalkMeta = {
      id: fp,
      name: input.name,
      source: input.source,
      start: times.length ? Math.min(...times) : null,
      end: times.length ? Math.max(...times) : null,
      distance,
      newSegs: fresh.filter((id) => this.city.segs[id].counted).length,
      newStreets,
      points: pts.length,
      parks: this.parksVisited(pieces),
      addedAt: Date.now(),
    };
    this.walks.push(walk);
    this.walks.sort((a, b) => (a.start ?? a.addedAt) - (b.start ?? b.addedAt));
    this.trails.set(walk.id, this.toTrail(pieces));
    await store.saveTrack(walk.id, pts);
    await store.saveWalks(this.walks);
    await store.saveCoverage(this.version, this.cov.bits);
    this.progress = computeProgress(this.city, this.cov);
    return { walk, freshSegs: fresh };
  }

  async removeWalk(id: string) {
    this.walks = this.walks.filter((w) => w.id !== id);
    this.trails.delete(id);
    await store.deleteTrack(id);
    await store.saveWalks(this.walks);
    // przeliczenie od zera
    this.cov = new Coverage(this.index);
    for (const w of this.walks) this.cov.apply(matchPieces(this.index, cleanTrack(await store.loadTrack(w.id))));
    await store.saveCoverage(this.version, this.cov.bits);
    this.progress = computeProgress(this.city, this.cov);
    this.emit();
  }

  parksVisited(pieces: XY[][]): number[] {
    const out: number[] = [];
    this.city.parks.forEach((p, i) => {
      if (!p.name) return;
      const [a, b, c, d] = p.bbox;
      for (const pc of pieces)
        for (const q of pc)
          if (q[0] >= a && q[0] <= c && q[1] >= b && q[1] <= d && pointInRings(q[0], q[1], p.xy)) {
            out.push(i);
            return;
          }
    });
    return out;
  }

  lastWalk(): WalkMeta | null {
    let best: WalkMeta | null = null;
    for (const w of this.walks) if (!best || w.addedAt > best.addedAt) best = w;
    return best;
  }
}

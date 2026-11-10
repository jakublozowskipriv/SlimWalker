// Stan aplikacji: dane miasta, pokrycie, spacery. Łączy rdzeń (core/) z zapisem (store.ts).
import { decodeCity, type CityData, type RawCityData } from './core/data.ts';
import { pointInRings, simplify, toLonLat, type LonLat, type XY } from './core/geo.ts';
import { buildIndex, cleanTrack, Coverage, matchPieces, walkedDistance, type SampleIndex, type TrackPoint } from './core/match.ts';
import { computeProgress, type ProgressReport } from './core/progress.ts';
import * as store from './store.ts';
import type { WalkMeta } from './store.ts';
import { TREASURES } from './data/treasures.ts';
import { findTreasures } from './core/treasures.ts';

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
  /** Znalezione skarby: id → czas znalezienia. */
  treasures = new Map<string, number>();
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
    const saved = await store.getKV<Record<string, number>>('treasures');
    if (saved) this.treasures = new Map(Object.entries(saved));
    else if (this.walks.length) {
      // pierwsze uruchomienie z funkcją skarbów: zaliczamy bez fanfar to, co już przebyte
      for (const id of findTreasures([...this.trails.values()].flat(), TREASURES)) this.treasures.set(id, Date.now());
      await this.saveTreasures();
    }
  }

  private saveTreasures() {
    return store.setKV('treasures', Object.fromEntries(this.treasures));
  }

  /** Sprawdza ślady podanych spacerów; zwraca nowo znalezione skarby. */
  async checkTreasures(walkIds: string[]): Promise<string[]> {
    const trails = walkIds.flatMap((id) => this.trails.get(id) ?? []);
    const fresh = findTreasures(trails, TREASURES, new Set(this.treasures.keys()));
    for (const id of fresh) this.treasures.set(id, Date.now());
    if (fresh.length) await this.saveTreasures();
    return fresh;
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

  /**
   * Dodaje spacer. W trybie `batch` (import całej historii) nie zapisuje pokrycia
   * ani nie przelicza postępu po każdej trasie — wywołaj potem `commit()`.
   */
  async addWalk(input: WalkInput, batch = false): Promise<WalkResult> {
    const pts = input.points;
    if (pts.length < 2) return { walk: null, empty: true, freshSegs: [] };
    const fp = this.fingerprint(pts);
    if (this.walks.some((w) => w.id === fp)) return { walk: null, duplicate: true, freshSegs: [] };

    const pieces = cleanTrack(pts);
    if (!pieces.length) return { walk: null, empty: true, freshSegs: [] };
    const namesBefore = this.progress.streetNames;
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
    for (const n of newStreets) namesBefore.add(n);
    await store.saveTrack(walk.id, pts);
    if (!batch) await this.commit();
    return { walk, freshSegs: fresh };
  }

  async commit() {
    await store.saveWalks(this.walks);
    await store.saveCoverage(this.version, this.cov.bits);
    this.progress = computeProgress(this.city, this.cov);
  }

  /** Prostokąt miasta (lon/lat) powiększony o ~1 km — do odsiewania tras z wakacji. */
  cityBox(): [number, number, number, number] {
    const pts = this.city.city.ll.flat();
    const lons = pts.map((p) => p[0]),
      lats = pts.map((p) => p[1]);
    return [Math.min(...lons) - 0.015, Math.min(...lats) - 0.01, Math.max(...lons) + 0.015, Math.max(...lats) + 0.01];
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

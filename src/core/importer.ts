// Import tras z różnych źródeł: GPX, TCX, FIT (także .gz) i archiwa ZIP
// (eksport Apple Zdrowie, eksport danych Garmin z zagnieżdżonymi ZIP-ami).
import { parseGpx } from './gpx.ts';
import { FIT_SPORT_CYCLING, isFit, parseFit } from './fit.ts';
import { inflate, isZip, listZip, readEntry } from './zip.ts';
import { haversine } from './geo.ts';
import type { TrackPoint } from './match.ts';

export interface ImportedTrack {
  name: string;
  points: TrackPoint[];
  /** 'ride' gdy wiadomo z pliku (FIT/TCX), że to rower. */
  sport: 'walk' | 'run' | 'ride' | 'other' | null;
  file: string;
}

const TRACK_RE = /\.(gpx|tcx|fit)(\.gz)?$/i;

export function parseTcx(xml: string): { points: TrackPoint[]; sport: ImportedTrack['sport'] } {
  const sportAttr = xml.match(/<Activity\s+Sport="([^"]+)"/i)?.[1]?.toLowerCase() ?? '';
  const sport = sportAttr.includes('bik') ? 'ride' : sportAttr.includes('run') ? 'run' : sportAttr ? 'other' : null;
  const points: TrackPoint[] = [];
  for (const m of xml.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) {
    const b = m[1];
    const lat = parseFloat(b.match(/<LatitudeDegrees>([^<]+)</)?.[1] ?? '');
    const lon = parseFloat(b.match(/<LongitudeDegrees>([^<]+)</)?.[1] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = Date.parse(b.match(/<Time>([^<]+)</)?.[1] ?? '');
    points.push(Number.isFinite(t) ? { lat, lon, t } : { lat, lon });
  }
  return { points, sport };
}

const fitSport = (s: number | null): ImportedTrack['sport'] =>
  s == null ? null : s === FIT_SPORT_CYCLING ? 'ride' : s === 1 ? 'run' : s === 11 || s === 17 ? 'walk' : 'other';

const baseName = (path: string) => path.split('/').pop()!.replace(TRACK_RE, '');

/** Parsuje pojedynczy plik trasy z bajtów. Zwraca null, gdy to nie trasa. */
export async function parseTrackBytes(name: string, data: Uint8Array): Promise<ImportedTrack | null> {
  if (/\.gz$/i.test(name)) {
    data = await inflate(new Blob([data as BlobPart]), 'gzip');
    name = name.replace(/\.gz$/i, '');
  }
  if (isFit(data)) {
    const f = parseFit(data);
    return { name: baseName(name), points: f.points, sport: fitSport(f.sport), file: name };
  }
  const text = new TextDecoder().decode(data);
  if (/<TrainingCenterDatabase/i.test(text)) {
    const t = parseTcx(text);
    return { name: baseName(name), points: t.points, sport: t.sport, file: name };
  }
  if (/<gpx[\s>]/i.test(text)) {
    const g = parseGpx(text);
    return { name: g.name ?? baseName(name), points: g.points, sport: null, file: name };
  }
  return null;
}

/** Przechodzi po plikach (i rekurencyjnie po ZIP-ach), oddając kolejne trasy. */
export async function* readTracks(files: Blob[], names: string[], onFile?: (n: string) => void): AsyncGenerator<ImportedTrack> {
  for (let i = 0; i < files.length; i++) yield* readOne(files[i], names[i], onFile, 0);
}

async function* readOne(blob: Blob, name: string, onFile: ((n: string) => void) | undefined, depth: number): AsyncGenerator<ImportedTrack> {
  if ((await isZip(blob)) && depth < 3) {
    const entries = await listZip(blob);
    for (const e of entries) {
      if (/(^|\/)(__MACOSX|\.)/.test(e.name)) continue;
      if (/\.zip$/i.test(e.name)) {
        const inner = await readEntry(blob, e);
        yield* readOne(new Blob([inner as BlobPart]), e.name, onFile, depth + 1);
      } else if (TRACK_RE.test(e.name)) {
        onFile?.(e.name);
        try {
          const t = await parseTrackBytes(e.name, await readEntry(blob, e));
          if (t) yield t;
        } catch (err) {
          console.warn('Pomijam', e.name, err);
        }
      }
    }
    return;
  }
  onFile?.(name);
  const t = await parseTrackBytes(name, new Uint8Array(await blob.arrayBuffer()));
  if (t) yield t;
}

/** Mediana prędkości w oknach ~60 s (m/s), null bez czasu. */
export function typicalSpeed(pts: TrackPoint[]): number | null {
  const timed = pts.filter((p) => p.t != null);
  if (timed.length < 10) return null;
  const speeds: number[] = [];
  let j = 0;
  for (let i = 0; i < timed.length; i += 5) {
    if (j < i) j = i;
    while (j < timed.length - 1 && timed[j].t! - timed[i].t! < 60_000) j++;
    const dt = (timed[j].t! - timed[i].t!) / 1000;
    if (dt < 30 || dt > 600) continue;
    let d = 0;
    for (let k = i + 1; k <= j; k++) d += haversine([timed[k - 1].lon, timed[k - 1].lat], [timed[k].lon, timed[k].lat]);
    speeds.push(d / dt);
  }
  if (!speeds.length) return null;
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length / 2)];
}

/** Rower: zadeklarowany w pliku albo typowa prędkość > 4,5 m/s (16 km/h). */
export const RIDE_SPEED = 4.5;
export function isRide(t: ImportedTrack): boolean {
  if (t.sport === 'ride') return true;
  if (t.sport === 'walk' || t.sport === 'run') return false;
  const v = typicalSpeed(t.points);
  return v != null && v > RIDE_SPEED;
}

export function touchesBox(pts: TrackPoint[], box: [number, number, number, number]): boolean {
  const [w, s, e, n] = box;
  return pts.some((p) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n);
}

/** Czytelna nazwa dla tras bez nazwy (np. „route_2024-05-03_6.12pm” z Apple Zdrowia). */
export function niceName(t: ImportedTrack): string {
  // nazwy plików z eksportów (route_2024-05-03_6.12pm, user_123456789, 2024-05-03-07-12-33) zamieniamy na datę
  const generic =
    !t.name || /^(route|activity|track|ślad|trasa)?[_\s-]*[\d_.\-: apm]+$/i.test(t.name) || (!/\s/.test(t.name) && /\d{3,}/.test(t.name));
  const start = t.points.find((p) => p.t != null)?.t;
  if (!generic || start == null) return t.name || 'Trasa';
  const d = new Date(start);
  const kind = t.sport === 'run' ? 'Bieg' : 'Spacer';
  return `${kind} ${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

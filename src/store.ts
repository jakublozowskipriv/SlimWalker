// Trwały zapis na telefonie (IndexedDB). Nic nie wychodzi poza urządzenie.
import { createStore, get, set, del } from 'idb-keyval';
import { decodePolyline, encodePolyline } from './core/geo.ts';
import type { TrackPoint } from './core/match.ts';

const db = createStore('mgla-poznania', 'kv');

export interface WalkMeta {
  id: string;
  name: string;
  source: 'gpx' | 'live';
  start: number | null; // ms
  end: number | null;
  distance: number; // m (tylko pieszo)
  newSegs: number;
  newStreets: string[];
  points: number;
  /** Indeksy nazwanych parków, przez które prowadził spacer. */
  parks: number[];
  addedAt: number;
}

interface StoredTrack {
  p: string; // polyline
  t: number[] | null; // sekundy od startu (delta), null gdy brak czasu
  t0: number | null;
}

export async function loadWalks(): Promise<WalkMeta[]> {
  return (await get<WalkMeta[]>('walks', db)) ?? [];
}

export async function saveWalks(walks: WalkMeta[]) {
  await set('walks', walks, db);
}

export async function saveTrack(id: string, pts: TrackPoint[]) {
  const hasT = pts.every((p) => p.t != null);
  const t0 = hasT && pts.length ? pts[0].t! : null;
  const rec: StoredTrack = {
    p: encodePolyline(pts.map((p) => [p.lon, p.lat])),
    t: hasT ? pts.map((p, i) => Math.round(((p.t! - (i ? pts[i - 1].t! : t0!)) / 1000) * 10) / 10) : null,
    t0,
  };
  await set(`track:${id}`, rec, db);
}

export async function loadTrack(id: string): Promise<TrackPoint[]> {
  const rec = await get<StoredTrack>(`track:${id}`, db);
  if (!rec) return [];
  const ll = decodePolyline(rec.p);
  let t = rec.t0 ?? 0;
  return ll.map(([lon, lat], i) => {
    if (rec.t) t += rec.t[i] * 1000;
    return rec.t ? { lat, lon, t } : { lat, lon };
  });
}

export async function deleteTrack(id: string) {
  await del(`track:${id}`, db);
}

export async function loadCoverage(version: string): Promise<Uint8Array | null> {
  return (await get<Uint8Array>(`cov:${version}`, db)) ?? null;
}

export async function saveCoverage(version: string, bits: Uint8Array) {
  await set(`cov:${version}`, bits, db);
}

export const getKV = <T>(k: string) => get<T>(k, db);
export const setKV = (k: string, v: unknown) => set(k, v, db);
export const delKV = (k: string) => del(k, db);

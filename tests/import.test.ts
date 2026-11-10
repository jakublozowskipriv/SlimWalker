import { describe, expect, it } from 'vitest';
import { parseFit } from '../src/core/fit.ts';
import { listZip } from '../src/core/zip.ts';
import { isRide, niceName, readTracks, typicalSpeed, type ImportedTrack } from '../src/core/importer.ts';
import { toGpx } from '../src/core/gpx.ts';
import { makeFit, makeZip, gz } from './binfix.ts';
import { walk } from './fixtures.ts';

const pts = walk([[0, 0], [400, 0]], { step: 6 }).map((p) => ({ lat: p.lat, lon: p.lon, t: Math.round(p.t! / 1000) * 1000 }));
const enc = (s: string) => new TextEncoder().encode(s);
const collect = async (files: Uint8Array[], names: string[]) => {
  const out: ImportedTrack[] = [];
  for await (const t of readTracks(files.map((f) => new Blob([f as BlobPart])), names)) out.push(t);
  return out;
};

describe('FIT', () => {
  it('czyta punkty, czas i sport (także skompresowane znaczniki czasu)', () => {
    const f = parseFit(makeFit(pts, 11, 3));
    expect(f.points).toHaveLength(pts.length);
    expect(f.sport).toBe(11);
    f.points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i].lat, 6);
      expect(p.lon).toBeCloseTo(pts[i].lon, 6);
      expect(p.t).toBe(pts[i].t);
    });
  });
});

describe('import archiwów', () => {
  it('eksport Apple Zdrowie: bierze tylko workout-routes/*.gpx, pomija export.xml', async () => {
    const zip = makeZip([
      { name: 'apple_health_export/export.xml', data: enc('<HealthData>' + 'x'.repeat(5000) + '</HealthData>') },
      { name: 'apple_health_export/workout-routes/route_2026-06-01_6.12pm.gpx', data: enc(toGpx('Route', pts)) },
      { name: 'apple_health_export/workout-routes/route_2026-06-02_7.00pm.gpx', data: enc(toGpx('Route', pts)), store: true },
    ]);
    const tracks = await collect([zip], ['eksport.zip']);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].points).toHaveLength(pts.length);
    expect(niceName({ ...tracks[0], name: 'route_2026-06-01_6.12pm' })).toMatch(/^Spacer \d+ czerwca 2026$/);
    expect(niceName({ ...tracks[0], name: 'jan.kowalski_123456' })).toMatch(/^Spacer /);
    expect(niceName({ ...tracks[0], name: 'Wieczór na Jeżycach' })).toBe('Wieczór na Jeżycach');
  });

  it('eksport Garmin: zagnieżdżony ZIP z plikami .fit i .fit.gz', async () => {
    const inner = makeZip([
      { name: 'jan.kowalski_123.fit', data: makeFit(pts, 1) },
      { name: 'jan.kowalski_124.fit.gz', data: gz(makeFit(pts, 2)) },
      { name: 'notatka.txt', data: enc('nie trasa') },
    ]);
    const outer = makeZip([
      { name: 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip', data: inner },
      { name: 'DI_CONNECT/DI-Connect-Fitness/summary.json', data: enc('{}') },
    ]);
    expect((await listZip(new Blob([outer as BlobPart]))).length).toBe(2);
    const tracks = await collect([outer], ['garmin.zip']);
    expect(tracks.map((t) => t.sport)).toEqual(['run', 'ride']);
    expect(isRide(tracks[1])).toBe(true);
    expect(isRide(tracks[0])).toBe(false);
  });

  it('TCX i zwykły GPX obok siebie', async () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap><Track>${pts
      .map((p) => `<Trackpoint><Time>${new Date(p.t).toISOString()}</Time><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position></Trackpoint>`)
      .join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const tracks = await collect([enc(tcx), enc(toGpx('Spacer', pts))], ['bieg.tcx', 'spacer.gpx']);
    expect(tracks.map((t) => [t.sport, t.points.length])).toEqual([['run', pts.length], [null, pts.length]]);
  });

  it('rower bez deklaracji sportu rozpoznany po prędkości', () => {
    const ride = walk([[0, 0], [3000, 0]], { step: 30, speed: 6 });
    expect(typicalSpeed(ride)!).toBeGreaterThan(5);
    expect(isRide({ name: 'x', points: ride, sport: null, file: 'x' })).toBe(true);
    const stroll = walk([[0, 0], [1500, 0]], { step: 5, speed: 1.3, noise: 4 });
    expect(isRide({ name: 'x', points: stroll, sport: null, file: 'x' })).toBe(false);
  });
});

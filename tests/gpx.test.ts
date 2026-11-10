import { describe, expect, it } from 'vitest';
import { parseGpx, toGpx } from '../src/core/gpx.ts';

describe('GPX', () => {
  it('parsuje trkpt z czasem i nazwą', () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>Spacer po Jeżycach</name><trkseg>
      <trkpt lat="52.41" lon="16.90"><ele>80</ele><time>2026-06-01T20:15:00Z</time></trkpt>
      <trkpt lon='16.901' lat='52.411'/>
    </trkseg></trk></gpx>`;
    const t = parseGpx(xml);
    expect(t.name).toBe('Spacer po Jeżycach');
    expect(t.points).toHaveLength(2);
    expect(t.points[0]).toEqual({ lat: 52.41, lon: 16.9, t: Date.parse('2026-06-01T20:15:00Z') });
    expect(t.points[1]).toEqual({ lat: 52.411, lon: 16.901 });
  });
  it('round-trip toGpx → parseGpx', () => {
    const pts = [{ lat: 52.4, lon: 16.9, t: 1000 }, { lat: 52.401, lon: 16.901, t: 2000 }];
    const back = parseGpx(toGpx('A & B', pts));
    expect(back.name).toBe('A &amp; B');
    expect(back.points.map((p) => p.t)).toEqual([1000, 2000]);
  });
});

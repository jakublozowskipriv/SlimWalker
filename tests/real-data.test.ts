// Test na prawdziwych danych Poznania + wygenerowanym śladzie po Jeżycach.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCity } from '../src/core/data.ts';
import { buildIndex, Coverage, matchTrack, walkedDistance } from '../src/core/match.ts';
import { computeProgress } from '../src/core/progress.ts';
import { parseGpx } from '../src/core/gpx.ts';
import { TREASURES, FIND_RADIUS_M } from '../src/data/treasures.ts';
import { pointLineDist, toXY } from '../src/core/geo.ts';

const DATA = 'public/data/poznan.json';
describe.skipIf(!existsSync(DATA))('prawdziwe dane Poznania', () => {
  const city = decodeCity(JSON.parse(readFileSync(DATA, 'utf8')));
  const t0 = performance.now();
  const index = buildIndex(city.segs);
  const buildMs = performance.now() - t0;

  it('ma 42 osiedla i sensowną sieć ulic', () => {
    expect(city.districts).toHaveLength(42);
    const p = computeProgress(city, new Coverage(index));
    expect(p.city.totalLen / 1000).toBeGreaterThan(1000); // > 1000 km liczonych ulic
    expect(p.city.streetsTotal).toBeGreaterThan(1500);
    expect(buildMs).toBeLessThan(3000);
  });

  it('spacer po Jeżycach odkrywa ulice prawie wyłącznie na Jeżycach', () => {
    const cov = new Coverage(index);
    const { points } = parseGpx(readFileSync('samples/jezyce.gpx', 'utf8'));
    const fresh = cov.apply(matchTrack(index, points));
    const counted = fresh.filter((id) => city.segs[id].counted);
    const jez = city.districts.findIndex((d) => d.name === 'Jeżyce');
    const inJez = counted.filter((id) => city.segs[id].district === jez).length;
    expect(counted.length).toBeGreaterThan(15);
    expect(inJez / counted.length).toBeGreaterThan(0.9);
    // generator: 4,3 km po ulicach + szum GPS ±6 m — dystans nie może „puchnąć” od drgań
    expect(walkedDistance(points) / 1000).toBeGreaterThan(3.8);
    expect(walkedDistance(points) / 1000).toBeLessThan(4.9);
    const p = computeProgress(city, cov);
    expect(p.districts[jez].pct).toBeGreaterThan(p.city.pct);
    // ślad ma ~4,3 km i chodzi po ulicach — odkryta długość powinna być tego rzędu (nie 3× więcej)
    expect(p.city.discoveredLen).toBeLessThan(4300 * 1.3);
    expect(p.city.discoveredLen).toBeGreaterThan(4300 * 0.4);
  });

  it('każdy skarb da się znaleźć: leży blisko drogi, którą można przejść', () => {
    for (const t of TREASURES) {
      const p = toXY(t.ll[0], t.ll[1]);
      let best = Infinity;
      for (const s of city.segs) if (Math.abs(s.xy[0][0] - p[0]) < 3000 && Math.abs(s.xy[0][1] - p[1]) < 3000) best = Math.min(best, pointLineDist(p, s.xy));
      expect(best, t.id).toBeLessThan(FIND_RADIUS_M * 0.75);
    }
  });
});

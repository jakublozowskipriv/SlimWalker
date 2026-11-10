import { describe, expect, it } from 'vitest';
import { buildIndex, Coverage, matchTrack, walkedDistance, cleanTrack } from '../src/core/match.ts';
import { computeProgress, fmtPct } from '../src/core/progress.ts';
import { decodePolyline, encodePolyline } from '../src/core/geo.ts';
import { gridCity, walk } from './fixtures.ts';

const setup = () => {
  const city = gridCity();
  const index = buildIndex(city.segs);
  return { city, index, cov: new Coverage(index) };
};
const segOf = (city: ReturnType<typeof gridCity>, name: string, i: number) =>
  city.segs.filter((s) => s.name === name)[i].id;

describe('polyline', () => {
  it('koduje i dekoduje z dokładnością ~1 m', () => {
    const pts: [number, number][] = [[16.92345, 52.40812], [16.93001, 52.4], [16.9, 52.41111]];
    const back = decodePolyline(encodePolyline(pts));
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i][0], 5);
      expect(p[1]).toBeCloseTo(pts[i][1], 5);
    });
  });
});

describe('dopasowanie śladu do ulic', () => {
  it('spacer wzdłuż ulicy odkrywa jej odcinki', () => {
    const { city, index, cov } = setup();
    const fresh = cov.apply(matchTrack(index, walk([[0, 100], [300, 100]])));
    const ids = [0, 1, 2].map((i) => segOf(city, 'Pozioma 1', i));
    expect(new Set(fresh)).toEqual(new Set(ids));
  });

  it('chodnik 12 m od osi i szum GPS ±8 m nadal liczą się jako przejście ulicy', () => {
    const { city, index, cov } = setup();
    cov.apply(matchTrack(index, walk([[0, 100], [300, 100]], { offset: 12, noise: 8 })));
    for (let i = 0; i < 3; i++) expect(cov.isDiscovered(segOf(city, 'Pozioma 1', i))).toBe(true);
  });

  it('równoległa ulica 100 m dalej nie zostaje odkryta', () => {
    const { city, index, cov } = setup();
    cov.apply(matchTrack(index, walk([[0, 100], [300, 100]], { offset: 12, noise: 8 })));
    for (let i = 0; i < 3; i++) {
      expect(cov.segRatio(segOf(city, 'Pozioma 0', i))).toBe(0);
      expect(cov.segRatio(segOf(city, 'Pozioma 2', i))).toBe(0);
    }
  });

  it('przejście w poprzek ulicy (na skrzyżowaniu) jej nie odkrywa', () => {
    const { city, index, cov } = setup();
    cov.apply(matchTrack(index, walk([[150, 0], [150, 300]])));
    // ślad idzie środkiem kwartałów w pionie, przecina poziome ulice — nie mogą się odkryć
    for (const s of city.segs) expect(cov.isDiscovered(s.id)).toBe(false);
  });

  it('pół odcinka to za mało, ale druga połowa innego dnia go odkrywa', () => {
    const { city, index, cov } = setup();
    const id = segOf(city, 'Pozioma 1', 1); // x 100..200
    cov.apply(matchTrack(index, walk([[100, 100], [145, 100]])));
    expect(cov.segRatio(id)).toBeGreaterThan(0.2);
    expect(cov.isDiscovered(id)).toBe(false);
    const fresh = cov.apply(matchTrack(index, walk([[140, 100], [200, 100]])));
    expect(fresh).toContain(id);
  });

  it('przejazd tramwajem (40 km/h) nie odkrywa ulic', () => {
    const { index, cov } = setup();
    const fresh = cov.apply(matchTrack(index, walk([[0, 200], [300, 200]], { speed: 11 })));
    expect(fresh).toEqual([]);
  });

  it('skok GPS (teleport) nie tworzy fałszywego odcinka', () => {
    const pts = [...walk([[0, 0], [20, 0]]), ...walk([[280, 300], [300, 300]], { t0: Date.UTC(2026, 5, 1, 10, 0, 20) })];
    expect(cleanTrack(pts).length).toBe(2);
    expect(walkedDistance(pts)).toBeLessThan(60);
  });
});

describe('postęp', () => {
  it('liczy procent miasta, osiedli i ulice po nazwie', () => {
    const { city, index, cov } = setup();
    // przejście całej Poziomej 1 (300 m z 2400 m sieci)
    cov.apply(matchTrack(index, walk([[0, 100], [300, 100]])));
    const p = computeProgress(city, cov);
    expect(p.city.totalLen).toBeCloseTo(2400, -1);
    expect(p.city.pct).toBeCloseTo(12.5, 0);
    expect(p.city.streets).toBe(1);
    expect(p.city.streetsTotal).toBe(8);
    // Zachód ma 1,5 odcinka Poziomej 1 → odcinki z midpointem x<150: i=0 (50) → zachód; i=1 (150) → wschód
    const [west, east] = p.districts;
    expect(west.discoveredLen + east.discoveredLen).toBeCloseTo(300, -1);
    expect(west.segs).toBe(1);
    expect(east.segs).toBe(2);
  });

  it('formatuje procenty po polsku', () => {
    expect(fmtPct(0)).toBe('0');
    expect(fmtPct(0.04)).toBe('<0,1');
    expect(fmtPct(12.46)).toBe('12,5');
    expect(fmtPct(12)).toBe('12');
    expect(fmtPct(99.97)).toBe('99,9');
  });
});

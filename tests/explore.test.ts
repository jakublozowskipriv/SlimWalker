import { describe, expect, it } from 'vitest';
import { buildIndex, Coverage, matchTrack } from '../src/core/match.ts';
import { computeProgress } from '../src/core/progress.ts';
import { directionName, nearestSpot, randomTarget } from '../src/core/explore.ts';
import { evaluateSeals, isNight, streaks } from '../src/core/achievements.ts';
import { gridCity, ll, walk } from './fixtures.ts';

describe('eksploracja', () => {
  it('najbliższe miejsce do odsłonięcia omija odkryte okolice', () => {
    const city = gridCity();
    const idx = buildIndex(city.segs);
    const cov = new Coverage(idx);
    cov.apply(matchTrack(idx, walk([[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]])));
    const p = computeProgress(city, cov);
    const s = nearestSpot(city, p.discovered, ll(0, 0))!;
    expect(s).not.toBeNull();
    expect(s.streets.length).toBeGreaterThan(0);
    // odkryty obwód nie może być wśród „nowych” ulic
    expect(s.streets).not.toContain('Pozioma 0');
    expect(s.streets).not.toContain('Pionowa 3');
  });
  it('losowy cel jest deterministyczny dla danego generatora i wskazuje kierunek', () => {
    const city = gridCity();
    const t = randomTarget(city, new Set(), ll(-2000, 150), () => 0.5, [100, 5000])!;
    expect(t).not.toBeNull();
    expect(directionName(t.bearing)).toBe('wschód');
  });
  it('nazwy kierunków', () => {
    expect(directionName(0)).toBe('północ');
    expect(directionName(44)).toBe('północny wschód');
    expect(directionName(359)).toBe('północ');
    expect(directionName(225)).toBe('południowy zachód');
  });
});

describe('pieczęcie', () => {
  const day = (d: number, h = 18) => new Date(2026, 5, d, h).getTime();
  it('serie dni liczą się po kolejnych dniach kalendarzowych', () => {
    const walks = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map((d) => ({ start: day(d), end: day(d) + 3600e3, distance: 2000 }));
    const s = streaks(walks, day(11, 20));
    expect(s.longest).toBe(7);
    expect(s.current).toBe(7);
    expect(streaks(walks, day(14)).current).toBe(0);
  });
  it('krótkie wyjście (<300 m) nie przedłuża serii', () => {
    const walks = [{ start: day(1), end: day(1), distance: 2000 }, { start: day(2), end: day(2), distance: 100 }];
    expect(streaks(walks, day(2)).longest).toBe(1);
  });
  it('nocny spacer: start 21:40, koniec 22:20', () => {
    expect(isNight(new Date(2026, 5, 1, 21, 40).getTime(), new Date(2026, 5, 1, 22, 20).getTime())).toBe(true);
    expect(isNight(new Date(2026, 5, 1, 18).getTime(), new Date(2026, 5, 1, 21, 50).getTime())).toBe(false);
  });
  it('„Pierwsze kroki” po 8 ulicach jeszcze nie, postęp widoczny', () => {
    const city = gridCity();
    const idx = buildIndex(city.segs);
    const cov = new Coverage(idx);
    cov.apply(matchTrack(idx, walk([[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]])));
    const seals = evaluateSeals(city, cov, computeProgress(city, cov), []);
    const first = seals.find((s) => s.id === 'first-steps')!;
    expect(first.earned).toBe(false);
    expect(first.value).toBe(4);
    expect(first.label).toBe('4 z 10 ulic');
  });
});

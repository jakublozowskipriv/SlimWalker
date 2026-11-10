import { describe, expect, it } from 'vitest';
import { bankOf, classify, joinWays, splitWays } from '../scripts/build-data.ts';
import type { XY } from '../src/core/geo.ts';

describe('przetwarzanie OSM', () => {
  it('klasyfikuje drogi: chodniki odrzuca, bezimienne ścieżki rysuje bez liczenia', () => {
    expect(classify({ highway: 'residential', name: 'Kraszewskiego' })).toEqual({ cls: 2, counted: true });
    expect(classify({ highway: 'footway', footway: 'sidewalk' })).toBeNull();
    // ...ale chodnik na moście zostaje — inaczej nie dałoby się „przejść” mostu z jezdnią foot=no
    expect(classify({ highway: 'footway', footway: 'sidewalk', bridge: 'yes' })).toEqual({ cls: 3, counted: false });
    expect(classify({ highway: 'footway' })).toEqual({ cls: 3, counted: false });
    expect(classify({ highway: 'footway', name: 'Aleja Lipowa' })).toEqual({ cls: 3, counted: true });
    expect(classify({ highway: 'motorway' })).toBeNull();
    expect(classify({ highway: 'residential', access: 'private' })).toBeNull();
    expect(classify({ highway: 'service', service: 'parking_aisle' })).toBeNull();
  });
  it('tnie drogi na skrzyżowaniach', () => {
    const a = { nodes: [1, 2, 3], xy: [[0, 0], [50, 0], [100, 0]] as XY[] };
    const b = { nodes: [4, 2, 5], xy: [[50, -50], [50, 0], [50, 50]] as XY[] };
    const out = splitWays([a, b]);
    expect(out).toHaveLength(4);
  });
  it('skleja fragmenty w pierścień', () => {
    const r = joinWays([[[0, 0], [10, 0]], [[10, 10], [10, 0]], [[10, 10], [0, 10], [0, 0]]]);
    expect(r).toHaveLength(1);
    expect(r[0][0]).toEqual(r[0][r[0].length - 1]);
  });
  it('rozpoznaje brzeg rzeki płynącej z południa na północ', () => {
    const river: XY[] = [[0, -1e5], [0, 0], [100, 500], [0, 1000], [0, 1e5]];
    expect(bankOf([-200, 0], river)).toBe(0);
    expect(bankOf([200, 0], river)).toBe(1);
    expect(bankOf([50, 500], river)).toBe(0); // w zakolu, na zachód od rzeki
    expect(bankOf([150, 500], river)).toBe(1);
  });
});

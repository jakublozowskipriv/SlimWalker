// Liczenie postępu: miasto, osiedla, ulice (po nazwie).
import type { CityData } from './data.ts';
import type { Coverage } from './match.ts';

export interface Progress {
  discoveredLen: number;
  totalLen: number;
  pct: number; // 0–100
  streets: number; // odkryte nazwane ulice (≥1 odkryty odcinek)
  streetsTotal: number;
  segs: number;
  segsTotal: number;
}

const empty = (): Progress => ({ discoveredLen: 0, totalLen: 0, pct: 0, streets: 0, streetsTotal: 0, segs: 0, segsTotal: 0 });

export interface ProgressReport {
  city: Progress;
  districts: Progress[];
  discovered: Set<number>;
  streetNames: Set<string>;
}

export function computeProgress(city: CityData, cov: Coverage): ProgressReport {
  const discovered = cov.discoveredSet();
  const total = empty();
  const ds = city.districts.map(empty);
  const allNames = new Set<string>();
  const found = new Set<string>();
  const dNames = city.districts.map(() => ({ all: new Set<string>(), found: new Set<string>() }));
  for (const s of city.segs) {
    if (!s.counted) continue;
    const isD = discovered.has(s.id);
    const targets = [total];
    if (s.district >= 0) targets.push(ds[s.district]);
    for (const t of targets) {
      t.totalLen += s.len;
      t.segsTotal++;
      if (isD) {
        t.discoveredLen += s.len;
        t.segs++;
      }
    }
    if (s.name) {
      allNames.add(s.name);
      if (isD) found.add(s.name);
      if (s.district >= 0) {
        dNames[s.district].all.add(s.name);
        if (isD) dNames[s.district].found.add(s.name);
      }
    }
  }
  const fin = (p: Progress) => ((p.pct = p.totalLen ? (100 * p.discoveredLen) / p.totalLen : 0), p);
  total.streets = found.size;
  total.streetsTotal = allNames.size;
  ds.forEach((d, i) => {
    d.streets = dNames[i].found.size;
    d.streetsTotal = dNames[i].all.size;
  });
  return { city: fin(total), districts: ds.map(fin), discovered, streetNames: found };
}

/** Procent do wyświetlenia: 0 → „0”, poniżej 0,1 → „<0,1”, poza tym 1 miejsce po przecinku. */
export function fmtPct(p: number): string {
  if (p <= 0) return '0';
  if (p < 0.1) return '<0,1';
  if (p >= 99.95 && p < 100) return '99,9';
  return p.toFixed(1).replace('.', ',').replace(',0', '');
}

export function fmtKm(m: number): string {
  return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
}

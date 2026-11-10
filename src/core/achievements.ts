// Pieczęcie (osiągnięcia). Każda ma postęp value/goal, więc widać, ile brakuje.
import type { CityData } from './data.ts';
import type { Coverage } from './match.ts';
import type { ProgressReport } from './progress.ts';

export interface WalkLike {
  start: number | null;
  end: number | null;
  distance: number;
  parks?: number[];
  nightMinutes?: number;
  dawn?: boolean;
}

export interface SealState {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  value: number;
  goal: number;
  earned: boolean;
  /** Tekst postępu, np. „3 z 5 mostów”. */
  label: string;
}

/** Dni (lokalnie, RRRR-MM-DD) ze spacerem ≥ 300 m. */
export function walkDays(walks: WalkLike[]): string[] {
  const days = new Set<string>();
  for (const w of walks) {
    if (w.start == null || w.distance < 300) continue;
    const d = new Date(w.start);
    days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return [...days].sort();
}

const dayNum = (s: string) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);

/** Najdłuższa i bieżąca seria kolejnych dni ze spacerem. */
export function streaks(walks: WalkLike[], now = Date.now()): { longest: number; current: number } {
  const nums = walkDays(walks).map(dayNum);
  let longest = 0,
    run = 0,
    prev = -Infinity;
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }
  const t = new Date(now);
  const today = dayNum(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
  // seria trwa, jeśli ostatni spacer był dziś lub wczoraj
  const current = nums.length && today - nums[nums.length - 1] <= 1 ? run : 0;
  return { longest, current };
}

/** Czy spacer zahaczył o 22:00–4:00 czasu lokalnego. */
export function isNight(start: number | null, end: number | null): boolean {
  if (start == null) return false;
  const e = end ?? start;
  for (let t = start; t <= e; t += 10 * 60_000) {
    const h = new Date(t).getHours();
    if (h >= 22 || h < 4) return true;
  }
  const h = new Date(e).getHours();
  return h >= 22 || h < 4;
}

export function isDawn(start: number | null): boolean {
  if (start == null) return false;
  const h = new Date(start).getHours();
  return h >= 4 && h < 6;
}

export const DISTRICT_COMPLETE = 95; // % — patrz README: 100% bywa fizycznie nieosiągalne (płoty, budowy)

const G = {
  steps: `<path d="M-9 8c-2-6 0-14 4-14s4 7 2 11zM5 -2c-2-6 0-14 4-14s4 7 2 11zM-7 13a3 2 0 1 0 6 0M7 3a3 2 0 1 0 6 0" fill="currentColor" transform="scale(.9)"/>`,
  river: `<path d="M-20 -6c6-5 10 5 16 0s10 5 16 0 8 4 8 4M-20 4c6-5 10 5 16 0s10 5 16 0 8 4 8 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  moon: `<path d="M6-15a14 14 0 1 0 10 22A12 12 0 0 1 6-15z" fill="currentColor"/><circle cx="-12" cy="-12" r="1.3" fill="currentColor"/><circle cx="14" cy="-10" r="1" fill="currentColor"/>`,
  seven: `<text y="9" text-anchor="middle" font-family="Fraunces, serif" font-weight="700" font-size="28" fill="currentColor">7</text><path d="M-17-14h34" stroke="currentColor" stroke-width="1.6"/><path d="M-17 15h34" stroke="currentColor" stroke-width="1.6"/>`,
  bridge: `<path d="M-20 6h40M-20 -2c6-12 34-12 40 0M-12 6v-9M0 6v-12M12 6v-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M-20 12c5-3 10 3 15 0s10 3 15 0 10 3 10 0" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  tree: `<path d="M0-17c8 0 12 7 9 12 6 2 5 11-3 11H-6c-8 0-9-9-3-11-3-5 1-12 9-12z" fill="currentColor"/><path d="M0 6v11" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  house: `<path d="M-15 15V-2L0-15 15-2v17zM-5 15V4h10v11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`,
  compass: `<circle r="15" fill="none" stroke="currentColor" stroke-width="2"/><path d="M0-12 4 0 0 12-4 0z" fill="currentColor"/>`,
  sun: `<circle r="6" fill="currentColor"/><path d="M0-16v5M0 11v5M-16 0h5M11 0h5M-11-11l3.5 3.5M7.5 7.5 11 11M-11 11l3.5-3.5M7.5-7.5 11-11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  boot: `<path d="M-10-15h9v15l12 4c4 1 5 4 5 7v3h-26z" fill="currentColor"/>`,
  map: `<path d="M-16-11 -5-15 5-11 16-15v26L5 15-5 11-16 15z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M-5-15v26M5-11v26" stroke="currentColor" stroke-width="1.6"/>`,
};

export function evaluateSeals(
  city: CityData,
  cov: Coverage,
  progress: ProgressReport,
  walks: WalkLike[],
): SealState[] {
  const disc = progress.discovered;
  const banks = new Set<number>();
  const bridges = new Set<number>();
  for (const s of city.segs) {
    if (disc.has(s.id) && s.counted) banks.add(s.bank);
    if (s.bridge >= 0 && cov.segRatio(s.id) >= 0.5) bridges.add(s.bridge);
  }
  const parks = new Set<number>();
  for (const w of walks) for (const p of w.parks ?? []) parks.add(p);
  const night = walks.some((w) => isNight(w.start, w.end));
  const dawn = walks.some((w) => isDawn(w.start));
  const { longest } = streaks(walks);
  const jez = city.districts.findIndex((d) => /^Jeżyce$/i.test(d.name));
  const jezPct = jez >= 0 ? progress.districts[jez].pct : 0;
  const totalKm = walks.reduce((s, w) => s + w.distance, 0) / 1000;
  const visitedDistricts = progress.districts.filter((d) => d.segs > 0).length;

  const mk = (id: string, name: string, desc: string, glyph: string, value: number, goal: number, label: string): SealState => ({
    id,
    name,
    desc,
    glyph,
    value: Math.min(value, goal),
    goal,
    earned: value >= goal,
    label,
  });
  const pctLbl = (v: number, g: number) => `${Math.floor(v)}% z ${g}%`;
  return [
    mk('first-steps', 'Pierwsze kroki', 'Odsłoń 10 ulic', G.steps, progress.city.streets, 10, `${Math.min(progress.city.streets, 10)} z 10 ulic`),
    mk('river', 'Przez rzekę', 'Odkryj ulice po obu stronach Warty', G.river, banks.size, 2, banks.size >= 2 ? 'oba brzegi' : banks.size ? 'jeden brzeg' : 'żaden brzeg'),
    mk('night', 'Nocny marek', 'Spaceruj po 22:00', G.moon, night ? 1 : 0, 1, night ? 'zdobyta nocą' : 'czeka na noc'),
    mk('week', 'Seria tygodnia', '7 dni ze spacerem z rzędu', G.seven, longest, 7, `${Math.min(longest, 7)} z 7 dni`),
    mk('bridges', 'Mosty na Warcie', 'Przejdź 5 różnych mostów', G.bridge, bridges.size, 5, `${Math.min(bridges.size, 5)} z 5 mostów`),
    mk('parks', 'Zielony Poznań', 'Odwiedź 10 parków', G.tree, parks.size, 10, `${Math.min(parks.size, 10)} z 10 parków`),
    mk('jezyce', 'Całe Jeżyce', `Odsłoń ${DISTRICT_COMPLETE}% Jeżyc`, G.house, jezPct, DISTRICT_COMPLETE, pctLbl(jezPct, DISTRICT_COMPLETE)),
    mk('cartographer', 'Kartograf', 'Odsłoń 25% miasta', G.compass, progress.city.pct, 25, pctLbl(progress.city.pct, 25)),
    mk('dawn', 'Ranny ptaszek', 'Wyjdź na spacer przed 6:00', G.sun, dawn ? 1 : 0, 1, dawn ? 'zdobyta o świcie' : 'czeka na świt'),
    mk('wanderer', 'Wędrowiec', 'Przejdź łącznie 100 km', G.boot, totalKm, 100, `${Math.floor(Math.min(totalKm, 100))} z 100 km`),
    mk('ten-districts', 'Dziesięć osiedli', 'Postaw stopę w 10 osiedlach', G.map, visitedDistricts, 10, `${Math.min(visitedDistricts, 10)} z 10 osiedli`),
  ];
}

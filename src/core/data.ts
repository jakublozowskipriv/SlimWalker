// Format statycznych danych miasta (public/data/poznan.json) i ich dekodowanie.
import { decodePolyline, lineLength, toXY, type LonLat, type XY, bboxOf } from './geo.ts';

/** Klasy odcinków: 0 główne, 1 średnie, 2 osiedlowe/deptaki, 3 ścieżki (nieliczone jeśli bez nazwy). */
export type SegClass = 0 | 1 | 2 | 3;

/** [nazwa(-1), klasa, osiedle(-1), brzeg(0 zach./1 wsch.), most(-1), liczony(0/1), polyline] */
export type RawSeg = [number, SegClass, number, 0 | 1, number, 0 | 1, string];

export interface RawArea {
  name: string;
  rings: string[];
}

export interface RawCityData {
  v: number;
  generated: string;
  source: string;
  city: string[];
  districts: RawArea[];
  names: string[];
  bridges: string[];
  segs: RawSeg[];
  parks: RawArea[];
  water: string[];
  river: string[];
}

export interface Seg {
  id: number;
  name: string | null;
  cls: SegClass;
  district: number;
  bank: 0 | 1;
  bridge: number;
  counted: boolean;
  ll: LonLat[];
  xy: XY[];
  len: number;
}

export interface Area {
  name: string;
  ll: LonLat[][];
  xy: XY[][];
  bbox: [number, number, number, number];
  center: LonLat;
}

export interface CityData {
  raw: RawCityData;
  segs: Seg[];
  names: string[];
  bridges: string[];
  districts: Area[];
  parks: Area[];
  city: Area;
  river: LonLat[][];
  water: LonLat[][];
}

const xyOf = (ll: LonLat[]) => ll.map((p) => toXY(p[0], p[1]));

export function decodeArea(a: RawArea): Area {
  const ll = a.rings.map((r) => decodePolyline(r));
  const xy = ll.map(xyOf);
  const bbox = bboxOf(xy.flat());
  // „Środek” do podpisu: środek ciężkości największego pierścienia
  let best = ll[0];
  let bestN = 0;
  for (const r of ll) if (r.length > bestN) ((best = r), (bestN = r.length));
  let cx = 0,
    cy = 0;
  for (const p of best) ((cx += p[0]), (cy += p[1]));
  return { name: a.name, ll, xy, bbox, center: [cx / best.length, cy / best.length] };
}

export function decodeCity(raw: RawCityData): CityData {
  const segs: Seg[] = raw.segs.map((s, id) => {
    const ll = decodePolyline(s[6]);
    const xy = xyOf(ll);
    return {
      id,
      name: s[0] >= 0 ? raw.names[s[0]] : null,
      cls: s[1],
      district: s[2],
      bank: s[3],
      bridge: s[4],
      counted: s[5] === 1,
      ll,
      xy,
      len: lineLength(xy),
    };
  });
  return {
    raw,
    segs,
    names: raw.names,
    bridges: raw.bridges,
    districts: raw.districts.map(decodeArea),
    parks: raw.parks.map(decodeArea),
    city: decodeArea({ name: 'Poznań', rings: raw.city }),
    river: raw.river.map((r) => decodePolyline(r)),
    water: raw.water.map((r) => decodePolyline(r)),
  };
}

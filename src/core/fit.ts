// Minimalny parser plików Garmin FIT: wyciąga punkty (record: lat/lon/czas) i sport.
// Specyfikacja: nagłówek 12/14 B, potem wiadomości definicji i danych; współrzędne w „semicircles”.
import type { TrackPoint } from './match.ts';

export interface FitTrack {
  points: TrackPoint[];
  /** Sport z wiadomości session/sport (1 bieg, 2 rower, 11 chód, 17 wędrówka...), null gdy brak. */
  sport: number | null;
  start: number | null;
}

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z w sekundach uniksowych
const SEMI = 180 / 2 ** 31;

interface FieldDef {
  num: number;
  size: number;
  base: number;
}
interface Def {
  global: number;
  little: boolean;
  fields: FieldDef[];
  devSize: number;
  total: number;
}

export function isFit(buf: Uint8Array): boolean {
  return buf.length > 12 && buf[8] === 0x2e && buf[9] === 0x46 && buf[10] === 0x49 && buf[11] === 0x54; // ".FIT"
}

export function parseFit(buf: Uint8Array): FitTrack {
  if (!isFit(buf)) throw new Error('To nie jest plik FIT');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerSize = buf[0];
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(buf.length, headerSize + dataSize);
  const defs = new Map<number, Def>();
  const points: TrackPoint[] = [];
  let sport: number | null = null;
  let start: number | null = null;
  let lastTs = 0;
  let pos = headerSize;

  const read = (off: number, f: FieldDef, little: boolean): number | null => {
    switch (f.base & 0x1f) {
      case 0x00: // enum
      case 0x02: // uint8
      case 0x0a: {
        const v = dv.getUint8(off);
        return v === 0xff ? null : v;
      }
      case 0x01: {
        const v = dv.getInt8(off);
        return v === 0x7f ? null : v;
      }
      case 0x03: {
        const v = dv.getInt16(off, little);
        return v === 0x7fff ? null : v;
      }
      case 0x04:
      case 0x0b: {
        const v = dv.getUint16(off, little);
        return v === 0xffff ? null : v;
      }
      case 0x05: {
        const v = dv.getInt32(off, little);
        return v === 0x7fffffff ? null : v;
      }
      case 0x06:
      case 0x0c: {
        const v = dv.getUint32(off, little);
        return v === 0xffffffff ? null : v;
      }
      default:
        return null;
    }
  };

  while (pos < end) {
    const h = buf[pos++];
    if (h & 0x80) {
      // skompresowany nagłówek z czasem
      const local = (h >> 5) & 0x03;
      const offset = h & 0x1f;
      let ts = (lastTs & ~0x1f) + offset;
      if (offset < (lastTs & 0x1f)) ts += 0x20;
      lastTs = ts;
      const def = defs.get(local);
      if (!def) break;
      handle(def, pos, ts);
      pos += def.total;
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      // definicja
      const little = buf[pos + 1] === 0;
      const global = little ? dv.getUint16(pos + 2, true) : dv.getUint16(pos + 2, false);
      const n = buf[pos + 4];
      pos += 5;
      const fields: FieldDef[] = [];
      let total = 0;
      for (let i = 0; i < n; i++) {
        const f = { num: buf[pos], size: buf[pos + 1], base: buf[pos + 2] };
        fields.push(f);
        total += f.size;
        pos += 3;
      }
      let devSize = 0;
      if (h & 0x20) {
        const nd = buf[pos++];
        for (let i = 0; i < nd; i++) {
          devSize += buf[pos + 1];
          pos += 3;
        }
      }
      defs.set(local, { global, little, fields, devSize, total: total + devSize });
    } else {
      const def = defs.get(local);
      if (!def) break; // uszkodzony plik
      handle(def, pos, null);
      pos += def.total;
    }
  }

  function handle(def: Def, at: number, compressedTs: number | null) {
    let off = at;
    let lat: number | null = null,
      lon: number | null = null,
      ts: number | null = compressedTs;
    for (const f of def.fields) {
      if (def.global === 20) {
        if (f.num === 0 && f.size === 4) lat = read(off, f, def.little);
        else if (f.num === 1 && f.size === 4) lon = read(off, f, def.little);
        else if (f.num === 253 && f.size === 4) ts = read(off, f, def.little);
      } else if ((def.global === 18 && f.num === 5) || (def.global === 12 && f.num === 0)) {
        const v = read(off, f, def.little);
        if (v != null && sport == null) sport = v;
      } else if (f.num === 253 && f.size === 4) {
        const v = read(off, f, def.little);
        if (v != null) lastTs = v;
      }
      off += f.size;
    }
    if (def.global === 20) {
      if (ts != null) lastTs = ts;
      if (lat != null && lon != null) {
        const t = ts != null ? (ts + FIT_EPOCH) * 1000 : undefined;
        if (t != null && start == null) start = t;
        points.push({ lat: lat * SEMI, lon: lon * SEMI, ...(t != null ? { t } : {}) });
      }
    }
  }

  return { points, sport, start };
}

export const FIT_SPORT_CYCLING = 2;

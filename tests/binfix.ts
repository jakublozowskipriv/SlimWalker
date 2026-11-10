// Budowanie minimalnych plików FIT i ZIP do testów.
import { deflateRawSync, gzipSync } from 'node:zlib';

const FIT_EPOCH = 631065600;
const toSemi = (deg: number) => Math.round((deg * 2 ** 31) / 180);

export function makeFit(pts: { lat: number; lon: number; t: number }[], sport: number | null = 11, compressedEvery = 0): Uint8Array {
  const body: number[] = [];
  const u32 = (v: number) => body.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  // definicja: lokalna 0 → record (20): timestamp, lat, lon
  body.push(0x40, 0, 0, 20, 0, 3, 253, 4, 0x86, 0, 4, 0x85, 1, 4, 0x85);
  // definicja: lokalna 1 → record bez timestampu (do skompresowanych nagłówków)
  body.push(0x41, 0, 0, 20, 0, 2, 0, 4, 0x85, 1, 4, 0x85);
  pts.forEach((p, i) => {
    const ts = Math.round(p.t / 1000) - FIT_EPOCH;
    if (compressedEvery && i % compressedEvery !== 0) {
      body.push(0x80 | (1 << 5) | (ts & 0x1f));
    } else {
      body.push(0x00);
      u32(ts);
    }
    u32(toSemi(p.lat));
    u32(toSemi(p.lon));
  });
  if (sport != null) body.push(0x42, 0, 0, 18, 0, 1, 5, 1, 0x00, 0x02, sport);
  const head = [14, 0x20, 0, 0, ...[0, 0, 0, 0], 0x2e, 0x46, 0x49, 0x54, 0, 0];
  const n = body.length;
  head[4] = n & 255;
  head[5] = (n >>> 8) & 255;
  head[6] = (n >>> 16) & 255;
  head[7] = (n >>> 24) & 255;
  return new Uint8Array([...head, ...body, 0, 0]);
}

export function makeZip(files: { name: string; data: Uint8Array; store?: boolean }[]): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const comp = f.store ? Buffer.from(f.data) : deflateRawSync(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(f.store ? 0 : 8, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    chunks.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(f.store ? 0 : 8, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...chunks, cd, eocd]));
}

export const gz = (d: Uint8Array) => new Uint8Array(gzipSync(d));

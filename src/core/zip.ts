// Czytnik ZIP oparty na Blob.slice: czyta tylko katalog i wybrane pliki,
// więc kilkusetmegabajtowy eksport Apple Zdrowie nie trafia w całości do pamięci.
// Obsługuje metody 0 (store) i 8 (deflate) oraz ZIP64.

export interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);
const u64 = (d: DataView, o: number) => Number(d.getBigUint64(o, true));

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

export async function isZip(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false;
  const d = await bytes(blob, 0, 4);
  return u32(d, 0) === 0x04034b50;
}

export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(blob.size, 66000);
  const tail = await bytes(blob, blob.size - tailLen, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Uszkodzony plik ZIP');
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOff = u32(tail, eocd + 16);
  // ZIP64: lokalizator tuż przed EOCD
  if ((cdOff === 0xffffffff || count === 0xffff) && eocd >= 20 && u32(tail, eocd - 20) === 0x07064b50) {
    const z64 = u64(tail, eocd - 20 + 8);
    const rec = await bytes(blob, z64, z64 + 56);
    count = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOff = u64(rec, 48);
  }
  const cd = await bytes(blob, cdOff, cdOff + cdSize);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    let compSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    const nl = u16(cd, p + 28),
      xl = u16(cd, p + 30),
      cl = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    // pole extra ZIP64 (0x0001)
    let x = p + 46 + nl;
    const xEnd = x + xl;
    while (x + 4 <= xEnd) {
      const id = u16(cd, x),
        len = u16(cd, x + 2);
      if (id === 1) {
        let q = x + 4;
        if (size === 0xffffffff) ((size = u64(cd, q)), (q += 8));
        if (compSize === 0xffffffff) ((compSize = u64(cd, q)), (q += 8));
        if (offset === 0xffffffff) offset = u64(cd, q);
      }
      x += 4 + len;
    }
    if (!name.endsWith('/')) out.push({ name, method, compSize, size, offset });
    p += 46 + nl + xl + cl;
  }
  return out;
}

export async function readEntry(blob: Blob, e: ZipEntry): Promise<Uint8Array> {
  const lh = await bytes(blob, e.offset, e.offset + 30);
  if (u32(lh, 0) !== 0x04034b50) throw new Error('Uszkodzony wpis ZIP: ' + e.name);
  const start = e.offset + 30 + u16(lh, 26) + u16(lh, 28);
  const raw = blob.slice(start, start + e.compSize);
  if (e.method === 0) return new Uint8Array(await raw.arrayBuffer());
  if (e.method !== 8) throw new Error(`Nieobsługiwana kompresja (${e.method}): ${e.name}`);
  return inflate(raw, 'deflate-raw');
}

export async function inflate(blob: Blob, format: 'deflate-raw' | 'gzip'): Promise<Uint8Array> {
  const stream = blob.stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

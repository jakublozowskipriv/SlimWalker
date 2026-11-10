// Lekki parser GPX (trkpt / rtept / wpt-fallback) działający w przeglądarce i w Node.
import type { TrackPoint } from './match.ts';

export interface ParsedTrack {
  name: string | null;
  points: TrackPoint[];
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  return m ? parseFloat(m[1]) : NaN;
};

export function parseGpx(xml: string): ParsedTrack {
  const nameM = xml.match(/<(?:trk|metadata)>[\s\S]*?<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/);
  const points: TrackPoint[] = [];
  const re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const lat = attr(m[2], 'lat');
    const lon = attr(m[2], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const p: TrackPoint = { lat, lon };
    const body = m[4];
    if (body) {
      const tm = body.match(/<time>\s*([^<]+?)\s*<\/time>/);
      if (tm) {
        const t = Date.parse(tm[1]);
        if (Number.isFinite(t)) p.t = t;
      }
    }
    points.push(p);
  }
  return { name: nameM ? nameM[1].trim() || null : null, points };
}

export function toGpx(name: string, pts: TrackPoint[]): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
  const body = pts
    .map(
      (p) =>
        `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.t ? `<time>${new Date(p.t).toISOString()}</time>` : ''}</trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Mgła Poznania" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(name)}</name><trkseg>\n${body}\n</trkseg></trk></gpx>\n`;
}

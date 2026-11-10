// Karta spaceru do udostępnienia: PNG 1080×1350 w stylu ryciny (mapa, mgła, bursztynowe ulice, statystyki).
import type { Engine } from '../engine.ts';
import type { WalkMeta } from '../store.ts';
import { fmtKm, fmtPct } from '../core/progress.ts';
import { KX, KY, type LonLat } from '../core/geo.ts';
import { smokeTexture } from './fog.ts';
import { plural } from './util.ts';

const W = 1080,
  H = 1350;
const SERIF = '"Fraunces Variable", Fraunces, Georgia, serif';
const SANS = '"Inter Variable", Inter, system-ui, sans-serif';

function rose(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#C9A06A';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = i === 3 ? '#E3A440' : 'rgba(201,160,106,.55)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.lineTo(r * 0.16, 0);
    ctx.lineTo(-r * 0.16, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

export async function renderWalkCard(engine: Engine, walk: WalkMeta): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`600 64px ${SERIF}`),
    document.fonts.load(`italic 400 30px ${SERIF}`),
    document.fonts.load(`500 28px ${SANS}`),
  ]).catch(() => {});
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // Tło i ramka
  const g = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, H);
  g.addColorStop(0, '#2A1F14');
  g.addColorStop(1, '#17120D');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#4A3A28';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(201,160,106,.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  // Nagłówek
  rose(ctx, 112, 116, 44);
  ctx.fillStyle = '#C9A06A';
  ctx.font = `500 24px ${SANS}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('MGŁA POZNANIA', 180, 96);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#B5A486';
  ctx.font = `italic 400 30px ${SERIF}`;
  const date = walk.start ? new Date(walk.start).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  ctx.fillText(date ? `Dziennik wędrówki · ${date}` : 'Dziennik wędrówki', 180, 140);

  ctx.fillStyle = '#F0E4CC';
  ctx.font = `600 62px ${SERIF}`;
  const lines = wrap(ctx, walk.name, W - 140, 2);
  lines.forEach((l, i) => ctx.fillText(l, 70, 236 + i * 70));
  const top = 236 + (lines.length - 1) * 70 + 40;

  // Panel mapy
  const px = 60,
    py = top,
    pw = W - 120,
    ph = 1060 - top;
  const trail = engine.trails.get(walk.id) ?? [];
  const pts = trail.flat();
  const xs = pts.map((p) => p[0] * KX),
    ys = pts.map((p) => p[1] * KY);
  let [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const padM = Math.max(150, 0.12 * Math.max(maxX - minX, maxY - minY));
  minX -= padM;
  maxX += padM;
  minY -= padM;
  maxY += padM;
  // dopasowanie proporcji do panelu
  const scale = Math.min(pw / (maxX - minX), ph / (maxY - minY));
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const P = (ll: LonLat): [number, number] => [px + pw / 2 + (ll[0] * KX - cx) * scale, py + ph / 2 - (ll[1] * KY - cy) * scale];
  const vx0 = cx - pw / 2 / scale,
    vx1 = cx + pw / 2 / scale,
    vy0 = cy - ph / 2 / scale,
    vy1 = cy + ph / 2 / scale;
  const inView = (ll: LonLat[]) => ll.some((p) => p[0] * KX > vx0 && p[0] * KX < vx1 && p[1] * KY > vy0 && p[1] * KY < vy1);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 26);
  ctx.clip();
  ctx.fillStyle = '#2B2117';
  ctx.fillRect(px, py, pw, ph);
  const poly = (rings: LonLat[][], fill: string) => {
    ctx.beginPath();
    for (const r of rings) r.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
  };
  for (const pk of engine.city.parks) if (inView(pk.ll[0])) poly(pk.ll, '#332719');
  for (const w of engine.city.water) if (inView(w)) poly([w], '#16110C');
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const r of engine.city.river) {
    ctx.strokeStyle = '#8A6C46';
    ctx.lineWidth = Math.max(10, 60 * scale);
    ctx.beginPath();
    r.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.stroke();
    ctx.strokeStyle = '#16110C';
    ctx.lineWidth = Math.max(7, 60 * scale - 4);
    ctx.stroke();
  }
  const widths = [5, 3.6, 2.6, 1.2];
  const colors = ['#A07B50', '#8A6A45', '#76593A', '#5E4A32'];
  const visible = engine.city.segs.filter((s) => inView(s.ll));
  for (const cls of [3, 2, 1, 0] as const)
    for (const s of visible) {
      if (s.cls !== cls) continue;
      ctx.strokeStyle = colors[cls];
      ctx.lineWidth = widths[cls] * Math.min(1.6, Math.max(0.7, scale * 2.5));
      ctx.beginPath();
      s.ll.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
      ctx.stroke();
    }

  // Mgła z wyciętą trasą
  const fog = document.createElement('canvas');
  fog.width = pw;
  fog.height = ph;
  const f = fog.getContext('2d')!;
  const pat = f.createPattern(smokeTexture(256, 7, [20, 15, 10], [0.78, 0.93]), 'repeat')!;
  pat.setTransform(new DOMMatrix([2, 0, 0, 2, 0, 0]));
  f.fillStyle = pat;
  f.fillRect(0, 0, pw, ph);
  f.globalCompositeOperation = 'destination-out';
  f.lineCap = f.lineJoin = 'round';
  const r = Math.max(26, 55 * scale);
  for (const [k, a] of [[2.6, 0.12], [2.0, 0.2], [1.5, 0.32], [1.1, 0.55], [0.75, 1]] as const) {
    f.globalAlpha = a;
    f.lineWidth = 2 * r * k;
    for (const piece of engine.trails.values())
      for (const pc of piece) {
        if (!inView(pc)) continue;
        f.beginPath();
        pc.forEach((p, i) => {
          const [x, y] = P(p);
          if (i) f.lineTo(x - px, y - py);
          else f.moveTo(x - px, y - py);
        });
        f.stroke();
      }
  }
  ctx.drawImage(fog, px, py);

  // Odkryte ulice: bursztynowa poświata
  const disc = visible.filter((s) => engine.progress.discovered.has(s.id));
  ctx.shadowColor = 'rgba(227,164,64,.9)';
  ctx.shadowBlur = 18;
  for (const s of disc) {
    ctx.strokeStyle = s.cls === 3 ? '#C9A06A' : '#E3A440';
    ctx.lineWidth = s.cls === 3 ? 3 : 5;
    ctx.beginPath();
    s.ll.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // winieta panelu
  const v = ctx.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.35, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.75);
  v.addColorStop(0, 'rgba(10,7,4,0)');
  v.addColorStop(1, 'rgba(10,7,4,.6)');
  ctx.fillStyle = v;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();
  ctx.strokeStyle = '#4A3A28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 26);
  ctx.stroke();
  rose(ctx, px + pw - 64, py + ph - 64, 36);

  // Statystyki
  const stats: [string, string, string][] = [
    [fmtKm(walk.distance), 'pieszo', '#F0E4CC'],
    [`+${walk.newStreets.length}`, plural(walk.newStreets.length, 'nowa ulica', 'nowe ulice', 'nowych ulic'), '#E3A440'],
    [`${fmtPct(engine.progress.city.pct)}%`, 'Poznania odkryte', '#F0E4CC'],
  ];
  stats.forEach(([big, small, col], i) => {
    const x = 70 + i * ((W - 140) / 3);
    ctx.fillStyle = col;
    ctx.font = `600 64px ${SERIF}`;
    ctx.fillText(big, x, 1160);
    ctx.fillStyle = '#B5A486';
    ctx.font = `400 26px ${SANS}`;
    ctx.fillText(small, x, 1200);
  });
  if (walk.newStreets.length) {
    ctx.fillStyle = '#8a7a60';
    ctx.font = `italic 400 26px ${SERIF}`;
    const names = wrap(ctx, walk.newStreets.join(' · '), W - 140, 1)[0];
    ctx.fillText(names, 70, 1262);
  }
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export async function shareBlob(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

import type { Engine } from '../engine.ts';
import { nearestSpot, directionName } from '../core/explore.ts';
import { fmtKm, fmtPct } from '../core/progress.ts';
import { compassRose } from './icons.ts';
import { esc, plural } from './util.ts';
import type { LonLat } from '../core/geo.ts';

export function renderDistricts(root: HTMLElement, engine: Engine, here: LonLat, onPick: (i: number) => void, onSpot: (ll: LonLat) => void) {
  const { districts } = engine.city;
  const prog = engine.progress.districts;
  const visited = prog.filter((p) => p.segs > 0).length;
  const order = districts
    .map((d, i) => ({ d, i, p: prog[i] }))
    .sort((a, b) => b.p.pct - a.p.pct || a.d.name.localeCompare(b.d.name, 'pl'));

  const spot = nearestSpot(engine.city, engine.progress.discovered, here);
  const spotHtml = spot
    ? `<section class="spot-card">
        <div class="kicker">Najbliżej do odsłonięcia</div>
        <h2>${spot.streets[0] ? `Okolice ul. ${esc(spot.streets[0])}` : 'Nieznane ścieżki'}</h2>
        <p class="spot-where">${spot.district >= 0 ? `<i>${esc(districts[spot.district].name)}</i> · ` : ''}${fmtKm(spot.distance)} na ${directionName(spot.bearing)}</p>
        <p><b>+${spot.streets.length}</b> ${plural(spot.streets.length, 'nowa ulica', 'nowe ulice', 'nowych ulic')} na kawałku 300 × 300 m${spot.streets.length > 1 ? `: ${spot.streets.slice(1, 4).map(esc).join(', ')}${spot.streets.length > 4 ? '…' : ''}` : ''}</p>
        <button class="btn primary" id="spot-go">Pokaż na mapie</button>
      </section>`
    : '';

  root.innerHTML = `
    <header class="page-head">${compassRose(40)}<div><h1>Dzielnice</h1><p>${districts.length} osiedli · odwiedzone: ${visited}</p></div></header>
    ${spotHtml}
    <ul class="district-list">
      ${order
        .map(({ d, i, p }) => {
          const unknown = p.segs === 0;
          return `<li><button data-i="${i}" class="${unknown ? 'unknown' : ''}">
            <div class="d-top"><span class="d-name">${esc(d.name)}</span><span class="d-pct">${unknown ? '' : fmtPct(p.pct) + '%'}</span></div>
            ${unknown ? `<div class="d-sub incognita">terra incognita</div>` : `<div class="bar"><i style="width:${Math.max(1.5, p.pct)}%"></i></div><div class="d-sub">${p.streets} z ${p.streetsTotal} ${plural(p.streetsTotal, 'ulicy', 'ulic', 'ulic')}</div>`}
          </button></li>`;
        })
        .join('')}
    </ul>
    <p class="osm-note">Granice osiedli i ulice: © autorzy OpenStreetMap</p>`;
  root.querySelectorAll<HTMLElement>('.district-list button').forEach((b) => (b.onclick = () => onPick(+b.dataset.i!)));
  const go = root.querySelector<HTMLElement>('#spot-go');
  if (go && spot) go.onclick = () => onSpot(spot.center);
}

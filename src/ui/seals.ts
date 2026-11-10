import type { Engine } from '../engine.ts';
import { evaluateSeals, streaks } from '../core/achievements.ts';
import { fmtKm } from '../core/progress.ts';
import { compassRose, navIcons, sealSVG } from './icons.ts';
import { TREASURES, treasureGlyph } from '../data/treasures.ts';
import { pointInRings, toXY } from '../core/geo.ts';
import { esc, plural } from './util.ts';

export interface SealHandlers {
  onWalk: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onTreasure: (id: string) => void;
}

const WALKS_PAGE = 40;

export function renderSeals(root: HTMLElement, engine: Engine, h: SealHandlers, allWalks = false) {
  const { onWalk, onDelete, onShare, onTreasure } = h;
  const districtOf = (ll: [number, number]) => {
    const [x, y] = toXY(ll[0], ll[1]);
    return engine.city.districts.find((d) => pointInRings(x, y, d.xy))?.name ?? 'Poznań';
  };
  const seals = evaluateSeals(engine.city, engine.cov, engine.progress, engine.walks, { treasures: engine.treasures.size });
  const earned = seals.filter((s) => s.earned).length;
  const km = engine.walks.reduce((s, w) => s + w.distance, 0);
  const st = streaks(engine.walks);
  const p = engine.progress.city;
  const walks = [...engine.walks].sort((a, b) => (b.start ?? b.addedAt) - (a.start ?? a.addedAt));
  const date = (t: number | null) =>
    t ? new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'bez daty';

  root.innerHTML = `
    <header class="page-head">${compassRose(40)}<div><h1>Osiągnięcia</h1><p>Pieczęcie: ${earned} z ${seals.length}</p></div></header>
    <section class="stats-grid">
      <div class="stat"><b>${fmtKm(km)}</b><span>przebyte pieszo</span></div>
      <div class="stat"><b>${p.streets}</b><span>${plural(p.streets, 'odsłonięta ulica', 'odsłonięte ulice', 'odsłoniętych ulic')}</span></div>
      <div class="stat"><b>${st.current} <small>${plural(st.current, 'dzień', 'dni', 'dni')}</small></b><span>seria (rekord: ${st.longest})</span></div>
      <div class="stat"><b>${engine.walks.length}</b><span>${plural(engine.walks.length, 'spacer', 'spacery', 'spacerów')}</span></div>
    </section>
    <section class="seal-grid">
      ${seals
        .map(
          (s) => `<article class="seal-card ${s.earned ? 'earned' : ''}" title="${esc(s.desc)}">
            ${sealSVG(s.glyph, { earned: s.earned })}
            <h3>${esc(s.name)}</h3>
            <p>${esc(s.desc)}</p>
            ${s.earned ? `<span class="seal-ok">zdobyta</span>` : `<div class="bar small"><i style="width:${(100 * s.value) / s.goal}%"></i></div><span class="seal-lbl">${esc(s.label)}</span>`}
          </article>`,
        )
        .join('')}
    </section>
    <h2 class="section-title">Skarby <small style="font-family:var(--sans);font-size:14px;color:var(--muted);font-weight:400">${engine.treasures.size} z ${TREASURES.length}</small></h2>
    <section class="treasure-grid">
      ${TREASURES.map((t) => {
        const f = engine.treasures.has(t.id);
        return `<button class="treasure-card ${f ? 'found' : ''}" data-tr="${t.id}">
          <span class="treasure ${f ? 'found' : 'hidden-t'}">${f ? `<svg viewBox="-20 -20 40 40">${treasureGlyph(t.glyph)}</svg>` : '<span>?</span>'}</span>
          <b>${f ? esc(t.name) : 'ukryty we mgle'}</b>${f ? '' : `<small>${esc(districtOf(t.ll))}</small>`}</button>`;
      }).join('')}
    </section>
    <h2 class="section-title">Dziennik wędrówek</h2>
    ${
      walks.length
        ? `<ul class="walk-list">${(allWalks ? walks : walks.slice(0, WALKS_PAGE))
            .map(
              (w) => `<li>
          <button class="walk-main" data-walk="${esc(w.id)}"><span class="w-name">${esc(w.name)}</span><span class="w-sub">${date(w.start)} · ${fmtKm(w.distance)} · <em>+${w.newStreets.length} ${plural(w.newStreets.length, 'ulica', 'ulice', 'ulic')}</em></span></button>
          <button class="walk-share" data-share="${esc(w.id)}" aria-label="Karta spaceru">${navIcons.share}</button>
          <button class="walk-del" data-del="${esc(w.id)}" aria-label="Usuń spacer">×</button>
        </li>`,
            )
            .join('')}</ul>${!allWalks && walks.length > WALKS_PAGE ? `<button class="btn secondary" id="more-walks" style="width:100%;margin-top:10px">Pokaż wszystkie (${walks.length})</button>` : ''}`
        : `<p class="placeholder">Jeszcze żadnej wędrówki. Mapa czeka.</p>`
    }`;
  root.querySelectorAll<HTMLElement>('[data-tr]').forEach((b) => (b.onclick = () => onTreasure(b.dataset.tr!)));
  root.querySelectorAll<HTMLElement>('[data-share]').forEach((b) => (b.onclick = () => onShare(b.dataset.share!)));
  const more = root.querySelector<HTMLElement>('#more-walks');
  if (more) more.onclick = () => renderSeals(root, engine, h, true);
  root.querySelectorAll<HTMLElement>('[data-walk]').forEach((b) => (b.onclick = () => onWalk(b.dataset.walk!)));
  root.querySelectorAll<HTMLElement>('[data-del]').forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm('Usunąć ten spacer? Mgła wróci tam, gdzie tylko on ją rozwiał.')) onDelete(b.dataset.del!);
      }),
  );
}

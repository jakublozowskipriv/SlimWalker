import type { Engine } from '../engine.ts';
import { evaluateSeals, streaks } from '../core/achievements.ts';
import { fmtKm } from '../core/progress.ts';
import { compassRose, sealSVG } from './icons.ts';
import { esc, plural } from './util.ts';

export function renderSeals(root: HTMLElement, engine: Engine, onWalk: (id: string) => void, onDelete: (id: string) => void) {
  const seals = evaluateSeals(engine.city, engine.cov, engine.progress, engine.walks);
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
    <h2 class="section-title">Dziennik wędrówek</h2>
    ${
      walks.length
        ? `<ul class="walk-list">${walks
            .map(
              (w) => `<li>
          <button class="walk-main" data-walk="${esc(w.id)}"><span class="w-name">${esc(w.name)}</span><span class="w-sub">${date(w.start)} · ${fmtKm(w.distance)} · <em>+${w.newStreets.length} ${plural(w.newStreets.length, 'ulica', 'ulice', 'ulic')}</em></span></button>
          <button class="walk-del" data-del="${esc(w.id)}" aria-label="Usuń spacer">×</button>
        </li>`,
            )
            .join('')}</ul>`
        : `<p class="placeholder">Jeszcze żadnej wędrówki. Mapa czeka.</p>`
    }`;
  root.querySelectorAll<HTMLElement>('[data-walk]').forEach((b) => (b.onclick = () => onWalk(b.dataset.walk!)));
  root.querySelectorAll<HTMLElement>('[data-del]').forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm('Usunąć ten spacer? Mgła wróci tam, gdzie tylko on ją rozwiał.')) onDelete(b.dataset.del!);
      }),
  );
}

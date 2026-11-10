import './styles.css';
import * as maplibregl from 'maplibre-gl';
import { Engine, type WalkResult } from './engine.ts';
import { CityMap } from './ui/map.ts';
import { compassRose, navIcons, sealSVG } from './ui/icons.ts';
import { parseGpx } from './core/gpx.ts';
import { fmtKm, fmtPct } from './core/progress.ts';
import { directionName, randomTarget } from './core/explore.ts';
import { evaluateSeals } from './core/achievements.ts';
import type { LonLat } from './core/geo.ts';
import { $, h, openSheet, toast, hideToast, plural, esc } from './ui/util.ts';
import { renderDistricts } from './ui/districts.ts';
import { renderSeals } from './ui/seals.ts';
import { Recorder } from './ui/record.ts';
import { getKV, setKV } from './store.ts';

const engine = new Engine();
const app = $('#app');
const STARY_RYNEK: LonLat = [16.9342, 52.4083];

type Tab = 'map' | 'districts' | 'seals';

async function boot() {
  try {
    await engine.init();
  } catch (e) {
    console.error(e);
    $('.boot p').textContent = 'Nie udało się wczytać mapy Poznania. Odśwież stronę.';
    return;
  }
  app.innerHTML = '';
  app.append(
    h(`<section class="screen active" data-screen="map">
        <div id="map"></div>
        <div class="map-vignette"></div>
        <header class="topbar">
          ${compassRose(40)}
          <div class="brand"><h1>Mgła Poznania</h1><small>Mapa odkrywcy</small></div>
          <div class="pct"><b id="pct">0</b><small id="pct-sub">odkrytego miasta</small></div>
        </header>
        <div class="map-tools">
          <button class="icon-btn" id="btn-locate" aria-label="Pokaż moją pozycję">${navIcons.locate}</button>
          <button class="icon-btn" id="btn-dice" aria-label="Losuj cel spaceru">${navIcons.dice}</button>
        </div>
        ${compassRose(64, 'rose corner-rose')}
        <div class="dock">
          <button class="last-walk" id="last-walk" hidden></button>
          <div class="actions">
            <button class="btn primary" id="btn-walk">${navIcons.walk}<span>Wyrusz na spacer</span></button>
            <button class="btn secondary" id="btn-gpx" aria-label="Wgraj pliki GPX">${navIcons.upload}<span>GPX</span></button>
          </div>
        </div>
        <input type="file" id="gpx-input" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple hidden />
      </section>`),
    h(`<section class="screen scroll" data-screen="districts"></section>`),
    h(`<section class="screen scroll" data-screen="seals"></section>`),
    h(`<nav class="nav">
        <button data-tab="map" class="active">${navIcons.map}<span>Mapa</span></button>
        <button data-tab="districts">${navIcons.districts}<span>Dzielnice</span></button>
        <button data-tab="seals">${navIcons.seals}<span>Osiągnięcia</span></button>
      </nav>`),
    h(`<div class="sheet-backdrop"></div>`),
    h(`<div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div><div class="sheet-body"></div></div>`),
    h(`<div class="toast"></div>`),
    h(`<div class="drop-hint">Upuść pliki GPX</div>`),
  );

  const cmap = new CityMap($('#map'), engine.city);
  (window as unknown as { __mgla: unknown }).__mgla = { engine, cmap };
  await cmap.ready;
  cmap.fog.setTrails([...engine.trails.values()].flat());
  cmap.setDiscovered(engine.progress.discovered);
  if (engine.walks.length) cmap.fitTrail([...engine.trails.values()].flat(), 0);
  // pieczęcie zdobyte wcześniej nie powinny „wyskakiwać” przy starcie
  const known = new Set<string>((await getKV<string[]>('seals-seen')) ?? []);
  const sealsNow = () => evaluateSeals(engine.city, engine.cov, engine.progress, engine.walks);
  if (!known.size) for (const s of sealsNow()) if (s.earned) known.add(s.id);
  refresh();

  // --- Gdzie jestem (do podpowiedzi) ---
  let here: LonLat | null = null;
  const fallbackHere = (): LonLat => {
    const w = engine.lastWalk();
    const tr = w ? engine.trails.get(w.id) : null;
    const last = tr?.[tr.length - 1];
    return last ? last[last.length - 1] : STARY_RYNEK;
  };
  const locate = () =>
    new Promise<LonLat>((res) => {
      if (!('geolocation' in navigator)) return res(here ?? fallbackHere());
      navigator.geolocation.getCurrentPosition(
        (p) => res((here = [p.coords.longitude, p.coords.latitude])),
        () => res(here ?? fallbackHere()),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 },
      );
    });

  // --- Nawigacja ---
  let tab: Tab = 'map';
  const show = (t: Tab) => {
    tab = t;
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === t));
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', (s as HTMLElement).dataset.screen === t));
    if (t === 'districts') renderDistrictsScreen();
    if (t === 'seals')
      renderSeals($('[data-screen=seals]'), engine, (id) => (show('map'), cmap.fitTrail(engine.trails.get(id) ?? [])), async (id) => {
        await engine.removeWalk(id);
        cmap.fog.setTrails([...engine.trails.values()].flat());
        cmap.setDiscovered(engine.progress.discovered);
        refresh();
        show('seals');
      });
    if (t === 'map') cmap.map.resize();
  };
  const renderDistrictsScreen = () =>
    renderDistricts(
      $('[data-screen=districts]'),
      engine,
      here ?? fallbackHere(),
      (i) => (show('map'), cmap.fitTrail(engine.city.districts[i].ll)),
      (ll) => {
        show('map');
        setTarget(ll);
        cmap.map.easeTo({ center: ll, zoom: 15.5, duration: 900 });
      },
    );
  document.querySelectorAll<HTMLElement>('.nav button').forEach((b) => (b.onclick = () => show(b.dataset.tab as Tab)));
  // Pozycja przydaje się na ekranie Dzielnic; pytamy dopiero, gdy już dano zgodę
  navigator.permissions?.query({ name: 'geolocation' }).then((s) => {
    if (s.state === 'granted') void locate().then(() => tab === 'districts' && renderDistrictsScreen());
  }).catch(() => {});

  // --- Import GPX ---
  const input = $<HTMLInputElement>('#gpx-input');
  $('#btn-gpx').onclick = () => input.click();
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    await importFiles(files);
  };
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => (e.preventDefault(), dragDepth++, $('.drop-hint').classList.add('on')));
  window.addEventListener('dragleave', () => --dragDepth <= 0 && $('.drop-hint').classList.remove('on'));
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('.drop-hint').classList.remove('on');
    await importFiles([...(e.dataTransfer?.files ?? [])]);
  });

  async function importFiles(files: File[]) {
    const gpx = files.filter((f) => /\.gpx$/i.test(f.name) || f.type.includes('xml'));
    if (!gpx.length) return toast('To nie wygląda na plik GPX');
    if (tab !== 'map') show('map');
    const results: WalkResult[] = [];
    let skipped = 0;
    for (const [i, f] of gpx.entries()) {
      if (gpx.length > 1) toast(`Wczytuję ${i + 1} z ${gpx.length}…`, 60000);
      try {
        const parsed = parseGpx(await f.text());
        const r = await engine.addWalk({ name: parsed.name ?? f.name.replace(/\.gpx$/i, ''), source: 'gpx', points: parsed.points });
        if (r.walk) results.push(r);
        else skipped++;
      } catch (e) {
        console.error(e);
        skipped++;
      }
    }
    hideToast();
    if (!results.length) return toast(skipped ? 'Te trasy już są na mapie' : 'Brak punktów w pliku');
    const trails = results.flatMap((r) => engine.trails.get(r.walk!.id) ?? []);
    cmap.fitTrail(trails);
    await new Promise((r) => setTimeout(r, 950));
    await cmap.fog.reveal(trails, results.length > 1 ? 2600 : 2200);
    cmap.setDiscovered(engine.progress.discovered);
    refresh();
    summarySheet(results, skipped);
  }

  // --- Nagrywanie na żywo ---
  const recorder = new Recorder(cmap, {
    onFinish: async (points) => {
      if (points.length < 2) return toast('Za mało punktów GPS, spacer nie został zapisany');
      const start = new Date(points[0].t ?? Date.now());
      const name = `Spacer ${start.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}, ${start.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
      const r = await engine.addWalk({ name, source: 'live', points });
      if (!r.walk) return toast('Ten spacer już jest zapisany');
      cmap.fog.setTrails([...engine.trails.values()].flat());
      cmap.setDiscovered(engine.progress.discovered);
      refresh();
      summarySheet([r], 0);
    },
    onPosition: (ll) => (here = ll),
    toast,
  });
  $('#btn-walk').onclick = () => recorder.toggle();
  $('#btn-locate').onclick = () => recorder.locateOnce();
  $('#last-walk').onclick = () => {
    const w = engine.lastWalk();
    if (w) cmap.fitTrail(engine.trails.get(w.id) ?? []);
  };

  // --- Losuj cel ---
  let targetMarker: maplibregl.Marker | null = null;
  function setTarget(ll: LonLat | null) {
    targetMarker?.remove();
    targetMarker = null;
    if (!ll) return void setKV('target', null);
    const el = h(`<div class="target-pin"><span></span></div>`);
    targetMarker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(cmap.map);
    void setKV('target', { ll, day: new Date().toDateString() });
  }
  const savedTarget = await getKV<{ ll: LonLat; day: string } | null>('target');
  if (savedTarget && savedTarget.day === new Date().toDateString()) setTarget(savedTarget.ll);

  $('#btn-dice').onclick = async () => {
    const from = await locate();
    const t = randomTarget(engine.city, engine.progress.discovered, from);
    if (!t) return toast('Nie ma już czego odkrywać… serio?');
    setTarget(t.center);
    const lons = [from[0], t.center[0]],
      lats = [from[1], t.center[1]];
    cmap.map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 140, bottom: 320, left: 60, right: 60 }, maxZoom: 15.5, duration: 900 },
    );
    const dname = t.district >= 0 ? engine.city.districts[t.district].name : null;
    openSheet(`
      <div class="kicker">Dzisiejszy cel</div>
      <h2><span class="target-arrow" style="transform:rotate(${t.bearing}deg)">↑</span> Na ${directionName(t.bearing)}</h2>
      <p><b style="color:var(--text)">${fmtKm(t.distance)}</b> stąd${dname ? `, <i style="font-family:var(--serif);color:var(--ivory)">${esc(dname)}</i>` : ''}${t.streets[0] ? ` — okolice ul. ${esc(t.streets[0])}` : ''}.</p>
      <p>Czeka tam <b style="color:var(--accent)">${t.streets.length}</b> ${plural(t.streets.length, 'nieodkryta ulica', 'nieodkryte ulice', 'nieodkrytych ulic')} i ${fmtKm(t.newLen)} mgły do rozwiania.</p>
      <div class="actions" style="margin-top:14px">
        <button class="btn secondary" id="reroll">${navIcons.dice}<span>Losuj ponownie</span></button>
        <button class="btn primary" data-close>Idę!</button>
      </div>`);
    $('#reroll').onclick = () => $('#btn-dice').click();
  };

  function refresh() {
    const p = engine.progress.city;
    $('#pct').innerHTML = `${fmtPct(p.pct)}<sup>%</sup>`;
    $('#pct-sub').textContent = p.streets ? `${p.streets} ${plural(p.streets, 'ulica', 'ulice', 'ulic')} · ${fmtKm(p.discoveredLen)}` : 'odkrytego miasta';
    const w = engine.lastWalk();
    const lw = $('#last-walk');
    lw.hidden = !w;
    if (w) lw.innerHTML = `Ostatni spacer: <b>${fmtKm(w.distance)}</b> · <span class="new">+${w.newStreets.length} ${plural(w.newStreets.length, 'nowa ulica', 'nowe ulice', 'nowych ulic')}</span>`;
    const empty = $('.empty-card');
    if (!engine.walks.length && !empty) {
      $('[data-screen=map]').append(
        h(`<div class="empty-card"><div class="kicker">Terra incognita</div><h3>Całe miasto tonie we mgle</h3><p>Wgraj plik GPX ze starego spaceru albo wyrusz teraz — każda przebyta ulica rozbłyśnie na mapie.</p></div>`),
      );
    } else if (engine.walks.length && empty) empty.remove();
  }

  function newSeals() {
    const fresh = sealsNow().filter((s) => s.earned && !known.has(s.id));
    for (const s of fresh) known.add(s.id);
    void setKV('seals-seen', [...known]);
    return fresh;
  }

  function summarySheet(results: WalkResult[], skipped: number) {
    const dist = results.reduce((s, r) => s + r.walk!.distance, 0);
    const streets = [...new Set(results.flatMap((r) => r.walk!.newStreets))];
    const segs = results.reduce((s, r) => s + r.walk!.newSegs, 0);
    const title = results.length === 1 ? results[0].walk!.name : `${results.length} ${plural(results.length, 'trasa', 'trasy', 'tras')}`;
    const shown = streets.slice(0, 12);
    const fresh = newSeals();
    openSheet(`
      <div class="kicker">${results.length === 1 ? 'Spacer zapisany' : 'Trasy wczytane'}</div>
      <h2>${esc(title)}</h2>
      <div class="stat-row">
        <div class="stat"><b>${fmtKm(dist)}</b><span>pieszo</span></div>
        <div class="stat"><b style="color:var(--accent)">+${streets.length}</b><span>${plural(streets.length, 'nowa ulica', 'nowe ulice', 'nowych ulic')}</span></div>
        <div class="stat"><b>${fmtPct(engine.progress.city.pct)}%</b><span>miasta</span></div>
      </div>
      ${shown.length ? `<div class="street-list">${shown.map((s) => `<span>${esc(s)}</span>`).join('')}${streets.length > shown.length ? `<span class="more">+${streets.length - shown.length} więcej</span>` : ''}</div>` : `<p>${segs ? `Odsłonięto ${segs} ${plural(segs, 'odcinek', 'odcinki', 'odcinków')} znanych już ulic.` : 'Tym razem bez nowych ulic — ale mgła i tak się przerzedziła.'}</p>`}
      ${fresh.length ? `<div class="kicker" style="margin-top:6px">${fresh.length === 1 ? 'Nowa pieczęć' : 'Nowe pieczęcie'}</div><div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">${fresh.map((s) => `<div class="seal-pop">${sealSVG(s.glyph, { earned: true, size: 92 })}<b style="font-family:var(--serif);margin-top:6px">${esc(s.name)}</b></div>`).join('')}</div>` : ''}
      ${skipped ? `<p>Pominięto ${skipped} ${plural(skipped, 'plik', 'pliki', 'plików')} (duplikaty lub puste).</p>` : ''}
      <button class="btn primary" style="width:100%;margin-top:14px" data-close>Dalej w mgłę</button>
    `);
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

boot();

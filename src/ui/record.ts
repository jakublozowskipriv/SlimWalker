// Nagrywanie spaceru na żywo (Geolocation API).
//
// Uczciwie o iOS: Safari/PWA NIE dostaje pozycji, gdy ekran jest zablokowany albo
// aplikacja jest w tle. Dlatego: (1) trzymamy ekran włączony przez Wake Lock API,
// (2) zapisujemy punkty na bieżąco do IndexedDB (zamknięcie/odświeżenie nie gubi spaceru),
// (3) po powrocie z tła nie łączymy dziury prostą linią — fragment po prostu pomijamy.
// Plan B na długie trasy: nagrywaj w natywnej apce i wgraj GPX (patrz README).
import * as maplibregl from 'maplibre-gl';
import type { CityMap } from './map.ts';
import type { TrackPoint } from '../core/match.ts';
import { cleanTrack, walkedDistance } from '../core/match.ts';
import { simplify, toLonLat, type LonLat } from '../core/geo.ts';
import { getKV, setKV, delKV } from '../store.ts';
import { $ } from './util.ts';
import { fmtKm } from '../core/progress.ts';
import { navIcons } from './icons.ts';

interface Opts {
  onFinish: (pts: TrackPoint[]) => void | Promise<void>;
  onPosition?: (ll: LonLat) => void;
  /** Podgląd na żywo: ślad (punkty) do dopasowania, wołany co kilka punktów. */
  onLiveTrack?: (pts: TrackPoint[]) => void;
  toast: (m: string, ms?: number) => void;
}

const LIVE_KEY = 'live-walk';

export class Recorder {
  recording = false;
  points: TrackPoint[] = [];
  private watchId: number | null = null;
  private wake: WakeLockSentinel | null = null;
  private marker: maplibregl.Marker | null = null;
  private timer = 0;
  startedAt = 0;
  private lastSave = 0;
  lastAcc: number | null = null;
  /** Mapa podąża za pozycją, dopóki użytkownik sam jej nie przesunie. */
  follow = true;
  private cmap: CityMap;
  private opts: Opts;

  constructor(cmap: CityMap, opts: Opts) {
    this.cmap = cmap;
    this.opts = opts;
    cmap.map.on('dragstart', () => (this.follow = false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.recording) this.requestWake();
    });
    void this.resumeIfAny();
  }

  private async resumeIfAny() {
    const saved = await getKV<{ startedAt: number; points: TrackPoint[] }>(LIVE_KEY);
    if (!saved) return;
    const last = saved.points[saved.points.length - 1]?.t ?? saved.startedAt;
    if (Date.now() - last > 3 * 3600_000) {
      // stary, porzucony spacer — zapisujemy go zamiast wznawiać
      await delKV(LIVE_KEY);
      if (saved.points.length > 1) await this.opts.onFinish(saved.points);
      return;
    }
    this.points = saved.points;
    this.startedAt = saved.startedAt;
    this.opts.toast('Wznawiam przerwany spacer');
    this.start(true);
  }

  toggle() {
    if (this.recording) void this.stop();
    else this.start();
  }

  private ensureMarker(ll: LonLat) {
    if (!this.marker) {
      const el = document.createElement('div');
      el.className = 'me-dot';
      this.marker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(this.cmap.map);
    } else this.marker.setLngLat(ll);
  }

  locateOnce() {
    if (!('geolocation' in navigator)) return this.opts.toast('Ta przeglądarka nie udostępnia GPS');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll: LonLat = [p.coords.longitude, p.coords.latitude];
        this.ensureMarker(ll);
        this.opts.onPosition?.(ll);
        this.follow = true;
        this.cmap.map.easeTo({ center: ll, zoom: Math.max(this.cmap.map.getZoom(), 15), duration: 800 });
      },
      (e) => this.opts.toast(e.code === 1 ? 'Brak zgody na lokalizację (Ustawienia → Safari → Lokalizacja)' : 'Nie udało się ustalić pozycji'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  private async requestWake() {
    try {
      if ('wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen');
    } catch {
      /* brak wsparcia lub odmowa — trudno */
    }
  }

  start(resumed = false) {
    if (!('geolocation' in navigator)) return this.opts.toast('Ta przeglądarka nie udostępnia GPS');
    this.recording = true;
    if (!resumed) {
      this.points = [];
      this.startedAt = Date.now();
    }
    this.follow = true;
    document.body.classList.add('is-recording');
    this.renderHud();
    void this.requestWake();
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onPos(p),
      (e) => {
        if (e.code === 1) {
          this.opts.toast('Brak zgody na lokalizację (Ustawienia → Safari → Lokalizacja)', 5000);
          void this.stop(true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    this.timer = window.setInterval(() => this.renderHud(), 1000);
    if (!resumed) this.opts.toast('Spacer rozpoczęty — nie blokuj ekranu, mgła odsłania się na bieżąco', 4000);
  }

  private onPos(p: GeolocationPosition) {
    const pt: TrackPoint = { lat: p.coords.latitude, lon: p.coords.longitude, t: p.timestamp, acc: p.coords.accuracy };
    this.lastAcc = p.coords.accuracy;
    const ll: LonLat = [pt.lon, pt.lat];
    this.ensureMarker(ll);
    this.opts.onPosition?.(ll);
    if (this.points.length === 0) this.cmap.map.easeTo({ center: ll, zoom: 16, duration: 900 });
    else if (this.follow) this.cmap.map.easeTo({ center: ll, duration: 600 });
    this.points.push(pt);
    if (this.points.length % 8 === 0) this.opts.onLiveTrack?.(this.points);
    // podgląd odsłaniania mgły na żywo
    const pieces = cleanTrack(this.points).map((pc) => simplify(pc, 2).map((q) => toLonLat(q[0], q[1])));
    this.cmap.fog.setLive(pieces);
    if (Date.now() - this.lastSave > 5000) {
      this.lastSave = Date.now();
      void setKV(LIVE_KEY, { startedAt: this.startedAt, points: this.points });
    }
    this.renderHud();
  }

  async stop(silent = false) {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    clearInterval(this.timer);
    this.recording = false;
    document.body.classList.remove('is-recording');
    try {
      await this.wake?.release();
    } catch {
      /* ignore */
    }
    this.wake = null;
    const pts = this.points;
    this.points = [];
    await delKV(LIVE_KEY);
    this.cmap.fog.setLive([]);
    this.renderHud();
    if (!silent) await this.opts.onFinish(pts);
  }

  private renderHud() {
    const btn = $('#btn-walk');
    if (!btn) return;
    if (!this.recording) {
      btn.classList.remove('danger');
      btn.innerHTML = `${navIcons.walk}<span>Wyrusz na spacer</span>`;
      $('#rec-hud')?.remove();
      return;
    }
    btn.classList.add('danger');
    btn.innerHTML = `<span class="rec-dot"></span><span>Zakończ spacer</span>`;
    let hud = $('#rec-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'rec-hud';
      hud.className = 'rec-hud';
      $('.dock').prepend(hud);
    }
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    const t = `${Math.floor(sec / 3600) ? Math.floor(sec / 3600) + ':' : ''}${String(Math.floor((sec % 3600) / 60)).padStart(Math.floor(sec / 3600) ? 2 : 1, '0')}:${String(sec % 60).padStart(2, '0')}`;
    const acc = this.lastAcc == null ? 'szukam GPS…' : `GPS ±${Math.round(this.lastAcc)} m`;
    hud.innerHTML = `<div><b>${fmtKm(walkedDistance(this.points))}</b><span>dystans</span></div><div><b>${t}</b><span>czas</span></div><div><b class="${this.lastAcc != null && this.lastAcc > 50 ? 'warn' : ''}">${acc}</b><span>sygnał</span></div>`;
  }
}

// Tryb kieszonkowy: czarny ekran (OLED nie świeci czernią), przygaszone liczniki,
// Wake Lock dalej trzyma GPS przy życiu. Wyjście: przytrzymaj ekran przez sekundę.
import { fmtKm } from '../core/progress.ts';
import { plural } from './util.ts';

export interface PocketStats {
  distance: number;
  newStreets: number;
  startedAt: number;
  acc: number | null;
}

export class Pocket {
  private el: HTMLElement | null = null;
  private timer = 0;
  private moveTimer = 0;
  private getStats: () => PocketStats;
  onClose?: () => void;

  constructor(getStats: () => PocketStats) {
    this.getStats = getStats;
  }

  get open() {
    return !!this.el;
  }

  show() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'pocket';
    el.innerHTML = `<div class="pocket-body"><b class="pk-dist"></b><span class="pk-streets"></span><span class="pk-time"></span><span class="pk-acc"></span></div>
      <div class="pocket-hint"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="ring-bg"/><circle cx="20" cy="20" r="16" class="ring"/></svg>przytrzymaj, aby wrócić</div>`;
    document.body.append(el);
    this.el = el;
    let hold = 0;
    const start = (e: Event) => {
      e.preventDefault();
      el.classList.add('holding');
      hold = window.setTimeout(() => this.hide(), 900);
    };
    const cancel = () => {
      el.classList.remove('holding');
      clearTimeout(hold);
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    this.update();
    this.timer = window.setInterval(() => this.update(), 2000);
    // co 30 s przesuwamy napisy, żeby nic nie „wypaliło się” w ekranie
    const move = () => {
      const b = el.querySelector<HTMLElement>('.pocket-body')!;
      b.style.transform = `translate(${(Math.random() - 0.5) * 80}px, ${(Math.random() - 0.5) * 220}px)`;
    };
    move();
    this.moveTimer = window.setInterval(move, 30000);
  }

  hide() {
    clearInterval(this.timer);
    clearInterval(this.moveTimer);
    this.el?.remove();
    this.el = null;
    this.onClose?.();
  }

  private update() {
    if (!this.el) return;
    const s = this.getStats();
    const sec = Math.floor((Date.now() - s.startedAt) / 1000);
    const hh = Math.floor(sec / 3600),
      mm = Math.floor((sec % 3600) / 60);
    this.el.querySelector('.pk-dist')!.textContent = fmtKm(s.distance);
    this.el.querySelector('.pk-streets')!.textContent = `+${s.newStreets} ${plural(s.newStreets, 'nowa ulica', 'nowe ulice', 'nowych ulic')}`;
    this.el.querySelector('.pk-time')!.textContent = hh ? `${hh} h ${mm} min` : `${mm} min`;
    this.el.querySelector('.pk-acc')!.textContent = s.acc == null ? 'szukam GPS…' : s.acc > 50 ? `słaby GPS (±${Math.round(s.acc)} m)` : '';
  }
}

// Ręcznie rysowane SVG: róża wiatrów, pieczęcie, ikony nawigacji.

export function compassRose(size = 40, cls = 'rose'): string {
  const pts = (r1: number, r2: number, n: number, rot = 0) => {
    const out: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = ((i * Math.PI) / n) + rot;
      const r = i % 2 ? r2 : r1;
      out.push(`${(50 + r * Math.sin(a)).toFixed(2)},${(50 - r * Math.cos(a)).toFixed(2)}`);
    }
    return out.join(' ');
  };
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width=".6" stroke-dasharray="1.5 3" opacity=".6"/>
    <polygon points="${pts(30, 7, 4, Math.PI / 4)}" fill="currentColor" opacity=".35"/>
    <polygon points="${pts(44, 8, 4)}" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <polygon points="50,6 56,50 50,50" fill="var(--accent)"/>
    <polygon points="50,6 44,50 50,50" fill="var(--accent)" opacity=".6"/>
    <polygon points="50,94 44,50 50,50" fill="currentColor" opacity=".5"/>
    <circle cx="50" cy="50" r="3.2" fill="var(--bg)" stroke="currentColor" stroke-width="1.2"/>
  </svg>`;
}

/** Ząbkowana pieczęć (lak), w środku glif. */
export function sealSVG(glyph: string, opts: { size?: number; earned?: boolean } = {}): string {
  const { size = 84, earned = false } = opts;
  const teeth = 22;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const r = i % 2 ? 44 : 48;
    pts.push(`${(50 + r * Math.sin(a)).toFixed(2)},${(50 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `<svg class="seal ${earned ? 'earned' : 'locked'}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <polygon points="${pts.join(' ')}" class="seal-body"/>
    <circle cx="50" cy="50" r="36" class="seal-ring"/>
    <circle cx="50" cy="50" r="31" class="seal-ring thin"/>
    <g class="seal-glyph" transform="translate(50 50)">${glyph}</g>
  </svg>`;
}

export const navIcons = {
  map: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.6"/></svg>`,
  districts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4zM13 5h7v9h-7zM4 13h7v6H4zM13 16h7v3h-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  seals: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2 1.6 2.5-.4 1 2.3 2.3 1-.4 2.5 1.6 2-1.6 2 .4 2.5-2.3 1-1 2.3-2.5-.4-2 1.6-2-1.6-2.5.4-1-2.3-2.3-1 .4-2.5L2.5 12l1.6-2-.4-2.5 2.3-1 1-2.3 2.5.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  walk: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="2" fill="currentColor"/><path d="M10 21l2-6 3 3v3M9 12l1.5-4.5L14 9l2 3.5M10.5 7.5 8 9l-1 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  locate: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.7A7 7 0 0 1 15.5 3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3 8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

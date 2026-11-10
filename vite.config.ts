import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE: ścieżka, pod którą stoi aplikacja (np. /SlimWalker/ na GitHub Pages)
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Mgła Poznania',
        short_name: 'Mgła',
        description: 'Odkrywaj Poznań spacerami — mapa we mgle',
        lang: 'pl',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#17120D',
        theme_color: '#17120D',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/poznan.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'city-data' },
          },
        ],
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});

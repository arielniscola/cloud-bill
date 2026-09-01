import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' y no 'autoUpdate': una caja no puede recargarse sola en medio
      // de una venta. El aviso lo muestra useServiceWorker().
      registerType: 'prompt',
      injectRegister: null, // el registro lo hace src/lib/pwa/registerSW.ts
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png'],

      manifest: {
        name: 'Cloud Bill',
        short_name: 'Cloud Bill',
        description: 'Gestión de ventas, stock y facturación',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],

        // El bundle trae react-pdf, xlsx y recharts: los chunks superan el
        // limite por defecto de 2 MiB y quedarian fuera del precache.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,

        // logo.png pesa 1.2 MB y solo se usa en pantallas puntuales: se sirve
        // por red y no ocupa lugar en el precache.
        globIgnores: ['**/logo.png'],

        // SPA: cualquier ruta desconocida resuelve al shell ya cacheado.
        navigateFallback: '/index.html',
        // ...salvo la API, que nunca debe resolver al shell.
        navigateFallbackDenylist: [/^\/api\//],

        cleanupOutdatedCaches: true,
        // Sin runtimeCaching: en Fase 1 las llamadas a /api van siempre a la
        // red. La cache de datos es Fase 2 (IndexedDB, no Cache Storage).
      },
    }),
  ],
})

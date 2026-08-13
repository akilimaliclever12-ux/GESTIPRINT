import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: "GestiPrint — Gestion d'imprimerie",
        short_name: 'GestiPrint',
        description: 'Commandes, clients, dettes, caisse et dépenses pour imprimeries. Hors ligne, USD/FC/BIF. RDC & Burundi.',
        lang: 'fr',
        theme_color: '#0A69AC',
        background_color: '#0A69AC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        importScripts: ['push-sw.js'], // Web Push handlers (public/push-sw.js)
        navigateFallback: '/index.html',
        // standalone static pages (brochure + user guides), not part of the SPA shell
        navigateFallbackDenylist: [/^\/brochure\.html$/, /^\/guide.*\.html$/, /^\/pub.*\.html$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // Offline-first data reads: Supabase REST GET responses. NetworkFirst
            // = fresh whenever there is a connection, cached copy when the device
            // is offline or the network stalls (flaky connectivity). Only GET is
            // cached; writes (POST/PATCH/DELETE) always go to the network and,
            // when offline, are queued by the outbox (lib/outbox.js).
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-data',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the big, rarely-changing vendor libraries into their own chunk
        // so the browser caches them across app updates.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
  server: { port: 5173 },
});

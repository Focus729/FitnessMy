import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

const appBase = process.env.APP_BASE_PATH ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(appBase)) {
  throw new Error('APP_BASE_PATH must be a root-relative directory ending with a slash');
}

export default defineConfig({
  base: appBase,
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Раздел 7.1 / 19.2: встроенные наборы данных — отдельными чанками,
        // они не должны блокировать первый рендер.
        manualChunks(id) {
          if (id.includes('/src/data/seed/foods')) return 'seed-foods';
          if (id.includes('/src/data/seed/exercises')) return 'seed-exercises';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-'))
            return 'charts';
          if (id.includes('node_modules/@zxing')) return 'barcode';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'release-build-identity',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({
            revision: process.env.BUILD_REVISION ?? 'local-unreleased',
            base: appBase,
            builtAt: new Date().toISOString(),
          }),
        });
      },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Lenta',
        short_name: 'Lenta',
        description: 'Питание, тренировки и здоровье. Данные только на вашем устройстве.',
        theme_color: '#F5F6F8',
        background_color: '#F5F6F8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: appBase,
        scope: appBase,
        lang: 'ru',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Authentication and API responses must never become cached SPA documents.
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/cdn-cgi\//, /^\/auth(?:\/|$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Изображения упражнений — cache-first (19.1)
            urlPattern: /\/exercise-images\/.*\.(webp|jpg|png)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Внешние справочники — network-first с откатом на кэш (19.1)
            urlPattern: /^https:\/\/(world\.openfoodfacts\.org|api\.nal\.usda\.gov)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'food-sources',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    // Keep jsdom checks stable alongside the desktop app on memory-limited machines.
    maxWorkers: 1,
    minWorkers: 1,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      // model.ts — только типы, исполняемого кода в нём нет.
      exclude: ['src/domain/**/*.test.ts', 'src/domain/**/index.ts', 'src/domain/model.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});

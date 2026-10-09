/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Hash corto del commit; si no hay repositorio, la fecha de compilación. */
function versionDeCompilacion(): string {
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ')
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return `${hash} · ${fecha} UTC`
  } catch {
    return `${fecha} UTC`
  }
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __VERSION_COMPILACION__: JSON.stringify(versionDeCompilacion()) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': el service worker nuevo espera a que el usuario decida; nunca se recarga solo.
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icono.svg'],
      manifest: {
        name: 'Sigatoka: monitoreo de Sigatoka negra',
        short_name: 'Sigatoka',
        description: 'Monitoreo de Sigatoka negra en plátano y banano con el método de Stover modificado por Gauhl.',
        lang: 'es-MX',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#FFFFFF',
        theme_color: '#1B6A38',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precarga todo el cascarón para abrir sin conexión. Fuentes: solo woff2 (todo navegador
        // con service worker lo soporta) y solo el subconjunto latino, en pesos 400 y 700.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Sin skipWaiting/clientsClaim automáticos: la actualización la decide el usuario.
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/dominio/**/*.ts'],
      exclude: ['src/dominio/**/*.test.ts', 'src/dominio/ayudas.test-util.ts', 'src/dominio/index.ts', 'src/dominio/tipos.ts'],
      reporter: [['text', { skipFull: false }], 'html'],
    },
  },
})

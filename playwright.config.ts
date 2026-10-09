import { defineConfig } from '@playwright/test'

const PUERTO = 4174

/**
 * Pruebas de extremo a extremo en pantalla de celular (390 × 844) contra `vite preview`.
 * Usa el Chrome instalado en el equipo (`channel: 'chrome'`) para no descargar un navegador aparte.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'es-MX',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

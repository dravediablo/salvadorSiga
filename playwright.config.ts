import { execFileSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

const PUERTO = 4174
const PUERTO_DESARROLLO = 5174

/** Llaves de Supabase local (`supabase start`), o null si no está corriendo. Solo se usan en el servidor de desarrollo de las pruebas. */
function supabaseLocal(): { url: string; llave: string } | null {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return { url: process.env.SUPABASE_URL, llave: process.env.SUPABASE_ANON_KEY }
  try {
    const estado = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as { API_URL: string; ANON_KEY: string }
    return { url: estado.API_URL, llave: estado.ANON_KEY }
  } catch {
    return null
  }
}
const supabase = supabaseLocal()

/**
 * Pruebas de extremo a extremo en pantalla de celular (390 × 844).
 * - `captura`: contra `vite preview` (la compilación de producción, sin Supabase).
 * - `sincronizacion`: contra el servidor de desarrollo de Vite con Supabase local, porque el acceso de
 *   desarrollo solo existe fuera de producción. Se omite si `supabase start` no está corriendo.
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
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'es-MX',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'captura', testMatch: 'captura.spec.ts', use: { baseURL: `http://localhost:${PUERTO}` } },
    ...(supabase ? [{ name: 'sincronizacion', testMatch: 'sincronizacion.spec.ts', use: { baseURL: `http://localhost:${PUERTO_DESARROLLO}`, serviceWorkers: 'block' as const } }] : []),
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PUERTO} --strictPort`,
      url: `http://localhost:${PUERTO}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    ...(supabase
      ? [
          {
            command: `npx vite --port ${PUERTO_DESARROLLO} --strictPort`,
            url: `http://localhost:${PUERTO_DESARROLLO}`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
            env: { VITE_SUPABASE_URL: supabase.url, VITE_SUPABASE_ANON_KEY: supabase.llave },
          },
        ]
      : []),
  ],
})

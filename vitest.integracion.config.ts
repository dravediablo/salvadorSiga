import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Pruebas de integración de la sincronización contra Supabase local (`supabase start`).
 * Se corren con `npm run test:integracion`; no forman parte de `npm test`.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.integracion.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})

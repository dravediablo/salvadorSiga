import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/** scripts/verificar-dist.mjs: la compilación de producción no lleva el acceso de desarrollo ni datos de Supabase. */

const carpetas: string[] = []
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true })
})

function verificar(archivos: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  carpetas.push(dir)
  mkdirSync(join(dir, 'assets'))
  for (const [nombre, contenido] of Object.entries(archivos)) writeFileSync(join(dir, nombre), contenido)
  return spawnSync('node', ['scripts/verificar-dist.mjs', dir], { encoding: 'utf8' })
}

describe('verificar-dist', () => {
  it('una compilación limpia pasa', () => {
    const r = verificar({ 'index.html': '<html></html>', 'assets/index.js': 'console.log("Solo en este dispositivo")' })
    expect(r.status).toBe(0)
  })

  it.each([
    ['el texto del acceso de desarrollo', 'x("Acceso de desarrollo (temporal)")'],
    ['el botón del acceso de desarrollo', 'x("Iniciar sesión de desarrollo")'],
    // Se arman al vuelo para que el repositorio no contenga nada con forma de llave real.
    ['una llave pública nueva', `k="${['sb_publishable', 'x'.repeat(30)].join('_')}"`],
    ['una llave secreta nueva', `k="${['sb_secret', 'x'.repeat(30)].join('_')}"`],
    ['un JWT', 'k="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.CRXP1A7WOeoJeXxjNni43kdQ"'],
    ['la URL de un proyecto', 'u="https://abcdefgh.supabase.co"'],
    ['la URL local', 'u="http://127.0.0.1:56321"'],
  ])('falla si aparece %s', (_nombre, contenido) => {
    const r = verificar({ 'assets/index.js': contenido })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('assets')
  })

  it('falla si no hay nada que revisar', () => {
    expect(verificar({}).status).toBe(1)
  })
})

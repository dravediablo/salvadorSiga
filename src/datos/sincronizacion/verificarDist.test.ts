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

function jwt(carga: object): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${parte({ alg: 'HS256', typ: 'JWT' })}.${parte(carga)}.${'x'.repeat(30)}`
}

describe('verificar-dist', () => {
  it('una compilación limpia pasa', () => {
    const r = verificar({ 'index.html': '<html></html>', 'assets/index.js': 'console.log("Solo en este dispositivo")' })
    expect(r.status).toBe(0)
  })

  it.each([
    ['la URL de un proyecto de Supabase', 'u="https://abcdefgh.supabase.co"'],
    ['una llave pública nueva (sb_publishable_…)', `k="${['sb_publishable', 'x'.repeat(30)].join('_')}"`],
    ['un JWT con rol anon', `k="${jwt({ role: 'anon', iss: 'supabase' })}"`],
  ])('ACEPTA %s: en producción sí van', (_nombre, contenido) => {
    expect(verificar({ 'assets/index.js': contenido }).status).toBe(0)
  })

  it.each([
    ['el texto del acceso de desarrollo', 'x("Acceso de desarrollo (temporal)")'],
    ['el botón del acceso de desarrollo', 'x("Iniciar sesión de desarrollo")'],
    // Se arman al vuelo para que el repositorio no contenga nada con forma de llave real.
    ['una llave secreta (sb_secret_…)', `k="${['sb_secret', 'x'.repeat(30)].join('_')}"`],
    ['un JWT con rol service_role', `k="${jwt({ role: 'service_role', iss: 'supabase' })}"`],
    ['la PIMIENTA', 'const p = process.env.PIMIENTA'],
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

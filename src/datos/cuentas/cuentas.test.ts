import { describe, expect, it } from 'vitest'
import {
  aliasBase, aliasUnico, contrasenaDerivada, correoSintetico, esPinValido, generarPin, mensajeBloqueo, normalizarAlias, normalizarCodigo,
} from '../../../supabase/functions/_compartido/cuentas'

/** Reglas de las cuentas de operador (las usan las funciones del servidor; aquí se prueban sin Deno). */

describe('alias', () => {
  it.each([
    ['Juan Pérez', 'juan'],
    ['  María José  ', 'maria'],
    ['Ñandú López', 'nandu'],
    ['José-Luis', 'joseluis'],
    ['ÁNGEL', 'angel'],
    ['Pedro2', 'pedro2'],
    ['', 'operador'],
    ['  ', 'operador'],
    ['@@@', 'operador'],
    ['Ximenaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'ximenaaaaaaaaaaaaaaaaaaa'],
  ])('%s → %s', (nombre, alias) => {
    expect(aliasBase(nombre)).toBe(alias)
  })

  it('siempre cumple el formato de la base: minúsculas y números, sin acentos ni espacios', () => {
    for (const n of ['Zoé', 'Ünal', 'a b c', 'O\'Brien', 'Ana María', '日本']) expect(aliasBase(n)).toMatch(/^[a-z0-9]{1,30}$/)
  })

  it('es único dentro del rancho: juan, juan2, juan3…', () => {
    const usados = new Set<string>()
    const alias: string[] = []
    for (let i = 0; i < 4; i++) {
      const a = aliasUnico('Juan', usados)
      usados.add(a)
      alias.push(a)
    }
    expect(alias).toEqual(['juan', 'juan2', 'juan3', 'juan4'])
    expect(aliasUnico('Juan', new Set(['juan', 'juan3']))).toBe('juan2')
    expect(aliasUnico('Pedro', new Set(['juan']))).toBe('pedro')
  })
})

describe('PIN', () => {
  it('son 6 dígitos, con ceros a la izquierda', () => {
    for (let i = 0; i < 2000; i++) expect(generarPin()).toMatch(/^\d{6}$/)
  })

  it('se reparten parejo: todos los dígitos aparecen en todas las posiciones (2000 PIN)', () => {
    const cuentas = Array.from({ length: 6 }, () => new Array<number>(10).fill(0))
    for (let i = 0; i < 6000; i++) [...generarPin()].forEach((d, pos) => cuentas[pos][Number(d)]++)
    for (const pos of cuentas) for (const n of pos) expect(n).toBeGreaterThan(450) // esperado 600 ± 3σ ≈ 600 ± 66
  })

  it('casi nunca se repiten', () => {
    expect(new Set(Array.from({ length: 300 }, generarPin)).size).toBeGreaterThan(290)
  })

  it('esPinValido', () => {
    expect(esPinValido('012345')).toBe(true)
    for (const x of ['12345', '1234567', 'abcdef', '12 345', '', 123456, null, undefined]) expect(esPinValido(x)).toBe(false)
  })
})

describe('contraseña derivada', () => {
  const pimienta = 'pimienta-de-prueba'
  const id = '3f2b8c1e-0000-4000-8000-000000000001'

  it('es HMAC-SHA256(PIMIENTA, id + ":" + PIN) en base64url (43 caracteres, sin relleno)', async () => {
    const c = await contrasenaDerivada(pimienta, id, '123456')
    expect(c).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // Valor de referencia calculado aparte con la misma definición.
    const { createHmac } = await import('node:crypto')
    expect(c).toBe(createHmac('sha256', pimienta).update(`${id}:123456`).digest('base64url'))
  })

  it('es determinista y cambia con el PIN, el usuario o la pimienta', async () => {
    const base = await contrasenaDerivada(pimienta, id, '123456')
    expect(await contrasenaDerivada(pimienta, id, '123456')).toBe(base)
    expect(await contrasenaDerivada(pimienta, id, '123457')).not.toBe(base)
    expect(await contrasenaDerivada(pimienta, id.replace('1', '2'), '123456')).not.toBe(base)
    expect(await contrasenaDerivada('otra-pimienta', id, '123456')).not.toBe(base)
  })

  it('no contiene el PIN ni se parece a él', async () => {
    const c = await contrasenaDerivada(pimienta, id, '123456')
    expect(c).not.toContain('123456')
  })

  it('cabe en el límite de 72 bytes de bcrypt que usa Auth', async () => {
    expect(new TextEncoder().encode(await contrasenaDerivada(pimienta, id, '000000')).length).toBeLessThanOrEqual(72)
  })
})

describe('otras reglas', () => {
  it('el correo sintético usa un dominio reservado que nunca recibe correo', () => {
    expect(correoSintetico('abc')).toBe('op-abc@operadores.invalid')
  })
  it('normaliza el código y el alias como los escribe una persona', () => {
    expect(normalizarCodigo(' 7ql 5ts ')).toBe('7QL5TS'.toUpperCase())
    expect(normalizarCodigo(undefined)).toBe('')
    expect(normalizarAlias('  JUAN ')).toBe('juan')
    expect(normalizarAlias(5)).toBe('')
  })
  it('el mensaje de bloqueo dice hasta cuándo, en hora de Ciudad de México', () => {
    expect(mensajeBloqueo(new Date('2026-10-09T21:30:00Z'))).toBe('Demasiados intentos. Vuelve a intentar después de las 15:30.')
  })
})

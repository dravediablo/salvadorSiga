import { describe, expect, it } from 'vitest'
import { completa, distribucion, hf, ii, iiPlanta, resumen, resumenSintoma, semaforo, validar } from './calculos'
import { plantaConGrados } from './ayudas.test-util'

describe('índice de infección y hojas funcionales', () => {
  it('planta [0,0,0,1,2,3,3,4,5,6] → II 40 y HF 8', () => {
    const { hojas } = plantaConGrados([0, 0, 0, 1, 2, 3, 3, 4, 5, 6])
    expect(iiPlanta(hojas)).toBeCloseTo(40, 2)
    expect(hf(hojas)).toBe(8)
  })
  it('12 hojas en grado 0 → II 0 y HF 12', () => {
    const { hojas } = plantaConGrados(Array(12).fill(0))
    expect(iiPlanta(hojas)).toBe(0)
    expect(hf(hojas)).toBe(12)
  })
  it('8 hojas en grado 6 → II 100 y HF 0', () => {
    const { hojas } = plantaConGrados(Array(8).fill(6))
    expect(iiPlanta(hojas)).toBe(100)
    expect(hf(hojas)).toBe(0)
  })
  it('planta [0, 2, sin calificar] → II 16,67 e incompleta', () => {
    const { planta, hojas } = plantaConGrados([0, 2, null])
    expect(iiPlanta(hojas)).toBeCloseTo(16.67, 2)
    expect(completa(planta, hojas)).toBe(false)
  })
  it('planta con todas las hojas calificadas es completa', () => {
    const { planta, hojas } = plantaConGrados([0, 2, 3])
    expect(completa(planta, hojas)).toBe(true)
  })
  it('planta sin hojas calificadas → II null', () => {
    expect(ii([null, null])).toBeNull()
    expect(ii([])).toBeNull()
  })
  it('tabla con A [0,0,6] y B [0,0,0,0,0,0] → II 11,11 (hojas juntas, no promedio de plantas)', () => {
    const r = resumen([plantaConGrados([0, 0, 6]), plantaConGrados([0, 0, 0, 0, 0, 0])])
    expect(r.ii).toBeCloseTo(11.11, 2)
    expect(r.hojas_evaluadas).toBe(9)
    expect(r.n).toBe(2)
    expect(r.completas).toBe(2)
  })
  it('resumen ignora plantas y hojas eliminadas', () => {
    const a = plantaConGrados([0, 0, 6])
    const b = plantaConGrados([6, 6, 6])
    b.planta.eliminado = true
    a.hojas[2].eliminado = true
    const r = resumen([a, b])
    expect(r.n).toBe(1)
    expect(r.ii).toBe(0)
    expect(hf(a.hojas)).toBe(2)
  })
  it('resumen de lista vacía', () => {
    const r = resumen([])
    expect(r).toMatchObject({ n: 0, ii: null, th: null, hf: null, hojas_evaluadas: 0 })
  })
  it('resumen promedia TH y HF por planta', () => {
    const r = resumen([plantaConGrados([0, 0, 0, 0]), plantaConGrados([6, 6])])
    expect(r.th).toBe(3)
    expect(r.hf).toBe(2)
  })
})

describe('hoja más joven con síntoma', () => {
  it('estría [3,0,5,null] → promedio 4, no presenta 1, sin capturar 1', () => {
    const r = resumen([3, 0, 5, null].map((e) => plantaConGrados([0], { e })))
    expect(r.estria).toEqual({ prom: 4, no_presenta: 1, sin_capturar: 1 })
  })
  it('sin valores presentes → promedio null', () => {
    expect(resumenSintoma([0, null]).prom).toBeNull()
  })
  it('la estrategia por defecto es excluir_no_presenta', () => {
    expect(resumenSintoma([2, 0], 'excluir_no_presenta').prom).toBe(2)
    expect(resumenSintoma([2, 0]).prom).toBe(2)
  })
  it('pizca y mancha también se resumen', () => {
    const r = resumen([plantaConGrados([0], { p: 6, m: 8 }), plantaConGrados([0], { p: 4, m: 0 })])
    expect(r.pizca.prom).toBe(5)
    expect(r.mancha).toEqual({ prom: 8, no_presenta: 1, sin_capturar: 0 })
  })
})

describe('validaciones', () => {
  const diez = Array(10).fill(0)
  it('TH 10, pizca 12 → 1 error', () => {
    const { planta, hojas } = plantaConGrados(diez, { p: 12, e: 4, m: 6 })
    const v = validar(planta, hojas)
    expect(v.errores).toHaveLength(1)
  })
  it('TH 10, pizca 5, estría 3, mancha 6 → 0 errores y aviso de orden pizca/estría', () => {
    const { planta, hojas } = plantaConGrados(diez, { p: 5, e: 3, m: 6 })
    const v = validar(planta, hojas)
    expect(v.errores).toHaveLength(0)
    expect(v.avisos).toHaveLength(1)
    expect(v.avisos[0]).toMatch(/pizca.*estría/)
  })
  it('TH 10, pizca no presenta (0), estría 4, mancha 6 → sin aviso de orden', () => {
    const { planta, hojas } = plantaConGrados(diez, { p: 0, e: 4, m: 6 })
    const v = validar(planta, hojas)
    expect(v.errores).toHaveLength(0)
    expect(v.avisos).toHaveLength(0)
  })
  it('avisa estría > mancha', () => {
    const { planta, hojas } = plantaConGrados(diez, { p: 2, e: 7, m: 5 })
    expect(validar(planta, hojas).avisos.some((a) => a.includes('estría') && a.includes('mancha'))).toBe(true)
  })
  it('avisa pizca > mancha cuando no hay estría', () => {
    const { planta, hojas } = plantaConGrados(diez, { p: 8, e: 0, m: 5 })
    expect(validar(planta, hojas).avisos).toEqual(['La pizca está en una hoja más vieja que la mancha.'])
  })
  it('avisa campos sin capturar y hojas sin calificar', () => {
    const { planta, hojas } = plantaConGrados([0, null, null])
    const v = validar(planta, hojas)
    expect(v.errores).toHaveLength(0)
    expect(v.avisos).toHaveLength(4)
    expect(v.avisos.at(-1)).toBe('Faltan 2 hoja(s) por calificar.')
  })
})

describe('semáforo (umbral medio 20, alto 30)', () => {
  const u = { ii_umbral_medio: 20, ii_umbral_alto: 30 }
  it.each([
    [19.99, 'verde'],
    [20, 'amarillo'],
    [29.99, 'amarillo'],
    [30, 'rojo'],
    [null, 'sin'],
  ] as const)('%s → %s', (v, esperado) => {
    expect(semaforo(v, u)).toBe(esperado)
  })
})

describe('distribución', () => {
  it('cuenta hojas por número de hoja y grado', () => {
    const d = distribucion([plantaConGrados([0, 6]), plantaConGrados([0, 2, null])])
    expect(d).toHaveLength(3)
    expect(d[0][0]).toBe(2)
    expect(d[1][6]).toBe(1)
    expect(d[1][2]).toBe(1)
    expect(d[2].every((x) => x === 0)).toBe(true)
  })
  it('sin plantas → matriz vacía', () => {
    expect(distribucion([])).toEqual([])
  })
})

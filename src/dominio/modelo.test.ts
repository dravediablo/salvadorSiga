import { describe, expect, it } from 'vitest'
import { RANCHO } from './ayudas.test-util'
import {
  ajustarHojas, nuevaAplicacion, nuevaEvaluacion, nuevaHoja, nuevaMembresia, nuevaPlanta, nuevoRancho, nuevoRecorrido, nuevaTabla,
} from './modelo'
import type { GradoGauhl } from './tipos'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('fábricas', () => {
  it('llenan campos comunes', () => {
    const t = nuevaTabla({ rancho_id: RANCHO })
    expect(t.id).toMatch(uuid)
    expect(t.rancho_id).toBe(RANCHO)
    expect(t.server_updated_at).toBeNull()
    expect(t.eliminado).toBe(false)
    expect(t.created_at).toBe(t.updated_at)
    expect(t).toMatchObject({ activa: true, origen: 'manual' })
  })
  it('los ids no se repiten', () => {
    expect(nuevaTabla({ rancho_id: RANCHO }).id).not.toBe(nuevaTabla({ rancho_id: RANCHO }).id)
  })
  it('nuevoRecorrido calcula la semana ISO y empieza en curso', () => {
    const r = nuevoRecorrido({ rancho_id: RANCHO, fecha: '2026-10-09', usuario_id: 'u' })
    expect(r.semana_iso).toBe('2026-W41')
    expect(r.estado).toBe('en_curso')
  })
  it('nuevaEvaluacion es Stover por defecto', () => {
    const e = nuevaEvaluacion({ rancho_id: RANCHO, recorrido_id: 'r', tabla_id: 't' })
    expect(e).toMatchObject({ tipo: 'stover', hora_inicio: null, hora_fin: null })
    expect(nuevaEvaluacion({ rancho_id: RANCHO, recorrido_id: 'r', tabla_id: 't', tipo: 'preaviso' }).tipo).toBe('preaviso')
  })
  it('nuevaPlanta trae 10 hojas sin calificar y hereda TH de la previa', () => {
    const { planta, hojas } = nuevaPlanta({ rancho_id: RANCHO, evaluacion_tabla_id: 'e', numero_planta: 1 })
    expect(planta.total_hojas).toBe(10)
    expect(hojas).toHaveLength(10)
    expect(hojas.every((h) => h.grado_gauhl === null && h.planta_id === planta.id)).toBe(true)
    expect(planta).toMatchObject({ hmj_pizca: null, hmj_estria: null, hmj_mancha: null })
    const otra = nuevaPlanta({ rancho_id: RANCHO, evaluacion_tabla_id: 'e', numero_planta: 2 }, { total_hojas: 7 })
    expect(otra.hojas).toHaveLength(7)
  })
  it('nuevoRancho, nuevaMembresia y nuevaAplicacion', () => {
    expect(nuevoRancho({ nombre: 'La Palma' })).toMatchObject({ ii_umbral_medio: 20, ii_umbral_alto: 30, dias_alerta_aplicacion: 14 })
    expect(nuevaMembresia({ rancho_id: RANCHO, usuario_id: 'u', rol: 'operador' }).activo).toBe(true)
    const a = nuevaAplicacion({ rancho_id: RANCHO })
    expect(a.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(a).toMatchObject({ unidad: 'L/ha', metodo: 'Terrestre', grupo_frac: '' })
  })
})

describe('ajustarHojas', () => {
  const armar = (n: number) => {
    const { planta, hojas } = nuevaPlanta({ rancho_id: RANCHO, evaluacion_tabla_id: 'e', numero_planta: 1 }, { total_hojas: n })
    hojas.forEach((h, i) => (h.grado_gauhl = (i % 7) as GradoGauhl))
    return { planta, hojas }
  }
  it('TH de 10 a 8 conserva las hojas 1–8 con sus grados', () => {
    const { planta, hojas } = armar(10)
    const r = ajustarHojas(planta, hojas, 8)
    expect(r.map((h) => h.numero_hoja)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(r.map((h) => h.grado_gauhl)).toEqual(hojas.slice(0, 8).map((h) => h.grado_gauhl))
    expect(r[0]).toBe(hojas[0])
  })
  it('TH de 8 a 10 agrega las hojas 9 y 10 sin calificar con planta_id correcto', () => {
    const { planta, hojas } = armar(8)
    const r = ajustarHojas(planta, hojas, 10)
    expect(r).toHaveLength(10)
    expect(r.slice(0, 8)).toEqual(hojas)
    for (const h of r.slice(8)) expect(h).toMatchObject({ planta_id: planta.id, rancho_id: RANCHO, grado_gauhl: null })
    expect(r.slice(8).map((h) => h.numero_hoja)).toEqual([9, 10])
  })
  it('nuevaHoja', () => {
    expect(nuevaHoja({ id: 'p', rancho_id: RANCHO }, 3)).toMatchObject({ planta_id: 'p', numero_hoja: 3, grado_gauhl: null })
  })
})

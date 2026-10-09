import { describe, expect, it } from 'vitest'
import {
  aplicacionesDeTabla, efectoAplicacion, filas, INDICADORES, previa, repeticionesFrac, serie, ultimaAplicacion, valorEn,
  type EvaluacionConPlantas,
} from './analisis'
import { plantaConGrados, RANCHO } from './ayudas.test-util'
import { nuevaAplicacion, nuevaEvaluacion, nuevoRecorrido, nuevaTabla } from './modelo'
import { lunesDeSemana } from './fechas'
import type { AplicacionTabla, GradoGauhl, Recorrido } from './tipos'

/** Crea un recorrido en la semana ISO dada con una evaluación de la tabla y plantas del grado indicado. */
function evaluar(semana: string, tablaId: string, grado: GradoGauhl, extra: Partial<Recorrido> = {}) {
  const recorrido = { ...nuevoRecorrido({ rancho_id: RANCHO, fecha: lunesDeSemana(semana), usuario_id: 'u1' }), ...extra }
  const evaluacion = nuevaEvaluacion({ rancho_id: RANCHO, recorrido_id: recorrido.id, tabla_id: tablaId })
  const ev: EvaluacionConPlantas = { evaluacion, plantas: [plantaConGrados([grado, grado])] }
  return { recorrido, ev }
}

const II = INDICADORES[0]

describe('serie y filas', () => {
  it('agrupa por tabla y semana, y junta recorridos de la misma semana', () => {
    const a = evaluar('2026-W30', 'T1', 6)
    const b = evaluar('2026-W30', 'T1', 0)
    const c = evaluar('2026-W31', 'T2', 3)
    const fs = filas([a.ev, b.ev, c.ev], [a.recorrido, b.recorrido, c.recorrido])
    const s = serie(fs)
    expect(valorEn(s.get('T1'), '2026-W30', II)).toBe(50)
    expect(valorEn(s.get('T2'), '2026-W31', II)).toBe(50)
    expect(valorEn(s.get('T2'), '2026-W30', II)).toBeNull()
    expect(valorEn(undefined, '2026-W30', II)).toBeNull()
  })
  it('filtra por fechas, operador, tablas, eliminados y tipo', () => {
    const a = evaluar('2026-W30', 'T1', 1)
    const b = evaluar('2026-W31', 'T2', 1, { usuario_id: 'u2' })
    const eliminado = evaluar('2026-W32', 'T1', 1, { eliminado: true })
    const pre = evaluar('2026-W33', 'T1', 1)
    pre.ev.evaluacion.tipo = 'preaviso'
    const evEliminada = evaluar('2026-W34', 'T1', 1)
    evEliminada.ev.evaluacion.eliminado = true
    const sinRec = evaluar('2026-W35', 'T1', 1)
    const todos = [a, b, eliminado, pre, evEliminada, sinRec]
    const evs = todos.map((x) => x.ev)
    const recs = todos.slice(0, 5).map((x) => x.recorrido)
    expect(filas(evs, recs)).toHaveLength(2)
    expect(filas(evs, recs, { desde: b.recorrido.fecha })).toHaveLength(1)
    expect(filas(evs, recs, { hasta: a.recorrido.fecha })).toHaveLength(1)
    expect(filas(evs, recs, { operador: 'u2' })).toHaveLength(1)
    expect(filas(evs, recs, { tablas: ['T1'] })).toHaveLength(1)
    expect(filas(evs, recs, { tablas: [] })).toHaveLength(2)
  })
  it('ignora evaluaciones sin plantas', () => {
    const a = evaluar('2026-W30', 'T1', 1)
    a.ev.plantas = []
    expect(serie(filas([a.ev], [a.recorrido])).get('T1')?.size).toBe(0)
  })
  it('INDICADORES lee del resumen', () => {
    const a = evaluar('2026-W30', 'T1', 2)
    const { r } = serie(filas([a.ev], [a.recorrido])).get('T1')!.get('2026-W30')!
    expect(INDICADORES.map((i) => i.get(r))).toEqual([r.ii, r.th, r.hf, null, null, null])
  })
})

describe('previa', () => {
  it('devuelve la semana anterior más cercana', () => {
    const e = [evaluar('2026-W28', 'T1', 1), evaluar('2026-W30', 'T1', 1)]
    const st = serie(filas(e.map((x) => x.ev), e.map((x) => x.recorrido))).get('T1')
    expect(previa(st, '2026-W30')).toBe('2026-W28')
    expect(previa(st, '2026-W28')).toBeNull()
    expect(previa(undefined, '2026-W28')).toBeNull()
  })
})

describe('aplicaciones', () => {
  const t1 = nuevaTabla({ rancho_id: RANCHO, codigo: 'T1' })
  const t2 = nuevaTabla({ rancho_id: RANCHO, codigo: 'T2' })
  const app = (fecha: string, frac: string) => nuevaAplicacion({ rancho_id: RANCHO, fecha, grupo_frac: frac })
  const enlazar = (a: { id: string }, ...ts: Array<{ id: string }>): AplicacionTabla[] =>
    ts.map((t) => ({ aplicacion_id: a.id, tabla_id: t.id }))

  it('dos aplicaciones consecutivas FRAC 11 en la misma tabla → 1 alerta', () => {
    const a = app('2026-07-01', '11')
    const b = app('2026-07-15', '11')
    const r = repeticionesFrac([t1], [a, b], [...enlazar(a, t1), ...enlazar(b, t1)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tabla: t1, a: b, b: a })
  })
  it('FRAC 11 en una tabla y FRAC 11 en otra → 0 alertas', () => {
    const a = app('2026-07-01', '11')
    const b = app('2026-07-15', '11')
    expect(repeticionesFrac([t1, t2], [a, b], [...enlazar(a, t1), ...enlazar(b, t2)])).toHaveLength(0)
  })
  it('grupos distintos, FRAC vacío y tablas eliminadas no alertan', () => {
    const a = app('2026-07-01', '11')
    const b = app('2026-07-15', '3')
    const c = app('2026-07-20', '')
    const d = app('2026-07-25', '')
    const links = [...enlazar(a, t1), ...enlazar(b, t1), ...enlazar(c, t1), ...enlazar(d, t1)]
    expect(repeticionesFrac([t1], [a, b, c, d], links)).toHaveLength(0)
    const e = app('2026-08-01', '3')
    const borrada = { ...t2, eliminado: true }
    expect(repeticionesFrac([borrada], [b, e], [...enlazar(b, t2), ...enlazar(e, t2)])).toHaveLength(0)
  })
  it('aplicacionesDeTabla ordena por fecha y omite eliminadas; ultimaAplicacion respeta "hasta"', () => {
    const a = app('2026-07-15', '1')
    const b = app('2026-07-01', '2')
    const c = { ...app('2026-07-20', '3'), eliminado: true }
    const links = [...enlazar(a, t1), ...enlazar(b, t1), ...enlazar(c, t1)]
    expect(aplicacionesDeTabla([a, b, c], links, t1.id).map((x) => x.fecha)).toEqual(['2026-07-01', '2026-07-15'])
    expect(ultimaAplicacion([a, b, c], links, t1.id)).toBe(a)
    expect(ultimaAplicacion([a, b, c], links, t1.id, '2026-07-10')).toBe(b)
    expect(ultimaAplicacion([a, b, c], links, t1.id, '2026-06-01')).toBeNull()
  })
})

describe('efectoAplicacion', () => {
  const armar = (semanas: Array<[string, GradoGauhl]>) => {
    const e = semanas.map(([s, g]) => evaluar(s, 'T1', g))
    return serie(filas(e.map((x) => x.ev), e.map((x) => x.recorrido)))
  }
  // 2026-W30 = lunes 2026-07-20
  it('con evaluaciones en S30 (antes), S32 y S34 devuelve los tres valores', () => {
    const s = armar([['2026-W30', 6], ['2026-W32', 3], ['2026-W34', 0]])
    const r = efectoAplicacion(s, { fecha: '2026-07-21' }, 'T1')!
    expect(r.antesSem).toBe('2026-W30')
    expect(r.antes).toBe(100)
    expect(r.d2).toEqual({ sem: '2026-W32', v: 50 })
    expect(r.d4).toEqual({ sem: '2026-W34', v: 0 })
  })
  it('sin evaluación previa, antes = null', () => {
    const s = armar([['2026-W32', 3], ['2026-W34', 0]])
    const r = efectoAplicacion(s, { fecha: '2026-07-21' }, 'T1')!
    expect(r.antesSem).toBeNull()
    expect(r.antes).toBeNull()
    expect(r.d2?.sem).toBe('2026-W32')
  })
  it('usa la evaluación previa más cercana y acepta ±1 semana de tolerancia', () => {
    const s = armar([['2026-W28', 6], ['2026-W33', 3], ['2026-W31', 2]])
    const r = efectoAplicacion(s, { fecha: '2026-07-21' }, 'T1')!
    expect(r.antesSem).toBe('2026-W28')
    expect(r.d2?.sem).toBe('2026-W33') // 2 semanas → W32 no existe; con +1 de tolerancia, W33
    expect(r.d4?.sem).toBe('2026-W33') // 4 semanas → W34 y W35 no existen; con −1, W33
  })
  it('tabla sin serie → null', () => {
    expect(efectoAplicacion(new Map(), { fecha: '2026-07-21' }, 'T9')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { filas, serie, type EvaluacionConPlantas } from './analisis'
import { plantaConGrados, RANCHO } from './ayudas.test-util'
import { lunesDeSemana } from './fechas'
import { nuevaAplicacion, nuevaEvaluacion, nuevoRecorrido, nuevaTabla } from './modelo'
import { climaConDesfase, conGeometria, escalaNice, estadoTablas, proyectarMapa, semanaPorDefecto, semanasConRepunte, tablasPorRevisar, tablasQueEmpeoran } from './tablero'
import type { GradoGauhl } from './tipos'

const UMBRALES = { ii_umbral_medio: 20, ii_umbral_alto: 30 }

/** Serie con una evaluación por (semana, tabla); cada planta tiene 2 hojas del grado dado. */
function armar(datos: Array<[string, string, GradoGauhl]>) {
  const recorridos = datos.map(([semana]) => nuevoRecorrido({ rancho_id: RANCHO, fecha: lunesDeSemana(semana), usuario_id: 'u1' }))
  const evs: EvaluacionConPlantas[] = datos.map(([, tabla, g], i) => ({
    evaluacion: nuevaEvaluacion({ rancho_id: RANCHO, recorrido_id: recorridos[i].id, tabla_id: tabla }),
    plantas: [plantaConGrados([g, g])],
  }))
  return serie(filas(evs, recorridos))
}

const tablaConId = (id: string, codigo: string, extra = {}) => ({ ...nuevaTabla({ rancho_id: RANCHO, codigo, ...extra }), id })

describe('escalaNice', () => {
  it('redondea los límites y genera marcas', () => {
    expect(escalaNice(0, 47, 5)).toEqual({ min: 0, max: 50, ticks: [0, 10, 20, 30, 40, 50] })
    expect(escalaNice(0, 1, 3).ticks[0]).toBe(0)
  })
  it('sin datos o con un solo valor devuelve un eje válido', () => {
    expect(escalaNice(null, null)).toEqual({ min: 0, max: 1, ticks: [0, 1] })
    const e = escalaNice(5, 5)
    expect(e.min).toBeLessThan(5)
    expect(e.max).toBeGreaterThan(5)
  })
})

describe('semanaPorDefecto', () => {
  it('descarta las semanas con menos de la mitad de la cobertura máxima', () => {
    const cob: Record<string, number> = { '2026-W30': 4, '2026-W31': 4, '2026-W32': 1 }
    expect(semanaPorDefecto(['2026-W30', '2026-W31', '2026-W32'], (s) => cob[s])).toBe('2026-W31')
  })
  it('sin semanas con datos no hay semana', () => {
    expect(semanaPorDefecto([], () => 0)).toBeNull()
  })
})

describe('estadoTablas', () => {
  // Grado 6 en todas las hojas → II 100; grado 0 → II 0; grado 3 → II 50.
  const T1 = tablaConId('T1', '1')
  const T2 = tablaConId('T2', '2')
  const s = armar([
    ['2026-W30', 'T1', 0],
    ['2026-W31', 'T1', 3],
    ['2026-W30', 'T2', 6],
  ])

  it('calcula II, cambio, semáforo y días desde la última aplicación', () => {
    const app = { ...nuevaAplicacion({ rancho_id: RANCHO, fecha: '2026-07-20', tabla_ids: ['T1'] }) }
    const [e1, e2] = estadoTablas([T1, T2], s, '2026-W31', [app], UMBRALES, '2026-07-30')
    expect(e1.ii).toBe(50)
    expect(e1.delta).toBe(50)
    expect(e1.semaforo).toBe('rojo')
    expect(e1.dias).toBe(10)
    expect(e1.semana).toBe('2026-W31')
    // T2 no se evaluó en W31: usa W30 (dentro de 2 semanas), sin cambio por no tener evaluación previa.
    expect(e2.ii).toBe(100)
    expect(e2.semana).toBe('2026-W30')
    expect(e2.delta).toBeNull()
    expect(e2.dias).toBeNull()
  })

  it('no usa evaluaciones de hace más de 2 semanas', () => {
    const [e2] = estadoTablas([T2], s, '2026-W33', [], UMBRALES, '2026-08-10')
    expect(e2.ii).toBeNull()
    expect(e2.semaforo).toBe('sin')
    expect(e2.semana).toBeNull()
  })

  it('tablasQueEmpeoran y tablasPorRevisar ordenan y filtran', () => {
    const estado = estadoTablas([T1, T2], s, '2026-W31', [], UMBRALES, '2026-07-30')
    expect(tablasQueEmpeoran(estado).map((e) => e.tabla.codigo)).toEqual(['1'])
    expect(tablasQueEmpeoran(estado, 60)).toEqual([])
    // Sin aplicaciones, ambas (rojo) hay que revisarlas, la de mayor II primero.
    expect(tablasPorRevisar(estado, 14).map((e) => e.tabla.codigo)).toEqual(['2', '1'])
    // Con una aplicación reciente en T1 solo queda T2.
    const app = nuevaAplicacion({ rancho_id: RANCHO, fecha: '2026-07-28', tabla_ids: ['T1'] })
    const con = estadoTablas([T1, T2], s, '2026-W31', [app], UMBRALES, '2026-07-30')
    expect(tablasPorRevisar(con, 14).map((e) => e.tabla.codigo)).toEqual(['2'])
  })
})

describe('semanasConRepunte', () => {
  it('detecta subidas de 3 puntos o más contra la evaluación anterior', () => {
    const s = armar([
      ['2026-W30', 'T1', 0],
      ['2026-W31', 'T1', 0],
      ['2026-W32', 'T1', 1], // II 100 / 6 ≈ 16.7
      ['2026-W30', 'T2', 1],
      ['2026-W31', 'T2', 1],
    ])
    expect(semanasConRepunte(['T1', 'T2'], s)).toEqual(['2026-W32'])
    expect(semanasConRepunte(['T2'], s)).toEqual([])
    expect(semanasConRepunte(['T1'], s, 20)).toEqual([])
  })
})

describe('climaConDesfase', () => {
  const dia = (precipitacion: number | null) => ({ dias: 7, temp_max: null, temp_min: null, temp_media: null, hr_media: null, precipitacion, horas_hr_alta: null, dias_lluvia: 0 })
  const clima = new Map([
    ['2026-W28', dia(10)],
    ['2026-W29', dia(30)],
  ])
  it('promedia la variable el número de semanas indicado antes', () => {
    expect(climaConDesfase(clima, ['2026-W30', '2026-W31'], 'precipitacion', 2)).toBe(20)
    expect(climaConDesfase(clima, ['2026-W31'], 'precipitacion', 2)).toBe(30)
  })
  it('sin clima en esas semanas da null', () => {
    expect(climaConDesfase(clima, ['2026-W40'], 'precipitacion', 2)).toBeNull()
    expect(climaConDesfase(new Map(), ['2026-W30'], 'precipitacion', 0)).toBeNull()
  })
})

describe('proyectarMapa', () => {
  const cuadro = (lon: number, lat: number, lado = 0.001) => ({
    type: 'Polygon' as const,
    coordinates: [[[lon, lat], [lon + lado, lat], [lon + lado, lat + lado], [lon, lat + lado], [lon, lat]]],
  })
  it('sin polígonos no hay mapa', () => {
    expect(proyectarMapa([tablaConId('T1', '1')])).toBeNull()
    expect(conGeometria([tablaConId('T1', '1', { geometria: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } })])).toEqual([])
  })
  it('deja los polígonos dentro del lienzo, con el norte arriba y al este a la derecha', () => {
    const sur = tablaConId('S', 'S', { geometria: cuadro(-103.8, 18.9) })
    const norteEste = tablaConId('N', 'N', { geometria: cuadro(-103.79, 18.91) })
    const m = proyectarMapa([sur, norteEste])
    expect(m).not.toBeNull()
    const [ps, pn] = m!.poligonos
    expect(ps.cx).toBeLessThan(pn.cx) // el este queda a la derecha
    expect(pn.cy).toBeLessThan(ps.cy) // el norte queda arriba
    for (const p of m!.poligonos)
      for (const par of p.puntos.split(' ')) {
        const [x, y] = par.split(',').map(Number)
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(m!.ancho)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(m!.alto)
      }
  })
  it('con un solo polígono no divide entre cero', () => {
    const m = proyectarMapa([tablaConId('T1', '1', { geometria: cuadro(-103.8, 18.9) })])
    expect(Number.isFinite(m!.poligonos[0].cx)).toBe(true)
  })
})

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { nuevaAplicacion, nuevaEvaluacion, nuevaPlanta, nuevoRecorrido, nuevaTabla, type ClimaDiario } from '@/dominio'
import { crearConsultas } from './consultas'
import { SigatokaDB } from './db'

const abiertas: SigatokaDB[] = []
afterEach(() => {
  for (const db of abiertas.splice(0)) db.close()
})
const R = '00000000-0000-4000-8000-000000000001'

async function conDatos() {
  const db = new SigatokaDB(`tablero-${Math.random().toString(36).slice(2)}`)
  abiertas.push(db)
  const tabla = nuevaTabla({ rancho_id: R, codigo: '1' })
  const baja = nuevaTabla({ rancho_id: R, codigo: '2', eliminado: true })
  const rec = nuevoRecorrido({ rancho_id: R, fecha: '2026-10-05', usuario_id: 'u1' })
  const ev = nuevaEvaluacion({ rancho_id: R, recorrido_id: rec.id, tabla_id: tabla.id })
  const p2 = nuevaPlanta({ rancho_id: R, evaluacion_tabla_id: ev.id, numero_planta: 2 })
  const p1 = nuevaPlanta({ rancho_id: R, evaluacion_tabla_id: ev.id, numero_planta: 1 })
  const borrada = nuevaPlanta({ rancho_id: R, evaluacion_tabla_id: ev.id, numero_planta: 3 })
  borrada.planta.eliminado = true
  await db.tablas.bulkPut([tabla, baja])
  await db.recorridos.put(rec)
  await db.evaluaciones.put(ev)
  await db.plantas.bulkPut([p2.planta, p1.planta, borrada.planta])
  await db.hojas.bulkPut([...p2.hojas, ...p1.hojas, ...borrada.hojas])
  return { db, tabla, rec, ev, p1, p2, consultas: crearConsultas(db) }
}

describe('datosTablero', () => {
  it('junta evaluaciones con sus plantas y hojas, ordenadas, sin eliminados', async () => {
    const { consultas, tabla, ev, p1, p2 } = await conDatos()
    const d = await consultas.datosTablero(R)
    expect(d.tablas.map((t) => t.id)).toEqual([tabla.id])
    expect(d.recorridos).toHaveLength(1)
    expect(d.evaluaciones).toHaveLength(1)
    expect(d.evaluaciones[0].evaluacion.id).toBe(ev.id)
    expect(d.evaluaciones[0].plantas.map((x) => x.planta.numero_planta)).toEqual([1, 2])
    expect(d.evaluaciones[0].plantas[0].hojas.length).toBe(p1.hojas.length)
    expect(d.evaluaciones[0].plantas[1].hojas.length).toBe(p2.hojas.length)
    expect(d.evaluaciones[0].plantas[0].hojas.map((h) => h.numero_hoja)).toEqual([...p1.hojas.map((h) => h.numero_hoja)].sort((a, b) => a - b))
  })

  it('sin aplicaciones ni clima devuelve listas vacías', async () => {
    const { consultas } = await conDatos()
    const d = await consultas.datosTablero(R)
    expect(d.aplicaciones).toEqual([])
    expect(d.clima).toEqual([])
  })

  it('devuelve aplicaciones y clima vivos', async () => {
    const { db, consultas, tabla } = await conDatos()
    const app = nuevaAplicacion({ rancho_id: R, fecha: '2026-10-01', tabla_ids: [tabla.id] })
    const gone = nuevaAplicacion({ rancho_id: R, fecha: '2026-10-02', tabla_ids: [tabla.id], eliminado: true })
    await db.aplicaciones.bulkPut([app, gone])
    const dia = (fecha: string, eliminado = false): ClimaDiario => ({
      ...app, id: `c-${fecha}`, fecha, temp_max: 30, temp_min: 20, temp_media: 25, hr_media: 80, precipitacion: 0, horas_hr_alta: 8, fuente: 'prueba', eliminado,
    })
    await db.clima.bulkPut([dia('2026-10-01'), dia('2026-10-02', true)])
    const d = await consultas.datosTablero(R)
    expect(d.aplicaciones.map((a) => a.id)).toEqual([app.id])
    expect(d.clima.map((c) => c.fecha)).toEqual(['2026-10-01'])
  })

  it('con 200 recorridos × 20 plantas × 13 hojas tarda menos de 1.5 s', async () => {
    const { db, consultas } = await conDatos()
    const t = '2026-10-05T12:00:00.000Z'
    const base = { created_at: t, updated_at: t, server_updated_at: t, eliminado: false }
    const plantas = []
    const hojas = []
    for (let e = 0; e < 200; e++)
      for (let p = 0; p < 20; p++) {
        const pid = `p${e}-${p}`
        plantas.push({ ...base, id: pid, rancho_id: R, evaluacion_tabla_id: `e${e}`, numero_planta: p + 1, total_hojas: 13, hmj_pizca: null, hmj_estria: null, hmj_mancha: null, observaciones: '', gps_lat: null, gps_lon: null, gps_precision_m: null })
        for (let h = 1; h <= 13; h++) hojas.push({ ...base, id: `h${e}-${p}-${h}`, rancho_id: R, planta_id: pid, numero_hoja: h, grado_gauhl: 1 as const })
      }
    await db.plantas.bulkPut(plantas)
    for (let i = 0; i < hojas.length; i += 5000) await db.hojas.bulkPut(hojas.slice(i, i + 5000))
    await consultas.datosTablero(R)
    const inicio = performance.now()
    await consultas.datosTablero(R)
    expect(performance.now() - inicio).toBeLessThan(1500)
  })

  it('no mezcla los datos de dos ranchos en la misma base local', async () => {
    const { db, consultas, tabla } = await conDatos()
    const R2 = '00000000-0000-4000-8000-000000000002'
    const t = '2026-10-05T12:00:00.000Z'
    const base = { created_at: t, updated_at: t, server_updated_at: t, eliminado: false }
    const tabla2 = nuevaTabla({ rancho_id: R2, codigo: '9' })
    const rec2 = nuevoRecorrido({ rancho_id: R2, fecha: '2026-10-05', usuario_id: 'u2' })
    const ev2 = nuevaEvaluacion({ rancho_id: R2, recorrido_id: rec2.id, tabla_id: tabla2.id })
    const p2 = nuevaPlanta({ rancho_id: R2, evaluacion_tabla_id: ev2.id, numero_planta: 1 })
    await db.tablas.put(tabla2)
    await db.recorridos.put(rec2)
    await db.evaluaciones.put(ev2)
    await db.plantas.put(p2.planta)
    await db.hojas.bulkPut(p2.hojas)
    await db.aplicaciones.put(nuevaAplicacion({ rancho_id: R2, fecha: '2026-10-01', tabla_ids: [tabla2.id] }))
    await db.clima.put({ ...base, id: 'c2', rancho_id: R2, fecha: '2026-10-01', temp_max: 30, temp_min: 20, temp_media: 25, hr_media: 80, precipitacion: 0, horas_hr_alta: 8, fuente: 'prueba' })
    await db.usuarios.bulkPut([
      { ...base, id: 'u1', nombre: 'Ana', email: '' },
      { ...base, id: 'u2', nombre: 'Beto', email: '' },
    ])
    await db.membresias.bulkPut([
      { ...base, id: 'm1', rancho_id: R, usuario_id: 'u1', rol: 'operador', activo: true },
      { ...base, id: 'm2', rancho_id: R2, usuario_id: 'u2', rol: 'operador', activo: true },
    ])
    const a = await consultas.datosTablero(R)
    expect(a.tablas.map((x) => x.id)).toEqual([tabla.id])
    expect(a.recorridos.every((r) => r.rancho_id === R)).toBe(true)
    expect(a.evaluaciones).toHaveLength(1)
    expect(a.evaluaciones[0].plantas).toHaveLength(2)
    expect(a.aplicaciones).toEqual([])
    expect(a.clima).toEqual([])
    expect(a.usuarios.map((u) => u.id)).toEqual(['u1'])
    const b = await consultas.datosTablero(R2)
    expect(b.tablas.map((x) => x.id)).toEqual([tabla2.id])
    expect(b.evaluaciones).toHaveLength(1)
    expect(b.evaluaciones[0].plantas).toHaveLength(1)
    expect(b.aplicaciones).toHaveLength(1)
    expect(b.clima).toHaveLength(1)
    expect(b.usuarios.map((u) => u.id)).toEqual(['u2'])
  })
})

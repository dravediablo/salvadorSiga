import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { EvaluacionTabla, Hoja, Planta, Recorrido } from '@/dominio'
import { crearConsultas } from './consultas'
import { SigatokaDB } from './db'

const abiertas: SigatokaDB[] = []
afterEach(() => {
  for (const db of abiertas.splice(0)) db.close()
})

describe('rendimiento de tarjetasRecorridos', () => {
  it('con 200 recorridos cerrados de 20 plantas × 13 hojas y la cola vacía tarda menos de 300 ms', async () => {
    const db = new SigatokaDB(`rendimiento-${Math.random().toString(36).slice(2)}`)
    abiertas.push(db)
    const t = '2026-10-05T12:00:00.000Z'
    const base = { created_at: t, updated_at: t, server_updated_at: t, eliminado: false }
    const recorridos: Recorrido[] = []
    const evaluaciones: EvaluacionTabla[] = []
    const plantas: Planta[] = []
    const hojas: Hoja[] = []
    for (let r = 0; r < 200; r++) {
      const rid = `r${r}`
      recorridos.push({ ...base, id: rid, rancho_id: 'x', fecha: '2026-10-05', semana_iso: '2026-W41', usuario_id: 'u', estado: 'cerrado' })
      evaluaciones.push({ ...base, id: `e${r}`, rancho_id: 'x', recorrido_id: rid, tabla_id: 't', tipo: 'stover', hora_inicio: null, hora_fin: null })
      for (let p = 0; p < 20; p++) {
        const pid = `p${r}-${p}`
        plantas.push({ ...base, id: pid, rancho_id: 'x', evaluacion_tabla_id: `e${r}`, numero_planta: p + 1, total_hojas: 13, hmj_pizca: null, hmj_estria: null, hmj_mancha: null, observaciones: '', gps_lat: null, gps_lon: null, gps_precision_m: null })
        for (let h = 1; h <= 13; h++) hojas.push({ ...base, id: `h${r}-${p}-${h}`, rancho_id: 'x', planta_id: pid, numero_hoja: h, grado_gauhl: 1 })
      }
    }
    await db.recorridos.bulkPut(recorridos)
    await db.evaluaciones.bulkPut(evaluaciones)
    await db.plantas.bulkPut(plantas)
    for (let i = 0; i < hojas.length; i += 5000) await db.hojas.bulkPut(hojas.slice(i, i + 5000))
    await db.usuarios.put({ ...base, id: 'u', nombre: 'Operador', email: '' })
    expect(await db.hojas.count()).toBe(200 * 20 * 13)
    expect(await db.cola.count()).toBe(0)

    const consultas = crearConsultas(db)
    await consultas.tarjetasRecorridos() // calienta el motor de IndexedDB simulado
    const medidas: number[] = []
    for (let i = 0; i < 3; i++) {
      const inicio = performance.now()
      const tarjetas = await consultas.tarjetasRecorridos()
      medidas.push(performance.now() - inicio)
      expect(tarjetas).toHaveLength(200)
      expect(tarjetas.every((x) => x.sincronizado && x.plantas === 20)).toBe(true)
    }
    const mejor = Math.min(...medidas)
    process.stdout.write(`\n[rendimiento] tarjetasRecorridos con 200 recorridos × 20 plantas × 13 hojas: ${medidas.map((m) => m.toFixed(0)).join(' ms, ')} ms\n`)
    expect(mejor).toBeLessThan(300)
  }, 120_000)
})

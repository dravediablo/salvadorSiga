import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { nuevaTabla } from '@/dominio'
import { contarPendientes, listarPendientes } from './cola'
import { SigatokaDB } from './db'

const abiertas: Dexie[] = []
afterEach(() => {
  for (const d of abiertas.splice(0)) d.close()
})

/** Base tal como la dejaba la versión 1 del esquema (cola con una entrada por cambio). */
async function crearBaseV1(nombre: string, llenar: (db: Dexie) => Promise<void>) {
  const v1 = new Dexie(nombre)
  v1.version(1).stores({
    ranchos: 'id',
    usuarios: 'id',
    membresias: 'id, rancho_id, usuario_id',
    tablas: 'id, rancho_id',
    recorridos: 'id, rancho_id, usuario_id, estado',
    evaluaciones: 'id, rancho_id, recorrido_id',
    plantas: 'id, rancho_id, evaluacion_tabla_id',
    hojas: 'id, rancho_id, planta_id, [planta_id+numero_hoja]',
    aplicaciones: 'id, rancho_id',
    clima: 'id, rancho_id, [rancho_id+fecha]',
    pendientes: '++id, entidad, registro_id',
    ajustes: 'clave',
  })
  await llenar(v1)
  v1.close()
}

describe('migración del esquema 1 → 3', () => {
  it('consolida la cola vieja en una entrada por registro, con el updated_at más reciente', async () => {
    const nombre = `migracion-${Math.random().toString(36).slice(2)}`
    await crearBaseV1(nombre, async (db) => {
      await db.table('pendientes').bulkAdd([
        { entidad: 'hojas', registro_id: 'h1', updated_at: '2026-10-09T10:00:00.000Z', creado_en: 'x' },
        { entidad: 'hojas', registro_id: 'h1', updated_at: '2026-10-09T10:00:02.000Z', creado_en: 'x' },
        { entidad: 'plantas', registro_id: 'p1', updated_at: '2026-10-09T10:00:01.000Z', creado_en: 'x' },
        { entidad: 'hojas', registro_id: 'h1', updated_at: '2026-10-09T10:00:01.000Z', creado_en: 'x' }, // llegó después pero es más vieja
        { entidad: 'hojas', registro_id: 'h2', updated_at: '2026-10-09T10:00:03.000Z', creado_en: 'x' },
        // Mismo id en otra entidad: no se mezcla.
        { entidad: 'plantas', registro_id: 'h1', updated_at: '2026-10-09T10:00:04.000Z', creado_en: 'x' },
      ])
    })

    const db = new SigatokaDB(nombre)
    abiertas.push(db)
    const cola = await listarPendientes(db)
    // Una entrada por registro, ordenadas por updated_at.
    expect(cola).toEqual([
      { entidad: 'plantas', registro_id: 'p1', updated_at: '2026-10-09T10:00:01.000Z' },
      { entidad: 'hojas', registro_id: 'h1', updated_at: '2026-10-09T10:00:02.000Z' },
      { entidad: 'hojas', registro_id: 'h2', updated_at: '2026-10-09T10:00:03.000Z' },
      { entidad: 'plantas', registro_id: 'h1', updated_at: '2026-10-09T10:00:04.000Z' },
    ])
    expect(await contarPendientes(db)).toBe(4)
    expect(db.tables.map((t) => t.name)).not.toContain('pendientes') // la cola vieja se retira
  })

  it('da de baja las tablas buffer ya importadas (eliminado = true, con su entrada en la cola y marca nueva)', async () => {
    const nombre = `migracion-buffer-${Math.random().toString(36).slice(2)}`
    const buffer = nuevaTabla({ rancho_id: 'r1', codigo: '2A buffer', nombre: 'Tabla 2A Buffer 0.30', activa: false })
    const otraBuffer = nuevaTabla({ rancho_id: 'r1', codigo: 'X', nombre: 'franja BUFFER norte' })
    const normal = nuevaTabla({ rancho_id: 'r1', codigo: '1', nombre: 'Tabla 1. Sup. 6.8 ha.' })
    await crearBaseV1(nombre, async (db) => {
      await db.table('tablas').bulkPut([buffer, otraBuffer, normal])
    })

    const db = new SigatokaDB(nombre)
    abiertas.push(db)
    const tablas = Object.fromEntries((await db.tablas.toArray()).map((t) => [t.id, t]))
    expect(tablas[buffer.id].eliminado).toBe(true)
    expect(tablas[otraBuffer.id].eliminado).toBe(true)
    expect(tablas[normal.id].eliminado).toBe(false)
    expect(tablas[buffer.id].updated_at > buffer.updated_at).toBe(true)

    const cola = await listarPendientes(db)
    expect(cola.map((c) => c.registro_id).sort()).toEqual([buffer.id, otraBuffer.id].sort())
    for (const c of cola) expect(c.updated_at).toBe(tablas[c.registro_id].updated_at)
  })

  it('una base vacía o nueva abre sin errores', async () => {
    const db = new SigatokaDB(`migracion-vacia-${Math.random().toString(36).slice(2)}`)
    abiertas.push(db)
    expect(await contarPendientes(db)).toBe(0)
  })
})

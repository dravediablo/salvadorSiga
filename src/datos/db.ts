import Dexie, { type Table } from 'dexie'
import { esBuffer, type Aplicacion, type ClimaDiario, type EvaluacionTabla, type Hoja, type Membresia, type Planta, type Rancho, type Recorrido, type Tabla, type Usuario } from '@/dominio'
import { CLAVE_ULTIMA_MARCA } from './reloj'

/**
 * Cola de pendientes: UNA entrada por registro (llave `[entidad+registro_id]`).
 * Cada escritura la sobrescribe con el `updated_at` más reciente; el hito 4 envía
 * el estado actual del registro, no la lista de cambios.
 */
export interface Pendiente {
  entidad: Entidad
  registro_id: string
  /** `updated_at` más reciente del registro. */
  updated_at: string
}

/** Ajuste donde las migraciones dejan un aviso para mostrar una sola vez. */
export const CLAVE_AVISO_MIGRACION = 'aviso.migracion'

/** Entrada de la cola del esquema 1 (una por cambio). Solo la usa la migración. */
interface PendienteV1 extends Pendiente {
  id?: number
}

/** Ajustes locales del dispositivo (posición en la app, usuario simulado…). No se sincronizan. */
export interface Ajuste {
  clave: string
  valor: unknown
}

/** Nombres de las tablas de Dexie que guardan entidades sincronizables. */
export type Entidad =
  | 'ranchos'
  | 'usuarios'
  | 'membresias'
  | 'tablas'
  | 'recorridos'
  | 'evaluaciones'
  | 'plantas'
  | 'hojas'
  | 'aplicaciones'
  | 'clima'

export class SigatokaDB extends Dexie {
  ranchos!: Table<Rancho, string>
  usuarios!: Table<Usuario, string>
  membresias!: Table<Membresia, string>
  tablas!: Table<Tabla, string>
  recorridos!: Table<Recorrido, string>
  evaluaciones!: Table<EvaluacionTabla, string>
  plantas!: Table<Planta, string>
  hojas!: Table<Hoja, string>
  aplicaciones!: Table<Aplicacion, string>
  clima!: Table<ClimaDiario, string>
  cola!: Table<Pendiente, [Entidad, string]>
  ajustes!: Table<Ajuste, string>

  constructor(nombre = 'sigatoka') {
    super(nombre)
    // IndexedDB no indexa booleanos, así que `eliminado` se filtra en memoria.
    // `ranchos` y `usuarios` no llevan `rancho_id`, por eso solo se indexan por `id`.
    this.version(1).stores({
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
    // Versión 2: la cola pasa a una entrada por registro. Dexie no deja cambiar la llave
    // primaria de una tabla, así que nace `cola` y la migración consolida la vieja `pendientes`.
    this.version(2)
      .stores({ cola: '[entidad+registro_id], updated_at' })
      .upgrade(async (tx) => {
        const viejas = (await tx.table('pendientes').orderBy('id').toArray()) as PendienteV1[]
        const porRegistro = new Map<string, Pendiente>()
        for (const v of viejas) {
          const llave = `${v.entidad}|${v.registro_id}`
          const previa = porRegistro.get(llave)
          if (!previa || v.updated_at > previa.updated_at) porRegistro.set(llave, { entidad: v.entidad, registro_id: v.registro_id, updated_at: v.updated_at })
        }
        await tx.table('cola').bulkPut([...porRegistro.values()])
      })
    // Versión 3: se retira la cola vieja y se dan de baja las franjas "buffer" que se
    // importaron antes de que el productor pidiera omitirlas.
    this.version(3)
      .stores({ pendientes: null })
      .upgrade(async (tx) => {
        let ultima = (await tx.table('ajustes').get(CLAVE_ULTIMA_MARCA))?.valor as number | undefined
        const tablas = (await tx.table('tablas').toArray()) as Tabla[]
        for (const t of tablas) {
          if (t.eliminado || !(esBuffer(t.nombre) || esBuffer(t.codigo))) continue
          // Misma regla que el generador de marcas: nunca igual ni anterior a la última.
          ultima = Math.max(Date.now(), (ultima ?? 0) + 1, Date.parse(t.updated_at) + 1)
          const updated_at = new Date(ultima).toISOString()
          await tx.table('tablas').put({ ...t, eliminado: true, updated_at })
          await tx.table('cola').put({ entidad: 'tablas', registro_id: t.id, updated_at } satisfies Pendiente)
        }
        if (ultima !== undefined) await tx.table('ajustes').put({ clave: CLAVE_ULTIMA_MARCA, valor: ultima })
      })
    // Versión 4: la versión 3 dio de baja TODAS las franjas "buffer". Las que ya tenían evaluaciones
    // capturadas se restauran, desactivadas, y se deja un aviso para mostrarlo una vez.
    this.version(4).upgrade(async (tx) => {
      const vivas = new Set(((await tx.table('evaluaciones').toArray()) as EvaluacionTabla[]).filter((e) => !e.eliminado).map((e) => e.tabla_id))
      const restauradas: string[] = []
      let ultima = (await tx.table('ajustes').get(CLAVE_ULTIMA_MARCA))?.valor as number | undefined
      for (const t of (await tx.table('tablas').toArray()) as Tabla[]) {
        if (!(esBuffer(t.nombre) || esBuffer(t.codigo)) || !vivas.has(t.id) || (!t.eliminado && !t.activa)) continue
        ultima = Math.max(Date.now(), (ultima ?? 0) + 1, Date.parse(t.updated_at) + 1)
        const updated_at = new Date(ultima).toISOString()
        await tx.table('tablas').put({ ...t, eliminado: false, activa: false, updated_at })
        await tx.table('cola').put({ entidad: 'tablas', registro_id: t.id, updated_at } satisfies Pendiente)
        restauradas.push(t.codigo)
      }
      if (ultima !== undefined) await tx.table('ajustes').put({ clave: CLAVE_ULTIMA_MARCA, valor: ultima })
      if (restauradas.length) {
        await tx.table('ajustes').put({
          clave: CLAVE_AVISO_MIGRACION,
          valor: `La tabla ${restauradas.join(', ')} es una franja "buffer" con evaluaciones capturadas: se conservó desactivada en vez de eliminarse.`,
        })
      }
    })
  }
}

/** Tablas que guardan entidades (todas menos `cola` y `ajustes`). */
export const ENTIDADES: readonly Entidad[] = [
  'ranchos', 'usuarios', 'membresias', 'tablas', 'recorridos', 'evaluaciones', 'plantas', 'hojas', 'aplicaciones', 'clima',
]

import Dexie, { type Table } from 'dexie'
import type { Aplicacion, ClimaDiario, EvaluacionTabla, Hoja, Membresia, Planta, Rancho, Recorrido, Tabla, Usuario } from '@/dominio'

/** Entradas de la cola de pendientes: qué registro cambió y cuándo. El hito 4 las consolida y las envía. */
export interface Pendiente {
  id?: number
  entidad: Entidad
  registro_id: string
  /** `updated_at` del registro en el momento del cambio. */
  updated_at: string
  creado_en: string
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
  pendientes!: Table<Pendiente, number>
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
  }
}

/** Tablas que guardan entidades (todas menos `pendientes` y `ajustes`). */
export const ENTIDADES: readonly Entidad[] = [
  'ranchos', 'usuarios', 'membresias', 'tablas', 'recorridos', 'evaluaciones', 'plantas', 'hojas', 'aplicaciones', 'clima',
]

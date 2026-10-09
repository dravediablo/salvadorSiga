import type { Registro } from '@/dominio'
import type { Entidad, Pendiente, SigatokaDB } from './db'

const ahora = (): string => new Date().toISOString()

/**
 * Orden de escritura: todas las escrituras de una base pasan por una sola fila,
 * así que llegan a IndexedDB en el mismo orden en que la interfaz las pidió,
 * aunque la interfaz no espere a que terminen.
 */
const filas = new WeakMap<SigatokaDB, Promise<unknown>>()

export function enOrden<T>(db: SigatokaDB, tarea: () => Promise<T>): Promise<T> {
  const previa = filas.get(db) ?? Promise.resolve()
  // Si una escritura falla, la siguiente igual se ejecuta.
  const siguiente = previa.then(tarea, tarea)
  filas.set(db, siguiente.catch(() => undefined))
  return siguiente
}

/** Espera a que terminen las escrituras que ya se pidieron. */
export function esperarEscrituras(db: SigatokaDB): Promise<void> {
  return (filas.get(db) ?? Promise.resolve()).then(() => undefined)
}

/**
 * Guarda un registro y su entrada en la cola. DEBE llamarse dentro de una
 * transacción de Dexie que incluya la tabla de la entidad y `pendientes`:
 * si cualquiera de las dos escrituras falla, fallan las dos.
 */
export async function guardar<T extends Registro>(db: SigatokaDB, entidad: Entidad, registro: T): Promise<T> {
  const t = ahora()
  const nuevo: T = { ...registro, updated_at: t }
  await db.table(entidad).put(nuevo)
  await db.pendientes.add({ entidad, registro_id: nuevo.id, updated_at: t, creado_en: t })
  return nuevo
}

export async function guardarVarios<T extends Registro>(db: SigatokaDB, entidad: Entidad, registros: T[]): Promise<T[]> {
  const salida: T[] = []
  for (const r of registros) salida.push(await guardar(db, entidad, r))
  return salida
}

/** Todas las tablas que puede tocar una escritura de repositorio, para abrir una sola transacción. */
export function tablasDeEscritura(db: SigatokaDB) {
  return [db.ranchos, db.usuarios, db.membresias, db.tablas, db.recorridos, db.evaluaciones, db.plantas, db.hojas, db.aplicaciones, db.clima, db.pendientes]
}

/** Ejecuta `cuerpo` en una transacción de lectura y escritura, en orden con las demás escrituras. */
export function escribir<T>(db: SigatokaDB, cuerpo: () => Promise<T>): Promise<T> {
  return enOrden(db, () => db.transaction('rw', tablasDeEscritura(db), cuerpo))
}

/** Registros distintos con cambios sin enviar (una entrada por cambio puede repetir el mismo registro). */
export async function contarPendientes(db: SigatokaDB): Promise<number> {
  const ids = await db.pendientes.orderBy('registro_id').uniqueKeys()
  return ids.length
}

/** Entradas de la cola en el orden en que se crearon. El hito 4 las consolida y las envía. */
export function listarPendientes(db: SigatokaDB): Promise<Pendiente[]> {
  return db.pendientes.orderBy('id').toArray()
}

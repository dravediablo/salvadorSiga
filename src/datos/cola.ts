import type { Registro } from '@/dominio'
import type { Entidad, Pendiente, SigatokaDB } from './db'
import { relojDe } from './reloj'

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
 * transacción de Dexie que incluya la tabla de la entidad, `cola` y `ajustes`:
 * si cualquiera de las escrituras falla, fallan todas.
 *
 * La cola tiene una sola entrada por registro (`[entidad+registro_id]`): `put` la
 * sobrescribe con el `updated_at` más reciente.
 */
export async function guardar<T extends Registro>(db: SigatokaDB, entidad: Entidad, registro: T): Promise<T> {
  const t = await relojDe(db).siguiente()
  const nuevo: T = { ...registro, updated_at: t }
  await db.table(entidad).put(nuevo)
  await db.cola.put({ entidad, registro_id: nuevo.id, updated_at: t })
  return nuevo
}

export async function guardarVarios<T extends Registro>(db: SigatokaDB, entidad: Entidad, registros: T[]): Promise<T[]> {
  const salida: T[] = []
  for (const r of registros) salida.push(await guardar(db, entidad, r))
  return salida
}

/** Todas las tablas que puede tocar una escritura de repositorio, para abrir una sola transacción. */
export function tablasDeEscritura(db: SigatokaDB) {
  return [db.ranchos, db.usuarios, db.membresias, db.tablas, db.recorridos, db.evaluaciones, db.plantas, db.hojas, db.aplicaciones, db.clima, db.cola, db.ajustes]
}

/** Ejecuta `cuerpo` en una transacción de lectura y escritura, en orden con las demás escrituras. */
export function escribir<T>(db: SigatokaDB, cuerpo: () => Promise<T>): Promise<T> {
  return enOrden(db, () =>
    db.transaction('rw', tablasDeEscritura(db), async () => {
      const resultado = await cuerpo()
      // La última marca emitida se guarda en la misma transacción que los cambios.
      await relojDe(db).persistir()
      return resultado
    }),
  )
}

/** Registros con cambios sin enviar (la cola tiene una entrada por registro). */
export function contarPendientes(db: SigatokaDB): Promise<number> {
  return db.cola.count()
}

/** Entradas de la cola, de la más antigua a la más reciente. El hito 4 las envía. */
export function listarPendientes(db: SigatokaDB): Promise<Pendiente[]> {
  return db.cola.orderBy('updated_at').toArray()
}

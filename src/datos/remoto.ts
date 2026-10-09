import type { Registro } from '@/dominio'
import type { Entidad, SigatokaDB } from './db'
import { relojDe } from './reloj'

export type ResultadoRemoto = 'aplicado' | 'conservado_local'

/**
 * Escribe en la base local un registro que viene del servidor, TAL CUAL: con su `updated_at` y su
 * `server_updated_at`, sin pasar por el generador de marcas y SIN agregar entrada a la cola
 * (lo que se descarga no se vuelve a enviar). Es la contraparte de `guardar()`.
 *
 * Se conserva la versión local, sin tocarla, si es más nueva que la remota y está esperando:
 * - en la cola (todavía no se envía), o
 * - en la lista de rechazos (el servidor la rechazó y la persona aún no decide qué hacer).
 * En cualquier otro caso gana el remoto. Si había un rechazo más viejo que el remoto, se borra.
 *
 * `forzar` ignora esa protección (es lo que hace "Descartar mi cambio").
 * DEBE llamarse dentro de una transacción de Dexie que incluya la tabla de la entidad, `cola` y `rechazos`.
 */
export async function aplicarRemoto<T extends Registro>(db: SigatokaDB, entidad: Entidad, remoto: T, forzar = false): Promise<ResultadoRemoto> {
  if (!forzar) {
    const pendiente = await db.cola.get([entidad, remoto.id])
    if (pendiente && pendiente.updated_at > remoto.updated_at) return 'conservado_local'
    const rechazo = await db.rechazos.get([entidad, remoto.id])
    if (rechazo && rechazo.updated_at > remoto.updated_at) return 'conservado_local'
  }
  await db.table(entidad).put(remoto)
  await db.rechazos.delete([entidad, remoto.id])
  return 'aplicado'
}

/** Aplica una página de registros remotos en una sola transacción. Devuelve cuántos se conservaron locales. */
export function aplicarRemotos<T extends Registro>(db: SigatokaDB, entidad: Entidad, remotos: readonly T[]): Promise<{ aplicados: number; conservados: number }> {
  return db.transaction('rw', [db.table(entidad), db.cola, db.rechazos], async () => {
    let aplicados = 0
    let conservados = 0
    for (const r of remotos) {
      if ((await aplicarRemoto(db, entidad, r)) === 'aplicado') aplicados++
      else conservados++
    }
    return { aplicados, conservados }
  })
}

/** Adelanta el generador de marcas local hasta una marca remota y la guarda. */
export async function avanzarRelojHasta(db: SigatokaDB, updated_at_ms: number): Promise<void> {
  const reloj = relojDe(db)
  await reloj.avanzarHasta(updated_at_ms)
  await db.transaction('rw', db.ajustes, () => reloj.persistir())
}

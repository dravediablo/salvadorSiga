import type { Entidad, SigatokaDB } from '../db'
import { ENTIDAD_SERVIDOR } from './entidades'

const CON_RANCHO_ID: readonly Entidad[] = ['membresias', 'tablas', 'recorridos', 'evaluaciones', 'plantas', 'hojas', 'aplicaciones', 'clima']

/**
 * Borra de este dispositivo TODO lo de un rancho: sus registros, lo que esperaba en la cola y sus rechazos. Se usa cuando el
 * servidor informa que el acceso a ese rancho fue desactivado (lo que no se había enviado se pierde: por eso el aviso al propietario).
 * Los cursores de descarga se reinician; los perfiles de usuario (compartidos) se conservan.
 */
export async function borrarDatosDelRancho(db: SigatokaDB, ranchoId: string): Promise<void> {
  await db.transaction('rw', [...CON_RANCHO_ID.map((e) => db.table(e)), db.ranchos, db.cola, db.rechazos, db.ajustes], async () => {
    for (const entidad of CON_RANCHO_ID) {
      const ids = (await db.table(entidad).where('rancho_id').equals(ranchoId).primaryKeys()) as string[]
      await db.table(entidad).bulkDelete(ids)
      await db.cola.bulkDelete(ids.map((id) => [entidad, id] as [Entidad, string]))
      await db.rechazos.bulkDelete(ids.map((id) => [entidad, id] as [Entidad, string]))
    }
    await db.ranchos.delete(ranchoId)
    await db.cola.delete(['ranchos', ranchoId])
    await db.rechazos.delete(['ranchos', ranchoId])
    // Nada de lo descargado vale ya: la próxima descarga (si algún día se reactiva el acceso) empieza de cero.
    for (const entidad of Object.keys(ENTIDAD_SERVIDOR)) await db.ajustes.delete(`sync.cursor.${entidad}`)
    await db.ajustes.delete('sync.ultima')
  })
}

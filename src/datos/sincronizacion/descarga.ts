import type { Registro } from '@/dominio'
import type { Entidad, SigatokaDB } from '../db'
import { aplicarRemotos, avanzarRelojHasta } from '../remoto'
import { deFilaServidor, ENTIDAD_SERVIDOR, ORDEN_DESCARGA } from './entidades'
import type { Servidor } from './servidor'

export const PAGINA = 1000
/** Margen del cursor: se vuelven a pedir los cambios de los últimos 2 minutos, por si algún cambio se confirmó en el servidor con retraso. */
export const MARGEN_CURSOR_MS = 2 * 60 * 1000
/** Una marca remota más de 24 h en el futuro no adelanta el generador local. */
export const FUTURO_MAXIMO_MS = 24 * 60 * 60 * 1000

export const claveCursor = (entidad: Entidad): string => `sync.cursor.${entidad}`

export interface ResumenDescarga {
  recibidos: number
  aplicados: number
  conservadosLocales: number
  /** Texto de aviso si el reloj no avanzó por una marca remota demasiado en el futuro. */
  aviso: string | null
}

/** Desde dónde pedir: el cursor menos el margen (null = desde el principio). */
export function desdeConMargen(cursor: string | undefined): string | null {
  if (!cursor) return null
  const ms = Date.parse(cursor)
  return Number.isNaN(ms) ? null : new Date(ms - MARGEN_CURSOR_MS).toISOString()
}

/**
 * Descarga lo cambiado en el servidor, entidad por entidad en orden de dependencias, y lo aplica
 * con `aplicarRemoto` (sin pasar por la cola). El cursor de cada entidad es el mayor `server_updated_at` recibido.
 * Al final adelanta el generador de marcas hasta el `updated_at` remoto más alto (si no está a más de 24 h en el futuro).
 */
export async function descargarTodo(db: SigatokaDB, servidor: Servidor, ahora: () => number = Date.now): Promise<ResumenDescarga> {
  const resumen: ResumenDescarga = { recibidos: 0, aplicados: 0, conservadosLocales: 0, aviso: null }
  let masAlta = 0

  for (const entidad of ORDEN_DESCARGA) {
    const cursorAnterior = (await db.ajustes.get(claveCursor(entidad)))?.valor as string | undefined
    const desde = desdeConMargen(cursorAnterior)
    let cursor = cursorAnterior
    for (let desplazamiento = 0; ; desplazamiento += PAGINA) {
      const filas = await servidor.descargar(ENTIDAD_SERVIDOR[entidad], desde, desplazamiento, PAGINA)
      const remotos = filas.map((f) => deFilaServidor<Registro>(f))
      const r = await aplicarRemotos(db, entidad, remotos)
      resumen.recibidos += remotos.length
      resumen.aplicados += r.aplicados
      resumen.conservadosLocales += r.conservados
      for (const reg of remotos) {
        if (reg.server_updated_at && (!cursor || Date.parse(reg.server_updated_at) > Date.parse(cursor))) cursor = reg.server_updated_at
        masAlta = Math.max(masAlta, Date.parse(reg.updated_at))
      }
      if (filas.length < PAGINA) break
    }
    if (cursor && cursor !== cursorAnterior) await db.ajustes.put({ clave: claveCursor(entidad), valor: cursor })
  }

  if (masAlta > 0) {
    if (masAlta > ahora() + FUTURO_MAXIMO_MS) {
      resumen.aviso = `Un registro del servidor trae una marca de tiempo más de 24 h en el futuro (${new Date(masAlta).toISOString()}); no se adelantó el reloj de este dispositivo.`
    } else {
      await avanzarRelojHasta(db, masAlta)
    }
  }
  return resumen
}

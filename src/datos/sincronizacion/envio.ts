import type { Registro } from '@/dominio'
import { listarPendientes } from '../cola'
import type { Entidad, Pendiente, SigatokaDB } from '../db'
import { aRegistroServidor, ENTIDAD_SERVIDOR } from './entidades'
import type { ItemLote, Servidor } from './servidor'

export const TAMANO_LOTE = 200

interface Preparado {
  entrada: Pendiente
  /** `updated_at` del registro tal como se envía. */
  enviado: string
  item: ItemLote
}

export interface ResumenEnvio {
  /** Entradas que salieron de la cola o pasaron a rechazos en este lote. */
  atendidas: number
  aplicados: number
  ignorados: number
  rechazados: number
  /** Había entradas que enviar. */
  hubo: boolean
}

const ahoraISO = (): string => new Date().toISOString()

/**
 * Envía UN lote (hasta 200 registros, del `updated_at` más viejo al más nuevo) con `aplicar_cambios`.
 *
 * Por cada resultado, en una sola transacción de Dexie:
 * - 'aplicado' / 'ignorado_version': se borra la entrada de la cola SOLO si su `updated_at` sigue
 *   siendo el que se envió; si cambió, hubo una edición local más nueva y la entrada se queda.
 * - 'rechazado': la entrada sale de la cola (con la misma condición) y el cambio pasa a `rechazos` con
 *   su motivo. El registro local no se toca.
 *
 * Si la llamada falla, lanza y no se borra nada.
 */
export async function enviarLote(db: SigatokaDB, servidor: Servidor, limite = TAMANO_LOTE): Promise<ResumenEnvio> {
  const entradas = await listarPendientes(db, limite)
  const resumen: ResumenEnvio = { atendidas: 0, aplicados: 0, ignorados: 0, rechazados: 0, hubo: entradas.length > 0 }
  if (!entradas.length) return resumen

  const preparados: Preparado[] = []
  const huerfanas: Pendiente[] = []
  for (const entrada of entradas) {
    const registro = (await db.table(entrada.entidad).get(entrada.registro_id)) as Registro | undefined
    if (!registro) huerfanas.push(entrada)
    else preparados.push({ entrada, enviado: registro.updated_at, item: { entidad: ENTIDAD_SERVIDOR[entrada.entidad], registro: aRegistroServidor(registro) } })
  }
  // Una entrada sin registro no se puede enviar: se retira para que no trabe la cola.
  if (huerfanas.length) await db.cola.bulkDelete(huerfanas.map((h) => [h.entidad, h.registro_id] as [Entidad, string]))

  if (!preparados.length) {
    resumen.atendidas = huerfanas.length
    return resumen
  }
  const resultados = await servidor.aplicarCambios(preparados.map((p) => p.item))
  if (resultados.length !== preparados.length) {
    throw new Error(`El servidor respondió ${resultados.length} resultados para ${preparados.length} registros.`)
  }

  await db.transaction('rw', db.cola, db.rechazos, async () => {
    for (const [i, p] of preparados.entries()) {
      const r = resultados[i]
      const llave: [Entidad, string] = [p.entrada.entidad, p.entrada.registro_id]
      const vigente = await db.cola.get(llave)
      const sigueIgual = !!vigente && vigente.updated_at === p.enviado
      if (r.resultado === 'rechazado') {
        // Si la entrada cambió, hay una edición más nueva que se enviará (y se juzgará) por su cuenta.
        if (!sigueIgual) continue
        await db.cola.delete(llave)
        await db.rechazos.put({ entidad: p.entrada.entidad, registro_id: p.entrada.registro_id, updated_at: p.enviado, motivo: r.motivo ?? 'El servidor rechazó el cambio.', fecha: ahoraISO() })
        resumen.rechazados++
        resumen.atendidas++
      } else {
        if (sigueIgual) await db.cola.delete(llave)
        if (r.resultado === 'aplicado') resumen.aplicados++
        else resumen.ignorados++
        if (sigueIgual) resumen.atendidas++
      }
    }
  })
  resumen.atendidas += huerfanas.length
  return resumen
}

/** Envía lotes seguidos hasta vaciar la cola (o hasta que un lote ya no avance). */
export async function enviarTodo(db: SigatokaDB, servidor: Servidor, limite = TAMANO_LOTE): Promise<ResumenEnvio & { lotes: number }> {
  const total: ResumenEnvio & { lotes: number } = { atendidas: 0, aplicados: 0, ignorados: 0, rechazados: 0, hubo: false, lotes: 0 }
  // El tope evita un ciclo infinito si algo impide que las entradas salgan de la cola.
  for (let i = 0; i < 1000; i++) {
    const r = await enviarLote(db, servidor, limite)
    if (!r.hubo) break
    total.hubo = true
    total.lotes++
    total.atendidas += r.atendidas
    total.aplicados += r.aplicados
    total.ignorados += r.ignorados
    total.rechazados += r.rechazados
    if (!r.atendidas) break
  }
  return total
}

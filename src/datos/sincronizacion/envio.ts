import type { Recorrido, Registro } from '@/dominio'
import type { Entidad, Pendiente, SigatokaDB } from '../db'
import { aRegistroServidor, ENTIDAD_SERVIDOR } from './entidades'
import type { ItemLote, Servidor } from './servidor'

export const TAMANO_LOTE = 200

/** Orden de dependencias: los padres salen antes que los hijos, también entre lotes distintos. */
const RANGO: Record<Entidad, number> = {
  usuarios: 0, ranchos: 1, tablas: 2, recorridos: 3, evaluaciones: 4, plantas: 5, hojas: 6, aplicaciones: 7, membresias: 8, clima: 9,
}
const RANGO_CIERRE = 100

interface Candidato {
  entrada: Pendiente
  registro: Registro
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
const esRecorridoCerrado = (c: Candidato): boolean => c.entrada.entidad === 'recorridos' && (c.registro as Recorrido).estado === 'cerrado'

/**
 * La cola completa con su registro, en el orden de envío:
 * 1. por entidad, de padres a hijos (el servidor ordena DENTRO de un lote; entre lotes lo garantiza este orden);
 * 2. dentro de cada entidad, primero las bajas (así un número de hoja liberado está libre antes de que otra hoja lo use);
 * 3. luego por `updated_at`.
 * Los recorridos CERRADOS van al final de todo: el servidor aplica el cierre al terminar el lote, y un recorrido
 * cerrado antes de que lleguen sus plantas y hojas rechazaría lo que falta.
 * Las entradas sin registro se retiran de la cola (no se pueden enviar y la trabarían).
 */
async function colaOrdenada(db: SigatokaDB): Promise<Candidato[]> {
  const entradas = await db.cola.toArray()
  const porEntidad = new Map<Entidad, Pendiente[]>()
  for (const e of entradas) porEntidad.set(e.entidad, [...(porEntidad.get(e.entidad) ?? []), e])
  const candidatos: Candidato[] = []
  const huerfanas: Array<[Entidad, string]> = []
  for (const [entidad, lista] of porEntidad) {
    const registros = (await db.table(entidad).bulkGet(lista.map((e) => e.registro_id))) as Array<Registro | undefined>
    lista.forEach((entrada, i) => {
      const registro = registros[i]
      if (registro) candidatos.push({ entrada, registro })
      else huerfanas.push([entidad, entrada.registro_id])
    })
  }
  if (huerfanas.length) await db.cola.bulkDelete(huerfanas)
  const rango = (c: Candidato): number => (esRecorridoCerrado(c) ? RANGO_CIERRE : RANGO[c.entrada.entidad])
  return candidatos.sort(
    (a, b) =>
      rango(a) - rango(b) ||
      Number(b.registro.eliminado) - Number(a.registro.eliminado) ||
      a.registro.updated_at.localeCompare(b.registro.updated_at) ||
      a.entrada.registro_id.localeCompare(b.entrada.registro_id),
  )
}

/**
 * Cuando la cola no cabe en un solo lote, un recorrido cerrado todavía no sale (va al final), pero sus tablas
 * necesitan que ya exista en el servidor. Se manda su "cascarón": el mismo recorrido, en curso y con una marca 1 ms
 * más vieja. Así existe desde el primer lote y su versión final (cerrado, con su marca real) sigue siendo más nueva
 * que el cascarón y se aplica, cierre incluido, en el último lote. El cascarón no toca la cola.
 */
function cascaron(c: Candidato): ItemLote {
  const registro = aRegistroServidor(c.registro)
  return {
    entidad: ENTIDAD_SERVIDOR.recorridos,
    registro: { ...registro, estado: 'en_curso', updated_at: new Date(Date.parse(c.registro.updated_at) - 1).toISOString() },
  }
}

/**
 * Envía UN lote (hasta 200 registros) con `aplicar_cambios`.
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
  const cola = await colaOrdenada(db)
  const resumen: ResumenEnvio = { atendidas: 0, aplicados: 0, ignorados: 0, rechazados: 0, hubo: cola.length > 0 }
  if (!cola.length) return resumen

  const lote = cola.slice(0, limite)
  const cascarones = cola.length > limite ? cola.slice(limite).filter(esRecorridoCerrado).map(cascaron) : []
  const items: ItemLote[] = [
    ...cascarones,
    ...lote.map((c) => ({ entidad: ENTIDAD_SERVIDOR[c.entrada.entidad], registro: aRegistroServidor(c.registro) })),
  ]
  const todos = await servidor.aplicarCambios(items)
  if (todos.length !== items.length) throw new Error(`El servidor respondió ${todos.length} resultados para ${items.length} registros.`)
  const resultados = todos.slice(cascarones.length)

  await db.transaction('rw', db.cola, db.rechazos, async () => {
    for (const [i, c] of lote.entries()) {
      const r = resultados[i]
      const llave: [Entidad, string] = [c.entrada.entidad, c.entrada.registro_id]
      const enviado = c.registro.updated_at
      const vigente = await db.cola.get(llave)
      const sigueIgual = !!vigente && vigente.updated_at === enviado
      if (r.resultado === 'rechazado') {
        // Si la entrada cambió, hay una edición más nueva que se enviará (y se juzgará) por su cuenta.
        if (!sigueIgual) continue
        await db.cola.delete(llave)
        await db.rechazos.put({ entidad: c.entrada.entidad, registro_id: c.entrada.registro_id, updated_at: enviado, motivo: r.motivo ?? 'El servidor rechazó el cambio.', fecha: ahoraISO() })
        resumen.rechazados++
      } else {
        if (sigueIgual) await db.cola.delete(llave)
        if (r.resultado === 'aplicado') resumen.aplicados++
        else resumen.ignorados++
      }
      if (sigueIgual) resumen.atendidas++
    }
  })
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

import type { Entidad, SigatokaDB } from '../db'

/**
 * Recorridos que tienen algo sin resolver: ellos mismos, o alguna de sus evaluaciones, plantas u hojas (incluidas las
 * eliminadas), en la cola de pendientes o en la lista de rechazos.
 *
 * Parte de la cola y de los rechazos (que son pocos), no de los datos: por cada entrada resuelve su recorrido subiendo
 * hoja → planta → evaluación → recorrido, un nivel por consulta en bloque. Un recorrido cerrado está "Sincronizado" si
 * no aparece aquí.
 */
export async function recorridosConAlgoPendiente(db: SigatokaDB): Promise<Set<string>> {
  const entradas = [...(await db.cola.toArray()), ...(await db.rechazos.toArray())]
  const ids = (entidad: Entidad): string[] => entradas.filter((e) => e.entidad === entidad).map((e) => e.registro_id)
  const unicos = (xs: Array<string | undefined>): string[] => [...new Set(xs.filter((x): x is string => !!x))]

  const hojas = (await db.hojas.bulkGet(ids('hojas'))).filter((h) => !!h)
  const plantaIds = unicos([...ids('plantas'), ...hojas.map((h) => h?.planta_id)])
  const plantas = (await db.plantas.bulkGet(plantaIds)).filter((p) => !!p)
  const evaluacionIds = unicos([...ids('evaluaciones'), ...plantas.map((p) => p?.evaluacion_tabla_id)])
  const evaluaciones = (await db.evaluaciones.bulkGet(evaluacionIds)).filter((e) => !!e)
  return new Set(unicos([...ids('recorridos'), ...evaluaciones.map((e) => e?.recorrido_id)]))
}

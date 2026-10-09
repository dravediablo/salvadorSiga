export type EntidadInexistente = 'hoja' | 'planta' | 'tabla' | 'recorrido' | 'evaluacion'

const ARTICULO: Record<EntidadInexistente, string> = {
  hoja: 'una hoja',
  planta: 'una planta',
  tabla: 'una tabla',
  recorrido: 'un recorrido',
  evaluacion: 'una tabla del recorrido',
}

/**
 * El registro que se quería escribir ya no existe o está eliminado. Lo lanzan los
 * repositorios; quien reintenta una escritura fallida lo distingue por tipo
 * (`instanceof`), nunca por el texto del mensaje.
 */
export class RegistroInexistente extends Error {
  readonly entidad: EntidadInexistente
  constructor(entidad: EntidadInexistente) {
    super(`${ARTICULO[entidad].replace(/^./, (c) => c.toUpperCase())} ya no existe.`)
    this.name = 'RegistroInexistente'
    this.entidad = entidad
  }
  /** Aviso para el usuario cuando se descarta un cambio pendiente. */
  get aviso(): string {
    return `Se descartó un cambio a ${ARTICULO[this.entidad]} que ya no existe.`
  }
}

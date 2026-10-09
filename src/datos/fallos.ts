/**
 * Escrituras en segundo plano que fallaron.
 *
 * La interfaz no espera a la base para avanzar (calificar una hoja debe sentirse
 * inmediato), así que un fallo llega tarde. Aquí se guarda el cambio fallido, con
 * lo necesario para reintentarlo tal cual, y la interfaz lo muestra fijo en el
 * encabezado hasta que se guarde. Mientras haya fallos no se puede cerrar un recorrido.
 */

export interface Fallo {
  /** Dos escrituras con la misma clave se reemplazan: gana la última. */
  clave: string
  /** Qué pasó, en palabras claras. */
  mensaje: string
  /** El cambio pendiente: volver a llamarla lo reintenta. */
  tarea: () => Promise<unknown>
}

const fallos = new Map<string, Fallo>()
/** Número de la última escritura lanzada por clave: una más nueva reemplaza a las anteriores. */
const ultimaPorClave = new Map<string, number>()
let contador = 0
let instantanea: readonly Fallo[] = []
const oyentes = new Set<() => void>()

function publicar(): void {
  instantanea = [...fallos.values()]
  for (const o of oyentes) o()
}

/** Texto del error para el operador. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.name === 'QuotaExceededError') return 'el dispositivo se quedó sin espacio. Libera espacio y toca Reintentar.'
  if (e instanceof Error && e.message) return e.message
  return 'error desconocido.'
}

/**
 * Lanza una escritura sin esperarla. Si falla, queda registrada para reintentarla.
 * `clave` identifica el dato escrito (p. ej. `hoja:<id>`): una escritura más nueva
 * con la misma clave descarta el fallo anterior, para que un reintento nunca
 * pise un valor más reciente.
 */
export function enSegundoPlano(tarea: () => Promise<unknown>, clave: string = `suelta:${crypto.randomUUID()}`): Promise<void> {
  const numero = ++contador
  ultimaPorClave.set(clave, numero)
  return tarea().then(
    () => {
      if (ultimaPorClave.get(clave) === numero && fallos.delete(clave)) publicar()
    },
    (e: unknown) => {
      // Si ya se lanzó una escritura más nueva de lo mismo, esta ya no importa.
      if (ultimaPorClave.get(clave) !== numero) return
      fallos.set(clave, { clave, mensaje: mensajeDeError(e), tarea })
      publicar()
    },
  )
}

/** Reintenta los cambios fallidos, en el orden en que fallaron. Los que vuelvan a fallar siguen en la lista. */
export async function reintentar(): Promise<void> {
  const pendientes = [...fallos.values()]
  for (const f of pendientes) await enSegundoPlano(f.tarea, f.clave)
}

export const fallosPendientes = (): readonly Fallo[] => instantanea
export const hayFallos = (): boolean => fallos.size > 0

/** Para `useSyncExternalStore`. */
export function suscribirFallos(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Solo para pruebas: deja la lista vacía. */
export function olvidarFallos(): void {
  fallos.clear()
  ultimaPorClave.clear()
  publicar()
}

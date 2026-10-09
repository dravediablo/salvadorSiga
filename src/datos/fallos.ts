/**
 * Escrituras en segundo plano que fallaron.
 *
 * La interfaz no espera a la base para avanzar (calificar una hoja debe sentirse
 * inmediato), así que un fallo llega tarde. Aquí se guarda el cambio fallido, con
 * lo necesario para reintentarlo tal cual, y la interfaz lo muestra fijo en el
 * encabezado hasta que se guarde. Mientras haya fallos no se puede cerrar un recorrido.
 */
import { RegistroInexistente } from './errores'

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
const oyentesDescarte = new Set<(aviso: string) => void>()

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
      // El registro ya no existe (se bajó el TH, se eliminó la planta…): reintentar no tiene sentido.
      // Se descarta el cambio (y cualquier fallo previo de la misma clave) y se avisa una sola vez.
      if (e instanceof RegistroInexistente) {
        if (ultimaPorClave.get(clave) === numero) {
          ultimaPorClave.delete(clave)
          if (fallos.delete(clave)) publicar()
        }
        for (const o of oyentesDescarte) o(e.aviso)
        return
      }
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

/** Avisa cada vez que se descarta un cambio pendiente a un registro que ya no existe. */
export function alDescartar(oyente: (aviso: string) => void): () => void {
  oyentesDescarte.add(oyente)
  return () => {
    oyentesDescarte.delete(oyente)
  }
}

/**
 * Claves de fallo: identifican registro Y campo. Un cambio exitoso a un campo nunca
 * descarta el fallo pendiente de otro campo (observaciones no pisa hmj_pizca).
 */
export const claveHojaGrado = (hojaId: string): string => `hoja:${hojaId}:grado`
export const clavePlantaTh = (plantaId: string): string => `planta:${plantaId}:th`
export const claveTablaCampo = (tablaId: string, campo: string): string => `tabla:${tablaId}:${campo}`

/** Campos de la planta que van juntos en una clave: las tres columnas del GPS son un solo dato. */
const campoDeClave = (campo: string): string => (campo.startsWith('gps_') ? 'gps' : campo)

/**
 * Parte un cambio de planta en un grupo por campo (el GPS va junto), cada uno con su clave,
 * para que cada grupo se guarde y se reintente por separado.
 */
export function gruposDeCambioPlanta<T extends object>(plantaId: string, cambios: T): Array<{ clave: string; cambios: Partial<T> }> {
  const grupos = new Map<string, Partial<T>>()
  for (const [campo, valor] of Object.entries(cambios)) {
    const clave = `planta:${plantaId}:${campoDeClave(campo)}`
    grupos.set(clave, { ...grupos.get(clave), [campo]: valor } as Partial<T>)
  }
  return [...grupos].map(([clave, c]) => ({ clave, cambios: c }))
}

/** Solo para pruebas: deja la lista vacía. */
export function olvidarFallos(): void {
  fallos.clear()
  ultimaPorClave.clear()
  oyentesDescarte.clear()
  publicar()
}

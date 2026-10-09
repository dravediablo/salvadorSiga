import { alEscribir } from '../cola'
import type { Rechazo, SigatokaDB } from '../db'
import { descargarTodo } from './descarga'
import { enviarTodo, TAMANO_LOTE } from './envio'
import { descartarRechazo, reintentarEnvio } from './rechazos'
import type { Servidor } from './servidor'

/** Espera entre reintentos tras un fallo del envío o de la descarga: 5 s, 15 s, 1 min, 5 min y de ahí en adelante 5 min. */
export const ESPERAS_MS: readonly number[] = [5_000, 15_000, 60_000, 300_000]
export const ESPERA_TRAS_ESCRITURA_MS = 5_000
export const CADA_MS = 60_000

/** Espera antes del reintento número `fallosSeguidos` (1 = el primer fallo). */
export function esperaTrasFallo(fallosSeguidos: number, esperas: readonly number[] = ESPERAS_MS): number {
  return esperas[Math.min(Math.max(fallosSeguidos, 1), esperas.length) - 1]
}

export const CLAVE_ULTIMA_SINCRONIZACION = 'sync.ultima'

export interface EstadoSincronizacion {
  /** `solo_local`: sin sesión, la sincronización está apagada y no se hace ninguna llamada. */
  modo: 'solo_local' | 'servidor'
  sincronizando: boolean
  /** Última sincronización correcta (ISO), o null. */
  ultima: string | null
  ultimoError: string | null
  /** Avisos de la última descarga (p. ej. marca remota demasiado en el futuro). */
  avisos: readonly string[]
  /** Hora (ms) antes de la cual los disparadores automáticos no reintentan. */
  noAntesDe: number
}

export interface OpcionesMotor {
  db: SigatokaDB
  /** `null` = sin sesión: nunca se llama al servidor. */
  servidor: Servidor | null
  ahora?: () => number
  /** Programa `fn` dentro de `ms`; devuelve cómo cancelarlo. */
  programar?: (fn: () => void, ms: number) => () => void
  enLinea?: () => boolean
  tamanoLote?: number
}

export interface OpcionesSincronizar {
  /** Ignora la espera creciente (al abrir, al volver la señal y con "Sincronizar ahora"). */
  ignorarEspera?: boolean
}

/**
 * Coordina la sincronización: primero envío, luego descarga; nunca dos a la vez; con espera creciente
 * si algo falla. No bloquea la captura: todo es asíncrono y la interfaz solo lee `estado`.
 */
export function crearMotor(o: OpcionesMotor) {
  const ahora = o.ahora ?? Date.now
  const programar = o.programar ?? ((fn, ms) => {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  })
  const enLinea = o.enLinea ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  let estado: EstadoSincronizacion = {
    modo: o.servidor ? 'servidor' : 'solo_local',
    sincronizando: false,
    ultima: null,
    ultimoError: null,
    avisos: [],
    noAntesDe: 0,
  }
  const oyentes = new Set<() => void>()
  let enCurso: Promise<void> | null = null
  let fallosSeguidos = 0
  let cancelarReintento: (() => void) | null = null
  let cancelarEspera: (() => void) | null = null

  const cambiar = (parcial: Partial<EstadoSincronizacion>): void => {
    estado = { ...estado, ...parcial }
    for (const oyente of oyentes) oyente()
  }

  void o.db.ajustes.get(CLAVE_ULTIMA_SINCRONIZACION).then((a) => {
    if (typeof a?.valor === 'string' && !estado.ultima) cambiar({ ultima: a.valor })
  })

  async function ciclo(): Promise<void> {
    const servidor = o.servidor as Servidor
    await enviarTodo(o.db, servidor, o.tamanoLote ?? TAMANO_LOTE)
    const d = await descargarTodo(o.db, servidor, ahora)
    const iso = new Date(ahora()).toISOString()
    await o.db.ajustes.put({ clave: CLAVE_ULTIMA_SINCRONIZACION, valor: iso })
    fallosSeguidos = 0
    cambiar({ ultima: iso, ultimoError: null, noAntesDe: 0, avisos: d.aviso ? [d.aviso] : [] })
    if (d.aviso) console.warn(d.aviso)
  }

  function sincronizar(opciones: OpcionesSincronizar = {}): Promise<void> {
    // Sin sesión no hay servidor: no se hace ninguna llamada.
    if (!o.servidor) return Promise.resolve()
    // Nunca dos a la vez: quien llega mientras se sincroniza espera la misma.
    if (enCurso) return enCurso
    if (!opciones.ignorarEspera && ahora() < estado.noAntesDe) return Promise.resolve()
    if (!enLinea()) return Promise.resolve()

    cancelarReintento?.()
    cancelarReintento = null
    cambiar({ sincronizando: true })
    enCurso = ciclo()
      .catch((e: unknown) => {
        fallosSeguidos++
        const espera = esperaTrasFallo(fallosSeguidos)
        const mensaje = e instanceof Error ? e.message : 'Error desconocido.'
        cambiar({ ultimoError: mensaje, noAntesDe: ahora() + espera })
        cancelarReintento = programar(() => void sincronizar(), espera)
      })
      .finally(() => {
        enCurso = null
        cambiar({ sincronizando: false })
      })
    return enCurso
  }

  // 5 s después de la última escritura local.
  const quitarOyenteEscritura = o.servidor
    ? alEscribir(o.db, () => {
        cancelarEspera?.()
        cancelarEspera = programar(() => void sincronizar(), ESPERA_TRAS_ESCRITURA_MS)
      })
    : () => undefined

  return {
    sincronizar,
    /** "Descartar mi cambio": trae la versión del servidor y borra el rechazo. */
    descartarRechazo(rechazo: Pick<Rechazo, 'entidad' | 'registro_id'>) {
      if (!o.servidor) return Promise.reject(new Error('Sin sesión no hay versión del servidor que traer.'))
      return descartarRechazo(o.db, o.servidor, rechazo)
    },
    /** "Reintentar envío": el cambio rechazado vuelve a la cola (sin cambiar su marca) y se sincroniza de inmediato. */
    async reintentarEnvio(rechazo: Pick<Rechazo, 'entidad' | 'registro_id'>): Promise<void> {
      await reintentarEnvio(o.db, rechazo)
      await sincronizar({ ignorarEspera: true })
    },
    obtenerEstado: (): EstadoSincronizacion => estado,
    suscribir(oyente: () => void): () => void {
      oyentes.add(oyente)
      return () => {
        oyentes.delete(oyente)
      }
    },
    detener(): void {
      cancelarReintento?.()
      cancelarEspera?.()
      quitarOyenteEscritura()
    },
  }
}
export type Motor = ReturnType<typeof crearMotor>

import type { SigatokaDB } from './db'

/** Clave del ajuste local donde se guarda la última marca emitida. */
export const CLAVE_ULTIMA_MARCA = 'reloj.ultima_marca'

export interface AlmacenReloj {
  leer(): Promise<number | undefined>
  guardar(ms: number): Promise<void>
}

/**
 * Generador de marcas de tiempo (`updated_at`) de un dispositivo.
 *
 * Nunca devuelve una hora igual ni anterior a la última emitida: si el reloj del
 * celular se atrasa (cambio de hora, ajuste manual) o se piden varias marcas en el
 * mismo milisegundo, usa la última más 1 ms. Así "gana la versión más reciente"
 * nunca se invierte entre dos escrituras del mismo dispositivo.
 *
 * La última marca se guarda en `ajustes` (con `persistir`) para que sobreviva al
 * cierre de la app.
 */
export function crearReloj(almacen: AlmacenReloj, ahoraMs: () => number = () => Date.now()) {
  let ultima: number | undefined
  let guardada: number | undefined
  let cargando: Promise<void> | undefined

  async function cargar(): Promise<void> {
    if (ultima !== undefined) return
    // Si la lectura falla (transacción abortada) no se queda guardada la promesa fallida.
    cargando ??= almacen
      .leer()
      .then((v) => {
        ultima = v ?? 0
        guardada = v
      })
      .finally(() => {
        cargando = undefined
      })
    await cargando
  }

  return {
    /** Siguiente marca, en ISO 8601 UTC, estrictamente mayor que cualquier marca anterior. */
    async siguiente(): Promise<string> {
      await cargar()
      ultima = Math.max(ahoraMs(), (ultima as number) + 1)
      return new Date(ultima).toISOString()
    },
    /**
     * Adelanta el generador hasta una marca remota (el `updated_at` más alto recibido del servidor), para que
     * la siguiente edición local nunca pierda contra ella. No retrocede nunca. Se persiste con `persistir`.
     */
    async avanzarHasta(ms: number): Promise<void> {
      await cargar()
      if (ms > (ultima as number)) ultima = ms
    },
    /** Guarda la última marca emitida. Llamar dentro de la transacción de escritura. */
    async persistir(): Promise<void> {
      if (ultima === undefined || ultima === guardada) return
      await almacen.guardar(ultima)
      guardada = ultima
    },
  }
}
export type Reloj = ReturnType<typeof crearReloj>

const relojes = new WeakMap<SigatokaDB, Reloj>()

/** El único generador de marcas de una base: todas las escrituras de `src/datos` lo usan. */
export function relojDe(db: SigatokaDB): Reloj {
  let r = relojes.get(db)
  if (!r) {
    r = crearReloj({
      leer: async () => (await db.ajustes.get(CLAVE_ULTIMA_MARCA))?.valor as number | undefined,
      guardar: async (ms) => {
        await db.ajustes.put({ clave: CLAVE_ULTIMA_MARCA, valor: ms })
      },
    })
    relojes.set(db, r)
  }
  return r
}

import 'fake-indexeddb/auto'
import type { Anillo } from '@/dominio'
import { SigatokaDB } from '../db'
import { crearRepoPlantas } from '../repos/plantas'
import { crearRepoRancho } from '../repos/rancho'
import { crearRepoRecorridos } from '../repos/recorridos'
import { crearRepoTablas } from '../repos/tablas'
import { esperarEscrituras } from '../cola'
import { ENTIDAD_SERVIDOR } from './entidades'
import type { ItemLote, LlavePagina, ResultadoItem, Servidor } from './servidor'

/** Utilidades compartidas por las pruebas de sincronización (unitarias y de integración). */

const abiertas: SigatokaDB[] = []

export function nuevaBase(nombre = `sync-${Math.random().toString(36).slice(2)}`): SigatokaDB {
  const db = new SigatokaDB(nombre)
  abiertas.push(db)
  return db
}

export async function cerrarBases(): Promise<void> {
  for (const db of abiertas.splice(0)) {
    await esperarEscrituras(db)
    db.close()
  }
}

/** Una base con un rancho, 3 usuarios locales y 3 tablas, más los repositorios. */
export async function sembrar(db: SigatokaDB) {
  const anillo = (n: number): Anillo => [[-103.5 + n, 18.5], [-103.497 + n, 18.5], [-103.497 + n, 18.4979], [-103.5 + n, 18.5]]
  const { rancho, usuarios } = await crearRepoRancho(db).configurarInicial({
    nombre: 'Rancho de prueba',
    poligonos: [1, 2, 3].map((n) => ({ nombre: `Tabla ${n}.`, anillo: anillo(n / 100) })),
  })
  const tablas = (await db.tablas.toArray()).sort((a, b) => a.codigo.localeCompare(b.codigo))
  return { rancho, usuarios, tablas, recorridos: crearRepoRecorridos(db), plantas: crearRepoPlantas(db), repoTablas: crearRepoTablas(db) }
}

export type Sembrado = Awaited<ReturnType<typeof sembrar>>

/** Un recorrido con una tabla y una planta de `n` hojas calificadas. */
export async function recorridoConPlanta(s: Sembrado, grados: number[] = [0, 1, 2]) {
  const { recorrido, evaluaciones } = await s.recorridos.crear({
    rancho_id: s.rancho.id, fecha: '2026-10-05', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id],
  })
  const { planta } = await s.plantas.crear(evaluaciones[0].id)
  await s.plantas.cambiarTotalHojas(planta.id, grados.length)
  return { recorrido, evaluacion: evaluaciones[0], planta }
}

type Fila = Record<string, unknown>

/** Microsegundos desde 1970 de una marca ISO con fracción de hasta 6 dígitos (como las manda Postgres). */
function microsegundos(marca: string): bigint {
  const m = /^(.*?)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(marca)
  if (!m) return BigInt(Date.parse(marca)) * 1000n
  return BigInt(Date.parse(`${m[1]}${m[3]}`)) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0').slice(0, 6))
}
/** Compara dos marcas con precisión de microsegundos. */
export function compararMarcas(a: string, b: string): number {
  const x = microsegundos(a)
  const y = microsegundos(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Servidor de mentira: guarda filas por tabla, aplica "gana la más reciente" y devuelve resultados.
 * `rechazar` decide qué registros rechaza. Todas las llamadas quedan en `llamadas`.
 */
export function servidorFalso(opciones: { rechazar?: (item: ItemLote) => string | null; alAplicar?: (lote: ItemLote[]) => Promise<void> | void; alDescargar?: (llamada: { entidad: string; despuesDe: LlavePagina | null }) => Promise<void> | void } = {}) {
  const tablas = new Map<string, Map<string, Fila>>()
  const llamadas: Array<{ tipo: 'aplicar' | 'descargar' | 'traer'; detalle: unknown }> = []
  let reloj = Date.parse('2026-10-09T12:00:00.000Z')
  const tabla = (nombre: string) => {
    if (!tablas.has(nombre)) tablas.set(nombre, new Map())
    return tablas.get(nombre) as Map<string, Fila>
  }
  const servidor: Servidor & { tablas: typeof tablas; llamadas: typeof llamadas; poner(entidad: string, fila: Fila, serverUpdatedAt?: string): void } = {
    tablas,
    llamadas,
    poner(entidad, fila, serverUpdatedAt) {
      reloj += 1000
      tabla(entidad).set(String(fila.id), { ...fila, server_updated_at: serverUpdatedAt ?? new Date(reloj).toISOString().replace('Z', '000+00:00') })
    },
    async aplicarCambios(lote) {
      llamadas.push({ tipo: 'aplicar', detalle: lote })
      await opciones.alAplicar?.(lote)
      return lote.map<ResultadoItem>((item) => {
        const id = String(item.registro.id)
        const motivo = opciones.rechazar?.(item) ?? null
        if (motivo) return { entidad: item.entidad, id, resultado: 'rechazado', motivo }
        const actual = tabla(item.entidad).get(id)
        if (actual && String(item.registro.updated_at) <= new Date(String(actual.updated_at)).toISOString()) return { entidad: item.entidad, id, resultado: 'ignorado_version', motivo: null }
        servidor.poner(item.entidad, item.registro)
        return { entidad: item.entidad, id, resultado: 'aplicado', motivo: null }
      })
    },
    async descargar(entidad, desde, despuesDe, limite) {
      llamadas.push({ tipo: 'descargar', detalle: { entidad, desde, despuesDe, limite } })
      await opciones.alDescargar?.({ entidad, despuesDe })
      const antes = (a: Fila, b: Fila) => compararMarcas(String(a.server_updated_at), String(b.server_updated_at)) || String(a.id).localeCompare(String(b.id))
      return [...tabla(entidad).values()]
        .filter((f) => {
          if (despuesDe) return compararMarcas(String(f.server_updated_at), despuesDe.server_updated_at) > 0 || (compararMarcas(String(f.server_updated_at), despuesDe.server_updated_at) === 0 && String(f.id) > despuesDe.id)
          return !desde || compararMarcas(String(f.server_updated_at), desde) > 0
        })
        .sort(antes)
        .slice(0, limite)
    },
    async traerRegistro(entidad, id) {
      llamadas.push({ tipo: 'traer', detalle: { entidad, id } })
      return tabla(entidad).get(id) ?? null
    },
  }
  return servidor
}

export const entidadesServidor = Object.values(ENTIDAD_SERVIDOR)

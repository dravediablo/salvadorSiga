import Dexie from 'dexie'
import type { EvaluacionTabla, Hoja, Planta, Recorrido, Tabla } from '@/dominio'
import { escribir, guardar } from '../cola'
import { SigatokaDB, type Entidad } from '../db'

/**
 * Migración de la etapa sin servidor: lo capturado en la base local `sigatoka` (rancho y usuarios simulados) se sube al
 * rancho real de la persona. Las tablas se copian con los MISMOS ids y el `rancho_id` nuevo; opcionalmente los recorridos
 * con sus evaluaciones, plantas y hojas, asignados al propietario. Todo entra por `guardar()`, o sea a la cola.
 * La base `sigatoka` no se borra hasta que la subida se confirme sincronizada.
 */

export const NOMBRE_BASE_ANTIGUA = 'sigatoka'
const CLAVE_MIGRACION = 'migracion.subida'

export interface ResumenBaseAntigua {
  tablas: number
  recorridos: number
  plantas: number
  hojas: number
}

export interface SubidaRegistrada {
  fecha: string
  /** Lo que se subió: cada registro debe salir de la cola para dar la subida por confirmada. */
  registros: Array<[Entidad, string]>
}

/** ¿Hay una base local de la etapa sin servidor en este dispositivo? */
export async function hayBaseAntigua(): Promise<boolean> {
  return Dexie.exists(NOMBRE_BASE_ANTIGUA)
}

const vivos = <T extends { eliminado: boolean }>(xs: T[]): T[] => xs.filter((x) => !x.eliminado)

async function conBaseAntigua<T>(f: (antigua: SigatokaDB) => Promise<T>): Promise<T> {
  const antigua = new SigatokaDB(NOMBRE_BASE_ANTIGUA)
  try {
    return await f(antigua)
  } finally {
    antigua.close()
  }
}

/** Qué hay en la base antigua (null si no existe o no tiene tablas ni recorridos). */
export async function resumenBaseAntigua(): Promise<ResumenBaseAntigua | null> {
  if (!(await hayBaseAntigua())) return null
  return conBaseAntigua(async (a) => {
    const r = {
      tablas: vivos(await a.tablas.toArray()).length,
      recorridos: vivos(await a.recorridos.toArray()).length,
      plantas: vivos(await a.plantas.toArray()).length,
      hojas: vivos(await a.hojas.toArray()).length,
    }
    return r.tablas || r.recorridos ? r : null
  })
}

export async function leerSubidaRegistrada(destino: SigatokaDB): Promise<SubidaRegistrada | null> {
  return ((await destino.ajustes.get(CLAVE_MIGRACION))?.valor as SubidaRegistrada | undefined) ?? null
}

/**
 * Sube los datos de la base antigua a `destino` (la base de la cuenta). Devuelve cuántos registros entraron a la cola.
 * Lo que ya existe en el destino con el mismo id no se vuelve a subir.
 */
export async function subirDatosLocales(destino: SigatokaDB, p: { ranchoId: string; usuarioId: string; incluirRecorridos: boolean }): Promise<ResumenBaseAntigua> {
  const origen = await conBaseAntigua(async (a) => ({
    tablas: vivos(await a.tablas.toArray()),
    recorridos: p.incluirRecorridos ? vivos(await a.recorridos.toArray()) : [],
    evaluaciones: p.incluirRecorridos ? vivos(await a.evaluaciones.toArray()) : [],
    plantas: p.incluirRecorridos ? vivos(await a.plantas.toArray()) : [],
    hojas: p.incluirRecorridos ? vivos(await a.hojas.toArray()) : [],
  }))
  const registros: Array<[Entidad, string]> = []
  const resumen: ResumenBaseAntigua = { tablas: 0, recorridos: 0, plantas: 0, hojas: 0 }

  await escribir(destino, async () => {
    const poner = async <T extends { id: string }>(entidad: Entidad, lista: T[], cambiar: (x: T) => T, cuenta?: keyof ResumenBaseAntigua) => {
      for (const x of lista) {
        if (await destino.table(entidad).get(x.id)) continue
        await guardar(destino, entidad, cambiar(x) as never)
        registros.push([entidad, x.id])
        if (cuenta) resumen[cuenta]++
      }
    }
    const rancho_id = p.ranchoId
    await poner<Tabla>('tablas', origen.tablas, (t) => ({ ...t, rancho_id }), 'tablas')
    // Los recorridos pasan a nombre del propietario (los operadores simulados no existen en el servidor).
    await poner<Recorrido>('recorridos', origen.recorridos, (r) => ({ ...r, rancho_id, usuario_id: p.usuarioId }), 'recorridos')
    await poner<EvaluacionTabla>('evaluaciones', origen.evaluaciones, (e) => ({ ...e, rancho_id }))
    await poner<Planta>('plantas', origen.plantas, (x) => ({ ...x, rancho_id }), 'plantas')
    await poner<Hoja>('hojas', origen.hojas, (h) => ({ ...h, rancho_id }), 'hojas')
    const previa = (await destino.ajustes.get(CLAVE_MIGRACION))?.valor as SubidaRegistrada | undefined
    await destino.ajustes.put({ clave: CLAVE_MIGRACION, valor: { fecha: new Date().toISOString(), registros: [...(previa?.registros ?? []), ...registros] } satisfies SubidaRegistrada })
  })
  return resumen
}

/** ¿Ya salió de la cola y de los rechazos todo lo que se subió? Solo entonces se ofrece borrar la base antigua. */
export async function subidaConfirmada(destino: SigatokaDB): Promise<boolean> {
  const subida = await leerSubidaRegistrada(destino)
  if (!subida) return false
  const llaves = subida.registros
  const [enCola, enRechazos] = await Promise.all([destino.cola.bulkGet(llaves), destino.rechazos.bulkGet(llaves)])
  return enCola.every((x) => !x) && enRechazos.every((x) => !x)
}

/** Borra la base de la etapa sin servidor. Solo después de confirmar la subida. */
export async function borrarBaseAntigua(): Promise<void> {
  await Dexie.delete(NOMBRE_BASE_ANTIGUA)
}

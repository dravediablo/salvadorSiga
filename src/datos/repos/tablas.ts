import { nuevaTabla, planearImportacion, type CambioSuperficie, type PlanImportacion, type PoligonoKml, type Tabla } from '@/dominio'
import { escribir, guardar, guardarVarios } from '../cola'
import { RegistroInexistente } from '../errores'
import type { SigatokaDB } from '../db'

export type CambiosTabla = Partial<Pick<Tabla, 'codigo' | 'variedad' | 'superficie_ha' | 'activa'>>

export interface ResultadoImportacion {
  nuevas: number
  actualizadas: number
  desactivadas: number
  /** Nombres de los polígonos "buffer" que no se importaron. */
  omitidas: string[]
  /** Tablas "buffer" importadas antes que se dieron de baja. */
  buffersEliminados: number
  /** Códigos de tablas "buffer" con evaluaciones capturadas: se desactivaron en vez de eliminarse. */
  buffersConEvaluaciones: string[]
  /** Vienen en el archivo pero están desactivadas: no se reactivan solas. */
  desactivadasEnArchivo: Array<{ tabla_id: string; codigo: string }>
  /** Tablas cuya superficie guardada difiere del polígono nuevo más del umbral (no se tocaron). */
  cambiosSuperficie: Array<{ tabla_id: string; codigo: string } & CambioSuperficie>
  advertencias: string[]
}

export function crearRepoTablas(db: SigatokaDB) {
  /** Aplica un plan de importación: crea, actualiza geometría y nombre, desactiva y da de baja buffers; nunca borra. */
  async function aplicarPlan(rancho_id: string, plan: PlanImportacion): Promise<ResultadoImportacion> {
    const nuevas = plan.nuevas.map((t) =>
      nuevaTabla({ rancho_id, codigo: t.codigo, nombre: t.nombre, superficie_ha: t.superficie_ha, geometria: t.geometria, origen: 'kmz' }),
    )
    // Solo geometría y nombre: la superficie guardada (quizá corregida a mano) se conserva.
    // Si la tabla no tenía superficie, no hay nada que conservar y se toma la del polígono.
    const actualizadas = plan.actualizadas.map(({ existente, datos }) => ({
      ...existente,
      nombre: datos.nombre,
      geometria: datos.geometria,
      superficie_ha: existente.superficie_ha ?? datos.superficie_ha,
    }))
    const desactivadas = plan.desactivadas.map((t) => ({ ...t, activa: false }))
    // Una tabla buffer con evaluaciones capturadas no se elimina: se desactiva y se avisa.
    const conEvaluaciones = new Set(
      (await db.evaluaciones.where('rancho_id').equals(rancho_id).toArray()).filter((e) => !e.eliminado).map((e) => e.tabla_id),
    )
    const buffersUsados = plan.buffersPrevios.filter((t) => conEvaluaciones.has(t.id))
    const buffers = plan.buffersPrevios.filter((t) => !conEvaluaciones.has(t.id)).map((t) => ({ ...t, eliminado: true }))
    const buffersApagados = buffersUsados.filter((t) => t.activa).map((t) => ({ ...t, activa: false }))
    await guardarVarios(db, 'tablas', [...nuevas, ...actualizadas, ...desactivadas, ...buffers, ...buffersApagados])
    return {
      nuevas: nuevas.length,
      actualizadas: actualizadas.length,
      desactivadas: desactivadas.length,
      omitidas: plan.omitidas,
      buffersEliminados: buffers.length,
      buffersConEvaluaciones: buffersUsados.map((t) => t.codigo),
      desactivadasEnArchivo: plan.desactivadasEnArchivo.map((t) => ({ tabla_id: t.id, codigo: t.codigo })),
      cambiosSuperficie: plan.actualizadas.flatMap(({ existente, cambioSuperficie }) =>
        cambioSuperficie ? [{ tabla_id: existente.id, codigo: existente.codigo, ...cambioSuperficie }] : [],
      ),
      advertencias: plan.advertencias,
    }
  }

  return {
    editar(tablaId: string, cambios: CambiosTabla): Promise<Tabla> {
      return escribir(db, async () => {
        const t = await db.tablas.get(tablaId)
        if (!t || t.eliminado) throw new RegistroInexistente('tabla')
        return guardar(db, 'tablas', { ...t, ...cambios })
      })
    },

    /** Importa los polígonos de un KMZ/KML al rancho. */
    importar(rancho_id: string, poligonos: readonly PoligonoKml[], opciones: { desactivarFaltantes: boolean }): Promise<ResultadoImportacion> {
      return escribir(db, async () => {
        const existentes = await db.tablas.where('rancho_id').equals(rancho_id).toArray()
        return aplicarPlan(rancho_id, planearImportacion(existentes, poligonos, opciones))
      })
    },
  }
}

export type RepoTablas = ReturnType<typeof crearRepoTablas>

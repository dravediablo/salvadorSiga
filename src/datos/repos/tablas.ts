import { nuevaTabla, planearImportacion, type CambioSuperficie, type PlanImportacion, type PoligonoKml, type Tabla } from '@/dominio'
import { escribir, guardar, guardarVarios } from '../cola'
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
    const buffers = plan.buffersPrevios.map((t) => ({ ...t, eliminado: true }))
    await guardarVarios(db, 'tablas', [...nuevas, ...actualizadas, ...desactivadas, ...buffers])
    return {
      nuevas: nuevas.length,
      actualizadas: actualizadas.length,
      desactivadas: desactivadas.length,
      omitidas: plan.omitidas,
      buffersEliminados: buffers.length,
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
        if (!t || t.eliminado) throw new Error('La tabla ya no existe.')
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

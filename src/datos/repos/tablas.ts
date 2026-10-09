import { nuevaTabla, planearImportacion, type PlanImportacion, type PoligonoKml, type Tabla } from '@/dominio'
import { escribir, guardar, guardarVarios } from '../cola'
import type { SigatokaDB } from '../db'

export type CambiosTabla = Partial<Pick<Tabla, 'codigo' | 'variedad' | 'superficie_ha' | 'activa'>>

export interface ResultadoImportacion {
  nuevas: number
  actualizadas: number
  desactivadas: number
  advertencias: string[]
}

export function crearRepoTablas(db: SigatokaDB) {
  /** Aplica un plan de importación: crea, actualiza y desactiva; nunca elimina. */
  async function aplicarPlan(rancho_id: string, plan: PlanImportacion): Promise<ResultadoImportacion> {
    const nuevas = plan.nuevas.map((t) =>
      nuevaTabla({
        rancho_id,
        codigo: t.codigo,
        nombre: t.nombre,
        superficie_ha: t.superficie_ha,
        geometria: t.geometria,
        origen: 'kmz',
        // Las franjas "buffer" no son tablas de evaluación: entran desactivadas.
        activa: !t.buffer,
      }),
    )
    const actualizadas = plan.actualizadas.map(({ existente, datos }) => ({
      ...existente,
      nombre: datos.nombre,
      superficie_ha: datos.superficie_ha,
      geometria: datos.geometria,
      origen: 'kmz' as const,
      // Una tabla que vuelve a venir en el archivo se reactiva, salvo las franjas buffer.
      activa: datos.buffer ? existente.activa : true,
    }))
    const desactivadas = plan.desactivadas.map((t) => ({ ...t, activa: false }))
    await guardarVarios(db, 'tablas', [...nuevas, ...actualizadas, ...desactivadas])
    return { nuevas: nuevas.length, actualizadas: actualizadas.length, desactivadas: desactivadas.length, advertencias: plan.advertencias }
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

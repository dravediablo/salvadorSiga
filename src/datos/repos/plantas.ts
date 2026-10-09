import { nuevaHoja, nuevaPlanta, type GradoGauhl, type Hoja, type Planta } from '@/dominio'
import { guardar, guardarVarios, escribir } from '../cola'
import { RegistroInexistente } from '../errores'
import type { SigatokaDB } from '../db'

/** Campos de la planta que la interfaz puede cambiar directamente (el TH tiene su propia operación). */
export type CambiosPlanta = Partial<
  Pick<Planta, 'numero_planta' | 'hmj_pizca' | 'hmj_estria' | 'hmj_mancha' | 'observaciones' | 'gps_lat' | 'gps_lon' | 'gps_precision_m'>
>

const ahora = (): string => new Date().toISOString()

/**
 * Hojas de una planta tras cambiar el TH, listas para guardar (solo las que cambian).
 * - Baja: las hojas con número mayor que el TH nuevo se marcan eliminadas.
 * - Sube: las que existieron y estaban eliminadas se reviven con su `id` y sin calificar;
 *   solo se crean hojas para números que nunca existieron.
 * Invariante: nunca quedan dos hojas vivas con el mismo `numero_hoja`.
 */
function hojasParaNuevoTh(planta: Pick<Planta, 'id' | 'rancho_id'>, existentes: Hoja[], th: number): Hoja[] {
  const cambios: Hoja[] = []
  const porNumero = new Map<number, Hoja[]>()
  for (const h of existentes) porNumero.set(h.numero_hoja, [...(porNumero.get(h.numero_hoja) ?? []), h])

  for (const h of existentes) if (!h.eliminado && h.numero_hoja > th) cambios.push({ ...h, eliminado: true })

  for (let n = 1; n <= th; n++) {
    const delNumero = porNumero.get(n) ?? []
    if (delNumero.some((h) => !h.eliminado)) continue
    // La eliminada más reciente es la que se revive; las demás siguen eliminadas.
    const eliminada = [...delNumero].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    if (eliminada) cambios.push({ ...eliminada, eliminado: false, grado_gauhl: null })
    else cambios.push(nuevaHoja(planta, n))
  }
  return cambios
}

export function crearRepoPlantas(db: SigatokaDB) {
  /** Lee las hojas vivas de una planta, ordenadas por número. */
  async function hojasVivas(plantaId: string): Promise<Hoja[]> {
    const hs = await db.hojas.where('planta_id').equals(plantaId).toArray()
    return hs.filter((h) => !h.eliminado).sort((a, b) => a.numero_hoja - b.numero_hoja)
  }

  return {
    /**
     * Crea la siguiente planta de una evaluación (número = máximo + 1) con sus hojas sin calificar.
     * Hereda el TH de la última planta; marca `hora_inicio` de la evaluación si faltaba.
     */
    crear(evaluacionId: string): Promise<{ planta: Planta; hojas: Hoja[] }> {
      return escribir(db, async () => {
        const ev = await db.evaluaciones.get(evaluacionId)
        if (!ev || ev.eliminado) throw new RegistroInexistente('evaluacion')
        const plantas = (await db.plantas.where('evaluacion_tabla_id').equals(evaluacionId).toArray()).filter((p) => !p.eliminado)
        const ultima = plantas.sort((a, b) => b.numero_planta - a.numero_planta)[0]
        const numero = ultima ? ultima.numero_planta + 1 : 1
        const { planta, hojas } = nuevaPlanta({ rancho_id: ev.rancho_id, evaluacion_tabla_id: ev.id, numero_planta: numero }, ultima)
        if (!ev.hora_inicio) await guardar(db, 'evaluaciones', { ...ev, hora_inicio: ahora() })
        const guardada = await guardar(db, 'plantas', planta)
        const hs = await guardarVarios(db, 'hojas', hojas)
        return { planta: guardada, hojas: hs }
      })
    },

    actualizar(plantaId: string, cambios: CambiosPlanta): Promise<Planta> {
      return escribir(db, async () => {
        const p = await db.plantas.get(plantaId)
        if (!p || p.eliminado) throw new RegistroInexistente('planta')
        return guardar(db, 'plantas', { ...p, ...cambios })
      })
    },

    /** Cambia el TH y ajusta las hojas según las reglas de baja, subida e invariante. */
    cambiarTotalHojas(plantaId: string, th: number): Promise<Hoja[]> {
      return escribir(db, async () => {
        const p = await db.plantas.get(plantaId)
        if (!p || p.eliminado) throw new RegistroInexistente('planta')
        if (!Number.isInteger(th) || th < 1) throw new Error('El total de hojas debe ser un número entero mayor que cero.')
        const existentes = await db.hojas.where('planta_id').equals(plantaId).toArray()
        const cambios = hojasParaNuevoTh(p, existentes, th)
        await guardar(db, 'plantas', { ...p, total_hojas: th })
        await guardarVarios(db, 'hojas', cambios)
        return hojasVivas(plantaId)
      })
    },

    calificarHoja(hojaId: string, grado: GradoGauhl | null): Promise<Hoja> {
      return escribir(db, async () => {
        const h = await db.hojas.get(hojaId)
        if (!h || h.eliminado) throw new RegistroInexistente('hoja')
        return guardar(db, 'hojas', { ...h, grado_gauhl: grado })
      })
    },

    /** Elimina la planta y, en cascada lógica, sus hojas. */
    eliminar(plantaId: string): Promise<void> {
      return escribir(db, async () => {
        const p = await db.plantas.get(plantaId)
        if (!p || p.eliminado) return
        await guardar(db, 'plantas', { ...p, eliminado: true })
        const hs = (await db.hojas.where('planta_id').equals(plantaId).toArray()).filter((h) => !h.eliminado)
        await guardarVarios(db, 'hojas', hs.map((h) => ({ ...h, eliminado: true })))
      })
    },
  }
}

export type RepoPlantas = ReturnType<typeof crearRepoPlantas>


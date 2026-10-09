import { nuevaPlanta } from './modelo'
import type { GradoGauhl, Hoja, Hmj, PlantaConHojas } from './tipos'

export const RANCHO = '00000000-0000-4000-8000-000000000001'

/** Planta con las hojas calificadas según `grados` (null = sin calificar). */
export function plantaConGrados(grados: Array<GradoGauhl | null>, hmj: { p?: Hmj; e?: Hmj; m?: Hmj } = {}): PlantaConHojas {
  const { planta, hojas } = nuevaPlanta({ rancho_id: RANCHO, evaluacion_tabla_id: 'ev', numero_planta: 1 })
  planta.total_hojas = grados.length
  planta.hmj_pizca = hmj.p ?? null
  planta.hmj_estria = hmj.e ?? null
  planta.hmj_mancha = hmj.m ?? null
  const hs: Hoja[] = grados.map((g, i) => ({ ...(hojas[i] ?? hojas[0]), id: `${planta.id}-${i + 1}`, numero_hoja: i + 1, grado_gauhl: g }))
  return { planta, hojas: hs }
}

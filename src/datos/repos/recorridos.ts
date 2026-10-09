import { nuevaEvaluacion, nuevoRecorrido, type EvaluacionTabla, type Recorrido } from '@/dominio'
import { escribir, guardar, guardarVarios } from '../cola'
import { RegistroInexistente } from '../errores'
import type { SigatokaDB } from '../db'

const ahora = (): string => new Date().toISOString()

export function crearRepoRecorridos(db: SigatokaDB) {
  async function recorridoVivo(id: string): Promise<Recorrido> {
    const r = await db.recorridos.get(id)
    if (!r || r.eliminado) throw new RegistroInexistente('recorrido')
    return r
  }

  return {
    /** Crea el recorrido y una evaluación por cada tabla, todo en una sola transacción. */
    crear(p: { rancho_id: string; fecha: string; usuario_id: string; tabla_ids: string[] }): Promise<{ recorrido: Recorrido; evaluaciones: EvaluacionTabla[] }> {
      return escribir(db, async () => {
        const recorrido = await guardar(db, 'recorridos', nuevoRecorrido({ rancho_id: p.rancho_id, fecha: p.fecha, usuario_id: p.usuario_id }))
        const evaluaciones = await guardarVarios(
          db,
          'evaluaciones',
          p.tabla_ids.map((tabla_id) => nuevaEvaluacion({ rancho_id: p.rancho_id, recorrido_id: recorrido.id, tabla_id })),
        )
        return { recorrido, evaluaciones }
      })
    },

    /** Agrega tablas a un recorrido; las que ya estaban se ignoran. */
    agregarTablas(recorridoId: string, tabla_ids: string[]): Promise<EvaluacionTabla[]> {
      return escribir(db, async () => {
        const r = await recorridoVivo(recorridoId)
        const actuales = (await db.evaluaciones.where('recorrido_id').equals(r.id).toArray()).filter((e) => !e.eliminado)
        const ya = new Set(actuales.map((e) => e.tabla_id))
        const nuevas = tabla_ids.filter((id) => !ya.has(id))
        return guardarVarios(db, 'evaluaciones', nuevas.map((tabla_id) => nuevaEvaluacion({ rancho_id: r.rancho_id, recorrido_id: r.id, tabla_id })))
      })
    },

    /** Marca la hora de fin de una tabla evaluada. */
    terminarTabla(evaluacionId: string): Promise<EvaluacionTabla> {
      return escribir(db, async () => {
        const e = await db.evaluaciones.get(evaluacionId)
        if (!e || e.eliminado) throw new RegistroInexistente('evaluacion')
        return guardar(db, 'evaluaciones', { ...e, hora_fin: ahora() })
      })
    },

    /** Cierra el recorrido; a las tablas con plantas y sin hora de fin les pone la hora actual. */
    cerrar(recorridoId: string): Promise<Recorrido> {
      return escribir(db, async () => {
        const r = await recorridoVivo(recorridoId)
        const evs = (await db.evaluaciones.where('recorrido_id').equals(r.id).toArray()).filter((e) => !e.eliminado)
        for (const e of evs) {
          if (e.hora_fin) continue
          const n = (await db.plantas.where('evaluacion_tabla_id').equals(e.id).toArray()).filter((p) => !p.eliminado).length
          if (n) await guardar(db, 'evaluaciones', { ...e, hora_fin: ahora() })
        }
        return guardar(db, 'recorridos', { ...r, estado: 'cerrado' })
      })
    },

    reabrir(recorridoId: string): Promise<Recorrido> {
      return escribir(db, async () => guardar(db, 'recorridos', { ...(await recorridoVivo(recorridoId)), estado: 'en_curso' }))
    },

    /** Elimina el recorrido y, en cascada lógica, sus evaluaciones, plantas y hojas. */
    eliminar(recorridoId: string): Promise<void> {
      return escribir(db, async () => {
        const r = await db.recorridos.get(recorridoId)
        if (!r || r.eliminado) return
        await guardar(db, 'recorridos', { ...r, eliminado: true })
        const evs = (await db.evaluaciones.where('recorrido_id').equals(r.id).toArray()).filter((e) => !e.eliminado)
        await guardarVarios(db, 'evaluaciones', evs.map((e) => ({ ...e, eliminado: true })))
        for (const e of evs) {
          const ps = (await db.plantas.where('evaluacion_tabla_id').equals(e.id).toArray()).filter((p) => !p.eliminado)
          await guardarVarios(db, 'plantas', ps.map((p) => ({ ...p, eliminado: true })))
          for (const p of ps) {
            const hs = (await db.hojas.where('planta_id').equals(p.id).toArray()).filter((h) => !h.eliminado)
            await guardarVarios(db, 'hojas', hs.map((h) => ({ ...h, eliminado: true })))
          }
        }
      })
    },
  }
}

export type RepoRecorridos = ReturnType<typeof crearRepoRecorridos>

import type { EvaluacionTabla, Hoja, Planta, PlantaConHojas, Rancho, Recorrido, Tabla, Usuario } from '@/dominio'
import { contarPendientes } from './cola'
import type { Rechazo, SigatokaDB } from './db'
import { recorridosConAlgoPendiente } from './sincronizacion/pendientesPorRecorrido'
import { describirRegistro } from './sincronizacion/rechazos'

const vivo = <T extends { eliminado: boolean }>(x: T | undefined): x is T => !!x && !x.eliminado

export interface TarjetaRecorrido {
  recorrido: Recorrido
  operador: string
  /** Cerrado y sin nada del recorrido (ni de sus tablas, plantas u hojas) en la cola ni en rechazos. */
  sincronizado: boolean
  tablas: number
  plantas: number
}

export interface EvaluacionConDatos {
  evaluacion: EvaluacionTabla
  tabla: Tabla | undefined
  plantas: PlantaConHojas[]
}

export interface DetalleRecorrido {
  recorrido: Recorrido
  operador: string
  sincronizado: boolean
  evaluaciones: EvaluacionConDatos[]
}

export interface DetalleTabla {
  evaluacion: EvaluacionTabla
  recorrido: Recorrido
  tabla: Tabla | undefined
  plantas: PlantaConHojas[]
}

export interface DetallePlanta extends DetalleTabla {
  planta: Planta
  hojas: Hoja[]
}

/**
 * Lecturas para la interfaz. Son funciones sin efectos; la interfaz las envuelve
 * en `useLiveQuery` para que se vuelvan a ejecutar cuando cambian los datos.
 */
export function crearConsultas(db: SigatokaDB) {
  async function plantasConHojas(evaluacionId: string): Promise<PlantaConHojas[]> {
    const plantas = (await db.plantas.where('evaluacion_tabla_id').equals(evaluacionId).toArray()).filter((p) => !p.eliminado)
    plantas.sort((a, b) => a.numero_planta - b.numero_planta)
    const salida: PlantaConHojas[] = []
    for (const planta of plantas) {
      const hojas = (await db.hojas.where('planta_id').equals(planta.id).toArray()).filter((h) => !h.eliminado)
      salida.push({ planta, hojas: hojas.sort((a, b) => a.numero_hoja - b.numero_hoja) })
    }
    return salida
  }

  async function nombreUsuario(id: string): Promise<string> {
    return (await db.usuarios.get(id))?.nombre ?? 'Usuario'
  }

  return {
    async rancho(): Promise<Rancho | undefined> {
      return (await db.ranchos.toArray()).find(vivo)
    },
    async usuarios(): Promise<Usuario[]> {
      return (await db.usuarios.toArray()).filter(vivo)
    },
    async tablas(): Promise<Tabla[]> {
      return (await db.tablas.toArray()).filter(vivo)
    },

    plantasConHojas,

    /** Todos los recorridos vivos con sus conteos, del más reciente al más antiguo. */
    async tarjetasRecorridos(): Promise<TarjetaRecorrido[]> {
      const recs = (await db.recorridos.toArray()).filter(vivo)
      const pendientes = await recorridosConAlgoPendiente(db)
      const nombres = new Map<string, string>()
      const operadorDe = async (id: string): Promise<string> => {
        if (!nombres.has(id)) nombres.set(id, await nombreUsuario(id))
        return nombres.get(id) as string
      }
      recs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
      const salida: TarjetaRecorrido[] = []
      for (const recorrido of recs) {
        const evs = (await db.evaluaciones.where('recorrido_id').equals(recorrido.id).toArray()).filter(vivo)
        let plantas = 0
        for (const e of evs) plantas += (await db.plantas.where('evaluacion_tabla_id').equals(e.id).toArray()).filter(vivo).length
        salida.push({
          recorrido,
          operador: await operadorDe(recorrido.usuario_id),
          sincronizado: recorrido.estado === 'cerrado' && !pendientes.has(recorrido.id),
          tablas: evs.length,
          plantas,
        })
      }
      return salida
    },

    async detalleRecorrido(recorridoId: string): Promise<DetalleRecorrido | undefined> {
      const recorrido = await db.recorridos.get(recorridoId)
      if (!vivo(recorrido)) return undefined
      const evs = (await db.evaluaciones.where('recorrido_id').equals(recorrido.id).toArray()).filter(vivo)
      const evaluaciones: EvaluacionConDatos[] = []
      for (const evaluacion of evs) {
        evaluaciones.push({ evaluacion, tabla: await db.tablas.get(evaluacion.tabla_id), plantas: await plantasConHojas(evaluacion.id) })
      }
      return {
        recorrido,
        operador: await nombreUsuario(recorrido.usuario_id),
        sincronizado: recorrido.estado === 'cerrado' && !(await recorridosConAlgoPendiente(db)).has(recorrido.id),
        evaluaciones,
      }
    },

    async detalleTabla(evaluacionId: string): Promise<DetalleTabla | undefined> {
      const evaluacion = await db.evaluaciones.get(evaluacionId)
      if (!vivo(evaluacion)) return undefined
      const recorrido = await db.recorridos.get(evaluacion.recorrido_id)
      if (!vivo(recorrido)) return undefined
      return { evaluacion, recorrido, tabla: await db.tablas.get(evaluacion.tabla_id), plantas: await plantasConHojas(evaluacion.id) }
    },

    async detallePlanta(evaluacionId: string, plantaId: string): Promise<DetallePlanta | undefined> {
      const base = await this.detalleTabla(evaluacionId)
      const actual = base?.plantas.find((x) => x.planta.id === plantaId)
      if (!base || !actual) return undefined
      return { ...base, planta: actual.planta, hojas: actual.hojas }
    },

    /** Operadores del rancho según lo descargado: su membresía (activa o no) y el nombre de su perfil. */
    async operadores(): Promise<Array<{ usuarioId: string; nombre: string; activo: boolean }>> {
      const membresias = (await db.membresias.toArray()).filter((m) => !m.eliminado && m.rol === 'operador')
      const salida = await Promise.all(membresias.map(async (m) => ({ usuarioId: m.usuario_id, nombre: (await db.usuarios.get(m.usuario_id))?.nombre || 'Operador', activo: m.activo })))
      return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },

    /** Rechazos del servidor pendientes de revisar, con una descripción legible, del más reciente al más antiguo. */
    async rechazos(): Promise<Array<{ rechazo: Rechazo; descripcion: string }>> {
      const lista = (await db.rechazos.toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha))
      return Promise.all(lista.map(async (rechazo) => ({ rechazo, descripcion: await describirRegistro(db, rechazo.entidad, rechazo.registro_id) })))
    },
    contarRechazos: () => db.rechazos.count(),

    /** Registros distintos con cambios sin enviar. */
    pendientes: () => contarPendientes(db),
  }
}

export type Consultas = ReturnType<typeof crearConsultas>

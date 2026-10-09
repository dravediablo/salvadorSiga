import type { Registro } from '@/dominio'
import type { Entidad, Rechazo, SigatokaDB } from '../db'
import { aplicarRemoto } from '../remoto'
import { deFilaServidor, ENTIDAD_SERVIDOR } from './entidades'
import type { Servidor } from './servidor'

/**
 * "Descartar mi cambio": trae la versión del servidor y borra el rechazo.
 * Si el servidor no tiene el registro (nació aquí y fue rechazado), se retira de la vista del dispositivo
 * (`eliminado = true`, sin entrada en la cola: el servidor nunca lo tuvo).
 * Si falla la llamada, lanza y el rechazo se queda.
 */
export async function descartarRechazo(db: SigatokaDB, servidor: Servidor, rechazo: Pick<Rechazo, 'entidad' | 'registro_id'>): Promise<'version_del_servidor' | 'retirado'> {
  const fila = await servidor.traerRegistro(ENTIDAD_SERVIDOR[rechazo.entidad], rechazo.registro_id)
  return db.transaction('rw', [db.table(rechazo.entidad), db.cola, db.rechazos], async () => {
    // Si mientras tanto se volvió a editar, el rechazo ya no existe y no hay nada que descartar.
    if (!(await db.rechazos.get([rechazo.entidad, rechazo.registro_id]))) return 'version_del_servidor'
    if (fila) {
      await aplicarRemoto(db, rechazo.entidad, deFilaServidor<Registro>(fila), true)
      await db.rechazos.delete([rechazo.entidad, rechazo.registro_id])
      return 'version_del_servidor'
    }
    const local = (await db.table(rechazo.entidad).get(rechazo.registro_id)) as Registro | undefined
    if (local) await db.table(rechazo.entidad).put({ ...local, eliminado: true })
    await db.rechazos.delete([rechazo.entidad, rechazo.registro_id])
    return 'retirado'
  })
}

/** Texto legible de lo que se rechazó, p. ej. "Hoja 3 de la planta 7, tabla 4". */
export async function describirRegistro(db: SigatokaDB, entidad: Entidad, id: string): Promise<string> {
  const tablaDeEvaluacion = async (evaluacionId: string): Promise<string> => {
    const ev = await db.evaluaciones.get(evaluacionId)
    const t = ev ? await db.tablas.get(ev.tabla_id) : undefined
    return t ? `tabla ${t.codigo}` : 'una tabla'
  }
  switch (entidad) {
    case 'hojas': {
      const h = await db.hojas.get(id)
      if (!h) return 'Una hoja'
      const p = await db.plantas.get(h.planta_id)
      return p ? `Hoja ${h.numero_hoja} de la planta ${p.numero_planta}, ${await tablaDeEvaluacion(p.evaluacion_tabla_id)}` : `Hoja ${h.numero_hoja}`
    }
    case 'plantas': {
      const p = await db.plantas.get(id)
      return p ? `Planta ${p.numero_planta}, ${await tablaDeEvaluacion(p.evaluacion_tabla_id)}` : 'Una planta'
    }
    case 'evaluaciones': {
      const ev = await db.evaluaciones.get(id)
      const t = ev ? await db.tablas.get(ev.tabla_id) : undefined
      return `Tabla ${t?.codigo ?? '?'} del recorrido`
    }
    case 'recorridos': {
      const r = await db.recorridos.get(id)
      return r ? `Recorrido del ${r.fecha}` : 'Un recorrido'
    }
    case 'tablas': {
      const t = await db.tablas.get(id)
      return t ? `Tabla ${t.codigo}` : 'Una tabla'
    }
    case 'aplicaciones': {
      const a = await db.aplicaciones.get(id)
      return a ? `Aplicación del ${a.fecha}${a.producto ? ` (${a.producto})` : ''}` : 'Una aplicación'
    }
    case 'ranchos':
      return 'Datos del rancho'
    case 'usuarios':
      return 'Tu perfil'
    case 'membresias':
      return 'Una membresía'
    case 'clima':
      return 'Un registro de clima'
  }
}

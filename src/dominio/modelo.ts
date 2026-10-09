import { hoy, semanaISO } from './fechas'
import type {
  Aplicacion,
  EvaluacionTabla,
  Hoja,
  Membresia,
  Planta,
  Recorrido,
  Registro,
  Rancho,
  Tabla,
  TipoEvaluacion,
} from './tipos'

const ahora = (): string => new Date().toISOString()

/** Campos comunes de un registro nuevo; `server_updated_at` queda vacío. */
function base(): Registro {
  const t = ahora()
  return { id: crypto.randomUUID(), created_at: t, updated_at: t, server_updated_at: null, eliminado: false }
}

export function nuevoRancho(p: Partial<Rancho> & Pick<Rancho, 'nombre'>): Rancho {
  return {
    ...base(),
    codigo: '',
    lat: null,
    lon: null,
    // Valores por defecto provisionales (ver Decisiones pendientes en CLAUDE.md).
    ii_umbral_medio: 20,
    ii_umbral_alto: 30,
    dias_alerta_aplicacion: 14,
    ...p,
  }
}

export function nuevaMembresia(p: Pick<Membresia, 'rancho_id' | 'usuario_id' | 'rol'> & Partial<Membresia>): Membresia {
  return { ...base(), activo: true, ...p }
}

export function nuevaTabla(p: Pick<Tabla, 'rancho_id'> & Partial<Tabla>): Tabla {
  return {
    ...base(),
    codigo: '',
    nombre: '',
    superficie_ha: null,
    variedad: '',
    geometria: null,
    activa: true,
    origen: 'manual',
    ...p,
  }
}

export function nuevoRecorrido(p: Pick<Recorrido, 'rancho_id' | 'fecha' | 'usuario_id'>): Recorrido {
  return { ...base(), ...p, semana_iso: semanaISO(p.fecha), estado: 'en_curso' }
}

export function nuevaEvaluacion(
  p: Pick<EvaluacionTabla, 'rancho_id' | 'recorrido_id' | 'tabla_id'> & { tipo?: TipoEvaluacion },
): EvaluacionTabla {
  return { ...base(), ...p, tipo: p.tipo ?? 'stover', hora_inicio: null, hora_fin: null }
}

export function nuevaHoja(planta: Pick<Planta, 'id' | 'rancho_id'>, numero_hoja: number): Hoja {
  return { ...base(), rancho_id: planta.rancho_id, planta_id: planta.id, numero_hoja, grado_gauhl: null }
}

/**
 * Deja la planta con exactamente `th` hojas: recorta las sobrantes (conserva
 * la 1 a la `th` con sus grados) o agrega las faltantes sin calificar.
 */
export function ajustarHojas(planta: Pick<Planta, 'id' | 'rancho_id'>, hojas: Hoja[], th: number): Hoja[] {
  const ordenadas = [...hojas].sort((a, b) => a.numero_hoja - b.numero_hoja).slice(0, th)
  for (let i = ordenadas.length + 1; i <= th; i++) ordenadas.push(nuevaHoja(planta, i))
  return ordenadas
}

/**
 * Planta nueva con sus hojas sin calificar. Si se pasa la planta anterior se
 * hereda su total de hojas; si no, 10.
 */
export function nuevaPlanta(
  p: Pick<Planta, 'rancho_id' | 'evaluacion_tabla_id' | 'numero_planta'>,
  previa?: Pick<Planta, 'total_hojas'>,
): { planta: Planta; hojas: Hoja[] } {
  const planta: Planta = {
    ...base(),
    ...p,
    total_hojas: previa ? previa.total_hojas : 10,
    hmj_pizca: null,
    hmj_estria: null,
    hmj_mancha: null,
    observaciones: '',
    gps_lat: null,
    gps_lon: null,
    gps_precision_m: null,
  }
  return { planta, hojas: ajustarHojas(planta, [], planta.total_hojas) }
}

export function nuevaAplicacion(p: Pick<Aplicacion, 'rancho_id'> & Partial<Aplicacion>): Aplicacion {
  return {
    ...base(),
    fecha: hoy(),
    tabla_ids: [],
    producto: '',
    ingrediente_activo: '',
    grupo_frac: '',
    dosis: null,
    unidad: 'L/ha',
    volumen_mezcla: null,
    metodo: 'Terrestre',
    usuario_id: null,
    responsable: '',
    observaciones: '',
    ...p,
  }
}

/** Campos comunes a todos los registros sincronizables. */
export interface Registro {
  id: string
  /** Marca de tiempo ISO del cliente. */
  created_at: string
  /** Marca de tiempo ISO del cliente; decide los conflictos. */
  updated_at: string
  /** La pone el servidor; `null` hasta sincronizar. */
  server_updated_at: string | null
  /** Nada se borra físicamente. */
  eliminado: boolean
}

export type Rol = 'operador' | 'administrador'
export type EstadoRecorrido = 'en_curso' | 'cerrado'
export type TipoEvaluacion = 'stover' | 'preaviso'
export type OrigenTabla = 'kmz' | 'manual'

/** Grado de la escala de Gauhl; `null` = hoja sin calificar. */
export type GradoGauhl = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Polígono GeoJSON (un solo anillo exterior en este proyecto). */
export interface Poligono {
  type: 'Polygon'
  /** Coordenadas [lon, lat]. */
  coordinates: number[][][]
}

export interface Rancho extends Registro {
  nombre: string
  lat: number | null
  lon: number | null
  ii_umbral_medio: number
  ii_umbral_alto: number
  dias_alerta_aplicacion: number
}

export interface Usuario extends Registro {
  nombre: string
  email: string
}

export interface Membresia extends Registro {
  rancho_id: string
  usuario_id: string
  rol: Rol
  activo: boolean
}

export interface Tabla extends Registro {
  rancho_id: string
  codigo: string
  nombre: string
  superficie_ha: number | null
  variedad: string
  geometria: Poligono | null
  activa: boolean
  origen: OrigenTabla
}

export interface Recorrido extends Registro {
  rancho_id: string
  /** AAAA-MM-DD, sin zona horaria. */
  fecha: string
  /** Semana ISO 8601 (AAAA-Www). */
  semana_iso: string
  usuario_id: string
  estado: EstadoRecorrido
}

export interface EvaluacionTabla extends Registro {
  rancho_id: string
  recorrido_id: string
  tabla_id: string
  tipo: TipoEvaluacion
  hora_inicio: string | null
  hora_fin: string | null
}

/**
 * Número de hoja más joven con un síntoma.
 * - `n >= 1`: número de hoja.
 * - `0`: "no presenta".
 * - `null`: sin capturar.
 */
export type Hmj = number | null

export interface Planta extends Registro {
  rancho_id: string
  evaluacion_tabla_id: string
  /** Consecutivo dentro de la tabla; las plantas no se siguen entre semanas. */
  numero_planta: number
  total_hojas: number
  /** Ver {@link Hmj}: 0 = "no presenta", null = sin capturar. */
  hmj_pizca: Hmj
  hmj_estria: Hmj
  hmj_mancha: Hmj
  observaciones: string
  gps_lat: number | null
  gps_lon: number | null
  gps_precision_m: number | null
}

export interface Hoja extends Registro {
  rancho_id: string
  planta_id: string
  /** 1 = la más joven completamente abierta. */
  numero_hoja: number
  grado_gauhl: GradoGauhl | null
}

/** Entrada de `resumen` y `distribucion`: una planta con sus hojas. */
export interface PlantaConHojas {
  planta: Planta
  hojas: Hoja[]
}

export interface Aplicacion extends Registro {
  rancho_id: string
  fecha: string
  producto: string
  ingrediente_activo: string
  grupo_frac: string
  dosis: number | null
  unidad: string
  volumen_mezcla: number | null
  metodo: string
  usuario_id: string | null
  responsable: string
  observaciones: string
}

export interface AplicacionTabla {
  aplicacion_id: string
  tabla_id: string
}

export interface ClimaDiario {
  rancho_id: string
  fecha: string
  temp_max: number | null
  temp_min: number | null
  temp_media: number | null
  hr_media: number | null
  precipitacion: number | null
  horas_hr_alta: number | null
  fuente: string
}

/** Futuro: preaviso biológico. Solo deja el espacio en el modelo. */
export interface PlantaMarcada extends Registro {
  rancho_id: string
  tabla_id: string
  fecha_marcado: string
}

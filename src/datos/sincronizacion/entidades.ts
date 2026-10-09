import type { Registro } from '@/dominio'
import type { Entidad } from '../db'

/** Tabla local de Dexie (plural) → tabla del servidor (singular). */
export const ENTIDAD_SERVIDOR: Record<Entidad, string> = {
  ranchos: 'rancho',
  usuarios: 'usuario',
  membresias: 'membresia',
  tablas: 'tabla',
  recorridos: 'recorrido',
  evaluaciones: 'evaluacion_tabla',
  plantas: 'planta',
  hojas: 'hoja',
  aplicaciones: 'aplicacion',
  clima: 'clima_diario',
}

/** Orden de dependencias para descargar (padres antes que hijos). */
export const ORDEN_DESCARGA: readonly Entidad[] = [
  'ranchos', 'usuarios', 'membresias', 'tablas', 'recorridos', 'evaluaciones', 'plantas', 'hojas', 'aplicaciones', 'clima',
]

export function entidadLocal(servidor: string): Entidad | undefined {
  return (Object.keys(ENTIDAD_SERVIDOR) as Entidad[]).find((e) => ENTIDAD_SERVIDOR[e] === servidor)
}

/** Campos que solo existen en el dispositivo: no se mandan al servidor (lo pone él). */
const SOLO_LOCALES = ['server_updated_at'] as const

/** Registro local → registro para `aplicar_cambios`: la fila COMPLETA, sin los campos solo locales. */
export function aRegistroServidor(registro: Registro): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...registro }
  for (const campo of SOLO_LOCALES) delete copia[campo]
  return copia
}

/** Columnas timestamptz de cada tabla (el servidor las devuelve como "…+00:00", con microsegundos). */
const MARCAS = ['created_at', 'updated_at', 'hora_inicio', 'hora_fin'] as const

/**
 * Fila del servidor → registro local. Las marcas se normalizan a ISO UTC con milisegundos
 * ("2026-10-09T12:00:00.123Z"), el mismo formato que escribe el generador local, para que
 * se puedan comparar como texto. `server_updated_at` se conserva tal cual lo mandó el servidor.
 */
export function deFilaServidor<T extends Registro>(fila: Record<string, unknown>): T {
  const copia: Record<string, unknown> = { ...fila }
  for (const campo of MARCAS) {
    const valor = copia[campo]
    if (typeof valor === 'string') copia[campo] = new Date(valor).toISOString()
  }
  return copia as unknown as T
}

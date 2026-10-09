import { useSyncExternalStore } from 'react'
import { motor, type EstadoSincronizacion } from '@/datos'

/** Estado de la sincronización (se vuelve a leer cuando cambia). */
export function useSincronizacion(): EstadoSincronizacion {
  return useSyncExternalStore(motor.suscribir, motor.obtenerEstado)
}

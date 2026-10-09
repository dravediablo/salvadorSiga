import { useSyncExternalStore } from 'react'
import { fallosPendientes, suscribirFallos, type Fallo } from '@/datos'

/** Escrituras en segundo plano que fallaron y esperan un reintento. */
export function useFallos(): readonly Fallo[] {
  return useSyncExternalStore(suscribirFallos, fallosPendientes)
}

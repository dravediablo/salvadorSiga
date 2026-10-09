import { useEffect } from 'react'
import { ajustes, alDescartar, CLAVE_AVISO_MIGRACION } from '@/datos'
import { avisar } from './dialogos'

/**
 * Avisos que llegan sin que el usuario haya tocado nada: lo que dejó una migración de la base
 * (se muestra una sola vez) y los cambios pendientes que se descartaron porque su registro ya no existe.
 */
export function AvisosDeInicio() {
  useEffect(() => {
    void (async () => {
      const texto = await ajustes.leer<string>(CLAVE_AVISO_MIGRACION)
      if (!texto) return
      await ajustes.quitar(CLAVE_AVISO_MIGRACION)
      avisar(texto)
    })()
    return alDescartar(avisar)
  }, [])
  return null
}

import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registro del service worker en modo `prompt`: cuando hay una versión nueva
 * solo se avisa; la app NUNCA se recarga sola (podría pasar a mitad de una captura).
 */
let hayNueva = false
let listaSinConexion = false
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())
let aplicar: ((recargar?: boolean) => Promise<void>) | null = null

export function registrarServiceWorker(): void {
  if (aplicar || !('serviceWorker' in navigator)) return
  aplicar = registerSW({
    onNeedRefresh() {
      hayNueva = true
      avisar()
    },
    onOfflineReady() {
      listaSinConexion = true
      avisar()
    },
  })
}

export function useActualizacion() {
  const [, forzar] = useState(0)
  useEffect(() => {
    const f = () => forzar((n) => n + 1)
    oyentes.add(f)
    return () => {
      oyentes.delete(f)
    }
  }, [])
  return {
    hayNueva,
    listaSinConexion,
    /** Activa la versión nueva y recarga. Solo se llama cuando el usuario lo decide. */
    actualizarAhora: () => aplicar?.(true),
    descartar: () => {
      hayNueva = false
      avisar()
    },
  }
}

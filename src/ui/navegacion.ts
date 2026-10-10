import { useCallback, useEffect, useState } from 'react'
import { ajustes } from '@/datos'

/** Posición en las pantallas de captura. Se guarda en el dispositivo para volver exactamente donde se estaba. */
export interface Nav {
  vista: 'lista' | 'nuevo' | 'recorrido' | 'tabla' | 'planta'
  recorridoId?: string
  evaluacionId?: string
  plantaId?: string
  /** El modal de hojas está abierto. */
  hojas?: boolean
}

export type Pestana = 'campo' | 'tablas' | 'operadores' | 'estado'

const CLAVE_NAV = 'nav'
const CLAVE_PESTANA = 'pestana'

/** `null` mientras se lee del dispositivo. */
export function useNavegacion(): { nav: Nav | null; ir: (n: Nav) => void } {
  const [nav, setNav] = useState<Nav | null>(null)
  useEffect(() => {
    let vivo = true
    void ajustes.leer<Nav>(CLAVE_NAV).then((n) => vivo && setNav(n ?? { vista: 'lista' }))
    return () => {
      vivo = false
    }
  }, [])
  const ir = useCallback((n: Nav) => {
    setNav(n)
    void ajustes.fijar(CLAVE_NAV, n)
    window.scrollTo(0, 0)
  }, [])
  return { nav, ir }
}

export function usePestana(): { pestana: Pestana | null; elegir: (p: Pestana) => void } {
  const [pestana, setPestana] = useState<Pestana | null>(null)
  useEffect(() => {
    let vivo = true
    void ajustes.leer<Pestana>(CLAVE_PESTANA).then((p) => vivo && setPestana(p ?? 'campo'))
    return () => {
      vivo = false
    }
  }, [])
  const elegir = useCallback((p: Pestana) => {
    setPestana(p)
    void ajustes.fijar(CLAVE_PESTANA, p)
    window.scrollTo(0, 0)
  }, [])
  return { pestana, elegir }
}

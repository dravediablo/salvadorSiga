import { useEffect, useState } from 'react'
import { esIOS, esSafariIOS, estaInstalada } from './plataforma'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// El evento puede llegar antes de que React monte: se captura al cargar el módulo.
let aviso: BeforeInstallPromptEvent | null = null
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    aviso = e as BeforeInstallPromptEvent
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    aviso = null
    avisar()
  })
}

export type ModoInstalacion =
  /** Ya abierta como app instalada: no se muestra nada. */
  | 'instalada'
  /** Android/Chrome con el aviso disponible: botón "Instalar". */
  | 'boton'
  /** iPhone en Safari: instrucciones de Compartir → Agregar a inicio. */
  | 'ios_safari'
  /** iPhone en otro navegador: pedir que abran el enlace en Safari. */
  | 'ios_otro'
  /** Navegador sin aviso (ya se descartó, o no es compatible). */
  | 'no_disponible'

export function useInstalacion() {
  const [, forzar] = useState(0)
  const [instalada, setInstalada] = useState(estaInstalada)

  useEffect(() => {
    const f = () => {
      setInstalada(estaInstalada())
      forzar((n) => n + 1)
    }
    oyentes.add(f)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', f)
    return () => {
      oyentes.delete(f)
      mq.removeEventListener('change', f)
    }
  }, [])

  const modo: ModoInstalacion = instalada
    ? 'instalada'
    : esIOS()
      ? esSafariIOS()
        ? 'ios_safari'
        : 'ios_otro'
      : aviso
        ? 'boton'
        : 'no_disponible'

  async function instalar(): Promise<void> {
    if (!aviso) return
    const evento = aviso
    aviso = null // el aviso solo se puede usar una vez
    avisar()
    await evento.prompt()
    await evento.userChoice
  }

  return { modo, instalada, ios: esIOS(), instalar }
}

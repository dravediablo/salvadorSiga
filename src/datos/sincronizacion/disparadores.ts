import { CADA_MS, type Motor } from './motor'

/**
 * Cuándo se sincroniza: al abrir la app, al volver la conexión, al volver a estar visible la app (respetando la
 * espera creciente) y cada 60 s mientras haya conexión y la app esté visible. (Los 5 s tras una escritura y el botón "Sincronizar ahora" los maneja el motor y la interfaz.)
 * Devuelve cómo apagarlos.
 */
export function iniciarDisparadores(motor: Motor): () => void {
  void motor.sincronizar({ ignorarEspera: true })

  const alVolverLaSenal = () => void motor.sincronizar({ ignorarEspera: true })
  window.addEventListener('online', alVolverLaSenal)

  const alVolverAVerse = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) void motor.sincronizar()
  }
  document.addEventListener('visibilitychange', alVolverAVerse)

  const cadaMinuto = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void motor.sincronizar()
  }, CADA_MS)

  return () => {
    window.removeEventListener('online', alVolverLaSenal)
    document.removeEventListener('visibilitychange', alVolverAVerse)
    clearInterval(cadaMinuto)
  }
}

const CLAVE = 'sigatoka.persistencia'
const MAX_REGISTROS = 20

export type ResultadoPersistencia = 'concedida' | 'ya_concedida' | 'rechazada' | 'no_disponible' | 'error'

export interface RegistroPersistencia {
  /** Marca de tiempo ISO. */
  cuando: string
  resultado: ResultadoPersistencia
  instalada: boolean
}

export function leerRegistros(): RegistroPersistencia[] {
  try {
    const crudo = localStorage.getItem(CLAVE)
    return crudo ? (JSON.parse(crudo) as RegistroPersistencia[]) : []
  } catch {
    return []
  }
}

function guardar(registro: RegistroPersistencia): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...leerRegistros(), registro].slice(-MAX_REGISTROS)))
  } catch {
    // Sin localStorage el resultado igual se muestra en pantalla.
  }
}

/** Pide almacenamiento persistente y registra el resultado. */
export async function solicitarPersistencia(instalada: boolean): Promise<RegistroPersistencia> {
  let resultado: ResultadoPersistencia
  try {
    if (!navigator.storage?.persist) resultado = 'no_disponible'
    else if (await navigator.storage.persisted()) resultado = 'ya_concedida'
    else resultado = (await navigator.storage.persist()) ? 'concedida' : 'rechazada'
  } catch {
    resultado = 'error'
  }
  const registro: RegistroPersistencia = { cuando: new Date().toISOString(), resultado, instalada }
  guardar(registro)
  return registro
}

let pedidaEnEstaSesion = false

/** Primera captura: pide almacenamiento persistente si aún no se concedió (una vez por sesión de la app). */
export async function asegurarPersistencia(instalada: boolean): Promise<void> {
  const ultimo = leerRegistros().at(-1)
  if (ultimo && (ultimo.resultado === 'concedida' || ultimo.resultado === 'ya_concedida')) return
  if (pedidaEnEstaSesion) return
  pedidaEnEstaSesion = true
  await solicitarPersistencia(instalada)
}

export async function estaPersistente(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null
  } catch {
    return null
  }
}

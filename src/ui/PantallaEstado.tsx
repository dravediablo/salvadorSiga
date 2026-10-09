import { useEffect, useState } from 'react'
import { useConexion } from '@/pwa/conexion'
import { useInstalacion } from '@/pwa/instalacion'
import { estaPersistente, leerRegistros, solicitarPersistencia, type RegistroPersistencia } from '@/pwa/persistencia'
import { CuentaSesion } from './CuentaSesion'
import { PanelInstalacion } from './PanelInstalacion'
import { Rechazos } from './Rechazos'

const TEXTO_RESULTADO: Record<RegistroPersistencia['resultado'], string> = {
  concedida: 'Concedida',
  ya_concedida: 'Ya estaba concedida',
  rechazada: 'Rechazada por el navegador',
  no_disponible: 'No disponible en este navegador',
  error: 'Error al solicitarla',
}

function Fila({ etiqueta, valor, bien }: { etiqueta: string; valor: string; bien: boolean }) {
  return (
    <li>
      <span>{etiqueta}</span>
      <span className={bien ? 'etq e-ok' : 'etq e-no'}>{valor}</span>
    </li>
  )
}

/** Instalación, conexión y almacenamiento del dispositivo (lo que era la pantalla de inicio del hito 1). */
export function PantallaEstado() {
  const enLinea = useConexion()
  const { modo, instalada, instalar } = useInstalacion()
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [ultimo, setUltimo] = useState<RegistroPersistencia | null>(() => leerRegistros().at(-1) ?? null)

  useEffect(() => {
    void estaPersistente().then(setPersistente)
  }, [])

  // Después de instalar se pide almacenamiento persistente (CLAUDE.md).
  useEffect(() => {
    if (!instalada) return
    void solicitarPersistencia(true).then((r) => {
      setUltimo(r)
      return estaPersistente().then(setPersistente)
    })
  }, [instalada])

  async function pedir() {
    setUltimo(await solicitarPersistencia(instalada))
    setPersistente(await estaPersistente())
  }

  return (
    <div>
      <h1>Estado de la app</h1>
      <Rechazos />
      <PanelInstalacion modo={modo} onInstalar={() => void instalar()} />
      <section className="seccion" aria-labelledby="estado">
        <h2 id="estado">Este dispositivo</h2>
        <ul className="estado">
          <Fila etiqueta="App instalada" valor={instalada ? 'Sí' : 'No'} bien={instalada} />
          <Fila etiqueta="Conexión" valor={enLinea ? 'Con conexión' : 'Sin conexión'} bien={enLinea} />
          <Fila etiqueta="Almacenamiento persistente" valor={persistente == null ? 'Sin dato' : persistente ? 'Sí' : 'No'} bien={persistente === true} />
        </ul>
        <p className="peq">
          Última solicitud de almacenamiento persistente:{' '}
          <strong>{ultimo ? `${TEXTO_RESULTADO[ultimo.resultado]} (${new Date(ultimo.cuando).toLocaleString('es-MX')})` : 'aún no se hace'}</strong>
        </p>
        <button className="btn btn-q" type="button" onClick={() => void pedir()}>
          Solicitar almacenamiento persistente
        </button>
      </section>
      <CuentaSesion />
      <footer className="pie peq muted">
        Versión de la compilación: <span className="num">{__VERSION_COMPILACION__}</span>
      </footer>
    </div>
  )
}

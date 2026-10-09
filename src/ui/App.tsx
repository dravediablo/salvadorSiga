import { useEffect, useState } from 'react'
import { useActualizacion } from '@/pwa/actualizacion'
import { useConexion } from '@/pwa/conexion'
import { useInstalacion } from '@/pwa/instalacion'
import { estaPersistente, leerRegistros, solicitarPersistencia, type RegistroPersistencia } from '@/pwa/persistencia'
import { AvisoActualizacion } from './AvisoActualizacion'
import { PanelInstalacion } from './PanelInstalacion'

const TEXTO_RESULTADO: Record<RegistroPersistencia['resultado'], string> = {
  concedida: 'Concedida',
  ya_concedida: 'Ya estaba concedida',
  rechazada: 'Rechazada por el navegador',
  no_disponible: 'No disponible en este navegador',
  error: 'Error al solicitarla',
}

export function App() {
  const enLinea = useConexion()
  const { modo, instalada, ios, instalar } = useInstalacion()
  const { hayNueva, actualizarAhora, descartar } = useActualizacion()
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [ultimo, setUltimo] = useState<RegistroPersistencia | null>(() => leerRegistros().at(-1) ?? null)

  async function pedirPersistencia() {
    setUltimo(await solicitarPersistencia(instalada))
    setPersistente(await estaPersistente())
  }

  useEffect(() => {
    void estaPersistente().then(setPersistente)
  }, [])

  // CLAUDE.md: se pide después de instalar (o en la primera captura, hito 2).
  useEffect(() => {
    if (instalada) void solicitarPersistencia(true).then((r) => {
      setUltimo(r)
      return estaPersistente().then(setPersistente)
    })
  }, [instalada])

  return (
    <>
      {hayNueva && <AvisoActualizacion onActualizar={() => void actualizarAhora()} onCerrar={descartar} />}
      <main className="contenido">
        <header className="marca">
          <span className="marca-hoja" aria-hidden="true" />
          <h1>Sigatoka</h1>
        </header>
        <p className="muted">Monitoreo de Sigatoka negra en plátano y banano.</p>

        {ios && !instalada && (
          <div className="aviso" role="alert">
            Instala la app antes de capturar: en iPhone, lo que captures en el navegador no aparece en la app instalada.
          </div>
        )}

        <PanelInstalacion modo={modo} onInstalar={() => void instalar()} />

        <section className="seccion" aria-labelledby="estado">
          <h2 id="estado">Estado</h2>
          <ul className="estado">
            <Fila etiqueta="App instalada" valor={instalada ? 'Sí' : 'No'} bien={instalada} />
            <Fila etiqueta="Conexión" valor={enLinea ? 'Con conexión' : 'Sin conexión'} bien={enLinea} />
            <Fila
              etiqueta="Almacenamiento persistente"
              valor={persistente == null ? 'Sin dato' : persistente ? 'Sí' : 'No'}
              bien={persistente === true}
            />
          </ul>
          <p className="peq">
            Última solicitud de almacenamiento persistente:{' '}
            <strong>{ultimo ? `${TEXTO_RESULTADO[ultimo.resultado]} (${new Date(ultimo.cuando).toLocaleString('es-MX')})` : 'aún no se hace'}</strong>
          </p>
          <button className="btn btn-q" type="button" onClick={() => void pedirPersistencia()}>
            Solicitar almacenamiento persistente
          </button>
        </section>

        <footer className="pie peq muted">
          Versión de la compilación: <span className="num">{__VERSION_COMPILACION__}</span>
        </footer>
      </main>
    </>
  )
}

function Fila({ etiqueta, valor, bien }: { etiqueta: string; valor: string; bien: boolean }) {
  return (
    <li>
      <span>{etiqueta}</span>
      <span className={bien ? 'etq e-ok' : 'etq e-no'}>{valor}</span>
    </li>
  )
}

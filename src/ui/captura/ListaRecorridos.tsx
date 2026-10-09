import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ajustes, consultas } from '@/datos'
import { puedeVerRecorrido, type ActorPermisos } from '@/dominio'
import { useInstalacion } from '@/pwa/instalacion'
import { confirmar } from '../dialogos'
import { etiquetaSemana, fechaCorta } from '../formato'
import type { Nav } from '../navegacion'
import { EtqEstado } from './componentes'

const CLAVE_CAPTURA_EN_NAVEGADOR = 'captura_en_navegador'

interface Props {
  actor: ActorPermisos
  ir: (n: Nav) => void
  /** Lleva a la pestaña con las instrucciones de instalación. */
  irAInstalar: () => void
}

export function ListaRecorridos({ actor, ir, irAInstalar }: Props) {
  const tarjetas = useLiveQuery(() => consultas.tarjetasRecorridos(), [])
  const { ios, instalada } = useInstalacion()
  const [verTodos, setVerTodos] = useState(false)
  const esAdmin = actor.rol === 'administrador'

  if (!tarjetas) return <div className="cargando">Cargando recorridos…</div>
  const visibles = tarjetas.filter((t) => puedeVerRecorrido(actor, t.recorrido))
  const abiertos = visibles.filter((t) => t.recorrido.estado === 'en_curso')
  const cerrados = visibles.filter((t) => t.recorrido.estado !== 'en_curso')

  async function nuevo() {
    // iPhone sin instalar: lo capturado en el navegador no aparece en la app instalada.
    if (ios && !instalada && !(await ajustes.leer<boolean>(CLAVE_CAPTURA_EN_NAVEGADOR))) {
      const seguir = await confirmar(
        'En iPhone, lo que captures en el navegador no aparece en la app instalada. Instálala primero desde la pestaña Estado, o confirma que quieres capturar aquí de todos modos.',
        { titulo: 'Instala la app antes de capturar', aceptar: 'Capturar aquí de todos modos', cancelar: 'Ver cómo instalar' },
      )
      if (!seguir) {
        irAInstalar()
        return
      }
      await ajustes.fijar(CLAVE_CAPTURA_EN_NAVEGADOR, true)
    }
    ir({ vista: 'nuevo' })
  }

  const tarjeta = (t: (typeof tarjetas)[number]) => (
    <li key={t.recorrido.id}>
      <button className="item" type="button" onClick={() => ir({ vista: 'recorrido', recorridoId: t.recorrido.id })}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {fechaCorta(t.recorrido.fecha)} <span className="muted">({etiquetaSemana(t.recorrido.semana_iso)})</span>
          </div>
          <div className="peq muted">
            {t.operador}: {t.tablas} tabla{t.tablas !== 1 ? 's' : ''}, {t.plantas} planta{t.plantas !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="der">
          <EtqEstado estado={t.recorrido.estado} sincronizado={t.sincronizado} />
        </div>
      </button>
    </li>
  )

  return (
    <div>
      <h1>Recorridos</h1>
      <p className="muted">{esAdmin ? 'Como administrador ves y corriges los recorridos de todos.' : 'Tus recorridos abiertos.'}</p>
      <button className="btn btn-p btn-b" type="button" style={{ margin: '14px 0' }} onClick={() => void nuevo()}>
        Nuevo recorrido
      </button>
      {abiertos.length ? (
        <ul className="lista">{abiertos.map(tarjeta)}</ul>
      ) : (
        <div className="caja vacio-panel">{esAdmin ? 'No hay recorridos abiertos.' : 'No tienes recorridos abiertos. Crea uno para empezar a capturar.'}</div>
      )}
      {esAdmin && cerrados.length > 0 && (
        <div className="seccion">
          <h2 style={{ margin: '18px 0 10px' }}>Cerrados</h2>
          <ul className="lista">{(verTodos ? cerrados : cerrados.slice(0, 6)).map(tarjeta)}</ul>
          {cerrados.length > 6 && (
            <button className="enlace" type="button" onClick={() => setVerTodos(!verTodos)}>
              {verTodos ? 'Ver menos' : `Ver los ${cerrados.length} recorridos cerrados`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

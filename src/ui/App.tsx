import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, modoServidor, motor, sesion } from '@/datos'
import { puedeAdministrar } from '@/dominio'
import { useActualizacion } from '@/pwa/actualizacion'
import { useInstalacion } from '@/pwa/instalacion'
import { AdminTablas } from './AdminTablas'
import { AvisoActualizacion } from './AvisoActualizacion'
import { AccesoDesarrollo } from './AccesoDesarrollo'
import { AvisosDeInicio } from './AvisosDeInicio'
import { Bienvenida } from './Bienvenida'
import { Campo } from './captura/Campo'
import { Dialogo, Toast } from './dialogos'
import { Encabezado } from './Encabezado'
import { IconoCampo, IconoEstado, IconoTablas } from './iconos'
import { usePestana, type Pestana } from './navegacion'
import { PantallaEstado } from './PantallaEstado'
import { useSincronizacion } from './useSincronizacion'

/** Primera sincronización de una persona en este dispositivo: todavía no hay rancho local que mostrar. */
function DescargaInicial() {
  const sync = useSincronizacion()
  return (
    <div className="bienvenida">
      <h1>Descargando los datos de tu rancho…</h1>
      {sync.ultimoError ? (
        <div className="error" role="alert">
          No se pudo descargar ({sync.ultimoError}). Revisa tu conexión; se reintenta solo.
        </div>
      ) : (
        <p className="muted">Esto pasa solo la primera vez en este dispositivo.</p>
      )}
      <button className="btn btn-p" type="button" disabled={sync.sincronizando} onClick={() => void motor.sincronizar({ ignorarEspera: true })}>
        Reintentar ahora
      </button>
      <AccesoDesarrollo />
    </div>
  )
}

export function App() {
  // `null` = no hay rancho en este dispositivo; `undefined` = todavía leyendo.
  const rancho = useLiveQuery(async () => (await consultas.rancho()) ?? null, [])
  const actual = useLiveQuery(async () => (await sesion.actual()) ?? null, [])
  const { hayNueva, actualizarAhora, descartar } = useActualizacion()
  const { ios, instalada } = useInstalacion()
  const { pestana, elegir } = usePestana()

  if (rancho === undefined || actual === undefined || pestana === null) return <div className="cargando">Cargando datos…</div>
  if (modoServidor && (rancho === null || actual === null)) return <DescargaInicial />
  if (rancho === null || actual === null) {
    return (
      <>
        <Bienvenida />
        <Dialogo />
      </>
    )
  }

  const esAdmin = puedeAdministrar({ usuario_id: actual.usuario.id, rol: actual.membresia.rol })
  const pestanas: Array<[Pestana, string, React.ReactNode]> = [
    ['campo', 'Campo', <IconoCampo key="c" />],
    ...(esAdmin ? ([['tablas', 'Tablas', <IconoTablas key="t" />]] as Array<[Pestana, string, React.ReactNode]>) : []),
    ['estado', 'Estado', <IconoEstado key="e" />],
  ]
  const activa = pestanas.some((p) => p[0] === pestana) ? pestana : 'campo'

  return (
    <div>
      {hayNueva && <AvisoActualizacion onActualizar={() => void actualizarAhora()} onCerrar={descartar} />}
      <Encabezado actual={actual} irARechazos={() => elegir('estado')} />
      {ios && !instalada && (
        <div className="aviso aviso-ios" role="alert">
          Instala la app antes de capturar: en iPhone, lo que captures en el navegador no aparece en la app instalada.
        </div>
      )}
      <main className="contenido">
        {activa === 'campo' && <Campo actual={actual} irAInstalar={() => elegir('estado')} />}
        {activa === 'tablas' && esAdmin && <AdminTablas ranchoId={rancho.id} />}
        {activa === 'estado' && <PantallaEstado />}
      </main>
      <nav className="nav" aria-label="Secciones">
        {pestanas.map(([clave, nombre, icono]) => (
          <button key={clave} type="button" className={activa === clave ? 'activo' : ''} onClick={() => elegir(clave)} aria-current={activa === clave ? 'page' : undefined}>
            {icono}
            {nombre}
          </button>
        ))}
      </nav>
      <Toast />
      <AvisosDeInicio />
      <Dialogo />
    </div>
  )
}

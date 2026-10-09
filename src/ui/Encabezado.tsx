import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, modoServidor, motor, reintentar, sesion, type UsuarioActual } from '@/datos'
import { useConexion } from '@/pwa/conexion'
import { avisar } from './dialogos'
import { useFallos } from './useFallos'
import { useSincronizacion } from './useSincronizacion'

function Conexion({ irARechazos }: { irARechazos: () => void }) {
  const enLinea = useConexion()
  const sync = useSincronizacion()
  const pendientes = useLiveQuery(() => consultas.pendientes(), [], 0)
  const rechazos = useLiveQuery(() => consultas.contarRechazos(), [], 0)
  const [abierto, setAbierto] = useState(false)
  // "Solo en este dispositivo" (sin sesión), "Sincronizando…", "Sin conexión", "N por enviar" o "Al día".
  const porEnviar = pendientes ? ` · ${pendientes} por enviar` : ''
  const texto =
    sync.modo === 'solo_local'
      ? 'Solo en este dispositivo'
      : !enLinea
        ? 'Sin conexión' + porEnviar
        : sync.sincronizando
          ? 'Sincronizando…'
          : pendientes
            ? `${pendientes} por enviar`
            : 'Al día'
  return (
    <div style={{ position: 'relative' }}>
      <button className="pill" type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-label={`Conexión: ${texto}`}>
        <span className="punto" style={{ background: sync.modo === 'solo_local' ? 'var(--amarillo)' : enLinea && !sync.ultimoError ? 'var(--verde)' : 'var(--rojo)' }}></span>
        {texto}
      </button>
      {abierto && (
        <div className="pop sin-conexion-detalle">
          <h3>Conexión y datos</h3>
          {sync.modo === 'solo_local' ? (
            <p className="peq">
              <b>Tus datos están solo en este dispositivo.</b> Todavía no hay sesión con el servidor: lo que captures se guarda aquí, aunque no tengas señal, y queda en cola para enviarse cuando esa función esté disponible.
            </p>
          ) : (
            <p className="peq">
              <b>Última sincronización correcta:</b> {sync.ultima ? new Date(sync.ultima).toLocaleString('es-MX') : 'todavía ninguna'}
              {sync.ultimoError && (
                <>
                  <br />
                  <b>Último intento:</b> falló ({sync.ultimoError}). Se reintenta solo.
                </>
              )}
              {sync.avisos.map((a) => (
                <span key={a}>
                  <br />
                  <b>Aviso:</b> {a}
                </span>
              ))}
            </p>
          )}
          <p className="peq">
            <b>Registros sin enviar:</b> {pendientes}
            <br />
            <b>Cambios rechazados:</b> {rechazos}
            <br />
            <b>Conexión:</b> {enLinea ? 'con señal' : 'sin señal (no afecta la captura)'}
          </p>
          {sync.modo === 'servidor' && (
            <div className="fila-btn" style={{ marginBottom: 8 }}>
              <button
                className="btn btn-s btn-p"
                type="button"
                disabled={sync.sincronizando || !enLinea}
                onClick={() => void motor.sincronizar({ ignorarEspera: true }).then(() => (motor.obtenerEstado().ultimoError ? avisar('No se pudo sincronizar. Se reintenta solo.') : undefined))}
              >
                Sincronizar ahora
              </button>
              {rechazos > 0 && (
                <button
                  className="btn btn-s"
                  type="button"
                  onClick={() => {
                    setAbierto(false)
                    irARechazos()
                  }}
                >
                  Ver rechazos
                </button>
              )}
            </div>
          )}
          <button className="btn btn-s btn-q" type="button" onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}

interface Props {
  actual: UsuarioActual
  irARechazos: () => void
}

/** Aviso fijo cuando una escritura en segundo plano falló: el cambio se conserva y se puede reintentar. */
function AvisoFallos() {
  const fallos = useFallos()
  const [reintentando, setReintentando] = useState(false)
  if (!fallos.length) return null
  return (
    <div className="aviso-fallo" role="alert">
      <div>
        <b>No se pudo guardar: {fallos[0].mensaje}</b>
        {fallos.length > 1 && <span> ({fallos.length} cambios sin guardar)</span>}
        <div className="peq">Tu captura sigue en pantalla. No cierres la app hasta que se guarde.</div>
      </div>
      <button
        className="btn btn-xp"
        type="button"
        disabled={reintentando}
        onClick={() => {
          setReintentando(true)
          void reintentar().finally(() => setReintentando(false))
        }}
      >
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}

export function Encabezado({ actual, irARechazos }: Props) {
  const usuarios = useLiveQuery(() => sesion.disponibles(), [])
  return (
    <>
    <header className="barra">
      <div className="marca">
        <span className="marca-hoja" aria-hidden="true"></span>
        <span className="txt">Sigatoka negra</span>
      </div>
      {/* TEMPORAL: se reemplaza por inicio de sesión en el hito 5 */}
      {modoServidor ? (
        <span className="peq" aria-label="Usuario">
          {actual.usuario.nombre} ({actual.membresia.rol === 'administrador' ? 'admin' : 'operador'})
        </span>
      ) : (
        <select className="sel-usuario" value={actual.usuario.id} onChange={(e) => void sesion.fijar(e.target.value)} aria-label="Usuario (simulación de roles)">
          {(usuarios ?? [actual]).map((u) => (
            <option key={u.usuario.id} value={u.usuario.id}>
              {u.usuario.nombre} ({u.membresia.rol === 'administrador' ? 'admin' : 'operador'})
            </option>
          ))}
        </select>
      )}
      <Conexion irARechazos={irARechazos} />
    </header>
    <AvisoFallos />
    </>
  )
}

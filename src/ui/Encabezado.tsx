import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, sesion, type UsuarioActual } from '@/datos'
import { useConexion } from '@/pwa/conexion'

function Conexion() {
  const enLinea = useConexion()
  const pendientes = useLiveQuery(() => consultas.pendientes(), [], 0)
  const [abierto, setAbierto] = useState(false)
  const texto = (enLinea ? 'En línea' : 'Sin señal') + (pendientes ? ` · ${pendientes} sin enviar` : '')
  return (
    <div style={{ position: 'relative' }}>
      <button className="pill" type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-label={`Conexión: ${texto}`}>
        <span className="punto" style={{ background: enLinea ? 'var(--verde)' : 'var(--rojo)' }}></span>
        {texto}
      </button>
      {abierto && (
        <div className="pop sin-conexion-detalle">
          <h3>Conexión y datos</h3>
          <p className="peq">
            <b>Tus datos están solo en este dispositivo.</b> Todavía no hay servidor: lo que captures se guarda aquí, aunque no tengas señal, y queda en cola para enviarse cuando esa función esté disponible.
          </p>
          <p className="peq">
            <b>Registros sin enviar:</b> {pendientes}
            <br />
            <b>Conexión:</b> {enLinea ? 'con señal' : 'sin señal (no afecta la captura)'}
          </p>
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
}

export function Encabezado({ actual }: Props) {
  const usuarios = useLiveQuery(() => sesion.disponibles(), [])
  return (
    <header className="barra">
      <div className="marca">
        <span className="marca-hoja" aria-hidden="true"></span>
        <span className="txt">Sigatoka negra</span>
      </div>
      {/* TEMPORAL: se reemplaza por inicio de sesión en el hito 5 */}
      <select className="sel-usuario" value={actual.usuario.id} onChange={(e) => void sesion.fijar(e.target.value)} aria-label="Usuario (simulación de roles)">
        {(usuarios ?? [actual]).map((u) => (
          <option key={u.usuario.id} value={u.usuario.id}>
            {u.usuario.nombre} ({u.membresia.rol === 'administrador' ? 'admin' : 'operador'})
          </option>
        ))}
      </select>
      <Conexion />
    </header>
  )
}

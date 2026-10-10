import { useLiveQuery } from 'dexie-react-hooks'
import { borrarDatosDeEsteCelular, cerrarSesion, consultas, correoDeSesionGuardada, modoServidor } from '@/datos'
import { avisar, confirmar, conAviso } from './dialogos'

/** Cuenta con sesión: quién es y "Cerrar sesión" (avisa de lo pendiente; borrar los datos solo si no hay pendientes). */
export function CuentaSesion() {
  const pendientes = useLiveQuery(() => consultas.pendientes(), [], 0)
  const rechazos = useLiveQuery(() => consultas.contarRechazos(), [], 0)
  if (!modoServidor) return null
  const correo = correoDeSesionGuardada() ?? ''
  const cuenta = correo.endsWith('@operadores.invalid') ? 'Operador' : correo

  async function salir() {
    const hay = pendientes + rechazos > 0
    const mensaje = hay
      ? `Tienes ${pendientes} cambio(s) sin enviar y ${rechazos} rechazado(s) por el servidor. Se conservan en este celular y se enviarán la próxima vez que esta cuenta entre aquí.`
      : 'Tus datos están al día en el servidor. Los de este celular se conservan.'
    if (!(await confirmar(mensaje, { titulo: '¿Cerrar sesión?', aceptar: 'Cerrar sesión' }))) return
    await cerrarSesion()
    location.reload()
  }

  async function salirYBorrar() {
    if (!(await confirmar('Se borran los datos de este celular. Lo que ya está en el servidor no se pierde; para volver a verlo tendrás que entrar de nuevo.', { titulo: '¿Cerrar sesión y borrar los datos de este celular?', aceptar: 'Cerrar sesión y borrar', peligro: true }))) return
    try {
      await borrarDatosDeEsteCelular()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudieron borrar los datos.')
      return
    }
    await cerrarSesion()
    location.reload()
  }

  return (
    <section className="seccion caja" aria-labelledby="cuenta">
      <h2 id="cuenta">Mi cuenta</h2>
      <p className="peq">Sesión: {cuenta || 'sin correo'}</p>
      {pendientes + rechazos > 0 && (
        <div className="aviso" role="status">
          Hay {pendientes} cambio(s) sin enviar y {rechazos} rechazado(s). No cierres sesión sin señal si puedes evitarlo.
        </div>
      )}
      <div className="fila-btn">
        <button className="btn" type="button" onClick={() => conAviso(salir())}>
          Cerrar sesión
        </button>
        {pendientes + rechazos === 0 && (
          <button className="btn btn-x" type="button" onClick={() => conAviso(salirYBorrar())}>
            Cerrar sesión y borrar los datos de este celular
          </button>
        )}
      </div>
    </section>
  )
}

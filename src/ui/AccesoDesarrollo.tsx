import { useState } from 'react'
import { cerrarSesionDesarrollo, correoDeSesionGuardada, iniciarSesionDesarrollo, modoServidor, supabaseConfigurado } from '@/datos'

/*
 * TEMPORAL (hito 4): acceso de desarrollo con los usuarios de supabase/seed.sql. El hito 5 lo reemplaza
 * por el inicio de sesión real. Solo existe en desarrollo (import.meta.env.DEV): no debe aparecer en la
 * compilación de producción (scripts/verificar-dist.mjs lo comprueba).
 */
function AccesoDev() {
  const [correo, setCorreo] = useState('op1@prueba.test')
  const [contrasena, setContrasena] = useState('prueba123')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (!supabaseConfigurado) return null
  const correoActual = correoDeSesionGuardada()

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      await iniciarSesionDesarrollo(correo, contrasena)
      location.reload() // la base local cambia con la sesión: se vuelve a arrancar
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
      setOcupado(false)
    }
  }

  async function salir() {
    setOcupado(true)
    await cerrarSesionDesarrollo()
    location.reload()
  }

  return (
    <section className="seccion caja" aria-labelledby="acceso-dev">
      <h2 id="acceso-dev">Acceso de desarrollo (temporal)</h2>
      {modoServidor ? (
        <>
          <p className="peq">Sesión: {correoActual ?? 'sin correo'}. Los datos se sincronizan con el servidor local.</p>
          <button className="btn" type="button" disabled={ocupado} onClick={() => void salir()}>
            Cerrar sesión de desarrollo
          </button>
        </>
      ) : (
        <form onSubmit={(e) => void entrar(e)}>
          <label className="campo">
            Correo
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" />
          </label>
          <label className="campo">
            Contraseña
            <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="current-password" />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-p" type="submit" disabled={ocupado}>
            Iniciar sesión de desarrollo
          </button>
        </form>
      )}
    </section>
  )
}

export const AccesoDesarrollo: () => React.ReactNode = import.meta.env.DEV ? AccesoDev : () => null

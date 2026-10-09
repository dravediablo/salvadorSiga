import { useState } from 'react'
import { cerrarSesion, crearMiRancho } from '@/datos'
import { PantallaEntrada } from './PantallaEntrada'

/** Sesión vencida o revocada: se pide volver a entrar SIN tocar la base local (con la misma cuenta se usa la misma y se envía lo pendiente). */
export function VuelveAEntrar() {
  return <PantallaEntrada aviso="Tu sesión venció. Entra de nuevo con tu cuenta: lo que capturaste en este celular se conserva y se enviará." />
}

/** El servidor desactivó el acceso a este rancho: ya se borraron los datos locales de ese rancho. */
export function AccesoDesactivado() {
  const [ocupado, setOcupado] = useState(false)
  return (
    <div className="bienvenida">
      <h1>Tu acceso a este rancho fue desactivado</h1>
      <p>Los datos de este rancho se borraron de este celular. Si crees que es un error, habla con el propietario del rancho.</p>
      <button
        className="btn btn-p btn-b"
        type="button"
        disabled={ocupado}
        onClick={() => {
          setOcupado(true)
          void cerrarSesion().then(() => location.reload())
        }}
      >
        Salir
      </button>
    </div>
  )
}

/** Cuenta con sesión pero sin rancho: se crea con el código de alta. */
export function CrearRanchoPantalla() {
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  return (
    <div className="bienvenida">
      <h1>Crea tu rancho</h1>
      <p>Tu cuenta todavía no tiene rancho. Escribe su nombre y tu código de alta.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setOcupado(true)
          setError(null)
          crearMiRancho(nombre, codigo)
            .then(() => location.reload())
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'No se pudo crear el rancho.')
              setOcupado(false)
            })
        }}
      >
        <label className="campo">
          <span>Nombre del rancho</span>
          <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <label className="campo">
          <span>Código de alta</span>
          <input className="inp" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-p btn-b" type="submit" disabled={ocupado || !nombre.trim() || !codigo.trim()}>
          {ocupado ? 'Creando…' : 'Crear mi rancho'}
        </button>
      </form>
      <button className="enlace" type="button" onClick={() => void cerrarSesion().then(() => location.reload())}>
        Salir
      </button>
    </div>
  )
}

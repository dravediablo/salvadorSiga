import { useState } from 'react'
import { crearMiRancho, entrarComoOperador, entrarComoPropietario, registrarPropietario } from '@/datos'

/**
 * Pantalla de entrada (hito 5), con Supabase configurado y sin sesión.
 * - "Soy operador": código del rancho + usuario + PIN de 6 dígitos (la función del servidor aplica el bloqueo por intentos).
 * - "Soy propietario": correo y contraseña, o "Crear cuenta" (con el código de alta que reparte el responsable del proyecto).
 * Al entrar se recarga la página: la base local depende de la sesión.
 */

const CLAVE_ULTIMO = 'sigatoka.ultimo_operador'

function leerUltimo(): { codigo: string; usuario: string } {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE_ULTIMO) ?? '{}') as { codigo?: string; usuario?: string }
    return { codigo: x.codigo ?? '', usuario: x.usuario ?? '' }
  } catch {
    return { codigo: '', usuario: '' }
  }
}

function Error_({ texto }: { texto: string | null }) {
  return texto ? (
    <div className="error" role="alert">
      {texto}
    </div>
  ) : null
}

function FormularioOperador() {
  const ultimo = leerUltimo()
  const [codigo, setCodigo] = useState(ultimo.codigo)
  const [usuario, setUsuario] = useState(ultimo.usuario)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      await entrarComoOperador({ codigo, usuario, pin })
      try {
        localStorage.setItem(CLAVE_ULTIMO, JSON.stringify({ codigo: codigo.trim().toUpperCase(), usuario: usuario.trim().toLowerCase() }))
      } catch {
        /* sin almacenamiento: solo se pierde la comodidad de recordar el código */
      }
      location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.')
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={(e) => void entrar(e)}>
      <label className="campo">
        <span>Código del rancho</span>
        <input className="inp" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" maxLength={8} placeholder="Por ejemplo: 7QL5TS" />
      </label>
      <label className="campo">
        <span>Usuario</span>
        <input className="inp" value={usuario} onChange={(e) => setUsuario(e.target.value.toLowerCase())} autoCapitalize="none" autoComplete="username" autoCorrect="off" placeholder="Por ejemplo: juan" />
      </label>
      <label className="campo">
        <span>PIN de 6 dígitos</span>
        <input
          className="inp"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="current-password"
          placeholder="••••••"
        />
      </label>
      <Error_ texto={error} />
      <button className="btn btn-p btn-b" type="submit" disabled={ocupado || !codigo.trim() || !usuario.trim() || pin.length !== 6}>
        {ocupado ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="peq muted">Tu propietario te da el código del rancho, tu usuario y tu PIN.</p>
    </form>
  )
}

function FormularioPropietario() {
  const [modo, setModo] = useState<'entrar' | 'crear' | 'rancho'>('entrar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [codigoAlta, setCodigoAlta] = useState('')
  const [nombreRancho, setNombreRancho] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function correr(accion: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar. Inténtalo de nuevo.')
      setOcupado(false)
    }
  }

  const entrar = (e: React.FormEvent) => {
    e.preventDefault()
    void correr(async () => {
      await entrarComoPropietario(correo, contrasena)
      location.reload()
    })
  }
  const crearCuenta = (e: React.FormEvent) => {
    e.preventDefault()
    void correr(async () => {
      await registrarPropietario({ nombre, correo, contrasena })
      setModo('rancho') // la cuenta ya tiene sesión; falta el rancho
      setOcupado(false)
    })
  }
  const crearRancho = (e: React.FormEvent) => {
    e.preventDefault()
    void correr(async () => {
      await crearMiRancho(nombreRancho, codigoAlta)
      location.reload()
    })
  }

  if (modo === 'rancho') {
    return (
      <form onSubmit={crearRancho}>
        <div className="info">Tu cuenta ya está creada. Falta tu rancho.</div>
        <label className="campo">
          <span>Nombre del rancho</span>
          <input className="inp" value={nombreRancho} onChange={(e) => setNombreRancho(e.target.value)} autoComplete="off" placeholder="Por ejemplo: Rancho El Salvador" />
        </label>
        <label className="campo">
          <span>Código de alta</span>
          <input className="inp" value={codigoAlta} onChange={(e) => setCodigoAlta(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
        </label>
        <Error_ texto={error} />
        <button className="btn btn-p btn-b" type="submit" disabled={ocupado || !nombreRancho.trim() || !codigoAlta.trim()}>
          {ocupado ? 'Creando…' : 'Crear mi rancho'}
        </button>
      </form>
    )
  }

  if (modo === 'crear') {
    return (
      <form onSubmit={crearCuenta}>
        <label className="campo">
          <span>Tu nombre</span>
          <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
        </label>
        <label className="campo">
          <span>Correo</span>
          <input className="inp" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </label>
        <label className="campo">
          <span>Contraseña (mínimo 8 caracteres)</span>
          <input className="inp" type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="campo">
          <span>Código de alta</span>
          <input className="inp" value={codigoAlta} onChange={(e) => setCodigoAlta(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
        </label>
        <Error_ texto={error} />
        <button className="btn btn-p btn-b" type="submit" disabled={ocupado || !nombre.trim() || !correo.trim() || contrasena.length < 8 || !codigoAlta.trim()}>
          {ocupado ? 'Creando…' : 'Crear cuenta'}
        </button>
        <button className="enlace" type="button" onClick={() => { setModo('entrar'); setError(null) }}>
          Ya tengo cuenta
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={entrar}>
      <label className="campo">
        <span>Correo</span>
        <input className="inp" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" autoCapitalize="none" />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input className="inp" type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="current-password" />
      </label>
      <Error_ texto={error} />
      <button className="btn btn-p btn-b" type="submit" disabled={ocupado || !correo.trim() || !contrasena}>
        {ocupado ? 'Entrando…' : 'Entrar'}
      </button>
      <button className="enlace" type="button" onClick={() => { setModo('crear'); setError(null) }}>
        Crear cuenta
      </button>
    </form>
  )
}

export function PantallaEntrada({ aviso }: { aviso?: string }) {
  const [pestana, setPestana] = useState<'operador' | 'propietario'>('operador')
  return (
    <div className="bienvenida">
      <div className="marca">
        <span className="marca-hoja" aria-hidden="true"></span>
        <span className="marca-txt">Monitoreo de Sigatoka negra</span>
      </div>
      <h1>{aviso ? 'Vuelve a entrar' : 'Entrar'}</h1>
      {aviso && <div className="aviso" role="status">{aviso}</div>}
      <div className="pestanas" role="tablist" aria-label="Tipo de cuenta">
        <button type="button" role="tab" aria-selected={pestana === 'operador'} className={pestana === 'operador' ? 'activo' : ''} onClick={() => setPestana('operador')}>
          Soy operador
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'propietario'} className={pestana === 'propietario' ? 'activo' : ''} onClick={() => setPestana('propietario')}>
          Soy propietario
        </button>
      </div>
      {pestana === 'operador' ? <FormularioOperador /> : <FormularioPropietario />}
    </div>
  )
}

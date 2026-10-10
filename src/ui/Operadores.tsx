import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  consultas, crearOperador, motor, desactivarOperador, enlaceWhatsApp, listarCuentasOperador, reactivarOperador, restablecerPin, textoCredenciales,
  type Credencial, type CuentaOperador,
} from '@/datos'
import { avisar, confirmar } from './dialogos'

/** Pantalla "Operadores" (solo administrador): alta, nuevo PIN, desactivar y reactivar. El PIN se muestra UNA vez. */

function DialogoCredenciales({ credencial, nombre, onCerrar }: { credencial: Credencial; nombre: string; onCerrar: () => void }) {
  const texto = textoCredenciales(credencial, nombre, location.origin)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      avisar('Copiado. Pégalo en un mensaje al operador.')
    } catch {
      avisar('No se pudo copiar. Escribe los datos a mano.')
    }
  }
  return (
    <div className="velo" style={{ zIndex: 90 }}>
      <div className="hoja-sheet" role="alertdialog" aria-modal="true" aria-label="Datos de acceso del operador">
        <h2>Datos de acceso de {nombre}</h2>
        <p className="peq">Anótalos o compártelos ahora: el PIN no se puede volver a ver. Si se pierde, usa &quot;Nuevo PIN&quot;.</p>
        <div className="credenciales">
          <div>
            Código del rancho: <b>{credencial.codigo_rancho}</b>
          </div>
          <div>
            Usuario: <b>{credencial.alias}</b>
          </div>
          <div>
            PIN: <span className="pin num">{credencial.pin}</span>
          </div>
        </div>
        <div className="fila-btn">
          <a className="btn btn-p" href={enlaceWhatsApp(texto)} target="_blank" rel="noreferrer">
            Compartir por WhatsApp
          </a>
          <button className="btn" type="button" onClick={() => void copiar()}>
            Copiar
          </button>
        </div>
        <button className="btn btn-b" type="button" style={{ marginTop: 10 }} onClick={onCerrar}>
          Listo, ya los guardé
        </button>
      </div>
    </div>
  )
}

function estadoDe(activo: boolean, cuenta: CuentaOperador | undefined): { texto: string; clase: string } {
  if (!activo) return { texto: 'Desactivado', clase: 'e-cerrado' }
  if (cuenta && (cuenta.bloqueado_permanente || (cuenta.bloqueado_hasta && new Date(cuenta.bloqueado_hasta) > new Date()))) return { texto: 'Bloqueado', clase: 'e-curso' }
  return { texto: 'Activo', clase: 'e-sinc' }
}

export function Operadores({ ranchoId }: { ranchoId: string }) {
  const locales = useLiveQuery(() => consultas.operadores(), [])
  const [cuentas, setCuentas] = useState<CuentaOperador[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [credencial, setCredencial] = useState<{ datos: Credencial; nombre: string } | null>(null)

  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const lista = await listarCuentasOperador(ranchoId)
        if (vivo) {
          setCuentas(lista)
          setErrorLista(null)
        }
      } catch (e) {
        if (vivo) setErrorLista(e instanceof Error ? e.message : 'No se pudo cargar la lista.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [ranchoId, version])

  async function correr(accion: () => Promise<void>) {
    setOcupado(true)
    try {
      await accion()
      // El alta, el PIN nuevo y la (des)activación los hizo el servidor: se baja lo nuevo para que la lista lo muestre.
      await motor.sincronizar({ ignorarEspera: true })
      recargar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo completar. Inténtalo de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  const agregar = () =>
    correr(async () => {
      const nombreOperador = nombre.trim()
      const datos = await crearOperador(ranchoId, nombreOperador)
      setCredencial({ datos, nombre: nombreOperador })
      setNombre('')
      setAgregando(false)
    })

  async function nuevoPin(usuarioId: string, nombreOperador: string) {
    if (!(await confirmar(`${nombreOperador} dejará de poder entrar con su PIN actual y recibirás uno nuevo para dárselo.`, { titulo: '¿Dar un PIN nuevo?', aceptar: 'Dar PIN nuevo' }))) return
    await correr(async () => setCredencial({ datos: await restablecerPin(ranchoId, usuarioId), nombre: nombreOperador }))
  }
  async function desactivar(usuarioId: string, nombreOperador: string) {
    const ok = await confirmar('Si tiene cambios sin enviar en su celular, se perderán. Pídele que sincronice antes.', {
      titulo: `¿Desactivar a ${nombreOperador}?`,
      aceptar: 'Desactivar',
      peligro: true,
    })
    if (ok) await correr(() => desactivarOperador(ranchoId, usuarioId))
  }
  async function reactivar(usuarioId: string, nombreOperador: string) {
    if (await confirmar('Podrá volver a entrar con su PIN.', { titulo: `¿Reactivar a ${nombreOperador}?`, aceptar: 'Reactivar' })) await correr(() => reactivarOperador(ranchoId, usuarioId))
  }

  return (
    <div>
      <h1>Operadores</h1>
      <p className="muted">Quienes capturan en campo. Entran con el código del rancho, su usuario y un PIN de 6 dígitos.</p>
      {errorLista && (
        <div className="aviso" role="status">
          No se pudo leer la lista de usuarios ({errorLista}). Revisa tu conexión.
        </div>
      )}
      {agregando ? (
        <div className="caja" style={{ margin: '12px 0' }}>
          <label className="campo">
            <span>Nombre del operador</span>
            <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" placeholder="Por ejemplo: Juan Pérez" />
          </label>
          <div className="fila-btn">
            <button className="btn" type="button" onClick={() => setAgregando(false)}>
              Cancelar
            </button>
            <button className="btn btn-p" type="button" disabled={ocupado || !nombre.trim()} onClick={() => void agregar()}>
              {ocupado ? 'Creando…' : 'Crear operador'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-p btn-b" type="button" style={{ margin: '12px 0' }} onClick={() => setAgregando(true)}>
          Agregar operador
        </button>
      )}
      {locales && !locales.length && <div className="caja">Todavía no hay operadores. Agrega el primero.</div>}
      <ul className="lista-operadores">
        {locales?.map((o) => {
          const cuenta = cuentas?.find((c) => c.usuario_id === o.usuarioId)
          const estado = estadoDe(o.activo, cuenta)
          return (
            <li key={o.usuarioId} className="caja">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ flex: 1 }}>{o.nombre}</b>
                <span className={'etq ' + estado.clase}>{estado.texto}</span>
              </div>
              <div className="peq muted">
                Usuario: <b>{cuenta?.alias ?? '—'}</b> · Última sincronización:{' '}
                {cuenta?.ultima_sincronizacion ? new Date(cuenta.ultima_sincronizacion).toLocaleString('es-MX') : 'todavía ninguna'}
              </div>
              <div className="fila-btn" style={{ marginTop: 8 }}>
                <button className="btn btn-s" type="button" disabled={ocupado} onClick={() => void nuevoPin(o.usuarioId, o.nombre)}>
                  Nuevo PIN
                </button>
                {o.activo ? (
                  <button className="btn btn-s btn-x" type="button" disabled={ocupado} onClick={() => void desactivar(o.usuarioId, o.nombre)}>
                    Desactivar
                  </button>
                ) : (
                  <button className="btn btn-s" type="button" disabled={ocupado} onClick={() => void reactivar(o.usuarioId, o.nombre)}>
                    Reactivar
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {credencial && <DialogoCredenciales credencial={credencial.datos} nombre={credencial.nombre} onCerrar={() => setCredencial(null)} />}
    </div>
  )
}

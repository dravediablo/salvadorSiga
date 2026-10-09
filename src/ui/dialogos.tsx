import { useEffect, useState } from 'react'
import { mensajeDeError } from '@/datos'

/**
 * Diálogos propios de la app. Nunca se usan alert(), confirm() ni prompt():
 * el navegador los puede bloquear y rompen la captura con una mano.
 */

export interface OpcionesConfirmar {
  titulo?: string
  aceptar?: string
  cancelar?: string
  /** Pinta el botón de aceptar como acción destructiva. */
  peligro?: boolean
}

interface Pedido extends OpcionesConfirmar {
  mensaje: string
  resolver: (acepto: boolean) => void
}

export function confirmar(mensaje: string, opciones: OpcionesConfirmar = {}): Promise<boolean> {
  return new Promise((resolver) => window.dispatchEvent(new CustomEvent<Pedido>('sigatoka:confirmar', { detail: { mensaje, ...opciones, resolver } })))
}

export function avisar(mensaje: string): void {
  window.dispatchEvent(new CustomEvent<string>('sigatoka:aviso', { detail: mensaje }))
}

/**
 * Acción que el usuario pidió con un botón (crear, borrar, cerrar…): si falla, lo dice
 * con un aviso y el botón se puede volver a tocar. Los cambios de captura que se
 * guardan solos van por `enSegundoPlano` de `@/datos`, que sí los reintenta.
 */
export function conAviso(promesa: Promise<unknown>): void {
  promesa.catch((e: unknown) => avisar(`No se pudo guardar: ${mensajeDeError(e)}`))
}

export function Dialogo() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  useEffect(() => {
    const f = (e: Event) => setPedido((e as CustomEvent<Pedido>).detail)
    window.addEventListener('sigatoka:confirmar', f)
    return () => window.removeEventListener('sigatoka:confirmar', f)
  }, [])
  if (!pedido) return null
  const cerrar = (valor: boolean) => {
    setPedido(null)
    pedido.resolver(valor)
  }
  return (
    <div className="velo" style={{ zIndex: 90 }} onClick={(e) => e.target === e.currentTarget && cerrar(false)}>
      <div className="hoja-sheet" role="alertdialog" aria-modal="true" aria-label={pedido.titulo ?? 'Confirmar'}>
        {pedido.titulo && <h2>{pedido.titulo}</h2>}
        <div style={{ whiteSpace: 'pre-line', margin: '10px 0 18px' }}>{pedido.mensaje}</div>
        <div className="fila-btn">
          <button className="btn" type="button" onClick={() => cerrar(false)}>
            {pedido.cancelar ?? 'Cancelar'}
          </button>
          <button className={'btn ' + (pedido.peligro ? 'btn-xp' : 'btn-p')} type="button" autoFocus onClick={() => cerrar(true)}>
            {pedido.aceptar ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toast() {
  const [mensaje, setMensaje] = useState<string | null>(null)
  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>
    const f = (e: Event) => {
      setMensaje((e as CustomEvent<string>).detail)
      clearTimeout(temporizador)
      temporizador = setTimeout(() => setMensaje(null), 3200)
    }
    window.addEventListener('sigatoka:aviso', f)
    return () => {
      clearTimeout(temporizador)
      window.removeEventListener('sigatoka:aviso', f)
    }
  }, [])
  return mensaje ? (
    <div className="toast" role="status">
      {mensaje}
    </div>
  ) : null
}

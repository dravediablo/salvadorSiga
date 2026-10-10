import { clienteSupabase, llavePublica, urlSupabase } from './cliente'

/** Gestión de operadores: lee `cuenta_operador` (RLS: solo administradores) y llama a la función del servidor `operadores`. */

export interface CuentaOperador {
  usuario_id: string
  alias: string
  intentos_fallidos: number
  bloqueado_hasta: string | null
  bloqueado_permanente: boolean
  ultima_sincronizacion: string | null
}

export interface Credencial {
  usuario_id: string
  alias: string
  /** Solo viaja en esta respuesta: el servidor no lo guarda. */
  pin: string
  codigo_rancho: string
}

export async function listarCuentasOperador(ranchoId: string): Promise<CuentaOperador[]> {
  const cliente = await clienteSupabase()
  const { data, error } = await cliente
    .from('cuenta_operador')
    .select('usuario_id, alias, intentos_fallidos, bloqueado_hasta, bloqueado_permanente, ultima_sincronizacion')
    .eq('rancho_id', ranchoId)
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

async function llamar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const cliente = await clienteSupabase()
  const { data } = await cliente.auth.getSession()
  if (!data.session) throw new Error('La sesión venció. Vuelve a entrar.')
  let respuesta: Response
  try {
    respuesta = await fetch(`${urlSupabase()}/functions/v1/operadores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: llavePublica(), Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu señal e inténtalo de nuevo.')
  }
  const json = (await respuesta.json().catch(() => ({}))) as { error?: string }
  if (!respuesta.ok) throw new Error(json.error ?? 'No se pudo completar la acción. Inténtalo de nuevo.')
  return json as T
}

export const crearOperador = (ranchoId: string, nombre: string): Promise<Credencial> => llamar({ accion: 'crear', rancho_id: ranchoId, nombre })
export const restablecerPin = (ranchoId: string, usuarioId: string): Promise<Credencial> => llamar({ accion: 'restablecer_pin', rancho_id: ranchoId, usuario_id: usuarioId })
export const desactivarOperador = (ranchoId: string, usuarioId: string): Promise<void> => llamar<unknown>({ accion: 'desactivar', rancho_id: ranchoId, usuario_id: usuarioId }).then(() => undefined)
export const reactivarOperador = (ranchoId: string, usuarioId: string): Promise<void> => llamar<unknown>({ accion: 'reactivar', rancho_id: ranchoId, usuario_id: usuarioId }).then(() => undefined)
export const renombrarOperador = (ranchoId: string, usuarioId: string, nombre: string): Promise<void> =>
  llamar<unknown>({ accion: 'renombrar', rancho_id: ranchoId, usuario_id: usuarioId, nombre }).then(() => undefined)

/** Texto para compartir las credenciales por WhatsApp (o copiarlas). */
export function textoCredenciales(c: Credencial, nombre: string, direccion: string): string {
  return `Hola ${nombre}, entra a la app de Sigatoka: ${direccion}\nCódigo del rancho: ${c.codigo_rancho}\nUsuario: ${c.alias}\nPIN: ${c.pin}\nGuarda este mensaje; el PIN no se puede volver a ver (si lo pierdes, tu propietario te da uno nuevo).`
}
export const enlaceWhatsApp = (texto: string): string => `https://wa.me/?text=${encodeURIComponent(texto)}`

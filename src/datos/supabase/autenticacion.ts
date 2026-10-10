import { clienteSupabase, CLAVE_SESION, llavePublica, urlSupabase } from './cliente'

/**
 * Entrada y salida de cuentas (hito 5).
 * - Propietario: correo y contraseña de Supabase Auth (alta con código de un solo uso para crear su rancho).
 * - Operador: código del rancho + usuario + PIN, por la función del servidor `entrar_operador`, que aplica el bloqueo
 *   por intentos y entrega la sesión. El operador no conoce ni usa una contraseña de Supabase.
 * Tras entrar o salir, la interfaz recarga la página: la base local depende de la sesión.
 */

const SIN_CONEXION = 'No hay conexión con el servidor. Revisa tu señal e inténtalo de nuevo.'

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ese correo ya tiene cuenta. Entra con tu contraseña.',
  'Email rate limit exceeded': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
}

function mensaje(e: unknown): string {
  if (e instanceof TypeError) return SIN_CONEXION // fetch sin red
  const texto = e instanceof Error ? e.message : String(e)
  if (MENSAJES[texto]) return MENSAJES[texto]
  if (/password should be at least|password is too short/i.test(texto)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/valid email|invalid format|email address .* is invalid/i.test(texto)) return 'Escribe un correo válido.'
  if (/failed to fetch|network/i.test(texto)) return SIN_CONEXION
  return texto
}

export async function entrarComoPropietario(correo: string, contrasena: string): Promise<void> {
  try {
    const cliente = await clienteSupabase()
    const { error } = await cliente.auth.signInWithPassword({ email: correo.trim(), password: contrasena })
    if (error) throw error
  } catch (e) {
    throw new Error(mensaje(e), { cause: e })
  }
}

/** Crea la cuenta de propietario (la confirmación de correo está desactivada: queda con sesión). */
export async function registrarPropietario(p: { nombre: string; correo: string; contrasena: string }): Promise<void> {
  try {
    const cliente = await clienteSupabase()
    const { data, error } = await cliente.auth.signUp({ email: p.correo.trim(), password: p.contrasena, options: { data: { nombre: p.nombre.trim() } } })
    if (error) throw error
    if (!data.session) throw new Error('No se pudo iniciar sesión con la cuenta nueva. Intenta entrar con tu correo y contraseña.')
  } catch (e) {
    throw new Error(mensaje(e), { cause: e })
  }
}

/** Crea el rancho del propietario con su código de alta (un solo uso). Devuelve el id del rancho. */
export async function crearMiRancho(nombre: string, codigoAlta: string): Promise<string> {
  try {
    const cliente = await clienteSupabase()
    const { data, error } = await cliente.rpc('crear_rancho', { p_nombre: nombre, p_codigo_alta: codigoAlta })
    if (error) throw error
    return data as string
  } catch (e) {
    throw new Error(mensaje(e), { cause: e })
  }
}

/** Entra un operador con el código del rancho, su usuario y su PIN. El error trae el motivo (PIN incorrecto, bloqueo, acceso desactivado…). */
export async function entrarComoOperador(p: { codigo: string; usuario: string; pin: string }): Promise<void> {
  try {
    const respuesta = await fetch(`${urlSupabase()}/functions/v1/entrar_operador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: llavePublica() },
      body: JSON.stringify({ codigo_rancho: p.codigo, alias: p.usuario, pin: p.pin }),
    })
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; access_token?: string; refresh_token?: string }
    if (!respuesta.ok || !cuerpo.access_token || !cuerpo.refresh_token) throw new Error(cuerpo.error ?? 'No se pudo entrar. Inténtalo de nuevo.')
    const cliente = await clienteSupabase()
    const { error } = await cliente.auth.setSession({ access_token: cuerpo.access_token, refresh_token: cuerpo.refresh_token })
    if (error) throw error
  } catch (e) {
    throw new Error(mensaje(e), { cause: e })
  }
}

/** Cierra la sesión de este dispositivo. La base local se conserva (la usa la misma cuenta al volver a entrar). */
export async function cerrarSesion(): Promise<void> {
  try {
    const cliente = await clienteSupabase()
    await cliente.auth.signOut({ scope: 'local' })
  } catch {
    // Sin conexión también se puede salir: basta con olvidar la sesión de este dispositivo.
  }
  localStorage.removeItem(CLAVE_SESION)
}

/** Correo (o usuario sintético) de la sesión guardada en este dispositivo; síncrono. */
export function correoDeSesionGuardada(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION)
    const email = crudo ? (JSON.parse(crudo) as { user?: { email?: unknown } }).user?.email : null
    return typeof email === 'string' ? email : null
  } catch {
    return null
  }
}

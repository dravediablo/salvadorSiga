import { clienteSupabase, CLAVE_SESION } from './cliente'

/** TEMPORAL (hito 4): acceso de desarrollo con correo y contraseña. El hito 5 lo reemplaza por el inicio de sesión real. */
export async function iniciarSesionDesarrollo(correo: string, contrasena: string): Promise<void> {
  const cliente = await clienteSupabase()
  const { error } = await cliente.auth.signInWithPassword({ email: correo.trim(), password: contrasena })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
}

export async function cerrarSesionDesarrollo(): Promise<void> {
  const cliente = await clienteSupabase()
  await cliente.auth.signOut()
  localStorage.removeItem(CLAVE_SESION)
}

/** Correo de la sesión guardada en este dispositivo (síncrono), o null. */
export function correoDeSesionGuardada(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION)
    const email = crudo ? (JSON.parse(crudo) as { user?: { email?: unknown } }).user?.email : null
    return typeof email === 'string' ? email : null
  } catch {
    return null
  }
}

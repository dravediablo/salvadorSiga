import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './tipos.gen'

/**
 * Cliente de Supabase. Solo existe si hay VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en
 * `.env.development.local`, sin versionar). Sin ellas la app funciona en modo "solo este dispositivo".
 * En el cliente solo va la llave pública (anon); la `service_role` nunca.
 */
const URL_SUPABASE: string | undefined = import.meta.env.VITE_SUPABASE_URL
const LLAVE_PUBLICA: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigurado: boolean = !!URL_SUPABASE && !!LLAVE_PUBLICA

/** Dónde guarda la sesión supabase-js; se lee también de forma síncrona para elegir la base local. */
export const CLAVE_SESION = 'sigatoka.sesion'

/** Id del usuario con sesión guardada en este dispositivo (síncrono, sin red), o null. */
export function usuarioConSesionGuardada(): string | null {
  if (!supabaseConfigurado) return null
  try {
    const crudo = localStorage.getItem(CLAVE_SESION)
    if (!crudo) return null
    const sesion = JSON.parse(crudo) as Partial<Session> | null
    const id = sesion?.user?.id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

let promesa: Promise<SupabaseClient<Database>> | null = null

/** Crea el cliente la primera vez (la biblioteca se carga solo si hay configuración). */
export function clienteSupabase(): Promise<SupabaseClient<Database>> {
  if (!supabaseConfigurado) return Promise.reject(new Error('Supabase no está configurado.'))
  promesa ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient<Database>(URL_SUPABASE as string, LLAVE_PUBLICA as string, {
      auth: { storageKey: CLAVE_SESION, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }),
  )
  return promesa
}

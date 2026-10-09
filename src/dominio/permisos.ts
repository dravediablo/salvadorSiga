import type { EstadoRecorrido, Rol } from './tipos'

/**
 * Reglas de acceso por rol. Son funciones puras: Supabase (hito 3) repite las
 * mismas reglas con RLS, y las pruebas de este archivo son la especificación.
 */

export interface ActorPermisos {
  usuario_id: string
  /** Rol del usuario en el rancho del recorrido. */
  rol: Rol
}

export interface RecorridoPermisos {
  usuario_id: string
  estado: EstadoRecorrido
}

const esAdmin = (a: ActorPermisos): boolean => a.rol === 'administrador'

/** El operador solo ve y edita sus recorridos abiertos; el administrador ve todo. */
export function puedeVerRecorrido(a: ActorPermisos, r: RecorridoPermisos): boolean {
  return esAdmin(a) || (r.usuario_id === a.usuario_id && r.estado === 'en_curso')
}

export function puedeEditarRecorrido(a: ActorPermisos, r: RecorridoPermisos): boolean {
  return puedeVerRecorrido(a, r)
}

/** Cerrar solo aplica a un recorrido en curso que la persona puede editar. */
export function puedeCerrarRecorrido(a: ActorPermisos, r: RecorridoPermisos): boolean {
  return r.estado === 'en_curso' && puedeEditarRecorrido(a, r)
}

export function puedeReabrirRecorrido(a: ActorPermisos, r: RecorridoPermisos): boolean {
  return esAdmin(a) && r.estado === 'cerrado'
}

export function puedeEliminarRecorrido(a: ActorPermisos): boolean {
  return esAdmin(a)
}

/** Cualquier miembro puede crear recorridos; quedan a su nombre. */
export function puedeCrearRecorrido(): boolean {
  return true
}

/** Tablas, usuarios y umbrales los administra solo el administrador. */
export function puedeAdministrar(a: ActorPermisos): boolean {
  return esAdmin(a)
}

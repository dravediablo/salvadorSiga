import type { Membresia, Usuario } from '@/dominio'
import { crearAjustes } from './ajustes'
import type { SigatokaDB } from './db'

/**
 * TEMPORAL: se reemplaza por inicio de sesión en el hito 5.
 *
 * Toda la lógica del "usuario actual" vive en este módulo. En el hito 5 se
 * sustituye por la sesión real de Supabase y el resto de la app no cambia:
 * solo consume `UsuarioActual`.
 */

const CLAVE = 'sesion.usuario_actual'

export interface UsuarioActual {
  usuario: Usuario
  membresia: Membresia
}

export function crearSesion(db: SigatokaDB) {
  const ajustes = crearAjustes(db)

  /** Usuarios activos del rancho con su membresía (administradores primero, luego por nombre). */
  async function disponibles(): Promise<UsuarioActual[]> {
    const membresias = (await db.membresias.toArray()).filter((m) => !m.eliminado && m.activo)
    const salida: UsuarioActual[] = []
    for (const m of membresias) {
      const u = await db.usuarios.get(m.usuario_id)
      if (u && !u.eliminado) salida.push({ usuario: u, membresia: m })
    }
    return salida.sort((a, b) => a.membresia.rol.localeCompare(b.membresia.rol) || a.usuario.nombre.localeCompare(b.usuario.nombre))
  }

  return {
    disponibles,
    /** Usuario simulado actual; si no hay uno elegido (o ya no existe), el primero disponible. */
    async actual(): Promise<UsuarioActual | null> {
      const lista = await disponibles()
      const id = await ajustes.leer<string>(CLAVE)
      return lista.find((x) => x.usuario.id === id) ?? lista[0] ?? null
    },
    fijar(usuarioId: string): Promise<void> {
      return ajustes.fijar(CLAVE, usuarioId)
    },
  }
}
export type Sesion = ReturnType<typeof crearSesion>

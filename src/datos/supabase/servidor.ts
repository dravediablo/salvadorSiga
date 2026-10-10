import type { SupabaseClient } from '@supabase/supabase-js'
import { SesionVencida, type ItemLote, type MembresiaEstado, type ResultadoItem, type Servidor } from '../sincronizacion/servidor'
import type { Database } from './tipos.gen'

/** Implementación de `Servidor` sobre un cliente de Supabase con sesión. */
export function servidorSupabase(cliente: SupabaseClient<Database>): Servidor {
  /** Antes de cada llamada: si no hay sesión (la renovación falló), se pide volver a entrar. */
  const conSesion = async (): Promise<void> => {
    const { data } = await cliente.auth.getSession()
    if (!data.session) throw new SesionVencida()
  }
  /** Un 401 del servidor (JWT vencido o revocado) también es sesión vencida; lo demás es un error normal. */
  const fallo = (error: { message: string }, status: number): never => {
    if (status === 401 || /JWT/i.test(error.message)) throw new SesionVencida()
    throw new Error(error.message)
  }
  return {
    async miEstado(): Promise<MembresiaEstado[]> {
      await conSesion()
      const { data, error, status } = await cliente.rpc('mi_estado')
      if (error) return fallo(error, status)
      return (data ?? []) as MembresiaEstado[]
    },

    async aplicarCambios(lote: ItemLote[]): Promise<ResultadoItem[]> {
      await conSesion()
      const { data, error, status } = await cliente.rpc('aplicar_cambios', { lote: lote as unknown as never })
      if (error) return fallo(error, status)
      return data as unknown as ResultadoItem[]
    },

    async descargar(entidad, desde, despuesDe, limite) {
      // `from` solo acepta nombres de tablas conocidas; la entidad viene de ENTIDAD_SERVIDOR.
      let consulta = cliente.from(entidad as 'hoja').select('*')
      if (despuesDe) {
        // Paginación por llave: server_updated_at mayor, o igual con id mayor (valores exactos del servidor, entre comillas).
        const t = `"${despuesDe.server_updated_at}"`
        consulta = consulta.or(`server_updated_at.gt.${t},and(server_updated_at.eq.${t},id.gt."${despuesDe.id}")`)
      } else if (desde) {
        consulta = consulta.gt('server_updated_at', desde)
      }
      await conSesion()
      const { data, error, status } = await consulta
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limite)
      if (error) return fallo(error, status)
      return data as unknown as Array<Record<string, unknown>>
    },

    async traerRegistro(entidad, id) {
      await conSesion()
      const { data, error, status } = await cliente.from(entidad as 'hoja').select('*').eq('id', id).maybeSingle()
      if (error) return fallo(error, status)
      return (data as unknown as Record<string, unknown> | null) ?? null
    },
  }
}

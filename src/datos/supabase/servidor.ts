import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItemLote, ResultadoItem, Servidor } from '../sincronizacion/servidor'
import type { Database } from './tipos.gen'

/** Implementación de `Servidor` sobre un cliente de Supabase con sesión. */
export function servidorSupabase(cliente: SupabaseClient<Database>): Servidor {
  return {
    async aplicarCambios(lote: ItemLote[]): Promise<ResultadoItem[]> {
      const { data, error } = await cliente.rpc('aplicar_cambios', { lote: lote as unknown as never })
      if (error) throw new Error(error.message)
      return data as unknown as ResultadoItem[]
    },

    async descargar(entidad, desde, desplazamiento, limite) {
      // `from` solo acepta nombres de tablas conocidas; la entidad viene de ENTIDAD_SERVIDOR.
      let consulta = cliente.from(entidad as 'hoja').select('*')
      if (desde) consulta = consulta.gt('server_updated_at', desde)
      const { data, error } = await consulta
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(desplazamiento, desplazamiento + limite - 1)
      if (error) throw new Error(error.message)
      return data as unknown as Array<Record<string, unknown>>
    },

    async traerRegistro(entidad, id) {
      const { data, error } = await cliente.from(entidad as 'hoja').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as unknown as Record<string, unknown> | null) ?? null
    },
  }
}

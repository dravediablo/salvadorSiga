/** Lo que la sincronización necesita del servidor. En producción lo implementa Supabase; en las pruebas, un doble. */

export interface ItemLote {
  /** Nombre de la tabla del servidor (singular). */
  entidad: string
  /** La fila completa. */
  registro: Record<string, unknown>
}

export type ResultadoRegistro = 'aplicado' | 'ignorado_version' | 'rechazado'

/** Última fila recibida de una página: de ahí sigue la siguiente. */
export interface LlavePagina {
  server_updated_at: string
  id: string
}

export interface ResultadoItem {
  entidad: string
  id: string
  resultado: ResultadoRegistro
  motivo: string | null
}

export interface Servidor {
  /** Llama a `aplicar_cambios`. Lanza si falla la llamada (red, servidor, sesión): ahí nada se da por enviado. */
  aplicarCambios(lote: ItemLote[]): Promise<ResultadoItem[]>
  /**
   * Una página de filas de una tabla, ordenadas por (`server_updated_at`, `id`), hasta `limite` filas.
   * Paginación POR LLAVE, no por posición: sin `despuesDe`, las de `server_updated_at` mayor que `desde` (ISO; todas si es null);
   * con `despuesDe`, las que siguen a esa fila: `server_updated_at` mayor, o igual con `id` mayor.
   * `despuesDe` lleva los valores EXACTOS que mandó el servidor (microsegundos incluidos). Así, si una fila ya descargada
   * se modifica entre una página y otra, no recorre a las demás ni deja ninguna sin descargar.
   */
  descargar(entidad: string, desde: string | null, despuesDe: LlavePagina | null, limite: number): Promise<Array<Record<string, unknown>>>
  /** Una fila por id (null si no existe o no se puede ver). */
  traerRegistro(entidad: string, id: string): Promise<Record<string, unknown> | null>
}

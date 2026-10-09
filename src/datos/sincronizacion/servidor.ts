/** Lo que la sincronización necesita del servidor. En producción lo implementa Supabase; en las pruebas, un doble. */

export interface ItemLote {
  /** Nombre de la tabla del servidor (singular). */
  entidad: string
  /** La fila completa. */
  registro: Record<string, unknown>
}

export type ResultadoRegistro = 'aplicado' | 'ignorado_version' | 'rechazado'

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
   * Filas de una tabla con `server_updated_at` mayor que `desde` (ISO) —todas si es null—, ordenadas por
   * `server_updated_at` y luego por id, de `desplazamiento` en adelante, hasta `limite` filas.
   */
  descargar(entidad: string, desde: string | null, desplazamiento: number, limite: number): Promise<Array<Record<string, unknown>>>
  /** Una fila por id (null si no existe o no se puede ver). */
  traerRegistro(entidad: string, id: string): Promise<Record<string, unknown> | null>
}

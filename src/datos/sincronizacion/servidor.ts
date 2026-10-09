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

/** Una membresía de quien sincroniza, incluidas las inactivas (`mi_estado()` del servidor). */
export interface MembresiaEstado {
  rancho_id: string
  rol: 'operador' | 'administrador'
  activo: boolean
}

/** La sesión caducó o fue revocada y no se pudo renovar: hay que volver a entrar. Los datos locales no se tocan. */
export class SesionVencida extends Error {
  constructor() {
    super('La sesión venció. Vuelve a entrar.')
    this.name = 'SesionVencida'
  }
}

export interface Servidor {
  /** Llama a `mi_estado()`: las membresías de la persona, también las inactivas. Se pide al empezar cada ciclo. */
  miEstado(): Promise<MembresiaEstado[]>
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

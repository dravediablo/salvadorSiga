import type { SigatokaDB } from './db'

/** Ajustes locales del dispositivo (no se sincronizan ni entran en la cola). */
export function crearAjustes(db: SigatokaDB) {
  return {
    async leer<T>(clave: string): Promise<T | undefined> {
      return (await db.ajustes.get(clave))?.valor as T | undefined
    },
    async fijar(clave: string, valor: unknown): Promise<void> {
      await db.ajustes.put({ clave, valor })
    },
    async quitar(clave: string): Promise<void> {
      await db.ajustes.delete(clave)
    },
  }
}
export type Ajustes = ReturnType<typeof crearAjustes>

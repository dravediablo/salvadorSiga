import { crearAjustes } from './ajustes'
import { crearConsultas } from './consultas'
import { SigatokaDB } from './db'
import { crearRepoPlantas } from './repos/plantas'
import { crearRepoRancho } from './repos/rancho'
import { crearRepoRecorridos } from './repos/recorridos'
import { crearRepoTablas } from './repos/tablas'
import { crearSesion } from './sesion'

/**
 * Única puerta de la interfaz a los datos locales. La interfaz importa de aquí
 * (`@/datos`) y nunca de Dexie ni de `@/datos/db`: así toda escritura pasa por
 * un repositorio y queda registrada en la cola de pendientes.
 */
const db = new SigatokaDB()

export const repos = {
  rancho: crearRepoRancho(db),
  tablas: crearRepoTablas(db),
  recorridos: crearRepoRecorridos(db),
  plantas: crearRepoPlantas(db),
}
export const consultas = crearConsultas(db)
export const ajustes = crearAjustes(db)
export const sesion = crearSesion(db)

export { leerPoligonos } from './importarKmz'
export type { UsuarioActual } from './sesion'
export type { DetallePlanta, DetalleRecorrido, DetalleTabla, EvaluacionConDatos, TarjetaRecorrido } from './consultas'
export type { CambiosTabla, ResultadoImportacion } from './repos/tablas'
export type { CambiosPlanta } from './repos/plantas'

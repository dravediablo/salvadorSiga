import { crearAjustes } from './ajustes'
import { crearConsultas } from './consultas'
import { SigatokaDB } from './db'
import { crearRepoPlantas } from './repos/plantas'
import { crearRepoRancho } from './repos/rancho'
import { crearRepoRecorridos } from './repos/recorridos'
import { crearRepoTablas } from './repos/tablas'
import { crearSesion } from './sesion'
import { iniciarDisparadores } from './sincronizacion/disparadores'
import { crearMotor } from './sincronizacion/motor'
import type { Servidor } from './sincronizacion/servidor'
import { clienteSupabase, usuarioConSesionGuardada } from './supabase/cliente'
import { servidorSupabase } from './supabase/servidor'

/**
 * Única puerta de la interfaz a los datos locales. La interfaz importa de aquí
 * (`@/datos`) y nunca de Dexie ni de `@/datos/db`: así toda escritura pasa por
 * un repositorio y queda registrada en la cola de pendientes.
 */
/**
 * Con sesión de Supabase guardada, cada persona tiene su propia base local (`sigatoka-<id>`): lo que se
 * captura sin servidor (base `sigatoka`) no se mezcla con lo del servidor; su migración llega en el hito 5.
 * Sin sesión, la app es la de siempre y la sincronización está apagada.
 */
const usuarioServidorId = usuarioConSesionGuardada()
const db = new SigatokaDB(usuarioServidorId ? `sigatoka-${usuarioServidorId}` : 'sigatoka')

export const repos = {
  rancho: crearRepoRancho(db),
  tablas: crearRepoTablas(db),
  recorridos: crearRepoRecorridos(db),
  plantas: crearRepoPlantas(db),
}
export const consultas = crearConsultas(db)
export const ajustes = crearAjustes(db)
export const sesion = crearSesion(db, usuarioServidorId)

/** El cliente se crea la primera vez que se necesita (la biblioteca no se carga sin sesión). */
const servidor: Servidor | null = usuarioServidorId
  ? {
      aplicarCambios: async (lote) => servidorSupabase(await clienteSupabase()).aplicarCambios(lote),
      descargar: async (e, d, o, l) => servidorSupabase(await clienteSupabase()).descargar(e, d, o, l),
      traerRegistro: async (e, id) => servidorSupabase(await clienteSupabase()).traerRegistro(e, id),
    }
  : null
export const motor = crearMotor({ db, servidor })
/** `true` si hay sesión del servidor en este dispositivo; si no, "solo este dispositivo". */
export const modoServidor: boolean = servidor !== null
if (servidor) iniciarDisparadores(motor)

export { leerPoligonos } from './importarKmz'
export { supabaseConfigurado } from './supabase/cliente'
export { cerrarSesionDesarrollo, correoDeSesionGuardada, iniciarSesionDesarrollo } from './supabase/autenticacion'
export type { EstadoSincronizacion } from './sincronizacion/motor'
export type { Rechazo } from './db'
export { alDescartar, claveHojaGrado, clavePlantaTh, claveTablaCampo, enSegundoPlano, fallosPendientes, gruposDeCambioPlanta, mensajeDeError, hayFallos, reintentar, suscribirFallos, type Fallo } from './fallos'
export { RegistroInexistente } from './errores'
export { CLAVE_AVISO_MIGRACION } from './db'
export type { UsuarioActual } from './sesion'
export type { DetallePlanta, DetalleRecorrido, DetalleTabla, EvaluacionConDatos, TarjetaRecorrido } from './consultas'
export type { CambiosTabla, ResultadoImportacion } from './repos/tablas'
export type { CambiosPlanta } from './repos/plantas'

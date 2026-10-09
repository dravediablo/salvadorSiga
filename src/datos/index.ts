import Dexie from 'dexie'
import { crearAjustes } from './ajustes'
import { crearConsultas } from './consultas'
import { SigatokaDB } from './db'
import { crearRepoPlantas } from './repos/plantas'
import { leerSubidaRegistrada, subidaConfirmada, subirDatosLocales as subirALaCuenta } from './repos/migracion'
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
/** Sube los datos de la etapa sin servidor (base `sigatoka`) al rancho de esta cuenta. */
export const subirDatosLocales = (p: { ranchoId: string; usuarioId: string; incluirRecorridos: boolean }) => subirALaCuenta(db, p)
export const subidaDeEstaCuentaConfirmada = () => subidaConfirmada(db)
export const subidaRegistradaDeEstaCuenta = () => leerSubidaRegistrada(db)
/** Para leer ids de la sesión en pantallas: la persona con sesión (null si no la hay). */
export const idUsuarioConSesion: string | null = usuarioServidorId

/**
 * "Cerrar sesión y borrar los datos de este celular": borra la base local de ESTA cuenta. Solo si no hay pendientes ni rechazos
 * (si los hubiera se perderían); si los hay, lanza.
 */
export async function borrarDatosDeEsteCelular(): Promise<void> {
  if ((await db.cola.count()) > 0 || (await db.rechazos.count()) > 0) throw new Error('Hay cambios sin enviar o rechazados: no se pueden borrar los datos de este celular.')
  db.close()
  await Dexie.delete(db.name)
}

/** El cliente se crea la primera vez que se necesita (la biblioteca no se carga sin sesión). */
const servidor: Servidor | null = usuarioServidorId
  ? {
      miEstado: async () => servidorSupabase(await clienteSupabase()).miEstado(),
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
export { borrarBaseAntigua, hayBaseAntigua, resumenBaseAntigua, subidaConfirmada, type ResumenBaseAntigua } from './repos/migracion'
export { supabaseConfigurado } from './supabase/cliente'
export { cerrarSesion, correoDeSesionGuardada, crearMiRancho, entrarComoOperador, entrarComoPropietario, registrarPropietario } from './supabase/autenticacion'
export {
  crearOperador, desactivarOperador, enlaceWhatsApp, listarCuentasOperador, reactivarOperador, renombrarOperador, restablecerPin, textoCredenciales,
  type Credencial, type CuentaOperador,
} from './supabase/operadores'
export type { EstadoSincronizacion } from './sincronizacion/motor'
export type { Rechazo } from './db'
export { alDescartar, claveHojaGrado, clavePlantaTh, claveTablaCampo, enSegundoPlano, fallosPendientes, gruposDeCambioPlanta, mensajeDeError, hayFallos, reintentar, suscribirFallos, type Fallo } from './fallos'
export { RegistroInexistente } from './errores'
export { CLAVE_AVISO_MIGRACION } from './db'
export type { UsuarioActual } from './sesion'
export type { DetallePlanta, DetalleRecorrido, DetalleTabla, EvaluacionConDatos, TarjetaRecorrido } from './consultas'
export type { CambiosTabla, ResultadoImportacion } from './repos/tablas'
export type { CambiosPlanta } from './repos/plantas'

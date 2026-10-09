import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../supabase/tipos.gen'
import { servidorSupabase } from '../../supabase/servidor'
import { crearMotor } from '../motor'
import { nuevaBase } from '../pruebas.util'
import type { SigatokaDB } from '../../db'
import { crearRepoPlantas } from '../../repos/plantas'
import { crearRepoRecorridos } from '../../repos/recorridos'
import type { Servidor } from '../servidor'

/** Entorno de las pruebas de integración: Supabase local con los usuarios de supabase/seed.sql. */

export const CONTRASENA = 'prueba123'
export const RANCHO = 'd1000000-0000-4000-8000-000000000001'
export const USUARIOS = {
  admin: { id: 'd0000000-0000-4000-8000-000000000001', correo: 'admin@prueba.test' },
  op1: { id: 'd0000000-0000-4000-8000-000000000002', correo: 'op1@prueba.test' },
  op2: { id: 'd0000000-0000-4000-8000-000000000003', correo: 'op2@prueba.test' },
} as const
export const TABLAS = ['d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003']
const CONTENEDOR_DB = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_salvador'

export function estadoSupabase(): { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { API_URL: process.env.SUPABASE_URL, ANON_KEY: process.env.SUPABASE_ANON_KEY, SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
  }
  try {
    const salida = execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return JSON.parse(salida) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string }
  } catch {
    throw new Error('No se pudo leer `supabase status`. Levanta el servidor local con `supabase start` (y `supabase db reset` para cargar la semilla).')
  }
}

/** Corre SQL como postgres dentro del contenedor de la base local. Devuelve la salida sin formato. */
export function sql(consulta: string): string {
  return execFileSync('docker', ['exec', '-i', CONTENEDOR_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', consulta], { encoding: 'utf8' }).trim()
}

/** Borra lo capturado (recorridos y todo lo que cuelga de ellos, aplicaciones); deja la semilla: usuarios, rancho, membresías y tablas. */
export function limpiarCaptura(): void {
  sql('truncate table public.hoja, public.planta, public.evaluacion_tabla, public.recorrido, public.aplicacion')
}

export function cuenta(tabla: string, donde = 'true'): number {
  return Number(sql(`select count(*) from public.${tabla} where ${donde}`))
}

export type Persona = keyof typeof USUARIOS

const clientes = new Map<Persona, SupabaseClient<Database>>()

/** Cliente de Supabase con la sesión de la persona (una sola vez por persona: el inicio de sesión tiene límite de intentos). */
export async function clienteDe(persona: Persona): Promise<SupabaseClient<Database>> {
  const existente = clientes.get(persona)
  if (existente) return existente
  const { API_URL, ANON_KEY } = estadoSupabase()
  const cliente = createClient<Database>(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await cliente.auth.signInWithPassword({ email: USUARIOS[persona].correo, password: CONTRASENA })
  if (error) throw new Error(`No se pudo iniciar sesión como ${persona}: ${error.message}. ¿Corriste \`supabase db reset\` para cargar la semilla?`)
  clientes.set(persona, cliente)
  return cliente
}

/** Cliente de Supabase sin sesión guardada (como un navegador nuevo). */
export function clienteNuevo(): SupabaseClient<Database> {
  const { API_URL, ANON_KEY } = estadoSupabase()
  return createClient<Database>(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Cliente con la llave service_role: SOLO para preparar y revisar cosas en las pruebas (la app nunca la usa). */
export function clienteServicio(): SupabaseClient<Database> {
  const { API_URL, SERVICE_ROLE_KEY } = estadoSupabase()
  return createClient<Database>(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Llama a una función del servidor como lo hace la app (fetch con la llave pública y, si hay, el token). */
export async function llamarFuncion(nombre: string, cuerpo: object, token?: string): Promise<{ estado: number; cuerpo: Record<string, unknown>; ms: number }> {
  const { API_URL, ANON_KEY } = estadoSupabase()
  const inicio = performance.now()
  const r = await fetch(`${API_URL}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: (await r.json().catch(() => ({}))) as Record<string, unknown>, ms: performance.now() - inicio }
}

/** Un dispositivo simulado: su propia base Dexie, su sesión y su motor de sincronización. */
export async function dispositivoConCliente(cliente: SupabaseClient<Database>, usuarioId: string, opciones: { db?: SigatokaDB; envolver?: (s: Servidor) => Servidor } = {}) {
  const db = opciones.db ?? nuevaBase()
  const servidor = (opciones.envolver ?? ((x: Servidor) => x))(servidorSupabase(cliente))
  const llamadasAplicar: number[] = []
  const contado: Servidor = {
    ...servidor,
    aplicarCambios: async (lote) => {
      llamadasAplicar.push(lote.length)
      return servidor.aplicarCambios(lote)
    },
  }
  const motor = crearMotor({ db, servidor: contado, enLinea: () => true, programar: () => () => undefined })
  return {
    usuarioId,
    cliente,
    db,
    motor,
    llamadasAplicar,
    recorridos: crearRepoRecorridos(db),
    plantas: crearRepoPlantas(db),
    /** Sincroniza ahora y propaga el error si falla. */
    async sincronizar(): Promise<void> {
      await motor.sincronizar({ ignorarEspera: true })
      const { ultimoError } = motor.obtenerEstado()
      if (ultimoError) throw new Error(`La sincronización de ${usuarioId} falló: ${ultimoError}`)
    },
  }
}

export async function dispositivo(persona: Persona, envolver: (s: Servidor) => Servidor = (s) => s) {
  const d = await dispositivoConCliente(await clienteDe(persona), USUARIOS[persona].id, { envolver })
  return { ...d, persona }
}
export type Dispositivo = Awaited<ReturnType<typeof dispositivo>>

/** Pausa mínima para que dos ediciones seguidas tengan marcas de tiempo distintas aunque el reloj sea el mismo. */
export const pausa = (ms = 15): Promise<void> => new Promise((ok) => setTimeout(ok, ms))

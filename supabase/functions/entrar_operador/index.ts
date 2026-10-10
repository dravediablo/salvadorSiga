// Función del servidor "entrar_operador" (pública, sin JWT): un operador entra con código del rancho + usuario + PIN.
// Aplica el bloqueo por intentos y le entrega la sesión de Supabase Auth; el operador nunca conoce su contraseña real
// (es HMAC-SHA256(PIMIENTA, usuario_id + ':' + PIN)). Usa service_role (variable de entorno de la función).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import {
  contrasenaDerivada, correoSintetico, ERROR_BLOQUEO_PERMANENTE, ERROR_DESACTIVADO, ERROR_GENERICO, esPinValido, mensajeBloqueo, normalizarAlias, normalizarCodigo,
} from '../_compartido/cuentas.ts'
import { error, json, leerJson, opciones } from '../_compartido/http.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const PIMIENTA = Deno.env.get('PIMIENTA') ?? ''
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(URL_SUPABASE, SERVICE_ROLE, sinSesion)

const CORREO_SENUELO = correoSintetico('00000000-0000-4000-8000-0000000000aa')
let senuelo: Promise<void> | null = null

/**
 * Una cuenta señuelo (sin acceso: su contraseña es aleatoria y nadie la conoce). Autenticarse contra una cuenta que existe
 * cuesta lo mismo que un PIN incorrecto real (la comparación de la contraseña con bcrypt); contra una que no existe, casi nada.
 */
function asegurarSenuelo(): Promise<void> {
  senuelo ??= admin.auth.admin
    .createUser({ email: CORREO_SENUELO, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true })
    .then(() => undefined, () => undefined) // si ya existe, bien
  return senuelo
}

/** Mismo trabajo (HMAC + una llamada a Auth con bcrypt + la escritura de un intento fallido) que un intento real, para que "no existe" y "PIN incorrecto" tarden parecido. */
async function intentoFalso(): Promise<Response> {
  await asegurarSenuelo()
  const anon = createClient(URL_SUPABASE, ANON, sinSesion)
  await anon.auth.signInWithPassword({ email: CORREO_SENUELO, password: await contrasenaDerivada(PIMIENTA, 'sin-cuenta', '000000') })
  await admin.rpc('registrar_intento_fallido_operador', { p_usuario_id: '00000000-0000-4000-8000-000000000000' })
  return error(ERROR_GENERICO, 401)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return opciones()
  if (req.method !== 'POST') return error('Método no permitido.', 405)
  if (!PIMIENTA) return error('El servidor no está configurado.', 500)

  const cuerpo = await leerJson(req)
  const codigo = normalizarCodigo(cuerpo?.codigo_rancho)
  const alias = normalizarAlias(cuerpo?.alias)
  const pin = cuerpo?.pin
  if (!codigo || !alias || !esPinValido(pin)) return error('Escribe el código del rancho, tu usuario y tu PIN de 6 dígitos.')

  const { data: rancho } = await admin.from('rancho').select('id').eq('codigo', codigo).eq('eliminado', false).maybeSingle()
  const { data: cuenta } = rancho
    ? await admin.from('cuenta_operador').select('usuario_id, bloqueado_hasta, bloqueado_permanente').eq('rancho_id', rancho.id).eq('alias', alias).maybeSingle()
    : { data: null }
  // Sin cuenta: el mismo error (y casi el mismo tiempo) que con un PIN incorrecto.
  if (!rancho || !cuenta) return intentoFalso()

  if (cuenta.bloqueado_permanente) return error(ERROR_BLOQUEO_PERMANENTE, 423, { bloqueado: 'permanente' })
  if (cuenta.bloqueado_hasta && new Date(cuenta.bloqueado_hasta) > new Date()) {
    return error(mensajeBloqueo(new Date(cuenta.bloqueado_hasta)), 423, { bloqueado: 'temporal', bloqueado_hasta: cuenta.bloqueado_hasta })
  }

  const usuarioId = cuenta.usuario_id as string
  const anon = createClient(URL_SUPABASE, ANON, sinSesion)
  const { data: sesion, error: errorAuth } = await anon.auth.signInWithPassword({
    email: correoSintetico(usuarioId),
    password: await contrasenaDerivada(PIMIENTA, usuarioId, pin),
  })

  if (errorAuth || !sesion.session) {
    const { data: estado } = await admin.rpc('registrar_intento_fallido_operador', { p_usuario_id: usuarioId })
    const fila = Array.isArray(estado) ? estado[0] : estado
    if (fila?.bloqueado_permanente) return error(ERROR_BLOQUEO_PERMANENTE, 423, { bloqueado: 'permanente' })
    if (fila?.bloqueado_hasta && new Date(fila.bloqueado_hasta) > new Date()) {
      return error(mensajeBloqueo(new Date(fila.bloqueado_hasta)), 423, { bloqueado: 'temporal', bloqueado_hasta: fila.bloqueado_hasta })
    }
    return error(ERROR_GENERICO, 401)
  }

  // PIN correcto: ¿su acceso a este rancho sigue activo? Si no, no se entrega sesión (y se revoca la que acaba de nacer).
  const { data: membresia } = await admin
    .from('membresia')
    .select('activo')
    .eq('usuario_id', usuarioId)
    .eq('rancho_id', rancho.id)
    .eq('eliminado', false)
    .maybeSingle()
  if (!membresia?.activo) {
    await admin.auth.admin.signOut(sesion.session.access_token)
    return error(ERROR_DESACTIVADO, 403, { desactivado: true })
  }

  await admin.rpc('reiniciar_intentos_operador', { p_usuario_id: usuarioId })
  return json({
    access_token: sesion.session.access_token,
    refresh_token: sesion.session.refresh_token,
    expires_in: sesion.session.expires_in,
    usuario_id: usuarioId,
  })
})

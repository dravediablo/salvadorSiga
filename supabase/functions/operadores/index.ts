// Función del servidor "operadores": el propietario administra a sus operadores.
// Es uno de los dos únicos lugares donde se usa la llave service_role (la entrega Supabase como variable
// de entorno de la función; nunca está en el repositorio ni en el cliente).
// Acciones: crear, restablecer_pin, desactivar, reactivar, renombrar. Cada llamada verifica con el JWT de quien llama
// que sea administrador ACTIVO del rancho indicado.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { aliasUnico, contrasenaDerivada, correoSintetico, generarPin } from '../_compartido/cuentas.ts'
import { error, json, leerJson, opciones } from '../_compartido/http.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PIMIENTA = Deno.env.get('PIMIENTA') ?? ''
const admin = createClient(URL_SUPABASE, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x)

async function usuarioDelJwt(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error: err } = await admin.auth.getUser(token)
  return err || !data.user ? null : data.user.id
}

async function esAdministradorActivo(usuarioId: string, ranchoId: string): Promise<boolean> {
  const { data } = await admin
    .from('membresia')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('rancho_id', ranchoId)
    .eq('rol', 'administrador')
    .eq('activo', true)
    .eq('eliminado', false)
    .maybeSingle()
  return !!data
}

/** La cuenta de operador debe ser de ESE rancho (un administrador no toca operadores de otro). */
async function cuentaDelRancho(usuarioId: string, ranchoId: string) {
  const { data } = await admin.from('cuenta_operador').select('usuario_id, alias, rancho_id').eq('usuario_id', usuarioId).eq('rancho_id', ranchoId).maybeSingle()
  return data
}

async function codigoDelRancho(ranchoId: string): Promise<string> {
  const { data } = await admin.from('rancho').select('codigo').eq('id', ranchoId).single()
  return data?.codigo ?? ''
}

async function crear(ranchoId: string, nombreCrudo: unknown): Promise<Response> {
  const nombre = typeof nombreCrudo === 'string' ? nombreCrudo.trim() : ''
  if (!nombre || nombre.length > 80) return error('Escribe el nombre del operador (hasta 80 letras).')

  const { data: existentes } = await admin.from('cuenta_operador').select('alias').eq('rancho_id', ranchoId)
  const alias = aliasUnico(nombre, new Set((existentes ?? []).map((c) => c.alias as string)))
  const pin = generarPin()

  // La cuenta nace con una contraseña aleatoria y enseguida recibe la derivada, que necesita el id.
  const creada = await admin.auth.admin.createUser({
    email: correoSintetico(crypto.randomUUID()),
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (creada.error || !creada.data.user) return error('No se pudo crear la cuenta del operador. Inténtalo de nuevo.', 500)
  const usuarioId = creada.data.user.id

  const deshacer = async () => {
    await admin.from('cuenta_operador').delete().eq('usuario_id', usuarioId)
    await admin.from('membresia').delete().eq('usuario_id', usuarioId)
    await admin.from('usuario').delete().eq('id', usuarioId)
    await admin.auth.admin.deleteUser(usuarioId)
  }

  const clave = await admin.auth.admin.updateUserById(usuarioId, { password: await contrasenaDerivada(PIMIENTA, usuarioId, pin) })
  if (clave.error) {
    await deshacer()
    return error('No se pudo crear la cuenta del operador. Inténtalo de nuevo.', 500)
  }
  const ahora = new Date().toISOString()
  const membresia = await admin.from('membresia').insert({ id: crypto.randomUUID(), created_at: ahora, updated_at: ahora, rancho_id: ranchoId, usuario_id: usuarioId, rol: 'operador', activo: true })
  const cuenta = membresia.error ? null : await admin.from('cuenta_operador').insert({ usuario_id: usuarioId, rancho_id: ranchoId, alias })
  if (membresia.error || cuenta?.error) {
    await deshacer()
    return error('No se pudo crear la cuenta del operador. Inténtalo de nuevo.', 500)
  }
  // El PIN solo viaja en esta respuesta: no se guarda en ningún lado.
  return json({ usuario_id: usuarioId, alias, pin, codigo_rancho: await codigoDelRancho(ranchoId) })
}

async function restablecerPin(ranchoId: string, usuarioId: string): Promise<Response> {
  const cuenta = await cuentaDelRancho(usuarioId, ranchoId)
  if (!cuenta) return error('Ese operador no existe en tu rancho.', 404)
  const pin = generarPin()
  const r = await admin.auth.admin.updateUserById(usuarioId, { password: await contrasenaDerivada(PIMIENTA, usuarioId, pin) })
  if (r.error) return error('No se pudo cambiar el PIN. Inténtalo de nuevo.', 500)
  await admin.rpc('reiniciar_intentos_operador', { p_usuario_id: usuarioId })
  return json({ usuario_id: usuarioId, alias: cuenta.alias, pin, codigo_rancho: await codigoDelRancho(ranchoId) })
}

async function cambiarActivo(ranchoId: string, usuarioId: string, activo: boolean): Promise<Response> {
  if (!(await cuentaDelRancho(usuarioId, ranchoId))) return error('Ese operador no existe en tu rancho.', 404)
  // Una escritura normal: el updated_at nuevo hace que gane en la sincronización.
  const { error: err } = await admin
    .from('membresia')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
    .eq('rancho_id', ranchoId)
    .eq('rol', 'operador')
  if (err) return error('No se pudo guardar el cambio. Inténtalo de nuevo.', 500)
  return json({ usuario_id: usuarioId, activo })
}

async function renombrar(ranchoId: string, usuarioId: string, nombreCrudo: unknown): Promise<Response> {
  const nombre = typeof nombreCrudo === 'string' ? nombreCrudo.trim() : ''
  if (!nombre || nombre.length > 80) return error('Escribe el nombre del operador (hasta 80 letras).')
  if (!(await cuentaDelRancho(usuarioId, ranchoId))) return error('Ese operador no existe en tu rancho.', 404)
  const { error: err } = await admin.from('usuario').update({ nombre, updated_at: new Date().toISOString() }).eq('id', usuarioId)
  if (err) return error('No se pudo guardar el cambio. Inténtalo de nuevo.', 500)
  return json({ usuario_id: usuarioId, nombre })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return opciones()
  if (req.method !== 'POST') return error('Método no permitido.', 405)
  if (!PIMIENTA) return error('El servidor no está configurado.', 500)

  const llamador = await usuarioDelJwt(req)
  if (!llamador) return error('Inicia sesión para continuar.', 401)
  const cuerpo = await leerJson(req)
  if (!cuerpo) return error('La solicitud no es válida.')
  const { accion, rancho_id: ranchoId, usuario_id: usuarioId } = cuerpo
  if (!esUuid(ranchoId)) return error('Falta el rancho.')
  // Siempre, antes de cualquier acción: quien llama es administrador activo de ESE rancho.
  if (!(await esAdministradorActivo(llamador, ranchoId))) return error('Solo el propietario de este rancho puede administrar operadores.', 403)

  switch (accion) {
    case 'crear':
      return crear(ranchoId, cuerpo.nombre)
    case 'restablecer_pin':
    case 'desactivar':
    case 'reactivar':
    case 'renombrar':
      if (!esUuid(usuarioId)) return error('Falta el operador.')
      if (accion === 'restablecer_pin') return restablecerPin(ranchoId, usuarioId)
      if (accion === 'renombrar') return renombrar(ranchoId, usuarioId, cuerpo.nombre)
      return cambiarActivo(ranchoId, usuarioId, accion === 'reactivar')
    default:
      return error('Acción desconocida.')
  }
})

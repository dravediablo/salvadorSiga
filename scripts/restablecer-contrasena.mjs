// Pone una contraseña temporal a un PROPIETARIO que olvidó la suya.
// Uso:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restablecer-contrasena.mjs correo@ejemplo.com
// Lee la URL y la llave service_role de variables de entorno; NUNCA las guarda. Imprime la contraseña temporal una vez:
// entrégala por un medio privado y pídele que la cambie. Los operadores no usan contraseña: su PIN lo restablece el propietario en la app.
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const correo = process.argv[2]?.trim().toLowerCase()
if (!URL || !LLAVE) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}
if (!correo || !correo.includes('@')) {
  console.error('Uso: node scripts/restablecer-contrasena.mjs correo@ejemplo.com')
  process.exit(1)
}
if (correo.endsWith('@operadores.invalid')) {
  console.error('Los operadores no tienen contraseña: su propietario les da un PIN nuevo desde la app.')
  process.exit(1)
}

const cliente = createClient(URL, LLAVE, { auth: { persistSession: false, autoRefreshToken: false } })

let usuario = null
for (let pagina = 1; !usuario; pagina++) {
  const { data, error } = await cliente.auth.admin.listUsers({ page: pagina, perPage: 200 })
  if (error) {
    console.error(`No se pudo consultar las cuentas: ${error.message}`)
    process.exit(1)
  }
  usuario = data.users.find((u) => u.email?.toLowerCase() === correo) ?? null
  if (data.users.length < 200) break
}
if (!usuario) {
  console.error(`No hay ninguna cuenta con el correo ${correo}.`)
  process.exit(1)
}

const SIN_AMBIGUOS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const temporal = Array.from({ length: 12 }, () => SIN_AMBIGUOS[randomInt(SIN_AMBIGUOS.length)]).join('')
const { error } = await cliente.auth.admin.updateUserById(usuario.id, { password: temporal })
if (error) {
  console.error(`No se pudo cambiar la contraseña: ${error.message}`)
  process.exit(1)
}
console.log(`Contraseña temporal para ${correo}: ${temporal}`)

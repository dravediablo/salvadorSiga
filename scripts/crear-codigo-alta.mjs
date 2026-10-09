// Genera códigos de alta de un solo uso para que un propietario cree su rancho.
// Uso:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/crear-codigo-alta.mjs [cantidad]
// Lee la URL y la llave service_role de variables de entorno; NUNCA las guarda ni las imprime. Las llaves se obtienen en el
// panel del proyecto (Project Settings → API). Los códigos se imprimen una vez: repártelos al propietario por un medio privado.
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !LLAVE) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}
const cantidad = Number(process.argv[2] ?? 1)
if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
  console.error('La cantidad debe ser un entero entre 1 y 50.')
  process.exit(1)
}

// Mismo alfabeto sin ambigüedades que los códigos de rancho: A–Z y 2–9, sin O, I, 0 ni 1.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const generar = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')

const cliente = createClient(URL, LLAVE, { auth: { persistSession: false, autoRefreshToken: false } })
const creados = []
while (creados.length < cantidad) {
  const codigo = generar()
  const { error } = await cliente.from('codigo_alta').insert({ codigo })
  if (!error) creados.push(codigo)
  else if (error.code !== '23505') {
    console.error(`No se pudo crear el código: ${error.message}`)
    process.exit(1)
  } // 23505 = repetido: se genera otro
}
console.log(creados.join('\n'))

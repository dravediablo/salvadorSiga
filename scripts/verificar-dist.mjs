// Comprueba que la compilación de producción (dist/) no contiene el acceso de desarrollo ni ninguna llave secreta
// (sb_secret_…, JWT service_role, PIMIENTA) ni la URL local de Supabase. La URL del proyecto real y la llave pública SÍ pueden ir. Falla (código 1) si encuentra algo. Uso: node scripts/verificar-dist.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// En producción SÍ van la URL del proyecto y la llave pública (anon / sb_publishable_…). Nunca una llave secreta.
const PROHIBIDO = [
  ['texto del acceso de desarrollo', /Acceso de desarrollo|Iniciar sesión de desarrollo|Cerrar sesión de desarrollo/],
  ['llave secreta de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['la PIMIENTA de los PIN', /PIMIENTA/],
  ['URL local de Supabase (una compilación hecha con las variables de desarrollo)', /(127\.0\.0\.1|localhost):5[46]\d{3}/],
]

/** Un JWT cuyo rol es service_role es una llave secreta aunque no tenga el prefijo sb_secret_. */
function jwtsDeServicio(texto) {
  const hallados = []
  for (const m of texto.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const carga = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (carga && carga.role === 'service_role') hallados.push(m[0])
    } catch {
      /* no es un JWT */
    }
  }
  return hallados
}

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) yield* archivos(ruta)
    else if (/\.(js|css|html|webmanifest|json|map)$/.test(nombre)) yield ruta
  }
}

const dist = process.argv[2] ?? 'dist'
const problemas = []
let revisados = 0
for (const ruta of archivos(dist)) {
  revisados++
  const texto = readFileSync(ruta, 'utf8')
  for (const [nombre, patron] of PROHIBIDO) {
    const m = patron.exec(texto)
    if (m) problemas.push(`${ruta}: ${nombre} → "${m[0].slice(0, 60)}"`)
  }
  for (const j of jwtsDeServicio(texto)) problemas.push(`${ruta}: llave service_role (JWT) → "${j.slice(0, 24)}…"`)
}
if (revisados === 0) {
  console.error(`No hay archivos en ${dist}/: compila primero.`)
  process.exit(1)
}
if (problemas.length) {
  console.error('La compilación de producción contiene lo que no debe:\n' + problemas.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log(`dist/ limpia: ${revisados} archivos revisados, sin acceso de desarrollo ni llaves secretas.`)

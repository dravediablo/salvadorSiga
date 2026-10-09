// Comprueba que la compilación de producción (dist/) no contiene el acceso de desarrollo ni
// ninguna URL o llave de Supabase. Falla (código 1) si encuentra algo. Uso: node scripts/verificar-dist.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PROHIBIDO = [
  ['texto del acceso de desarrollo', /Acceso de desarrollo|Iniciar sesión de desarrollo|Cerrar sesión de desarrollo/],
  ['llave pública de Supabase (sb_publishable_…)', /sb_publishable_[A-Za-z0-9_-]{16,}/],
  ['llave secreta de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['JWT (llave anon o service_role)', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['URL de un proyecto de Supabase', /https?:\/\/[a-z0-9-]+\.supabase\.(co|in|net)/i],
  ['URL local de Supabase', /(127\.0\.0\.1|localhost):5[46]\d{3}/],
  ['variable de entorno de Supabase con valor', /VITE_SUPABASE_(URL|ANON_KEY)["']?\s*[:=]\s*["'][^"']+["']/],
]

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
}
if (revisados === 0) {
  console.error(`No hay archivos en ${dist}/: compila primero.`)
  process.exit(1)
}
if (problemas.length) {
  console.error('La compilación de producción contiene lo que no debe:\n' + problemas.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log(`dist/ limpia: ${revisados} archivos revisados, sin acceso de desarrollo ni datos de Supabase.`)

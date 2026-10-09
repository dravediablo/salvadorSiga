// Crea supabase/.env con una PIMIENTA aleatoria para las funciones del servidor en local (si no existe).
// El archivo no se versiona. La pimienta del proyecto real se define con `supabase secrets set`, nunca aquí.
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const ruta = 'supabase/.env'
if (existsSync(ruta)) {
  console.log(`${ruta} ya existe: no se toca.`)
} else {
  writeFileSync(ruta, `PIMIENTA=${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 })
  console.log(`${ruta} creado con una pimienta local aleatoria.`)
}

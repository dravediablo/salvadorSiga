/**
 * Reglas de las cuentas de operador, sin nada propio de Deno para poder probarlas con Vitest
 * (src/datos/cuentas/cuentas.test.ts). Las usan las funciones `operadores` y `entrar_operador`.
 */

/** Alias a partir del nombre: primera palabra, minúsculas, sin acentos ni símbolos ("María José" → "maria"). */
export function aliasBase(nombre: string): string {
  const primera = nombre.trim().split(/\s+/)[0] ?? ''
  const limpio = primera
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24)
  return limpio || 'operador'
}

/** Alias único en el rancho: juan, juan2, juan3… */
export function aliasUnico(nombre: string, existentes: ReadonlySet<string>): string {
  const base = aliasBase(nombre)
  if (!existentes.has(base)) return base
  for (let n = 2; ; n++) {
    const candidato = `${base}${n}`
    if (!existentes.has(candidato)) return candidato
  }
}

/** PIN de 6 dígitos con el generador criptográfico, sin sesgo (muestreo por rechazo). */
export function generarPin(): string {
  const limite = 4_294_000_000 // múltiplo de 1 000 000 más grande que cabe en 32 bits
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0] < limite) return String(buffer[0] % 1_000_000).padStart(6, '0')
  }
}

export const esPinValido = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{6}$/.test(pin)

/** Correo sintético de un operador: dominio reservado (.invalid, RFC 2606) que nunca recibe correo. */
export const correoSintetico = (uuid: string): string => `op-${uuid}@operadores.invalid`

function base64url(bytes: Uint8Array): string {
  let texto = ''
  for (const b of bytes) texto += String.fromCharCode(b)
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Contraseña de Supabase Auth de un operador = HMAC-SHA256(PIMIENTA, usuario_id + ':' + PIN) en base64url.
 * El PIN no se guarda en ningún lado; sin la PIMIENTA (un secreto del proyecto) no se puede calcular.
 */
export async function contrasenaDerivada(pimienta: string, usuarioId: string, pin: string): Promise<string> {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pimienta), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(`${usuarioId}:${pin}`))
  return base64url(new Uint8Array(firma))
}

/** Código de rancho o de alta como lo escribe una persona: sin espacios y en mayúsculas. */
export const normalizarCodigo = (codigo: unknown): string => (typeof codigo === 'string' ? codigo.replace(/\s+/g, '').toUpperCase() : '')

export const normalizarAlias = (alias: unknown): string => (typeof alias === 'string' ? alias.trim().toLowerCase() : '')

/** Mensaje de bloqueo temporal con la hora de Ciudad de México. */
export function mensajeBloqueo(hasta: Date): string {
  const hora = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' }).format(hasta)
  return `Demasiados intentos. Vuelve a intentar después de las ${hora}.`
}

export const ERROR_GENERICO = 'Código, usuario o PIN incorrectos.'
export const ERROR_BLOQUEO_PERMANENTE = 'Tu cuenta está bloqueada. Pídele a tu propietario un PIN nuevo.'
export const ERROR_DESACTIVADO = 'Tu acceso a este rancho está desactivado.'

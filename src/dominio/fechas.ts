/**
 * Fechas como cadenas AAAA-MM-DD sin zona horaria. Todo el cálculo usa
 * Date.UTC sobre las partes; nunca se interpreta una cadena con `new Date`.
 */

const pad = (n: number): string => String(n).padStart(2, '0')

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number)
  return [a, m - 1, d]
}

function aCadena(t: Date): string {
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Fecha de hoy según el reloj local del dispositivo (única excepción a UTC). */
export function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = partes(fecha)
  return aCadena(new Date(Date.UTC(a, m, d + n)))
}

export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde)
  const [a2, m2, d2] = partes(hasta)
  return Math.round((Date.UTC(a2, m2, d2) - Date.UTC(a1, m1, d1)) / 864e5)
}

/** Semana ISO 8601 de una fecha, como `AAAA-Www`. */
export function semanaISO(fecha: string): string {
  const [a, m, d] = partes(fecha)
  const dt = new Date(Date.UTC(a, m, d))
  const dia = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dia)
  const anio = dt.getUTCFullYear()
  const sem = Math.ceil(((dt.getTime() - Date.UTC(anio, 0, 1)) / 864e5 + 1) / 7)
  return `${anio}-W${pad(sem)}`
}

/** Lunes (AAAA-MM-DD) de una semana ISO. */
export function lunesDeSemana(clave: string): string {
  const [a, w] = clave.split('-W').map(Number)
  const dia = new Date(Date.UTC(a, 0, 4)).getUTCDay() || 7
  return aCadena(new Date(Date.UTC(a, 0, 4 - dia + 1 + (w - 1) * 7)))
}

export function sumarSemanas(clave: string, n: number): string {
  return semanaISO(sumarDias(lunesDeSemana(clave), 7 * n))
}

/** Semanas de `desde` a `hasta`, ambas incluidas. */
export function rangoSemanas(desde: string, hasta: string): string[] {
  const salida: string[] = []
  let k = desde
  // Tope de seguridad: ~11 años de semanas.
  while (k <= hasta && salida.length < 600) {
    salida.push(k)
    k = sumarSemanas(k, 1)
  }
  return salida
}

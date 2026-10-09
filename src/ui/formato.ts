const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const fmt = (n: number | null | undefined, d = 1): string =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })

/** "9 oct 2026" a partir de AAAA-MM-DD (sin pasar por Date: no hay zonas horarias). */
export function fechaCorta(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]} ${y}`
}

export function fechaSinAnio(s: string | null | undefined): string {
  if (!s) return '—'
  const [, m, d] = s.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}

/** "2026-W41" → "S41". */
export const etiquetaSemana = (k: string): string => 'S' + Number(k.split('-W')[1])

export function horaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

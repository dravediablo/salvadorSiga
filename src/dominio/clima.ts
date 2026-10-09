import { promedio } from './calculos'
import { semanaISO, sumarDias } from './fechas'
import type { ClimaDiario } from './tipos'

/** Un día de clima aún sin rancho (el rancho lo asigna quien lo guarda). */
export type DiaClima = Omit<ClimaDiario, 'rancho_id'>

type CampoNumerico = 'temp_max' | 'temp_min' | 'temp_media' | 'hr_media' | 'precipitacion' | 'horas_hr_alta'
const CAMPOS_NUMERICOS: CampoNumerico[] = ['temp_max', 'temp_min', 'temp_media', 'hr_media', 'precipitacion', 'horas_hr_alta']

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Datos simulados con estacionalidad aproximada de Tecomán. Solo para demostración y pruebas. */
export function simular(desde: string, hasta: string, semilla = 11): DiaClima[] {
  const r = rng(semilla)
  const pLluvia = [0.05, 0.03, 0.02, 0.02, 0.05, 0.4, 0.6, 0.62, 0.66, 0.42, 0.1, 0.05]
  const salida: DiaClima[] = []
  let f = desde
  let humedo = 0
  while (f <= hasta && salida.length < 1500) {
    const mes = Number(f.slice(5, 7)) - 1
    const llueve = r() < pLluvia[mes] + humedo * 0.15
    humedo = llueve ? 1 : humedo * 0.5
    const lluvioso = pLluvia[mes] > 0.3
    const pp = llueve ? Math.round(-Math.log(1 - r()) * (lluvioso ? 16 : 6) * 10) / 10 : 0
    const tmax = 31 + (mes >= 3 && mes <= 5 ? 1.6 : 0) - (llueve ? 1.8 : 0) + (r() - 0.5) * 2
    const tmin = (lluvioso ? 23 : mes <= 1 || mes === 11 ? 17.5 : 20) + (r() - 0.5) * 2
    const hr = Math.min(98, (lluvioso ? 80 : 66) + (llueve ? 8 : 0) + (r() - 0.5) * 8)
    const horas = Math.max(0, Math.round(((hr - 62) / 36) * 16 + (llueve ? 2 : 0) + (r() - 0.5) * 3))
    salida.push({
      fecha: f,
      temp_max: +tmax.toFixed(1),
      temp_min: +tmin.toFixed(1),
      temp_media: +((tmax + tmin) / 2).toFixed(1),
      hr_media: +hr.toFixed(1),
      precipitacion: pp,
      horas_hr_alta: Math.min(24, horas),
      fuente: 'simulado',
    })
    f = sumarDias(f, 1)
  }
  return salida
}

/** Lee un CSV de clima (separador coma o punto y coma; decimales con coma o punto). */
export function parseCSV(texto: string): DiaClima[] {
  const lineas = texto
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
  if (lineas.length < 2) throw new Error('El CSV no tiene filas de datos.')
  const sep = (lineas[0].match(/;/g) ?? []).length > (lineas[0].match(/,/g) ?? []).length ? ';' : ','
  const cab = lineas[0].split(sep).map((s) => s.trim().toLowerCase())
  const idxFecha = cab.indexOf('fecha')
  if (idxFecha < 0) throw new Error('Falta la columna "fecha" (formato AAAA-MM-DD).')
  const idx = Object.fromEntries(CAMPOS_NUMERICOS.map((c) => [c, cab.indexOf(c)])) as Record<CampoNumerico, number>
  const dias: DiaClima[] = []
  for (const linea of lineas.slice(1)) {
    const c = linea.split(sep).map((s) => s.trim())
    const fecha = c[idxFecha]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
    const num = (k: CampoNumerico): number | null => (idx[k] >= 0 && c[idx[k]] ? Number(c[idx[k]].replace(',', '.')) : null)
    const d: DiaClima = {
      fecha,
      temp_max: num('temp_max'),
      temp_min: num('temp_min'),
      temp_media: num('temp_media'),
      hr_media: num('hr_media'),
      precipitacion: num('precipitacion'),
      horas_hr_alta: num('horas_hr_alta'),
      fuente: 'csv',
    }
    if (d.temp_media == null && d.temp_max != null && d.temp_min != null) d.temp_media = +((d.temp_max + d.temp_min) / 2).toFixed(1)
    dias.push(d)
  }
  if (!dias.length) throw new Error('No se encontró ninguna fila con fecha válida.')
  return dias
}

export interface ClimaSemanal {
  dias: number
  temp_max: number | null
  temp_min: number | null
  temp_media: number | null
  hr_media: number | null
  /** Suma de la semana. */
  precipitacion: number | null
  /** Suma de la semana. */
  horas_hr_alta: number | null
  /** Días con más de 1 mm. */
  dias_lluvia: number
}

/** Agrega por semana ISO: suma lluvia y horas de HR alta; promedia temperaturas y HR. */
export function porSemana(dias: DiaClima[]): Map<string, ClimaSemanal> {
  const grupos = new Map<string, DiaClima[]>()
  for (const d of dias) {
    const k = semanaISO(d.fecha)
    const g = grupos.get(k)
    if (g) g.push(d)
    else grupos.set(k, [d])
  }
  const suma = (ds: DiaClima[], c: CampoNumerico): number | null => {
    const v = ds.map((d) => d[c]).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  }
  const salida = new Map<string, ClimaSemanal>()
  for (const [k, ds] of grupos) {
    const prom = (c: CampoNumerico): number | null => promedio(ds.map((d) => d[c]))
    salida.set(k, {
      dias: ds.length,
      temp_max: prom('temp_max'),
      temp_min: prom('temp_min'),
      temp_media: prom('temp_media'),
      hr_media: prom('hr_media'),
      precipitacion: suma(ds, 'precipitacion'),
      horas_hr_alta: suma(ds, 'horas_hr_alta'),
      dias_lluvia: ds.filter((d) => (d.precipitacion ?? 0) > 1).length,
    })
  }
  return salida
}

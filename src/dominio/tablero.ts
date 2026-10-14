import { previa, INDICADORES, ultimaAplicacion, valorEn, type PuntoSerie, type Serie } from './analisis'
import { promedio, semaforo, type Resumen, type Semaforo, type Umbrales } from './calculos'
import type { ClimaSemanal } from './clima'
import { diasEntre, sumarSemanas } from './fechas'
import type { Aplicacion, Tabla } from './tipos'

/** Eje "bonito" para una gráfica: límites y marcas redondeadas. */
export function escalaNice(min: number | null, max: number | null, n = 5): { min: number; max: number; ticks: number[] } {
  if (min == null || max == null) return { min: 0, max: 1, ticks: [0, 1] }
  if (min === max) {
    min -= 1
    max += 1
  }
  const paso0 = (max - min) / n
  const mag = Math.pow(10, Math.floor(Math.log10(paso0)))
  const r = paso0 / mag
  const paso = (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1) * mag
  const lo = Math.floor(min / paso) * paso
  const hi = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let v = lo; v <= hi + paso / 2; v += paso) ticks.push(+v.toFixed(6))
  return { min: lo, max: hi, ticks }
}

/**
 * Semana que el tablero muestra por defecto: la última con datos de al menos la mitad
 * de las tablas que más cubrió alguna semana (una semana con una sola tabla no representa al rancho).
 */
export function semanaPorDefecto(semanasConDatos: string[], cobertura: (semana: string) => number): string | null {
  if (!semanasConDatos.length) return null
  const maxCob = Math.max(0, ...semanasConDatos.map(cobertura))
  const buenas = semanasConDatos.filter((s) => cobertura(s) >= maxCob / 2)
  return buenas[buenas.length - 1] ?? semanasConDatos[semanasConDatos.length - 1]
}

export interface EstadoTabla {
  tabla: Tabla
  /** II de la semana mostrada para esa tabla. */
  ii: number | null
  /** Cambio del II contra la evaluación anterior de la tabla. */
  delta: number | null
  resumen: Resumen | null
  /** Días desde la última aplicación a esa tabla; `null` si nunca. */
  dias: number | null
  semaforo: Semaforo
  /** Semana de la que salen los datos (la activa, o una de las 2 semanas previas si la tabla no se evaluó). */
  semana: string | null
}

/** Estado de cada tabla en la semana activa. Una tabla sin evaluación esa semana usa la de hasta 2 semanas antes. */
export function estadoTablas(tablas: Tabla[], serie: Serie, semanaActiva: string | null, aplicaciones: Aplicacion[], umbrales: Umbrales, hoy: string): EstadoTabla[] {
  const ii = INDICADORES[0]
  return tablas.map((tabla) => {
    const st = serie.get(tabla.id)
    let semana: string | null = semanaActiva && st?.has(semanaActiva) ? semanaActiva : null
    if (!semana && semanaActiva) {
      const p = previa(st, semanaActiva)
      if (p && p >= sumarSemanas(semanaActiva, -2)) semana = p
    }
    const v = semana ? valorEn(st, semana, ii) : null
    const prev = semana ? previa(st, semana) : null
    const vp = prev ? valorEn(st, prev, ii) : null
    const punto: PuntoSerie | undefined = semana ? st?.get(semana) : undefined
    const ua = ultimaAplicacion(aplicaciones, tabla.id)
    return {
      tabla,
      ii: v,
      delta: v != null && vp != null ? v - vp : null,
      resumen: punto?.r ?? null,
      dias: ua ? diasEntre(ua.fecha, hoy) : null,
      semaforo: semaforo(v, umbrales),
      semana,
    }
  })
}

/** Tablas cuyo II subió `minimo` puntos o más (por defecto 2), de la mayor subida a la menor. */
export function tablasQueEmpeoran(estado: EstadoTabla[], minimo = 2): EstadoTabla[] {
  return estado.filter((e) => e.delta != null && e.delta >= minimo).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
}

/**
 * Regla provisional de "cuándo aplicar" (decisión pendiente): semáforo medio o alto
 * y `diasAlerta` o más días desde la última aplicación (o ninguna).
 */
export function tablasPorRevisar(estado: EstadoTabla[], diasAlerta: number): EstadoTabla[] {
  return estado
    .filter((e) => (e.semaforo === 'rojo' || e.semaforo === 'amarillo') && (e.dias == null || e.dias >= diasAlerta))
    .sort((a, b) => (b.ii ?? 0) - (a.ii ?? 0))
}

/** Semanas en las que alguna de las tablas subió `minimo` puntos de II o más contra su evaluación anterior. */
export function semanasConRepunte(tablaIds: string[], serie: Serie, minimo = 3): string[] {
  const ii = INDICADORES[0]
  const semanas = new Set<string>()
  for (const id of tablaIds) {
    const st = serie.get(id)
    if (!st) continue
    for (const k of st.keys()) {
      const p = previa(st, k)
      const a = valorEn(st, k, ii)
      const b = p ? valorEn(st, p, ii) : null
      if (a != null && b != null && a - b >= minimo) semanas.add(k)
    }
  }
  return [...semanas].sort()
}

/** Promedio de una variable semanal de clima, `desfase` semanas antes de cada semana dada. */
export function climaConDesfase(clima: Map<string, ClimaSemanal>, semanas: string[], campo: keyof Omit<ClimaSemanal, 'dias' | 'dias_lluvia'>, desfase: number): number | null {
  return promedio(semanas.map((s) => clima.get(sumarSemanas(s, -desfase))?.[campo] ?? null))
}

export interface PoligonoProyectado {
  tabla: Tabla
  /** Vértices del anillo en el espacio del dibujo, listos para `points` de SVG. */
  puntos: string
  cx: number
  cy: number
}

export interface MapaProyectado {
  ancho: number
  alto: number
  /** Tamaño sugerido para las etiquetas. */
  letra: number
  poligonos: PoligonoProyectado[]
}

/** Tablas con un polígono dibujable (al menos 3 vértices). */
export const conGeometria = (tablas: Tabla[]): Tabla[] => tablas.filter((t) => (t.geometria?.coordinates[0]?.length ?? 0) > 2)

/**
 * Proyecta los polígonos [lon, lat] a un lienzo plano de 1000 de ancho. Corrige la
 * longitud con el coseno de la latitud media para no deformar; el norte queda arriba.
 */
export function proyectarMapa(tablas: Tabla[]): MapaProyectado | null {
  const dibujables = conGeometria(tablas)
  if (!dibujables.length) return null
  const anillos = dibujables.map((t) => (t.geometria as NonNullable<Tabla['geometria']>).coordinates[0])
  const todos = anillos.flat()
  const lat0 = todos.reduce((s, p) => s + p[1], 0) / todos.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xs = todos.map((p) => p[0] * k)
  const ys = todos.map((p) => -p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const W = 1000
  const m = 20
  const esc = (W - 2 * m) / (maxX - minX || 1e-6)
  const alto = Math.max(200, (maxY - minY) * esc + 2 * m)
  const proy = (p: number[]): [number, number] => [m + (p[0] * k - minX) * esc, m + (-p[1] - minY) * esc]
  const poligonos = dibujables.map((tabla, i) => {
    const anillo = anillos[i].map(proy)
    const cx = anillo.reduce((s, p) => s + p[0], 0) / anillo.length
    const cy = anillo.reduce((s, p) => s + p[1], 0) / anillo.length
    return { tabla, puntos: anillo.map((p) => `${+p[0].toFixed(1)},${+p[1].toFixed(1)}`).join(' '), cx, cy }
  })
  return { ancho: W, alto, letra: Math.max(14, Math.min(34, W / Math.sqrt(dibujables.length) / 6)), poligonos }
}

import { resumen, type Resumen } from './calculos'
import { semanaISO, sumarSemanas } from './fechas'
import type { Aplicacion, AplicacionTabla, EvaluacionTabla, PlantaConHojas, Recorrido, Tabla } from './tipos'

export interface Indicador {
  k: string
  nombre: string
  corto: string
  unidad: string
  dec: number
  peorSi: 'sube' | 'baja'
  get: (r: Resumen) => number | null
}

export const INDICADORES: ReadonlyArray<Indicador> = [
  { k: 'ii', nombre: 'Índice de infección', corto: 'II', unidad: '%', dec: 1, peorSi: 'sube', get: (r) => r.ii },
  { k: 'th', nombre: 'Total de hojas', corto: 'TH', unidad: '', dec: 1, peorSi: 'baja', get: (r) => r.th },
  { k: 'hf', nombre: 'Hojas funcionales', corto: 'HF', unidad: '', dec: 1, peorSi: 'baja', get: (r) => r.hf },
  { k: 'hmje', nombre: 'Hoja más joven con estría', corto: 'HMJE', unidad: '', dec: 1, peorSi: 'baja', get: (r) => r.estria.prom },
  { k: 'hmjm', nombre: 'Hoja más joven con mancha', corto: 'HMJM', unidad: '', dec: 1, peorSi: 'baja', get: (r) => r.mancha.prom },
  { k: 'pizca', nombre: 'Hoja más joven con pizca', corto: 'Pizca', unidad: '', dec: 1, peorSi: 'baja', get: (r) => r.pizca.prom },
]

/** Una evaluación de tabla con sus plantas y hojas. */
export interface EvaluacionConPlantas {
  evaluacion: EvaluacionTabla
  plantas: PlantaConHojas[]
}

export interface FiltroFilas {
  desde?: string
  hasta?: string
  operador?: string
  tablas?: string[]
}

export interface FilaEvaluacion extends EvaluacionConPlantas {
  recorrido: Recorrido
  semana: string
  tabla_id: string
}

export interface PuntoSerie {
  r: Resumen
  plantas: PlantaConHojas[]
}

/** tabla_id → semana → resumen de esa semana. */
export type Serie = Map<string, Map<string, PuntoSerie>>

/** Evaluaciones Stover vivas, con su recorrido, que pasan el filtro. */
export function filas(evaluaciones: EvaluacionConPlantas[], recorridos: Recorrido[], f: FiltroFilas = {}): FilaEvaluacion[] {
  const porId = new Map(recorridos.map((r) => [r.id, r]))
  const salida: FilaEvaluacion[] = []
  for (const x of evaluaciones) {
    const ev = x.evaluacion
    if (ev.eliminado || ev.tipo !== 'stover') continue
    const rec = porId.get(ev.recorrido_id)
    if (!rec || rec.eliminado) continue
    if (f.desde && rec.fecha < f.desde) continue
    if (f.hasta && rec.fecha > f.hasta) continue
    if (f.operador && rec.usuario_id !== f.operador) continue
    if (f.tablas?.length && !f.tablas.includes(ev.tabla_id)) continue
    salida.push({ ...x, recorrido: rec, semana: rec.semana_iso, tabla_id: ev.tabla_id })
  }
  return salida
}

/** Agrupa por tabla y semana; si hay varios recorridos en la semana, junta sus plantas. */
export function serie(fs: FilaEvaluacion[]): Serie {
  const tmp = new Map<string, Map<string, PlantaConHojas[]>>()
  for (const x of fs) {
    let porSemana = tmp.get(x.tabla_id)
    if (!porSemana) tmp.set(x.tabla_id, (porSemana = new Map()))
    const lista = porSemana.get(x.semana)
    if (lista) lista.push(...x.plantas)
    else porSemana.set(x.semana, [...x.plantas])
  }
  const salida: Serie = new Map()
  for (const [tabla, porSemana] of tmp) {
    const mm = new Map<string, PuntoSerie>()
    for (const [semana, plantas] of porSemana) if (plantas.length) mm.set(semana, { r: resumen(plantas), plantas })
    salida.set(tabla, mm)
  }
  return salida
}

export function valorEn(serieTabla: Map<string, PuntoSerie> | undefined, semana: string, ind: Indicador): number | null {
  const x = serieTabla?.get(semana)
  return x ? ind.get(x.r) : null
}

/** Última semana con datos estrictamente anterior a `semana`. */
export function previa(serieTabla: Map<string, PuntoSerie> | undefined, semana: string): string | null {
  if (!serieTabla) return null
  const ks = [...serieTabla.keys()].filter((k) => k < semana).sort()
  return ks.length ? ks[ks.length - 1] : null
}

/** Aplicaciones vivas de una tabla, de la más antigua a la más reciente. */
export function aplicacionesDeTabla(aplicaciones: Aplicacion[], enlaces: AplicacionTabla[], tablaId: string): Aplicacion[] {
  const ids = new Set(enlaces.filter((e) => e.tabla_id === tablaId).map((e) => e.aplicacion_id))
  return aplicaciones.filter((a) => !a.eliminado && ids.has(a.id)).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function ultimaAplicacion(
  aplicaciones: Aplicacion[],
  enlaces: AplicacionTabla[],
  tablaId: string,
  hasta?: string,
): Aplicacion | null {
  const l = aplicacionesDeTabla(aplicaciones, enlaces, tablaId).filter((a) => !hasta || a.fecha <= hasta)
  return l.length ? l[l.length - 1] : null
}

export interface RepeticionFrac {
  tabla: Tabla
  a: Aplicacion
  b: Aplicacion
}

/** Dos aplicaciones consecutivas de una misma tabla con el mismo grupo FRAC. */
export function repeticionesFrac(tablas: Tabla[], aplicaciones: Aplicacion[], enlaces: AplicacionTabla[]): RepeticionFrac[] {
  const salida: RepeticionFrac[] = []
  for (const t of tablas) {
    if (t.eliminado) continue
    const l = aplicacionesDeTabla(aplicaciones, enlaces, t.id)
    for (let i = 1; i < l.length; i++)
      if (l[i].grupo_frac && l[i].grupo_frac === l[i - 1].grupo_frac) salida.push({ tabla: t, a: l[i], b: l[i - 1] })
  }
  return salida
}

export interface PuntoEfecto {
  sem: string
  v: number | null
}

export interface EfectoAplicacion {
  /** Semana usada como "antes": la de la aplicación o la evaluada previa más cercana. */
  antesSem: string | null
  antes: number | null
  /** II a las 2 y 4 semanas (con una semana de tolerancia). */
  d2: PuntoEfecto | null
  d4: PuntoEfecto | null
}

/** Compara el II de la semana de la aplicación contra 2 y 4 semanas después. */
export function efectoAplicacion(serieCompleta: Serie, app: Pick<Aplicacion, 'fecha'>, tablaId: string): EfectoAplicacion | null {
  const st = serieCompleta.get(tablaId)
  if (!st) return null
  const s0 = semanaISO(app.fecha)
  const ii = INDICADORES[0]
  const antesSem = st.has(s0) ? s0 : previa(st, s0)
  const antes = antesSem ? valorEn(st, antesSem, ii) : null
  const buscar = (n: number): PuntoEfecto | null => {
    for (const d of [n, n + 1, n - 1]) {
      const k = sumarSemanas(s0, d)
      if (st.has(k)) return { sem: k, v: valorEn(st, k, ii) }
    }
    return null
  }
  return { antesSem, antes, d2: buscar(2), d4: buscar(4) }
}

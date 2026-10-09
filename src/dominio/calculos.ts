import type { GradoGauhl, Hmj, Hoja, Planta, PlantaConHojas } from './tipos'

export const GRADOS_GAUHL: ReadonlyArray<{ grado: GradoGauhl; severidad: string }> = [
  { grado: 0, severidad: 'Sin síntomas' },
  { grado: 1, severidad: '≤10 manchas o <1 %' },
  { grado: 2, severidad: '1–5 %' },
  { grado: 3, severidad: '6–15 %' },
  { grado: 4, severidad: '16–33 %' },
  { grado: 5, severidad: '34–50 %' },
  { grado: 6, severidad: '51–100 %' },
]

/** N en la fórmula del II: número de grados de la escala (0–6). */
const N_GRADOS = 7
/** Una hoja es funcional con grado 0 a 4. */
const GRADO_MAX_FUNCIONAL = 4

const vivas = (hojas: Hoja[]): Hoja[] => hojas.filter((h) => !h.eliminado)

/** Promedio ignorando `null` y NaN; `null` si no queda ningún valor. */
export function promedio(valores: ReadonlyArray<number | null | undefined>): number | null {
  const v = valores.filter((x): x is number => x != null && !Number.isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** La planta tiene todas sus hojas y todas están calificadas. */
export function completa(planta: Planta, hojas: Hoja[]): boolean {
  const hs = vivas(hojas)
  return planta.total_hojas > 0 && hs.length === planta.total_hojas && hs.every((h) => h.grado_gauhl != null)
}

/** Hojas funcionales: grado 0 a 4. Siempre se calcula, nunca se captura. */
export function hf(hojas: Hoja[]): number {
  return vivas(hojas).filter((h) => h.grado_gauhl != null && h.grado_gauhl <= GRADO_MAX_FUNCIONAL).length
}

/**
 * Índice de infección: Σ(n × b) / ((N − 1) × T) × 100, con T = hojas
 * calificadas. `null` si no hay ninguna.
 */
export function ii(grados: ReadonlyArray<GradoGauhl | null>): number | null {
  const g = grados.filter((x): x is GradoGauhl => x != null)
  if (!g.length) return null
  return (g.reduce<number>((a, b) => a + b, 0) / ((N_GRADOS - 1) * g.length)) * 100
}

export function iiPlanta(hojas: Hoja[]): number | null {
  return ii(vivas(hojas).map((h) => h.grado_gauhl))
}

/** Estrategias para promediar la hoja más joven con síntoma (decisión pendiente). */
export type EstrategiaHmj = 'excluir_no_presenta'

export interface ResumenSintoma {
  /** Promedio según la estrategia; `null` si no hay datos. */
  prom: number | null
  /** Plantas con 0 = "no presenta". */
  no_presenta: number
  /** Plantas con `null`. */
  sin_capturar: number
}

/**
 * Única función que decide cómo entran los "no presenta" al promedio de HMJ.
 * Para cambiar la regla, agrega otra estrategia aquí.
 */
export function resumenSintoma(
  valores: ReadonlyArray<Hmj>,
  estrategia: EstrategiaHmj = 'excluir_no_presenta',
): ResumenSintoma {
  const no_presenta = valores.filter((v) => v === 0).length
  const sin_capturar = valores.filter((v) => v == null).length
  switch (estrategia) {
    case 'excluir_no_presenta':
      return { prom: promedio(valores.filter((v) => v != null && v > 0)), no_presenta, sin_capturar }
  }
}

export interface Resumen {
  n: number
  completas: number
  ii: number | null
  th: number | null
  hf: number | null
  pizca: ResumenSintoma
  estria: ResumenSintoma
  mancha: ResumenSintoma
  hojas_evaluadas: number
}

/**
 * Resumen de una tabla o recorrido. El II junta todas las hojas de todas las
 * plantas (T = total de hojas evaluadas); no promedia los II de cada planta.
 */
export function resumen(plantas: PlantaConHojas[], estrategia: EstrategiaHmj = 'excluir_no_presenta'): Resumen {
  const ps = plantas.filter((x) => !x.planta.eliminado)
  const grados = ps.flatMap((x) => vivas(x.hojas).map((h) => h.grado_gauhl))
  const sint = (k: 'hmj_pizca' | 'hmj_estria' | 'hmj_mancha'): ResumenSintoma =>
    resumenSintoma(
      ps.map((x) => x.planta[k]),
      estrategia,
    )
  return {
    n: ps.length,
    completas: ps.filter((x) => completa(x.planta, x.hojas)).length,
    ii: ii(grados),
    th: promedio(ps.map((x) => x.planta.total_hojas)),
    hf: promedio(ps.map((x) => hf(x.hojas))),
    pizca: sint('hmj_pizca'),
    estria: sint('hmj_estria'),
    mancha: sint('hmj_mancha'),
    hojas_evaluadas: grados.filter((x) => x != null).length,
  }
}

/** Matriz [hoja − 1][grado] con el conteo de hojas por número de hoja y grado. */
export function distribucion(plantas: PlantaConHojas[]): number[][] {
  const ps = plantas.filter((x) => !x.planta.eliminado)
  const max = Math.max(0, ...ps.flatMap((x) => vivas(x.hojas).map((h) => h.numero_hoja)))
  const m: number[][] = Array.from({ length: max }, () => new Array<number>(N_GRADOS).fill(0))
  for (const x of ps)
    for (const h of vivas(x.hojas)) if (h.grado_gauhl != null) m[h.numero_hoja - 1][h.grado_gauhl]++
  return m
}

export interface Validacion {
  /** Bloquean el guardado. */
  errores: string[]
  /** Solo informan. */
  avisos: string[]
}

export function validar(planta: Planta, hojas: Hoja[]): Validacion {
  const errores: string[] = []
  const avisos: string[] = []
  const th = planta.total_hojas
  const sintomas: Array<['hmj_pizca' | 'hmj_estria' | 'hmj_mancha', string]> = [
    ['hmj_pizca', 'pizca'],
    ['hmj_estria', 'estría'],
    ['hmj_mancha', 'mancha'],
  ]
  for (const [k, nombre] of sintomas) {
    const v = planta[k]
    if (v == null) avisos.push(`Falta indicar la hoja más joven con ${nombre}.`)
    else if (v > th)
      errores.push(`La hoja más joven con ${nombre} (${v}) es mayor que el total de hojas (${th}).`)
  }
  // 0 ("no presenta") y null no entran en la comparación de orden.
  const presente = (v: Hmj): v is number => v != null && v > 0
  const { hmj_pizca: a, hmj_estria: b, hmj_mancha: c } = planta
  if (presente(a) && presente(b) && a > b)
    avisos.push('La pizca está en una hoja más vieja que la estría; lo normal es pizca ≤ estría.')
  if (presente(b) && presente(c) && b > c)
    avisos.push('La estría está en una hoja más vieja que la mancha; lo normal es estría ≤ mancha.')
  if (presente(a) && presente(c) && a > c && !presente(b))
    avisos.push('La pizca está en una hoja más vieja que la mancha.')
  const faltan = vivas(hojas).filter((h) => h.grado_gauhl == null).length
  if (faltan) avisos.push(`Faltan ${faltan} hoja(s) por calificar.`)
  return { errores, avisos }
}

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin'

export interface Umbrales {
  ii_umbral_medio: number
  ii_umbral_alto: number
}

/** Verde < medio ≤ amarillo < alto ≤ rojo. */
export function semaforo(valor: number | null, u: Umbrales): Semaforo {
  if (valor == null) return 'sin'
  if (valor < u.ii_umbral_medio) return 'verde'
  if (valor < u.ii_umbral_alto) return 'amarillo'
  return 'rojo'
}

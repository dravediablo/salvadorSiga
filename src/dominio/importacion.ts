import { areaHa, type PoligonoKml } from './geo'
import type { Poligono, Tabla } from './tipos'

/** Orden natural por código ("2" antes que "10", "2A" después de "2"). */
export function ordenarTablas<T extends Pick<Tabla, 'codigo'>>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', 'es', { numeric: true }))
}

export interface TablaImportada {
  codigo: string
  nombre: string
  superficie_ha: number
  geometria: Poligono
}

const CODIGO_MAX = 40

/** Diferencia relativa de superficie (frente a la guardada) a partir de la cual la reimportación lo avisa. */
export const UMBRAL_DIFERENCIA_SUPERFICIE = 0.05

/** Las franjas "buffer" no son tablas de evaluación: el productor pidió omitirlas. Sin importar mayúsculas. */
export const esBuffer = (nombre: string): boolean => /buffer/i.test(nombre)

/**
 * Deduce el código de una tabla del nombre del polígono en el KMZ:
 * "Tabla 1. Sup. 6.82 ha." → "1", "tabla 3. …" → "3".
 * Si el nombre no empieza con "Tabla N", el código es el nombre recortado.
 */
export function codigoDeNombre(nombre: string): string {
  const limpio = nombre.trim()
  const m = /^tabla\s+([0-9a-z]+)/i.exec(limpio)
  return m ? m[1].toUpperCase() : limpio.slice(0, CODIGO_MAX)
}

export function tablaDePoligono(p: PoligonoKml): TablaImportada {
  return {
    codigo: codigoDeNombre(p.nombre),
    nombre: p.nombre.trim(),
    superficie_ha: Math.round(areaHa(p.anillo) * 100) / 100,
    geometria: { type: 'Polygon', coordinates: [p.anillo] },
  }
}

/** La superficie del polígono difiere de la guardada más que el umbral. */
export interface CambioSuperficie {
  guardada: number
  poligono: number
  /** Diferencia relativa (0,12 = 12 %), siempre positiva. */
  diferencia: number
}

/** Compara la superficie del polígono con la guardada; `null` si no hay nada que avisar. */
export function cambioDeSuperficie(guardada: number | null, poligono: number): CambioSuperficie | null {
  if (guardada == null || guardada <= 0) return null
  const diferencia = Math.abs(poligono - guardada) / guardada
  return diferencia > UMBRAL_DIFERENCIA_SUPERFICIE ? { guardada, poligono, diferencia } : null
}

export interface PlanImportacion {
  nuevas: TablaImportada[]
  /**
   * Tablas existentes con el mismo código. Solo se actualizan geometría y nombre:
   * la superficie guardada se conserva (puede estar corregida a mano) y, si el
   * polígono difiere más del umbral, `cambioSuperficie` lo informa.
   */
  actualizadas: Array<{ existente: Tabla; datos: TablaImportada; cambioSuperficie: CambioSuperficie | null }>
  /** Existentes activas que no vienen en el archivo (solo si `desactivarFaltantes`). */
  desactivadas: Tabla[]
  /** Nombres de los polígonos "buffer" que no se importaron. */
  omitidas: string[]
  /** Tablas "buffer" importadas en versiones anteriores: se marcan eliminadas. */
  buffersPrevios: Tabla[]
  advertencias: string[]
}

/**
 * Decide qué hacer con las tablas de un KMZ frente a las que ya existen. Pura:
 * quien la llama escribe el resultado. Las tablas nunca se borran físicamente.
 * Los polígonos "buffer" se omiten antes de cualquier otro paso: no cuentan para
 * códigos repetidos, ni para "faltantes", ni para ninguna superficie.
 */
export function planearImportacion(
  existentes: readonly Tabla[],
  poligonos: readonly PoligonoKml[],
  opciones: { desactivarFaltantes: boolean },
): PlanImportacion {
  const vivas = existentes.filter((t) => !t.eliminado)
  const buffersPrevios = vivas.filter((t) => esBuffer(t.nombre) || esBuffer(t.codigo))
  const propias = vivas.filter((t) => !buffersPrevios.includes(t))
  const omitidas = poligonos.filter((p) => esBuffer(p.nombre)).map((p) => p.nombre.trim())
  const advertencias: string[] = []
  const vistos = new Map<string, number>()
  const importadas: TablaImportada[] = poligonos
    .filter((p) => !esBuffer(p.nombre))
    .map((p) => {
      const t = tablaDePoligono(p)
      const n = (vistos.get(t.codigo) ?? 0) + 1
      vistos.set(t.codigo, n)
      if (n > 1) {
        const nuevoCodigo = `${t.codigo} (${n})`
        advertencias.push(`El archivo repite el código "${t.codigo}"; la copia se importó como "${nuevoCodigo}".`)
        return { ...t, codigo: nuevoCodigo }
      }
      return t
    })

  const nuevas: TablaImportada[] = []
  const actualizadas: PlanImportacion['actualizadas'] = []
  const tocadas = new Set<string>()
  for (const datos of importadas) {
    const existente = propias.find((t) => t.codigo === datos.codigo)
    if (existente) {
      actualizadas.push({ existente, datos, cambioSuperficie: cambioDeSuperficie(existente.superficie_ha, datos.superficie_ha) })
      tocadas.add(existente.id)
    } else nuevas.push(datos)
  }
  const desactivadas = opciones.desactivarFaltantes ? propias.filter((t) => t.activa && !tocadas.has(t.id)) : []
  return { nuevas, actualizadas, desactivadas, omitidas, buffersPrevios, advertencias }
}

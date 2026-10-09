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
  /** Franja de amortiguamiento ("Buffer"): no es una tabla de evaluación. */
  buffer: boolean
}

const CODIGO_MAX = 40

/**
 * Deduce el código de una tabla del nombre del polígono en el KMZ:
 * "Tabla 1. Sup. 6.82 ha." → "1", "tabla 3. …" → "3", "Tabla 2A Buffer 0.30" → "2A buffer".
 * Si el nombre no empieza con "Tabla N", el código es el nombre recortado.
 */
export function codigoDeNombre(nombre: string): { codigo: string; buffer: boolean } {
  const limpio = nombre.trim()
  const buffer = /buffer/i.test(limpio)
  const m = /^tabla\s+([0-9a-z]+)/i.exec(limpio)
  if (!m) return { codigo: limpio.slice(0, CODIGO_MAX), buffer }
  const base = m[1].toUpperCase()
  return { codigo: buffer ? `${base} buffer` : base, buffer }
}

export function tablaDePoligono(p: PoligonoKml): TablaImportada {
  const { codigo, buffer } = codigoDeNombre(p.nombre)
  return {
    codigo,
    nombre: p.nombre.trim(),
    superficie_ha: Math.round(areaHa(p.anillo) * 100) / 100,
    geometria: { type: 'Polygon', coordinates: [p.anillo] },
    buffer,
  }
}

export interface PlanImportacion {
  nuevas: TablaImportada[]
  /** Tablas existentes con el mismo código: se actualiza polígono y superficie. */
  actualizadas: Array<{ existente: Tabla; datos: TablaImportada }>
  /** Existentes activas que no vienen en el archivo (solo si `desactivarFaltantes`). */
  desactivadas: Tabla[]
  advertencias: string[]
}

/**
 * Decide qué hacer con las tablas de un KMZ frente a las que ya existen. Pura:
 * quien la llama escribe el resultado. Las tablas nunca se eliminan.
 */
export function planearImportacion(
  existentes: readonly Tabla[],
  poligonos: readonly PoligonoKml[],
  opciones: { desactivarFaltantes: boolean },
): PlanImportacion {
  const vivas = existentes.filter((t) => !t.eliminado)
  const advertencias: string[] = []
  const vistos = new Map<string, number>()
  const importadas: TablaImportada[] = poligonos.map((p) => {
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
    const existente = vivas.find((t) => t.codigo === datos.codigo)
    if (existente) {
      actualizadas.push({ existente, datos })
      tocadas.add(existente.id)
    } else nuevas.push(datos)
  }
  const desactivadas = opciones.desactivarFaltantes ? vivas.filter((t) => t.activa && !tocadas.has(t.id)) : []
  const buffers = importadas.filter((t) => t.buffer).length
  if (buffers) advertencias.push(`${buffers} polígono(s) son franjas "buffer": se importan desactivadas, actívalas si se evalúan.`)
  return { nuevas, actualizadas, desactivadas, advertencias }
}

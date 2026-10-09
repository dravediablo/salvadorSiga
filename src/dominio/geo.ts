/** Coordenada [lon, lat]. */
export type Coordenada = [number, number]
export type Anillo = Coordenada[]

export interface PoligonoKml {
  nombre: string
  /** Anillo cerrado (primer y último punto iguales). */
  anillo: Anillo
}

function parseCoords(s: string): Anillo {
  return s
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((a) => a.length >= 2 && !Number.isNaN(a[0]) && !Number.isNaN(a[1]))
    .map((a): Coordenada => [a[0], a[1]])
}

/** Área en hectáreas con una proyección plana local (suficiente para lotes). */
export function areaHa(anillo: Anillo): number {
  if (anillo.length < 3) return 0
  const lat0 = anillo.reduce((s, p) => s + p[1], 0) / anillo.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < anillo.length; i++) {
    const [x1, y1] = anillo[i]
    const [x2, y2] = anillo[(i + 1) % anillo.length]
    a += x1 * 111320 * k * (y2 * 110574) - x2 * 111320 * k * (y1 * 110574)
  }
  return Math.abs(a) / 2 / 10000
}

export function centroide(anillo: Anillo): Coordenada {
  return [anillo.reduce((s, p) => s + p[0], 0) / anillo.length, anillo.reduce((s, p) => s + p[1], 0) / anillo.length]
}

function cerrar(a: Anillo): Anillo {
  const [p0] = a
  const pn = a[a.length - 1]
  return a.length && (p0[0] !== pn[0] || p0[1] !== pn[1]) ? [...a, p0] : a
}

/**
 * Extrae los polígonos de un KML (texto). Usa DOMParser, así que corre en el
 * navegador o en jsdom. Descomprimir el KMZ queda para el hito 6.
 */
export function parseKml(texto: string): PoligonoKml[] {
  const xml = new DOMParser().parseFromString(texto, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('El archivo KML no es válido.')
  const tag = (el: Element | Document, n: string): Element[] => [...el.getElementsByTagNameNS('*', n)]
  const coords = (el: Element | undefined): Anillo => parseCoords(el ? (tag(el, 'coordinates')[0]?.textContent ?? '') : '')
  const salida: PoligonoKml[] = []
  tag(xml, 'Placemark').forEach((pm, i) => {
    const nombre = (tag(pm, 'name')[0]?.textContent ?? '').trim() || `Tabla ${i + 1}`
    let anillos = tag(pm, 'Polygon').map((pg) => coords(tag(pg, 'outerBoundaryIs')[0] ?? pg))
    if (!anillos.length) anillos = [...tag(pm, 'LinearRing'), ...tag(pm, 'LineString')].map((l) => coords(l))
    anillos = anillos.filter((a) => a.length >= 3).sort((a, b) => areaHa(b) - areaHa(a))
    if (!anillos.length) return
    salida.push({ nombre, anillo: cerrar(anillos[0]) })
  })
  if (!salida.length) throw new Error('No se encontraron polígonos en el archivo.')
  return salida
}

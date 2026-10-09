// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { areaHa, centroide, parseKml, type Anillo } from './geo'

const rect: Anillo = [[-103.9, 18.88], [-103.897, 18.88], [-103.897, 18.877], [-103.9, 18.877]]

describe('areaHa y centroide', () => {
  it('rectángulo [-103.9, 18.88] → [-103.897, 18.877] ≈ 10,48 ha (±1 %)', () => {
    const a = areaHa(rect)
    expect(a).toBeGreaterThan(10.48 * 0.99)
    expect(a).toBeLessThan(10.48 * 1.01)
  })
  it('anillo con menos de 3 puntos → 0', () => {
    expect(areaHa([[0, 0], [1, 1]])).toBe(0)
  })
  it('centroide', () => {
    const [x, y] = centroide(rect)
    expect(x).toBeCloseTo(-103.8985, 6)
    expect(y).toBeCloseTo(18.8785, 6)
  })
})

const kml = (cuerpo: string) => `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${cuerpo}</Document></kml>`
const poligono = (nombre: string, coords: string) =>
  `<Placemark><name>${nombre}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`

describe('parseKml', () => {
  it('2 polígonos y 1 punto → 2 polígonos con su nombre; cierra el anillo abierto', () => {
    const texto = kml(
      poligono('T-01', '-103.9,18.88,0 -103.897,18.88,0 -103.897,18.877,0 -103.9,18.877,0') +
        poligono('T-02', '-103.9,18.88,0 -103.897,18.88,0 -103.897,18.877,0 -103.9,18.877,0 -103.9,18.88,0') +
        '<Placemark><name>Bodega</name><Point><coordinates>-103.9,18.88,0</coordinates></Point></Placemark>',
    )
    const r = parseKml(texto)
    expect(r.map((p) => p.nombre)).toEqual(['T-01', 'T-02'])
    for (const p of r) expect(p.anillo[0]).toEqual(p.anillo[p.anillo.length - 1])
    expect(r[0].anillo).toHaveLength(5)
    expect(r[1].anillo).toHaveLength(5)
  })
  it('sin nombre usa "Tabla N"; con varios anillos toma el de mayor área', () => {
    const chico = '-103.9,18.88 -103.899,18.88 -103.899,18.879'
    const grande = '-103.9,18.88 -103.89,18.88 -103.89,18.87'
    const r = parseKml(
      kml(`<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${chico}</coordinates></LinearRing></outerBoundaryIs></Polygon><Polygon><outerBoundaryIs><LinearRing><coordinates>${grande}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`),
    )
    expect(r[0].nombre).toBe('Tabla 1')
    expect(r[0].anillo[1]).toEqual([-103.89, 18.88])
  })
  it('acepta líneas cerradas (LineString) cuando no hay Polygon', () => {
    const r = parseKml(kml('<Placemark><name>L</name><LineString><coordinates>0,0 0,1 1,1 1,0</coordinates></LineString></Placemark>'))
    expect(r[0].anillo).toHaveLength(5)
  })
  it('KML sin polígonos → error en español', () => {
    expect(() => parseKml(kml('<Placemark><name>P</name><Point><coordinates>1,1</coordinates></Point></Placemark>'))).toThrow(
      'No se encontraron polígonos en el archivo.',
    )
  })
  it('XML inválido → error en español', () => {
    expect(() => parseKml('<kml><Document>')).toThrow('El archivo KML no es válido.')
  })
})

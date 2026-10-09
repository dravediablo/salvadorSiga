import { describe, expect, it } from 'vitest'
import { RANCHO } from './ayudas.test-util'
import { cambioDeSuperficie, codigoDeNombre, esBuffer, ordenarTablas, planearImportacion, tablaDePoligono, UMBRAL_DIFERENCIA_SUPERFICIE } from './importacion'
import { nuevaTabla } from './modelo'
import type { Anillo } from './geo'

const rect: Anillo = [[-103.9, 18.88], [-103.897, 18.88], [-103.897, 18.877], [-103.9, 18.877], [-103.9, 18.88]]
const pol = (nombre: string) => ({ nombre, anillo: rect })

describe('codigoDeNombre', () => {
  it.each([
    ['Tabla 1. Sup. 6.82 ha.', '1'],
    ['tabla 3. Sup. 5.37 ha.', '3'],
    ['Tabla 2A. Sup. 2.35 ha.', '2A'],
    ['Tabla 11. Sup. 6.0', '11'],
    ['  Tabla 10. Sup. 7.0 ha.  ', '10'],
    ['Lote norte', 'Lote norte'],
  ])('%s → %s', (nombre, codigo) => {
    expect(codigoDeNombre(nombre)).toBe(codigo)
  })
  it('recorta nombres largos sin patrón', () => {
    expect(codigoDeNombre('x'.repeat(60))).toHaveLength(40)
  })
})

describe('esBuffer', () => {
  it.each([['Tabla 2A Buffer 0.30', true], ['TABLA 12 BUFFER', true], ['tabla 3 buffer', true], ['Tabla 1. Sup. 6.8 ha.', false], ['Lote norte', false]])('%s → %s', (n, esperado) => {
    expect(esBuffer(n)).toBe(esperado)
  })
})

describe('tablaDePoligono', () => {
  it('calcula superficie (2 decimales) y geometría GeoJSON', () => {
    const t = tablaDePoligono(pol('Tabla 1. Sup. 6.82 ha.'))
    expect(t.superficie_ha).toBeCloseTo(10.48, 2)
    expect(t.geometria).toEqual({ type: 'Polygon', coordinates: [rect] })
    expect(t.nombre).toBe('Tabla 1. Sup. 6.82 ha.')
  })
})

describe('ordenarTablas', () => {
  it('ordena de forma natural', () => {
    const l = ['10', '2', '2A', '1'].map((codigo) => nuevaTabla({ rancho_id: RANCHO, codigo }))
    expect(ordenarTablas(l).map((t) => t.codigo)).toEqual(['1', '2', '2A', '10'])
  })
  it('no modifica el arreglo original', () => {
    const l = ['2', '1'].map((codigo) => nuevaTabla({ rancho_id: RANCHO, codigo }))
    ordenarTablas(l)
    expect(l.map((t) => t.codigo)).toEqual(['2', '1'])
  })
})

describe('planearImportacion', () => {
  const t = (codigo: string, extra = {}) => nuevaTabla({ rancho_id: RANCHO, codigo, ...extra })

  it('sin tablas previas, todas son nuevas', () => {
    const p = planearImportacion([], [pol('Tabla 1.'), pol('Tabla 2.')], { desactivarFaltantes: true })
    expect(p.nuevas.map((x) => x.codigo)).toEqual(['1', '2'])
    expect(p.actualizadas).toHaveLength(0)
    expect(p.desactivadas).toHaveLength(0)
  })
  it('mismo código → actualiza; faltantes activas → desactiva (por defecto)', () => {
    const uno = t('1')
    const dos = t('2')
    const inactiva = t('3', { activa: false })
    const p = planearImportacion([uno, dos, inactiva], [pol('Tabla 1.'), pol('Tabla 9.')], { desactivarFaltantes: true })
    expect(p.actualizadas.map((x) => x.existente.id)).toEqual([uno.id])
    expect(p.nuevas.map((x) => x.codigo)).toEqual(['9'])
    expect(p.desactivadas.map((x) => x.id)).toEqual([dos.id])
  })
  it('sin la opción, no desactiva nada', () => {
    const p = planearImportacion([t('1'), t('2')], [pol('Tabla 1.')], { desactivarFaltantes: false })
    expect(p.desactivadas).toHaveLength(0)
  })
  it('ignora tablas eliminadas al comparar', () => {
    const borrada = t('1', { eliminado: true })
    const p = planearImportacion([borrada], [pol('Tabla 1.')], { desactivarFaltantes: true })
    expect(p.nuevas).toHaveLength(1)
    expect(p.actualizadas).toHaveLength(0)
  })
  it('códigos repetidos en el archivo se renombran y avisan', () => {
    const p = planearImportacion([], [pol('Tabla 1.'), pol('Tabla 1 Sup.')], { desactivarFaltantes: true })
    expect(p.nuevas.map((x) => x.codigo)).toEqual(['1', '1 (2)'])
    expect(p.advertencias[0]).toMatch(/repite el código "1"/)
  })
  it('omite los buffer (sin importar mayúsculas), los lista y no los importa ni los cuenta como repetidos', () => {
    const p = planearImportacion([], [pol('Tabla 1.'), pol('Tabla 2A Buffer 0.30'), pol('TABLA 3 BUFFER'), pol('tabla 2A buffer')], { desactivarFaltantes: true })
    expect(p.nuevas.map((x) => x.codigo)).toEqual(['1'])
    expect(p.omitidas).toEqual(['Tabla 2A Buffer 0.30', 'TABLA 3 BUFFER', 'tabla 2A buffer'])
    expect(p.advertencias).toEqual([])
  })
  it('un buffer no actualiza a una tabla con su mismo código', () => {
    const dosA = t('2A')
    const p = planearImportacion([dosA], [pol('Tabla 2A Buffer 0.30')], { desactivarFaltantes: false })
    expect(p.actualizadas).toHaveLength(0)
    expect(p.nuevas).toHaveLength(0)
  })
  it('las tablas buffer importadas antes se marcan para baja y no se desactivan ni se actualizan', () => {
    const vieja = t('2A buffer', { nombre: 'Tabla 2A Buffer 0.30', activa: false })
    const otra = t('X', { nombre: 'Franja BUFFER norte' })
    const normal = t('1')
    const eliminada = t('9 buffer', { nombre: 'Tabla 9 buffer', eliminado: true })
    const p = planearImportacion([vieja, otra, normal, eliminada], [pol('Tabla 1.')], { desactivarFaltantes: true })
    expect(p.buffersPrevios.map((x) => x.id).sort()).toEqual([vieja.id, otra.id].sort())
    expect(p.desactivadas).toHaveLength(0)
    expect(p.actualizadas.map((x) => x.existente.id)).toEqual([normal.id])
  })
  it('reporta el cambio de superficie solo si difiere más de 5 % de la guardada', () => {
    const area = tablaDePoligono(pol('Tabla 1.')).superficie_ha // ≈ 10,48 ha
    const igual = t('1', { superficie_ha: area })
    const casi = t('2', { superficie_ha: area * 1.04 })
    const lejos = t('3', { superficie_ha: area * 1.5 })
    const sin = t('4', { superficie_ha: null })
    const p = planearImportacion([igual, casi, lejos, sin], ['1', '2', '3', '4'].map((n) => pol(`Tabla ${n}.`)), { desactivarFaltantes: false })
    const porCodigo = Object.fromEntries(p.actualizadas.map((x) => [x.existente.codigo, x.cambioSuperficie]))
    expect(porCodigo['1']).toBeNull()
    expect(porCodigo['2']).toBeNull()
    expect(porCodigo['3']).toMatchObject({ guardada: area * 1.5, poligono: area })
    expect(porCodigo['3']!.diferencia).toBeCloseTo(1 / 3, 2)
    expect(porCodigo['4']).toBeNull() // no hay superficie guardada que comparar
  })
})

describe('cambioDeSuperficie', () => {
  it('el umbral es 5 % y es estricto', () => {
    expect(UMBRAL_DIFERENCIA_SUPERFICIE).toBe(0.05)
    expect(cambioDeSuperficie(10, 10.5)).toBeNull() // justo 5 %
    expect(cambioDeSuperficie(10, 10.51)).not.toBeNull()
    expect(cambioDeSuperficie(10, 9.49)).toMatchObject({ guardada: 10, poligono: 9.49 })
  })
  it('sin superficie guardada (null o 0) no hay nada que comparar', () => {
    expect(cambioDeSuperficie(null, 5)).toBeNull()
    expect(cambioDeSuperficie(0, 5)).toBeNull()
  })
})

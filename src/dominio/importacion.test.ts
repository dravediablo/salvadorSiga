import { describe, expect, it } from 'vitest'
import { RANCHO } from './ayudas.test-util'
import { codigoDeNombre, ordenarTablas, planearImportacion, tablaDePoligono } from './importacion'
import { nuevaTabla } from './modelo'
import type { Anillo } from './geo'

const rect: Anillo = [[-103.9, 18.88], [-103.897, 18.88], [-103.897, 18.877], [-103.9, 18.877], [-103.9, 18.88]]
const pol = (nombre: string) => ({ nombre, anillo: rect })

describe('codigoDeNombre', () => {
  it.each([
    ['Tabla 1. Sup. 6.82 ha.', '1', false],
    ['tabla 3. Sup. 5.37 ha.', '3', false],
    ['Tabla 2A. Sup. 2.35 ha.', '2A', false],
    ['Tabla 2A Buffer 0.30', '2A buffer', true],
    ['Tabla 12 BUFFER 0.33 ha', '12 buffer', true],
    ['Tabla 11. Sup. 6.0', '11', false],
    ['  Tabla 10. Sup. 7.0 ha.  ', '10', false],
    ['Lote norte', 'Lote norte', false],
  ])('%s → %s', (nombre, codigo, buffer) => {
    expect(codigoDeNombre(nombre)).toEqual({ codigo, buffer })
  })
  it('recorta nombres largos sin patrón', () => {
    expect(codigoDeNombre('x'.repeat(60)).codigo).toHaveLength(40)
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
  it('avisa de los buffer', () => {
    const p = planearImportacion([], [pol('Tabla 2A Buffer 0.30')], { desactivarFaltantes: true })
    expect(p.nuevas[0].buffer).toBe(true)
    expect(p.advertencias.some((a) => a.includes('buffer'))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { parseCSV, porSemana, simular } from './clima'

describe('porSemana', () => {
  it('suma lluvia y horas de HR alta; promedia temperaturas y HR', () => {
    const dia = (fecha: string, tmax: number, pp: number, h: number) => ({
      fecha, temp_max: tmax, temp_min: 20, temp_media: tmax - 5, hr_media: 70 + h, precipitacion: pp, horas_hr_alta: h, fuente: 't',
    })
    // 2026-10-05 (lun) a 2026-10-07 están en W41; 2026-10-12 en W42.
    const m = porSemana([dia('2026-10-05', 30, 10, 4), dia('2026-10-06', 32, 0.5, 6), dia('2026-10-07', 34, 5, 8), dia('2026-10-12', 28, 0, 0)])
    expect(m.size).toBe(2)
    expect(m.get('2026-W41')).toEqual({
      dias: 3, temp_max: 32, temp_min: 20, temp_media: 27, hr_media: 76, precipitacion: 15.5, horas_hr_alta: 18, dias_lluvia: 2,
    })
    expect(m.get('2026-W42')?.precipitacion).toBe(0)
  })
  it('campos sin datos quedan en null', () => {
    const m = porSemana([{ fecha: '2026-10-05', temp_max: null, temp_min: null, temp_media: null, hr_media: null, precipitacion: null, horas_hr_alta: null, fuente: 't' }])
    expect(m.get('2026-W41')).toMatchObject({ temp_max: null, precipitacion: null, horas_hr_alta: null, dias_lluvia: 0 })
  })
})

describe('parseCSV', () => {
  it('lee comas, calcula temp_media y salta fechas inválidas', () => {
    const d = parseCSV('\uFEFFfecha,temp_max,temp_min,precipitacion\n2026-10-05,32,20,1.5\nmal,1,1,1\n2026-10-06,30,,')
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ fecha: '2026-10-05', temp_media: 26, precipitacion: 1.5, hr_media: null, fuente: 'csv' })
    expect(d[1]).toMatchObject({ temp_min: null, temp_media: null, precipitacion: null })
  })
  it('acepta punto y coma con decimales con coma', () => {
    const d = parseCSV('fecha;precipitacion;hr_media\r\n2026-10-05;1,5;80,25')
    expect(d[0]).toMatchObject({ precipitacion: 1.5, hr_media: 80.25 })
  })
  it('errores en español', () => {
    expect(() => parseCSV('fecha')).toThrow('El CSV no tiene filas de datos.')
    expect(() => parseCSV('dia,lluvia\n1,2')).toThrow('Falta la columna "fecha"')
    expect(() => parseCSV('fecha,temp_max\nx,1')).toThrow('No se encontró ninguna fila con fecha válida.')
  })
})

describe('simular', () => {
  it('es determinista y cubre el rango', () => {
    const a = simular('2026-09-01', '2026-09-30')
    expect(a).toHaveLength(30)
    expect(simular('2026-09-01', '2026-09-30')).toEqual(a)
    expect(simular('2026-09-01', '2026-09-30', 5)).not.toEqual(a)
    expect(a.every((d) => d.fuente === 'simulado' && d.horas_hr_alta! >= 0 && d.horas_hr_alta! <= 24 && d.hr_media! <= 98)).toBe(true)
  })
  it('cubre meses de secas y de lluvias', () => {
    expect(simular('2026-01-01', '2026-12-31').length).toBe(365)
  })
})

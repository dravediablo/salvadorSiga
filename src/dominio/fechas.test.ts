import { describe, expect, it } from 'vitest'
import { diasEntre, hoy, lunesDeSemana, rangoSemanas, semanaISO, sumarDias, sumarSemanas } from './fechas'

// Se ejecuta con TZ=America/Mexico_City y TZ=UTC (ver `npm test`).
describe('semanaISO', () => {
  it.each([
    ['2026-01-01', '2026-W01'],
    ['2026-12-31', '2026-W53'],
    ['2027-01-01', '2026-W53'],
    ['2024-12-30', '2025-W01'],
    ['2026-10-09', '2026-W41'],
  ])('%s → %s', (f, s) => {
    expect(semanaISO(f)).toBe(s)
  })
})

describe('semanas y días', () => {
  it('lunesDeSemana', () => {
    expect(lunesDeSemana('2026-W41')).toBe('2026-10-05')
    expect(lunesDeSemana('2026-W01')).toBe('2025-12-29')
  })
  it('rangoSemanas cruza el año con semana 53', () => {
    expect(rangoSemanas('2026-W52', '2027-W02')).toEqual(['2026-W52', '2026-W53', '2027-W01', '2027-W02'])
  })
  it('rangoSemanas con desde > hasta es vacío', () => {
    expect(rangoSemanas('2026-W10', '2026-W09')).toEqual([])
  })
  it('sumarSemanas', () => {
    expect(sumarSemanas('2026-W52', 2)).toBe('2027-W01')
    expect(sumarSemanas('2026-W41', -41)).toBe('2025-W52')
  })
  it('diasEntre', () => {
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2)
    expect(diasEntre('2028-02-27', '2028-03-01')).toBe(3)
    expect(diasEntre('2026-03-01', '2026-02-27')).toBe(-2)
  })
  it('sumarDias cruza mes y año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('hoy devuelve AAAA-MM-DD', () => {
    expect(hoy()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('el cambio de horario no mueve días (México, UTC y Nueva York)', () => {
    expect(sumarDias('2026-04-04', 1)).toBe('2026-04-05')
    expect(sumarDias('2026-10-24', 7)).toBe('2026-10-31')
    expect(diasEntre('2026-03-07', '2026-03-09')).toBe(2)
  })
})

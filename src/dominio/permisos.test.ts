import { describe, expect, it } from 'vitest'
import {
  puedeAdministrar, puedeCerrarRecorrido, puedeCrearRecorrido, puedeEditarRecorrido, puedeEliminarRecorrido, puedeReabrirRecorrido, puedeVerRecorrido,
} from './permisos'

const operador = { usuario_id: 'op1', rol: 'operador' as const }
const otroOperador = { usuario_id: 'op2', rol: 'operador' as const }
const admin = { usuario_id: 'ad', rol: 'administrador' as const }
const propioAbierto = { usuario_id: 'op1', estado: 'en_curso' as const }
const propioCerrado = { usuario_id: 'op1', estado: 'cerrado' as const }
const ajenoAbierto = { usuario_id: 'op2', estado: 'en_curso' as const }

describe('operador', () => {
  it('ve y edita solo sus recorridos abiertos', () => {
    expect(puedeVerRecorrido(operador, propioAbierto)).toBe(true)
    expect(puedeEditarRecorrido(operador, propioAbierto)).toBe(true)
  })
  it('no ve sus recorridos cerrados ni los de otro operador', () => {
    expect(puedeVerRecorrido(operador, propioCerrado)).toBe(false)
    expect(puedeEditarRecorrido(operador, propioCerrado)).toBe(false)
    expect(puedeVerRecorrido(operador, ajenoAbierto)).toBe(false)
    expect(puedeEditarRecorrido(otroOperador, propioAbierto)).toBe(false)
  })
  it('puede cerrar su recorrido abierto, no uno ajeno ni uno cerrado', () => {
    expect(puedeCerrarRecorrido(operador, propioAbierto)).toBe(true)
    expect(puedeCerrarRecorrido(operador, ajenoAbierto)).toBe(false)
    expect(puedeCerrarRecorrido(operador, propioCerrado)).toBe(false)
  })
  it('no puede reabrir, eliminar ni administrar', () => {
    expect(puedeReabrirRecorrido(operador, propioCerrado)).toBe(false)
    expect(puedeEliminarRecorrido(operador)).toBe(false)
    expect(puedeAdministrar(operador)).toBe(false)
  })
  it('puede crear recorridos', () => {
    expect(puedeCrearRecorrido()).toBe(true)
  })
})

describe('administrador', () => {
  it('ve y edita todo, abierto o cerrado, propio o ajeno', () => {
    for (const r of [propioAbierto, propioCerrado, ajenoAbierto, { usuario_id: 'op2', estado: 'cerrado' as const }]) {
      expect(puedeVerRecorrido(admin, r)).toBe(true)
      expect(puedeEditarRecorrido(admin, r)).toBe(true)
    }
  })
  it('cierra solo recorridos en curso', () => {
    expect(puedeCerrarRecorrido(admin, ajenoAbierto)).toBe(true)
    expect(puedeCerrarRecorrido(admin, propioCerrado)).toBe(false)
  })
  it('reabre solo recorridos cerrados', () => {
    expect(puedeReabrirRecorrido(admin, propioCerrado)).toBe(true)
    expect(puedeReabrirRecorrido(admin, propioAbierto)).toBe(false)
  })
  it('elimina y administra', () => {
    expect(puedeEliminarRecorrido(admin)).toBe(true)
    expect(puedeAdministrar(admin)).toBe(true)
  })
})

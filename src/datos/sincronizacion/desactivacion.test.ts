import { afterEach, describe, expect, it } from 'vitest'
import { borrarDatosDelRancho } from './desactivacion'
import { crearMotor } from './motor'
import { cerrarBases, nuevaBase, recorridoConPlanta, sembrar, servidorFalso } from './pruebas.util'
import { enviarTodo } from './envio'
import { SesionVencida } from './servidor'

afterEach(cerrarBases)

describe('borrarDatosDelRancho', () => {
  it('borra todo lo de ese rancho (registros, cola, rechazos y cursores) y deja los demás ranchos', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    await db.ranchos.put({ ...s.rancho, id: 'otro', nombre: 'Otro rancho' })
    await db.tablas.put({ ...s.tablas[0], id: 'tabla-otro', rancho_id: 'otro' })
    await db.ajustes.put({ clave: 'sync.cursor.hojas', valor: '2026-10-09T12:00:00Z' })
    await db.rechazos.put({ entidad: 'hojas', registro_id: (await db.hojas.toArray())[0].id, updated_at: 'x', motivo: 'm', fecha: 'f' })

    await borrarDatosDelRancho(db, s.rancho.id)

    for (const t of ['recorridos', 'evaluaciones', 'plantas', 'hojas', 'membresias']) expect(await db.table(t).count(), t).toBe(0)
    expect((await db.tablas.toArray()).map((t) => t.id)).toEqual(['tabla-otro'])
    expect((await db.ranchos.toArray()).map((r) => r.id)).toEqual(['otro'])
    expect(await db.cola.where('entidad').anyOf('hojas', 'plantas', 'recorridos', 'evaluaciones', 'tablas').filter((c) => c.registro_id !== 'tabla-otro').count()).toBe(0)
    expect(await db.rechazos.count()).toBe(0)
    expect(await db.ajustes.get('sync.cursor.hojas')).toBeUndefined()
    expect(await db.usuarios.count()).toBeGreaterThan(0) // los perfiles se conservan
  })
})

describe('el motor y el estado de la cuenta', () => {
  it('con la membresía inactiva: no envía, borra los datos locales del rancho y deja de sincronizar', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const servidor = servidorFalso({ membresias: [{ rancho_id: s.rancho.id, rol: 'operador', activo: false }] })
    const motor = crearMotor({ db, servidor, enLinea: () => true })
    await motor.sincronizar({ ignorarEspera: true })
    const e = motor.obtenerEstado()
    expect(e.desactivado).toBe(true)
    expect(e.membresias).toEqual([{ rancho_id: s.rancho.id, rol: 'operador', activo: false }])
    expect(await db.recorridos.count()).toBe(0)
    // En la cola solo quedan perfiles de usuario (compartidos, no son del rancho); nada del rancho se enviará.
    expect((await db.cola.toArray()).filter((c) => c.entidad !== 'usuarios')).toEqual([])
    expect(servidor.llamadas.filter((l) => l.tipo === 'aplicar' || l.tipo === 'descargar')).toHaveLength(0) // nada se envió ni se bajó
    servidor.llamadas.length = 0
    await motor.sincronizar({ ignorarEspera: true })
    expect(servidor.llamadas).toHaveLength(0)
    motor.detener()
  })

  it('si el acceso sigue activo en otro rancho, solo se borra el desactivado y se sigue sincronizando', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await db.tablas.put({ ...s.tablas[0], id: 'tabla-b', rancho_id: 'rancho-b' })
    const servidor = servidorFalso({ membresias: [{ rancho_id: s.rancho.id, rol: 'operador', activo: false }, { rancho_id: 'rancho-b', rol: 'administrador', activo: true }] })
    const motor = crearMotor({ db, servidor, enLinea: () => true })
    await motor.sincronizar({ ignorarEspera: true })
    expect(motor.obtenerEstado().desactivado).toBe(false)
    expect(await db.ranchos.count()).toBe(0)
    expect((await db.tablas.toArray()).map((t) => t.id)).toEqual(['tabla-b'])
    expect(servidor.llamadas.some((l) => l.tipo === 'descargar')).toBe(true)
    motor.detener()
  })

  it('sin membresías todavía (cuenta nueva sin rancho) sigue sincronizando y lo informa', async () => {
    const db = nuevaBase()
    const motor = crearMotor({ db, servidor: servidorFalso({ membresias: [] }), enLinea: () => true })
    await motor.sincronizar({ ignorarEspera: true })
    expect(motor.obtenerEstado().membresias).toEqual([])
    expect(motor.obtenerEstado().desactivado).toBe(false)
    motor.detener()
  })

  it('con la sesión vencida: lo marca, no borra nada, no reintenta solo y no vuelve a llamar', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const pendientes = await db.cola.count()
    const programadas: number[] = []
    const base = servidorFalso()
    const servidor = { ...base, miEstado: async () => { throw new SesionVencida() } }
    const motor = crearMotor({ db, servidor, enLinea: () => true, programar: (_f, ms) => { programadas.push(ms); return () => undefined } })
    await motor.sincronizar({ ignorarEspera: true })
    expect(motor.obtenerEstado().sesionVencida).toBe(true)
    expect(programadas.filter((ms) => ms >= 5000 && ms !== 5000)).toEqual([]) // sin reintentos programados por fallo
    expect(await db.cola.count()).toBe(pendientes)
    expect(await db.recorridos.count()).toBe(1)
    await motor.sincronizar({ ignorarEspera: true })
    expect(base.llamadas).toHaveLength(0)
    motor.detener()
  })

  it('con la sesión de vuelta (otro motor sobre la misma base) se envía lo pendiente', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const servidor = servidorFalso()
    const motor = crearMotor({ db, servidor, enLinea: () => true })
    await motor.sincronizar({ ignorarEspera: true })
    expect(await db.cola.count()).toBe(0)
    expect(servidor.tablas.get('hoja')!.size).toBeGreaterThan(0)
    await enviarTodo(db, servidor)
    motor.detener()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearConsultas } from '../consultas'
import { iniciarDisparadores } from './disparadores'
import { enviarTodo } from './envio'
import { recorridosConAlgoPendiente } from './pendientesPorRecorrido'
import { cerrarBases, nuevaBase, recorridoConPlanta, sembrar, servidorFalso } from './pruebas.util'
import { reintentarEnvio } from './rechazos'

afterEach(async () => {
  vi.restoreAllMocks()
  await cerrarBases()
})

describe('disparadores', () => {
  const visibilidad = (valor: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: valor, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('al abrir sincroniza ignorando la espera; al volver la señal también', () => {
    const motor = { sincronizar: vi.fn(() => Promise.resolve()) }
    const detener = iniciarDisparadores(motor as never)
    expect(motor.sincronizar).toHaveBeenLastCalledWith({ ignorarEspera: true })
    motor.sincronizar.mockClear()
    window.dispatchEvent(new Event('online'))
    expect(motor.sincronizar).toHaveBeenCalledWith({ ignorarEspera: true })
    detener()
  })

  it('al volver a estar visible la app sincroniza RESPETANDO la espera creciente; oculta, no', () => {
    const motor = { sincronizar: vi.fn(() => Promise.resolve()) }
    const detener = iniciarDisparadores(motor as never)
    motor.sincronizar.mockClear()
    visibilidad('hidden')
    expect(motor.sincronizar).not.toHaveBeenCalled()
    visibilidad('visible')
    expect(motor.sincronizar).toHaveBeenCalledTimes(1)
    expect(motor.sincronizar).toHaveBeenCalledWith() // sin ignorarEspera
    detener()
    visibilidad('visible')
    expect(motor.sincronizar).toHaveBeenCalledTimes(1) // ya no escucha
  })

  it('cada 60 s sincroniza solo si la app está visible', () => {
    vi.useFakeTimers()
    const motor = { sincronizar: vi.fn(() => Promise.resolve()) }
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    const detener = iniciarDisparadores(motor as never)
    motor.sincronizar.mockClear()
    vi.advanceTimersByTime(60_000)
    expect(motor.sincronizar).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    vi.advanceTimersByTime(60_000)
    expect(motor.sincronizar).toHaveBeenCalledTimes(1)
    detener()
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})

describe('reintentar envío de un rechazo', () => {
  it('devuelve el cambio a la cola con el updated_at ACTUAL del registro (sin cambiarlo) y borra el rechazo', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = (await db.hojas.where('planta_id').equals(planta.id).toArray()).filter((h) => !h.eliminado)
    await s.plantas.calificarHoja(hoja.id, 4)
    await enviarTodo(db, servidorFalso({ rechazar: (i) => (i.entidad === 'hoja' ? 'cerrado' : null) }))
    expect(await db.rechazos.get(['hojas', hoja.id])).toBeDefined()
    const marca = (await db.hojas.get(hoja.id))!.updated_at

    expect(await reintentarEnvio(db, { entidad: 'hojas', registro_id: hoja.id })).toBe(true)
    expect(await db.rechazos.get(['hojas', hoja.id])).toBeUndefined()
    expect(await db.cola.get(['hojas', hoja.id])).toEqual({ entidad: 'hojas', registro_id: hoja.id, updated_at: marca })
    expect((await db.hojas.get(hoja.id))!.updated_at).toBe(marca) // el registro no se tocó
    expect(await reintentarEnvio(db, { entidad: 'hojas', registro_id: hoja.id })).toBe(false) // ya no hay rechazo

    const servidor = servidorFalso()
    await enviarTodo(db, servidor)
    expect(await db.cola.count()).toBe(0)
    expect(await db.rechazos.count()).toBe(9) // las demás hojas (10 en total, menos la reintentada) rechazadas siguen esperando su decisión
    expect((servidor.tablas.get('hoja')!.get(hoja.id) as { grado_gauhl: number }).grado_gauhl).toBe(4)
  })
})

describe('"Sincronizado" parte de la cola y de los rechazos', () => {
  it('un recorrido cerrado está sincronizado si ni él ni sus hojas, plantas o tablas tienen algo pendiente o rechazado', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const a = await recorridoConPlanta(s)
    await s.recorridos.cerrar(a.recorrido.id)
    const b = await recorridoConPlanta(s)
    await s.recorridos.cerrar(b.recorrido.id)
    const consultas = crearConsultas(db)
    const estado = async () => Object.fromEntries((await consultas.tarjetasRecorridos()).map((t) => [t.recorrido.id, t.sincronizado]))

    expect(await estado()).toEqual({ [a.recorrido.id]: false, [b.recorrido.id]: false }) // todo está en la cola
    const servidor = servidorFalso()
    await enviarTodo(db, servidor)
    expect(await estado()).toEqual({ [a.recorrido.id]: true, [b.recorrido.id]: true })
    expect((await recorridosConAlgoPendiente(db)).size).toBe(0)

    // Una hoja del recorrido A se edita: A deja de estar sincronizado; B no.
    const [hoja] = (await db.hojas.where('planta_id').equals(a.planta.id).toArray()).filter((h) => !h.eliminado)
    await s.plantas.calificarHoja(hoja.id, 2)
    expect(await estado()).toEqual({ [a.recorrido.id]: false, [b.recorrido.id]: true })
    // Rechazada: sigue sin estar sincronizado.
    await enviarTodo(db, servidorFalso({ rechazar: () => 'no' }))
    expect(await db.cola.count()).toBe(0)
    expect(await estado()).toEqual({ [a.recorrido.id]: false, [b.recorrido.id]: true })
    // Una evaluación de B (la tabla del recorrido) en la cola.
    await s.recorridos.terminarTabla(b.evaluacion.id)
    expect((await estado())[b.recorrido.id]).toBe(false)
    expect([...(await recorridosConAlgoPendiente(db))].sort()).toEqual([a.recorrido.id, b.recorrido.id].sort())
  })

  it('un recorrido abierto nunca es "sincronizado"', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const a = await recorridoConPlanta(s)
    await enviarTodo(db, servidorFalso())
    const t = (await crearConsultas(db).tarjetasRecorridos()).find((x) => x.recorrido.id === a.recorrido.id)!
    expect(t.sincronizado).toBe(false)
  })
})

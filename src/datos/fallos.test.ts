import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { esperarEscrituras } from './cola'
import { SigatokaDB } from './db'
import { RegistroInexistente } from './errores'
import { alDescartar, claveHojaGrado, clavePlantaTh, claveTablaCampo, enSegundoPlano, fallosPendientes, gruposDeCambioPlanta, hayFallos, mensajeDeError, olvidarFallos, reintentar, suscribirFallos } from './fallos'
import { crearRepoPlantas } from './repos/plantas'
import { crearRepoRancho } from './repos/rancho'
import { crearRepoRecorridos } from './repos/recorridos'

beforeEach(() => olvidarFallos())

describe('escrituras en segundo plano que fallan', () => {
  it('un fallo queda registrado con su mensaje y se puede reintentar tal cual', async () => {
    let disponible = false
    const guardado: number[] = []
    const tarea = async () => {
      if (!disponible) throw new Error('no hay espacio')
      guardado.push(7)
    }
    await enSegundoPlano(tarea, 'hoja:1')
    expect(hayFallos()).toBe(true)
    expect(fallosPendientes()).toHaveLength(1)
    expect(fallosPendientes()[0]).toMatchObject({ clave: 'hoja:1', mensaje: 'no hay espacio' })

    await reintentar() // sigue fallando: el cambio no se pierde
    expect(hayFallos()).toBe(true)

    disponible = true
    await reintentar()
    expect(guardado).toEqual([7])
    expect(hayFallos()).toBe(false)
  })

  it('una escritura más nueva de lo mismo reemplaza al fallo: el reintento nunca pisa un valor más reciente', async () => {
    const valores: number[] = []
    await enSegundoPlano(async () => { throw new Error('fallo') }, 'hoja:1')
    expect(hayFallos()).toBe(true)
    await enSegundoPlano(async () => { valores.push(5) }, 'hoja:1') // se guardó el valor nuevo
    expect(hayFallos()).toBe(false)
    await reintentar()
    expect(valores).toEqual([5])
  })

  it('si falla una escritura vieja después de lanzar la nueva, no queda como fallo', async () => {
    let rechazar!: (e: Error) => void
    const vieja = enSegundoPlano(() => new Promise((_, rej) => { rechazar = rej }), 'hoja:1')
    await enSegundoPlano(async () => undefined, 'hoja:1')
    rechazar(new Error('tarde'))
    await vieja
    expect(hayFallos()).toBe(false)
  })

  it('claves distintas se acumulan y se reintentan en el orden en que fallaron', async () => {
    const orden: string[] = []
    let ok = false
    const hacer = (n: string) => async () => {
      if (!ok) throw new Error('fallo ' + n)
      orden.push(n)
    }
    await enSegundoPlano(hacer('a'), 'a')
    await enSegundoPlano(hacer('b'), 'b')
    expect(fallosPendientes().map((f) => f.clave)).toEqual(['a', 'b'])
    ok = true
    await reintentar()
    expect(orden).toEqual(['a', 'b'])
    expect(hayFallos()).toBe(false)
  })

  it('avisa a la interfaz cada vez que cambia la lista', async () => {
    const oyente = vi.fn()
    const baja = suscribirFallos(oyente)
    await enSegundoPlano(async () => { throw new Error('x') }, 'k')
    expect(oyente).toHaveBeenCalledTimes(1)
    const antes = fallosPendientes()
    await enSegundoPlano(async () => undefined, 'k')
    expect(oyente).toHaveBeenCalledTimes(2)
    expect(fallosPendientes()).not.toBe(antes) // instantánea nueva, requisito de useSyncExternalStore
    baja()
    await enSegundoPlano(async () => { throw new Error('y') }, 'k2')
    expect(oyente).toHaveBeenCalledTimes(2)
  })

  it('mensajes claros para el operador', () => {
    expect(mensajeDeError(new Error('La hoja ya no existe.'))).toBe('La hoja ya no existe.')
    expect(mensajeDeError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toMatch(/sin espacio/)
    expect(mensajeDeError('raro')).toBe('error desconocido.')
  })
})

describe('claves de fallo por registro y campo', () => {
  it('cada campo tiene su clave; el GPS va junto', () => {
    expect(gruposDeCambioPlanta('p1', { hmj_pizca: 2 })).toEqual([{ clave: 'planta:p1:hmj_pizca', cambios: { hmj_pizca: 2 } }])
    expect(gruposDeCambioPlanta('p1', { observaciones: 'x' })[0].clave).toBe('planta:p1:observaciones')
    expect(gruposDeCambioPlanta('p1', { numero_planta: 3 })[0].clave).toBe('planta:p1:numero_planta')
    expect(gruposDeCambioPlanta('p1', { gps_lat: 1, gps_lon: 2, gps_precision_m: 5 })).toEqual([
      { clave: 'planta:p1:gps', cambios: { gps_lat: 1, gps_lon: 2, gps_precision_m: 5 } },
    ])
    // Varios campos a la vez se separan en un grupo por campo.
    expect(gruposDeCambioPlanta('p1', { hmj_pizca: 1, hmj_estria: 2 }).map((g) => g.clave)).toEqual(['planta:p1:hmj_pizca', 'planta:p1:hmj_estria'])
    expect(claveHojaGrado('h1')).toBe('hoja:h1:grado')
    expect(clavePlantaTh('p1')).toBe('planta:p1:th')
    expect(claveTablaCampo('t1', 'activa')).toBe('tabla:t1:activa')
  })

  it('fallo en hmj_pizca + escritura exitosa de observaciones de la misma planta → el fallo de hmj_pizca sigue pendiente', async () => {
    let falla = true
    const [pizca] = gruposDeCambioPlanta('p1', { hmj_pizca: 2 })
    const [obs] = gruposDeCambioPlanta('p1', { observaciones: 'hoja rota' })
    await enSegundoPlano(async () => { if (falla) throw new Error('disco lleno') }, pizca.clave)
    await enSegundoPlano(async () => undefined, obs.clave)
    expect(fallosPendientes().map((f) => f.clave)).toEqual(['planta:p1:hmj_pizca'])
    falla = false
    await reintentar()
    expect(hayFallos()).toBe(false)
  })
})

describe('fallos obsoletos', () => {
  it('RegistroInexistente se descarta sin quedar como fallo y se informa una vez', async () => {
    const avisos: string[] = []
    const baja = alDescartar((a) => avisos.push(a))
    await enSegundoPlano(async () => { throw new Error('disco lleno') }, 'hoja:1:grado')
    expect(hayFallos()).toBe(true)
    await enSegundoPlano(async () => { throw new RegistroInexistente('hoja') }, 'hoja:1:grado')
    expect(hayFallos()).toBe(false)
    expect(avisos).toEqual(['Se descartó un cambio a una hoja que ya no existe.'])
    baja()
  })
})

describe('con la base real (fallo simulado al escribir)', () => {
  const abiertas: SigatokaDB[] = []
  afterEach(async () => {
    vi.restoreAllMocks()
    for (const db of abiertas.splice(0)) {
      await esperarEscrituras(db)
      db.close()
    }
  })

  async function sembrar() {
    const db = new SigatokaDB(`fallos-${Math.random().toString(36).slice(2)}`)
    abiertas.push(db)
    const { rancho, usuarios } = await crearRepoRancho(db).configurarInicial({ nombre: 'R', poligonos: [{ nombre: 'Tabla 1.', anillo: [[0, 0], [0, 1], [1, 1], [0, 0]] }] })
    const tabla = (await db.tablas.toArray())[0]
    const recorridos = crearRepoRecorridos(db)
    const plantas = crearRepoPlantas(db)
    const { recorrido, evaluaciones } = await recorridos.crear({ rancho_id: rancho.id, fecha: '2026-10-09', usuario_id: usuarios[1].id, tabla_ids: [tabla.id] })
    const { hojas } = await plantas.crear(evaluaciones[0].id)
    return { db, recorridos, plantas, recorrido, hoja: hojas[0] }
  }

  it('calificar una hoja cuando la base falla: no se guarda nada, queda el aviso, y al reintentar se guarda', async () => {
    const { db, plantas, hoja } = await sembrar()
    const colaAntes = await db.cola.count()
    const espia = vi.spyOn(db.cola, 'put').mockRejectedValue(new Error('disco lleno'))

    await enSegundoPlano(() => plantas.calificarHoja(hoja.id, 4), `hoja:${hoja.id}`)
    expect(hayFallos()).toBe(true)
    expect(fallosPendientes()[0].mensaje).toBe('disco lleno')
    expect((await db.hojas.get(hoja.id))?.grado_gauhl).toBeNull() // la transacción se deshizo
    expect(await db.cola.count()).toBe(colaAntes)

    espia.mockRestore()
    await reintentar()
    expect(hayFallos()).toBe(false)
    expect((await db.hojas.get(hoja.id))?.grado_gauhl).toBe(4) // el borrador se conservó
  })

  it('con un fallo pendiente no se puede cerrar el recorrido (hayFallos lo impide) y al resolverlo sí', async () => {
    const { db, plantas, recorridos, recorrido, hoja } = await sembrar()
    const espia = vi.spyOn(db.cola, 'put').mockRejectedValue(new Error('fallo simulado'))
    await enSegundoPlano(() => plantas.calificarHoja(hoja.id, 2), `hoja:${hoja.id}`)

    // La pantalla de recorrido consulta esto antes de ofrecer "Cerrar recorrido".
    const intentarCerrar = async () => {
      if (hayFallos()) return 'bloqueado'
      await recorridos.cerrar(recorrido.id)
      return 'cerrado'
    }
    expect(await intentarCerrar()).toBe('bloqueado')
    expect((await db.recorridos.get(recorrido.id))?.estado).toBe('en_curso')

    espia.mockRestore()
    await reintentar()
    expect(await intentarCerrar()).toBe('cerrado')
    expect((await db.hojas.get(hoja.id))?.grado_gauhl).toBe(2)
    expect((await db.recorridos.get(recorrido.id))?.estado).toBe('cerrado')
  })

  it('hoja 11 que falla y luego se baja el TH a 10: al reintentar se descarta, se informa una vez y se puede cerrar el recorrido', async () => {
    const { db, plantas, recorridos, recorrido, hoja } = await sembrar()
    const planta = (await db.plantas.toArray())[0]
    await plantas.cambiarTotalHojas(planta.id, 11)
    const h11 = (await db.hojas.where('planta_id').equals(planta.id).toArray()).find((h) => h.numero_hoja === 11)!
    void hoja
    const avisos: string[] = []
    const baja = alDescartar((a) => avisos.push(a))

    const espia = vi.spyOn(db.cola, 'put').mockRejectedValue(new Error('disco lleno'))
    await enSegundoPlano(() => plantas.calificarHoja(h11.id, 3), claveHojaGrado(h11.id))
    expect(hayFallos()).toBe(true)
    espia.mockRestore()

    await enSegundoPlano(() => plantas.cambiarTotalHojas(planta.id, 10), clavePlantaTh(planta.id)) // la hoja 11 se elimina
    expect(hayFallos()).toBe(true) // el fallo de la hoja 11 sigue ahí hasta reintentar

    await reintentar()
    expect(hayFallos()).toBe(false)
    expect(avisos).toEqual(['Se descartó un cambio a una hoja que ya no existe.'])
    expect((await db.hojas.get(h11.id))?.grado_gauhl).toBeNull()
    await recorridos.cerrar(recorrido.id)
    expect((await db.recorridos.get(recorrido.id))?.estado).toBe('cerrado')
    baja()
  })

  it('si se elimina la planta, el cambio pendiente a su hoja también se descarta', async () => {
    const { db, plantas, hoja } = await sembrar()
    const planta = (await db.plantas.toArray())[0]
    const espia = vi.spyOn(db.cola, 'put').mockRejectedValue(new Error('disco lleno'))
    await enSegundoPlano(() => plantas.calificarHoja(hoja.id, 1), claveHojaGrado(hoja.id))
    espia.mockRestore()
    await plantas.eliminar(planta.id)
    await reintentar()
    expect(hayFallos()).toBe(false)
  })

  it('los repositorios lanzan RegistroInexistente (error tipado) para hojas, plantas y tablas eliminadas', async () => {
    const { db, plantas, hoja } = await sembrar()
    const planta = (await db.plantas.toArray())[0]
    await plantas.eliminar(planta.id)
    await expect(plantas.calificarHoja(hoja.id, 1)).rejects.toBeInstanceOf(RegistroInexistente)
    await expect(plantas.actualizar(planta.id, { hmj_pizca: 1 })).rejects.toMatchObject({ entidad: 'planta' })
    await expect(plantas.cambiarTotalHojas(planta.id, 5)).rejects.toBeInstanceOf(RegistroInexistente)
  })
})

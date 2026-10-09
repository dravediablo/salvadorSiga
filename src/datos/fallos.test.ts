import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { esperarEscrituras } from './cola'
import { SigatokaDB } from './db'
import { enSegundoPlano, fallosPendientes, hayFallos, mensajeDeError, olvidarFallos, reintentar, suscribirFallos } from './fallos'
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
})

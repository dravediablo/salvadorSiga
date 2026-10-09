import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearReloj, relojDe, CLAVE_ULTIMA_MARCA, type AlmacenReloj } from './reloj'
import { esperarEscrituras } from './cola'
import { SigatokaDB } from './db'
import { crearRepoPlantas } from './repos/plantas'
import { crearRepoRecorridos } from './repos/recorridos'
import { crearRepoRancho } from './repos/rancho'

function almacenEnMemoria(inicial?: number): AlmacenReloj & { valor: number | undefined } {
  const a = {
    valor: inicial,
    leer: async () => a.valor,
    guardar: async (ms: number) => {
      a.valor = ms
    },
  }
  return a
}

const estrictamenteCrecientes = (marcas: string[]) => marcas.every((m, i) => i === 0 || m > marcas[i - 1])

describe('generador de marcas de tiempo', () => {
  it('con el reloj normal, devuelve la hora actual', async () => {
    const r = crearReloj(almacenEnMemoria(), () => Date.parse('2026-10-09T12:00:00.000Z'))
    expect(await r.siguiente()).toBe('2026-10-09T12:00:00.000Z')
  })

  it('reloj que retrocede 1 hora y 20 escrituras en el mismo milisegundo → todas estrictamente crecientes', async () => {
    let ahora = Date.parse('2026-10-09T12:00:00.000Z')
    const r = crearReloj(almacenEnMemoria(), () => ahora)
    const marcas = [await r.siguiente()]
    ahora -= 60 * 60 * 1000 // el celular se atrasa una hora
    for (let i = 0; i < 20; i++) marcas.push(await r.siguiente()) // y 20 escrituras sin que pase un milisegundo
    expect(marcas).toHaveLength(21)
    expect(estrictamenteCrecientes(marcas)).toBe(true)
    // "Última más 1 ms": no se inventa un salto grande.
    expect(marcas[1]).toBe('2026-10-09T12:00:00.001Z')
    expect(marcas[20]).toBe('2026-10-09T12:00:00.020Z')
  })

  it('cuando el reloj alcanza a la última marca, vuelve a seguir la hora real', async () => {
    let ahora = Date.parse('2026-10-09T12:00:00.000Z')
    const r = crearReloj(almacenEnMemoria(), () => ahora)
    await r.siguiente()
    await r.siguiente() // …00.001
    ahora = Date.parse('2026-10-09T12:00:05.000Z')
    expect(await r.siguiente()).toBe('2026-10-09T12:00:05.000Z')
  })

  it('la última marca sobrevive al cierre de la app', async () => {
    const almacen = almacenEnMemoria()
    let ahora = Date.parse('2026-10-09T12:00:00.000Z')
    const r1 = crearReloj(almacen, () => ahora)
    for (let i = 0; i < 5; i++) await r1.siguiente() // …00.004
    await r1.persistir()
    expect(almacen.valor).toBe(Date.parse('2026-10-09T12:00:00.004Z'))

    // App nueva, con el reloj una hora atrás: continúa desde lo guardado.
    ahora -= 60 * 60 * 1000
    const r2 = crearReloj(almacen, () => ahora)
    expect(await r2.siguiente()).toBe('2026-10-09T12:00:00.005Z')
  })

  it('llamadas simultáneas antes de cargar también son estrictamente crecientes', async () => {
    const r = crearReloj(almacenEnMemoria(Date.parse('2026-10-09T12:00:00.500Z')), () => Date.parse('2026-10-09T12:00:00.000Z'))
    const marcas = await Promise.all(Array.from({ length: 10 }, () => r.siguiente()))
    expect(estrictamenteCrecientes(marcas)).toBe(true)
    expect(marcas[0]).toBe('2026-10-09T12:00:00.501Z')
  })

  it('si la lectura del almacén falla, la siguiente llamada vuelve a intentarlo', async () => {
    let falla = true
    const r = crearReloj({ leer: async () => { if (falla) throw new Error('transacción abortada'); return undefined }, guardar: async () => undefined }, () => 1000)
    await expect(r.siguiente()).rejects.toThrow('abortada')
    falla = false
    expect(await r.siguiente()).toBe(new Date(1000).toISOString())
  })

  it('persistir no escribe si no hay marcas nuevas', async () => {
    const almacen = almacenEnMemoria()
    const guardar = vi.spyOn(almacen, 'guardar')
    const r = crearReloj(almacen, () => 1000)
    await r.persistir()
    await r.siguiente()
    await r.persistir()
    await r.persistir()
    expect(guardar).toHaveBeenCalledTimes(1)
  })
})

describe('updated_at monótono en la base', () => {
  const abiertas: SigatokaDB[] = []
  afterEach(async () => {
    vi.restoreAllMocks()
    for (const db of abiertas.splice(0)) {
      await esperarEscrituras(db)
      db.close()
    }
  })
  const nueva = (nombre = `reloj-${Math.random().toString(36).slice(2)}`) => {
    const db = new SigatokaDB(nombre)
    abiertas.push(db)
    return db
  }

  it('las escrituras reales nunca repiten ni retroceden updated_at, aunque el reloj retroceda 1 hora', async () => {
    const db = nueva()
    const ahora = Date.parse('2026-10-09T12:00:00.000Z')
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora)
    const { rancho, usuarios } = await crearRepoRancho(db).configurarInicial({ nombre: 'R', poligonos: [{ nombre: 'Tabla 1.', anillo: [[0, 0], [0, 1], [1, 1], [0, 0]] }] })
    const tabla = (await db.tablas.toArray())[0]
    const recorridos = crearRepoRecorridos(db)
    const plantas = crearRepoPlantas(db)
    const { evaluaciones } = await recorridos.crear({ rancho_id: rancho.id, fecha: '2026-10-09', usuario_id: usuarios[1].id, tabla_ids: [tabla.id] })
    const { planta, hojas } = await plantas.crear(evaluaciones[0].id)
    reloj.mockReturnValue(ahora - 60 * 60 * 1000)
    const marcas: string[] = []
    for (let i = 0; i < 20; i++) marcas.push((await plantas.calificarHoja(hojas[0].id, (i % 7) as 0))?.updated_at)
    marcas.push((await plantas.actualizar(planta.id, { hmj_pizca: 1 })).updated_at)
    expect(estrictamenteCrecientes(marcas)).toBe(true)
    const antes = (await db.recorridos.toArray())[0].updated_at
    expect(marcas[0] > antes).toBe(true)
  })

  it('la última marca queda en ajustes y una app nueva con el reloj atrasado sigue creciendo', async () => {
    const nombre = `reloj-persistente-${Math.random().toString(36).slice(2)}`
    const db1 = nueva(nombre)
    const ahora = Date.parse('2026-10-09T12:00:00.000Z')
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora)
    const rancho1 = crearRepoRancho(db1)
    await rancho1.configurarInicial({ nombre: 'R', poligonos: [{ nombre: 'Tabla 1.', anillo: [[0, 0], [0, 1], [1, 1], [0, 0]] }] })
    const guardada = (await db1.ajustes.get(CLAVE_ULTIMA_MARCA))?.valor as number
    const ultima = (await db1.tablas.toArray())[0].updated_at
    expect(guardada).toBeGreaterThanOrEqual(Date.parse(ultima))
    await esperarEscrituras(db1)
    db1.close()

    reloj.mockReturnValue(ahora - 60 * 60 * 1000)
    const db2 = nueva(nombre)
    const t = (await db2.tablas.toArray())[0]
    const editada = await (await import('./repos/tablas')).crearRepoTablas(db2).editar(t.id, { variedad: 'x' })
    expect(editada.updated_at > guardadaIso(guardada)).toBe(true)
  })

  it('relojDe devuelve siempre el mismo generador para una base', () => {
    const db = nueva()
    expect(relojDe(db)).toBe(relojDe(db))
  })
})

const guardadaIso = (ms: number) => new Date(ms).toISOString()

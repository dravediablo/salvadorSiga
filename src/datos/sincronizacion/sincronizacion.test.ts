import { afterEach, describe, expect, it, vi } from 'vitest'
import { listarPendientes } from '../cola'
import { aplicarRemoto } from '../remoto'
import { relojDe } from '../reloj'
import { descargarTodo, desdeConMargen, claveCursor, MARGEN_CURSOR_MS } from './descarga'
import { aRegistroServidor, deFilaServidor, ENTIDAD_SERVIDOR, ORDEN_DESCARGA } from './entidades'
import { enviarLote, enviarTodo } from './envio'
import { crearMotor, esperaTrasFallo, ESPERAS_MS } from './motor'
import { cerrarBases, compararMarcas, nuevaBase, recorridoConPlanta, sembrar, servidorFalso } from './pruebas.util'
import { descartarRechazo } from './rechazos'

afterEach(async () => {
  vi.restoreAllMocks()
  await cerrarBases()
})

const hojasVivas = async (db: ReturnType<typeof nuevaBase>, plantaId: string) =>
  (await db.hojas.where('planta_id').equals(plantaId).toArray()).filter((h) => !h.eliminado).sort((a, b) => a.numero_hoja - b.numero_hoja)

describe('traducción de nombres y campos', () => {
  it('cada tabla local se llama en el servidor como su entidad en singular', () => {
    expect(ENTIDAD_SERVIDOR).toEqual({
      ranchos: 'rancho', usuarios: 'usuario', membresias: 'membresia', tablas: 'tabla', recorridos: 'recorrido',
      evaluaciones: 'evaluacion_tabla', plantas: 'planta', hojas: 'hoja', aplicaciones: 'aplicacion', clima: 'clima_diario',
    })
    expect(new Set(ORDEN_DESCARGA)).toEqual(new Set(Object.keys(ENTIDAD_SERVIDOR)))
    expect(ORDEN_DESCARGA.slice(0, 3)).toEqual(['ranchos', 'usuarios', 'membresias'])
  })

  it('el lote lleva el registro COMPLETO, con el nombre del servidor y sin los campos solo locales', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const servidor = servidorFalso()
    await enviarLote(db, servidor)
    const lote = servidor.llamadas[0].detalle as Array<{ entidad: string; registro: Record<string, unknown> }>
    expect(lote.length).toBeGreaterThan(5)
    const hoja = lote.find((i) => i.entidad === 'hoja')!
    expect(Object.keys(hoja.registro).sort()).toEqual(['created_at', 'eliminado', 'grado_gauhl', 'id', 'numero_hoja', 'planta_id', 'rancho_id', 'updated_at'])
    expect(hoja.registro).not.toHaveProperty('server_updated_at')
    expect(lote.map((i) => i.entidad)).not.toContain('hojas')
    expect(lote.every((i) => Object.values(ENTIDAD_SERVIDOR).includes(i.entidad))).toBe(true)
    // Padres antes que hijos, también entre lotes: recorrido → tabla del recorrido → planta → hoja.
    const posicion = (e: string) => lote.findIndex((i) => i.entidad === e)
    expect(posicion('recorrido')).toBeLessThan(posicion('evaluacion_tabla'))
    expect(posicion('evaluacion_tabla')).toBeLessThan(posicion('planta'))
    expect(posicion('planta')).toBeLessThan(posicion('hoja'))
    expect(posicion('tabla')).toBeLessThan(posicion('recorrido'))
  })

  it('las marcas del servidor se normalizan al formato local y server_updated_at se conserva', () => {
    const r = deFilaServidor<{ id: string; eliminado: boolean; updated_at: string; created_at: string; hora_inicio: string | null; server_updated_at: string }>({
      updated_at: '2026-10-09T12:00:00.123+00:00', created_at: '2026-10-09T12:00:00+00:00', hora_inicio: '2026-10-09T13:00:00.5+00:00', server_updated_at: '2026-10-09T12:00:01.123456+00:00',
    })
    expect(r.updated_at).toBe('2026-10-09T12:00:00.123Z')
    expect(r.created_at).toBe('2026-10-09T12:00:00.000Z')
    expect(r.hora_inicio).toBe('2026-10-09T13:00:00.500Z')
    expect(r.server_updated_at).toBe('2026-10-09T12:00:01.123456+00:00')
    expect(aRegistroServidor({ id: 'x', created_at: 'a', updated_at: 'b', server_updated_at: 'c', eliminado: false })).not.toHaveProperty('server_updated_at')
  })
})

describe('envío', () => {
  it('lo aplicado e ignorado sale de la cola y nada más', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const total = await db.cola.count()
    expect(total).toBeGreaterThan(5)
    const r = await enviarTodo(db, servidorFalso())
    expect(r.aplicados).toBe(total)
    expect(await db.cola.count()).toBe(0)
    expect(await db.rechazos.count()).toBe(0)
  })

  it('la entrada de la cola se borra SOLO si su updated_at sigue siendo el que se envió', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    // Mientras "viaja" el lote, la persona califica la hoja otra vez.
    let editada = false
    const servidor = servidorFalso({ alAplicar: async () => { if (!editada) { editada = true; await s.plantas.calificarHoja(hoja.id, 5) } } })
    await enviarLote(db, servidor, 500)
    const entrada = await db.cola.get(['hojas', hoja.id])
    expect(entrada).toBeDefined() // la edición más nueva se queda en la cola
    expect(entrada!.updated_at).toBe((await db.hojas.get(hoja.id))!.updated_at)
    expect((await db.cola.count())).toBe(1) // y es la única
    // El siguiente envío la manda y la cola queda vacía.
    await enviarTodo(db, servidor)
    expect(await db.cola.count()).toBe(0)
    expect((servidor.tablas.get('hoja')!.get(hoja.id) as { grado_gauhl: number }).grado_gauhl).toBe(5)
  })

  it('un rechazo pasa a la lista con su motivo; el registro local sigue; una edición posterior lo devuelve a la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    await enviarTodo(db, servidorFalso())
    await s.plantas.calificarHoja(hoja.id, 3)
    const calificada = (await db.hojas.get(hoja.id))!

    const servidor = servidorFalso({ rechazar: (i) => (i.entidad === 'hoja' ? 'El recorrido ya está cerrado.' : null) })
    await enviarTodo(db, servidor)
    expect(await db.cola.count()).toBe(0)
    const rechazos = await db.rechazos.toArray()
    expect(rechazos).toHaveLength(1)
    expect(rechazos[0]).toMatchObject({ entidad: 'hojas', registro_id: hoja.id, updated_at: calificada.updated_at, motivo: 'El recorrido ya está cerrado.' })
    expect(typeof rechazos[0].fecha).toBe('string')
    expect((await db.hojas.get(hoja.id))!.grado_gauhl).toBe(3) // el registro local NO se borra

    await s.plantas.calificarHoja(hoja.id, 4) // se vuelve a editar
    expect(await db.rechazos.count()).toBe(0)
    expect((await db.cola.get(['hojas', hoja.id]))!.updated_at).toBe((await db.hojas.get(hoja.id))!.updated_at)
  })

  it('si la edición cambió mientras viajaba un registro que salió rechazado, no se registra un rechazo viejo', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    const servidor = servidorFalso({
      rechazar: (i) => (i.entidad === 'hoja' && i.registro.id === hoja.id ? 'no' : null),
      alAplicar: async () => { await s.plantas.calificarHoja(hoja.id, 6) },
    })
    await enviarLote(db, servidor, 500)
    expect(await db.rechazos.count()).toBe(0)
    expect(await db.cola.get(['hojas', hoja.id])).toBeDefined()
  })

  it('más de 200 pendientes se envían en lotes seguidos hasta vaciar la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    await s.plantas.cambiarTotalHojas(planta.id, 30)
    // Muchas escrituras sueltas: cada hoja deja su entrada.
    for (let i = 0; i < 8; i++) {
      const { planta: p } = await s.plantas.crear((await db.evaluaciones.toArray())[0].id)
      await s.plantas.cambiarTotalHojas(p.id, 30)
    }
    const pendientes = await db.cola.count()
    expect(pendientes).toBeGreaterThan(200)
    const servidor = servidorFalso()
    const r = await enviarTodo(db, servidor)
    expect(r.lotes).toBe(Math.ceil(pendientes / 200))
    expect(servidor.llamadas.filter((l) => l.tipo === 'aplicar').every((l) => (l.detalle as unknown[]).length <= 200)).toBe(true)
    expect(await db.cola.count()).toBe(0)
  })

  it('con más de un lote, ningún lote lleva un hijo sin que su padre haya salido antes o vaya en el mismo', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const evaluacion = (await db.evaluaciones.toArray())[0]
    for (let i = 0; i < 6; i++) {
      const { planta } = await s.plantas.crear(evaluacion.id)
      await s.plantas.cambiarTotalHojas(planta.id, 30)
      await s.plantas.actualizar(planta.id, { observaciones: 'x' }) // la planta se vuelve a tocar DESPUÉS de crear sus hojas
    }
    const servidor = servidorFalso()
    await enviarTodo(db, servidor, 50)
    const vistos = new Set<string>()
    let hijosSinPadre = 0
    for (const l of servidor.llamadas.filter((x) => x.tipo === 'aplicar')) {
      const lote = l.detalle as Array<{ entidad: string; registro: { id: string; planta_id?: string; evaluacion_tabla_id?: string } }>
      for (const i of lote) vistos.add(`${i.entidad}:${i.registro.id}`)
      for (const i of lote) {
        if (i.entidad === 'hoja' && !vistos.has(`planta:${i.registro.planta_id}`)) hijosSinPadre++
        if (i.entidad === 'planta' && !vistos.has(`evaluacion_tabla:${i.registro.evaluacion_tabla_id}`)) hijosSinPadre++
      }
    }
    expect(hijosSinPadre).toBe(0)
  })

  it('un recorrido cerrado sale al final; si la cola no cabe en un lote, antes sale su cascarón (en curso, marca 1 ms más vieja) y la cola lo conserva', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { recorrido } = await recorridoConPlanta(s)
    await s.recorridos.cerrar(recorrido.id)
    const servidor = servidorFalso()
    const cerrado = (await db.recorridos.get(recorrido.id))!
    await enviarLote(db, servidor, 5)
    const primero = servidor.llamadas[0].detalle as Array<{ entidad: string; registro: { id: string; estado?: string; updated_at: string } }>
    const sombra = primero.find((i) => i.entidad === 'recorrido')!
    expect(sombra.registro.estado).toBe('en_curso')
    expect(Date.parse(cerrado.updated_at) - Date.parse(sombra.registro.updated_at)).toBe(1)
    expect(await db.cola.get(['recorridos', recorrido.id])).toBeDefined()
    await enviarTodo(db, servidor, 5)
    expect(await db.cola.count()).toBe(0)
    const final = servidor.tablas.get('recorrido')!.get(recorrido.id) as { estado: string; updated_at: string }
    expect(new Date(final.updated_at).toISOString()).toBe(cerrado.updated_at)
  })

  it('si la llamada falla, no se borra nada de la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const antes = await listarPendientes(db)
    const servidor = servidorFalso({ alAplicar: () => { throw new Error('sin red') } })
    await expect(enviarLote(db, servidor)).rejects.toThrow('sin red')
    expect(await listarPendientes(db)).toEqual(antes)
  })

  it('una entrada cuyo registro no existe se retira para no trabar la cola', async () => {
    const db = nuevaBase()
    await db.cola.put({ entidad: 'hojas', registro_id: 'fantasma', updated_at: '2026-10-09T12:00:00.000Z' })
    const servidor = servidorFalso()
    await enviarTodo(db, servidor)
    expect(await db.cola.count()).toBe(0)
    expect(servidor.llamadas).toHaveLength(0)
  })
})

describe('fusión de lo que viene del servidor (aplicarRemoto)', () => {
  const remotoDe = async (db: ReturnType<typeof nuevaBase>, id: string, cambios: object) => ({ ...(await db.hojas.get(id))!, server_updated_at: '2026-10-09T12:00:00.000000+00:00', ...cambios })

  it('si el local es más nuevo y está en la cola, se conserva', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    await s.plantas.calificarHoja(hoja.id, 4)
    const local = (await db.hojas.get(hoja.id))!
    const r = await db.transaction('rw', [db.hojas, db.cola, db.rechazos], async () =>
      aplicarRemoto(db, 'hojas', await remotoDe(db, hoja.id, { grado_gauhl: 1, updated_at: '2000-01-01T00:00:00.000Z' })),
    )
    expect(r).toBe('conservado_local')
    expect(await db.hojas.get(hoja.id)).toEqual(local)
  })

  it('si el remoto es más nuevo se aplica tal cual (con su updated_at y server_updated_at) y SIN entrada en la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    await enviarTodo(db, servidorFalso()) // cola vacía
    const remoto = await remotoDe(db, hoja.id, { grado_gauhl: 6, updated_at: '2999-01-01T00:00:00.000Z' })
    const r = await db.transaction('rw', [db.hojas, db.cola, db.rechazos], () => aplicarRemoto(db, 'hojas', remoto))
    expect(r).toBe('aplicado')
    expect(await db.hojas.get(hoja.id)).toEqual(remoto)
    expect(await db.cola.count()).toBe(0)
  })

  it('un remoto aplicado no pasa por el generador de marcas local', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    const emitir = vi.spyOn(relojDe(db), 'siguiente')
    await db.transaction('rw', [db.hojas, db.cola, db.rechazos], async () =>
      aplicarRemoto(db, 'hojas', await remotoDe(db, hoja.id, { updated_at: '2999-01-01T00:00:00.000Z' })),
    )
    expect(emitir).not.toHaveBeenCalled()
  })

  it('un cambio rechazado que sigue sin resolverse tampoco se pisa con la versión vieja del servidor', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    await s.plantas.calificarHoja(hoja.id, 2)
    await enviarTodo(db, servidorFalso({ rechazar: (i) => (i.entidad === 'hoja' ? 'cerrado' : null) }))
    const local = (await db.hojas.get(hoja.id))!
    const r = await db.transaction('rw', [db.hojas, db.cola, db.rechazos], async () =>
      aplicarRemoto(db, 'hojas', await remotoDe(db, hoja.id, { grado_gauhl: 0, updated_at: '2000-01-01T00:00:00.000Z' })),
    )
    expect(r).toBe('conservado_local')
    expect(await db.hojas.get(hoja.id)).toEqual(local)
    expect(await db.rechazos.get(['hojas', hoja.id])).toBeDefined()
  })

  it('"Descartar mi cambio" trae la versión del servidor y borra el rechazo', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    const base = servidorFalso()
    await enviarTodo(db, base)
    await s.plantas.calificarHoja(hoja.id, 5)
    const servidor = servidorFalso({ rechazar: (i) => (i.entidad === 'hoja' ? 'cerrado' : null) })
    for (const [e, filas] of base.tablas) for (const f of filas.values()) servidor.poner(e, f)
    await enviarTodo(db, servidor)
    expect(await db.rechazos.count()).toBe(1)
    const resultado = await descartarRechazo(db, servidor, { entidad: 'hojas', registro_id: hoja.id })
    expect(resultado).toBe('version_del_servidor')
    expect(await db.rechazos.count()).toBe(0)
    expect((await db.hojas.get(hoja.id))!.grado_gauhl).toBe((servidor.tablas.get('hoja')!.get(hoja.id) as { grado_gauhl: number }).grado_gauhl)
    expect(await db.cola.count()).toBe(0)
  })

  it('descartar un rechazo de un registro que el servidor no tiene lo retira de la vista local', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const servidor = servidorFalso({ rechazar: (i) => (i.entidad === 'planta' ? 'no' : null) })
    await enviarTodo(db, servidor)
    expect((await db.rechazos.toArray()).map((r) => r.entidad)).toContain('plantas')
    const r = await descartarRechazo(db, servidor, { entidad: 'plantas', registro_id: planta.id })
    expect(r).toBe('retirado')
    expect((await db.plantas.get(planta.id))!.eliminado).toBe(true)
    expect(await db.cola.get(['plantas', planta.id])).toBeUndefined()
  })
})

describe('descarga y cursor', () => {
  const filaHoja = (id: string, extra: object = {}) => ({
    id, rancho_id: 'r', planta_id: 'p', numero_hoja: 1, grado_gauhl: 2, eliminado: false,
    created_at: '2026-10-09T10:00:00+00:00', updated_at: '2026-10-09T10:00:00+00:00', ...extra,
  })

  it('el cursor es el mayor server_updated_at recibido; la siguiente descarga pide desde cursor − 2 min', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    servidor.poner('hoja', filaHoja('h1'), '2026-10-09T12:00:00.000000+00:00')
    servidor.poner('hoja', filaHoja('h2'), '2026-10-09T12:05:00.500000+00:00')
    await descargarTodo(db, servidor)
    expect((await db.ajustes.get(claveCursor('hojas')))?.valor).toBe('2026-10-09T12:05:00.500000+00:00')
    servidor.llamadas.length = 0
    await descargarTodo(db, servidor)
    const pedida = servidor.llamadas.find((l) => l.tipo === 'descargar' && (l.detalle as { entidad: string }).entidad === 'hoja')!.detalle as { desde: string }
    expect(pedida.desde).toBe('2026-10-09T12:03:00.500Z')
    expect(desdeConMargen('2026-10-09T12:05:00.500000+00:00')).toBe('2026-10-09T12:03:00.500Z')
    expect(desdeConMargen(undefined)).toBeNull()
    expect(MARGEN_CURSOR_MS).toBe(120_000)
  })

  it('el margen vuelve a pedir lo reciente pero no duplica registros', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    servidor.poner('hoja', filaHoja('h1'), '2026-10-09T12:00:00.000000+00:00')
    servidor.poner('hoja', filaHoja('h2'), '2026-10-09T12:00:30.000000+00:00')
    const a = await descargarTodo(db, servidor)
    const b = await descargarTodo(db, servidor) // ambas están dentro del margen: se piden otra vez
    expect(b.recibidos).toBe(2)
    expect(a.recibidos).toBe(2)
    expect(await db.hojas.count()).toBe(2)
    expect(await db.cola.count()).toBe(0)
  })

  it('un cambio confirmado tarde (server_updated_at un minuto antes del cursor) se descarga igual', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    servidor.poner('hoja', filaHoja('h1'), '2026-10-09T12:10:00.000000+00:00')
    await descargarTodo(db, servidor)
    servidor.poner('hoja', filaHoja('h2'), '2026-10-09T12:09:00.000000+00:00') // un minuto ANTES del cursor
    await descargarTodo(db, servidor)
    expect(await db.hojas.get('h2')).toBeDefined()
  })

  it('los registros eliminados también se descargan y se aplican', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    servidor.poner('hoja', filaHoja('h1'), '2026-10-09T12:00:00.000000+00:00')
    await descargarTodo(db, servidor)
    servidor.poner('hoja', filaHoja('h1', { eliminado: true, updated_at: '2026-10-09T12:30:00+00:00' }), '2026-10-09T12:31:00.000000+00:00')
    await descargarTodo(db, servidor)
    expect((await db.hojas.get('h1'))!.eliminado).toBe(true)
  })

  it('pagina de a 1000', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    for (let i = 0; i < 2300; i++) servidor.poner('hoja', filaHoja(`h${String(i).padStart(5, '0')}`), new Date(Date.parse('2026-10-09T12:00:00Z') + i * 1000).toISOString())
    await descargarTodo(db, servidor)
    expect(await db.hojas.count()).toBe(2300)
    const llamadas = servidor.llamadas.filter((l) => l.tipo === 'descargar' && (l.detalle as { entidad: string }).entidad === 'hoja').map((l) => l.detalle as { despuesDe: { id: string; server_updated_at: string } | null; limite: number })
    expect(llamadas.map((l) => l.limite)).toEqual([1000, 1000, 1000])
    // La primera página no tiene llave; las siguientes siguen de la última fila recibida, con su marca exacta.
    expect(llamadas[0].despuesDe).toBeNull()
    expect(llamadas[1].despuesDe?.id).toBe('h00999')
    expect(llamadas[2].despuesDe?.id).toBe('h01999')
    expect(llamadas[1].despuesDe?.server_updated_at).toBe(new Date(Date.parse('2026-10-09T12:00:00Z') + 999 * 1000).toISOString())
  })

  it('si una fila YA descargada se modifica entre una página y otra, ninguna fila se omite', async () => {
    const db = nuevaBase()
    let paginasPedidas = 0
    const servidor = servidorFalso({
      alDescargar: ({ entidad }) => {
        if (entidad !== 'hoja') return
        paginasPedidas++
        // Justo antes de la página 2, otro dispositivo modifica la primera fila: sube su server_updated_at y pasa al final.
        if (paginasPedidas === 2) servidor.poner('hoja', filaHoja('h000', { grado_gauhl: 6, updated_at: '2026-10-09T13:00:00+00:00' }), '2026-10-09T13:00:00.000001+00:00')
      },
    })
    for (let i = 0; i < 35; i++) servidor.poner('hoja', filaHoja(`h${String(i).padStart(3, '0')}`), new Date(Date.parse('2026-10-09T12:00:00Z') + i * 1000).toISOString())
    await descargarTodo(db, servidor, Date.now, 10)
    const ids = (await db.hojas.toArray()).map((h) => h.id).sort()
    expect(ids).toHaveLength(35)
    expect(ids[34]).toBe('h034') // con paginación por posición, la fila 11 (h010) se habría quedado sin descargar
    expect((await db.hojas.get('h010'))).toBeDefined()
    // La fila modificada también llegó (al final) con su valor nuevo.
    expect((await db.hojas.get('h000'))!.grado_gauhl).toBe(6)
  })

  it('filas con el mismo server_updated_at no se pierden entre páginas (desempata el id)', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    for (let i = 0; i < 25; i++) servidor.poner('hoja', filaHoja(`h${String(i).padStart(3, '0')}`), '2026-10-09T12:00:00.123456+00:00')
    await descargarTodo(db, servidor, Date.now, 10)
    expect(await db.hojas.count()).toBe(25)
  })

  it('compara las marcas con precisión de microsegundos', () => {
    expect(compararMarcas('2026-10-09T12:00:00.000001+00:00', '2026-10-09T12:00:00.000002+00:00')).toBe(-1)
    expect(compararMarcas('2026-10-09T12:00:00.1+00:00', '2026-10-09T12:00:00.100000+00:00')).toBe(0)
    expect(compararMarcas('2026-10-09T12:00:01Z', '2026-10-09T12:00:00.999999+00:00')).toBe(1)
  })
})

describe('el reloj local con marcas remotas', () => {
  const fila = (updated_at: string) => ({
    id: 'h1', rancho_id: 'r', planta_id: 'p', numero_hoja: 1, grado_gauhl: 2, eliminado: false, created_at: updated_at, updated_at,
  })

  it('avanza hasta el updated_at remoto más alto, así la siguiente edición local lo supera', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    const futuro = new Date(Date.now() + 2 * 3_600_000).toISOString() // 2 h adelante: dentro de las 24 h
    const servidor = servidorFalso()
    servidor.poner('hoja', { ...fila(futuro), id: 'remota' })
    const d = await descargarTodo(db, servidor)
    expect(d.aviso).toBeNull()
    const editada = await s.plantas.calificarHoja(hoja.id, 3)
    expect(editada.updated_at > futuro).toBe(true)
  })

  it('con una marca de 2 días en el futuro NO avanza y deja un aviso', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { planta } = await recorridoConPlanta(s)
    const [hoja] = await hojasVivas(db, planta.id)
    const dosDias = new Date(Date.now() + 48 * 3_600_000).toISOString()
    const servidor = servidorFalso()
    servidor.poner('hoja', { ...fila(dosDias), id: 'remota' })
    const d = await descargarTodo(db, servidor)
    expect(d.aviso).toMatch(/24 h en el futuro/)
    const editada = await s.plantas.calificarHoja(hoja.id, 3)
    expect(editada.updated_at < dosDias).toBe(true)
  })
})

describe('espera creciente', () => {
  it('5 s, 15 s, 1 min, 5 min y de ahí en adelante 5 min', () => {
    expect(ESPERAS_MS).toEqual([5_000, 15_000, 60_000, 300_000])
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => esperaTrasFallo(n))).toEqual([5_000, 15_000, 60_000, 300_000, 300_000, 300_000, 300_000])
  })

  it('el motor programa cada reintento con la espera que toca y se recupera al volver el servidor', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    let funciona = false
    const servidor = servidorFalso({ alAplicar: () => { if (!funciona) throw new Error('sin servidor') } })
    let ahora = 1_000_000
    const programadas: Array<{ fn: () => void; ms: number }> = []
    const motor = crearMotor({ db, servidor, ahora: () => ahora, programar: (fn, ms) => { programadas.push({ fn, ms }); return () => undefined }, enLinea: () => true })

    await motor.sincronizar()
    expect(motor.obtenerEstado().ultimoError).toBe('sin servidor')
    expect(programadas.at(-1)!.ms).toBe(5_000)
    // Durante la espera, los disparadores automáticos no insisten.
    const llamadasAntes = servidor.llamadas.length
    await motor.sincronizar()
    expect(servidor.llamadas.length).toBe(llamadasAntes)

    ahora += 5_001
    await motor.sincronizar()
    expect(programadas.at(-1)!.ms).toBe(15_000)
    ahora += 15_001
    await motor.sincronizar()
    expect(programadas.at(-1)!.ms).toBe(60_000)
    ahora += 60_001
    await motor.sincronizar()
    expect(programadas.at(-1)!.ms).toBe(300_000)
    ahora += 300_001
    await motor.sincronizar()
    expect(programadas.at(-1)!.ms).toBe(300_000)

    // "Sincronizar ahora" ignora la espera; con el servidor de vuelta, todo se envía y la espera se reinicia.
    funciona = true
    await motor.sincronizar({ ignorarEspera: true })
    expect(motor.obtenerEstado().ultimoError).toBeNull()
    expect(motor.obtenerEstado().ultima).not.toBeNull()
    expect(await db.cola.count()).toBe(0)
    motor.detener()
  })
})

describe('una sola sincronización a la vez', () => {
  it('llamadas simultáneas comparten la misma sincronización', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    let liberar!: () => void
    const detenida = new Promise<void>((ok) => { liberar = ok })
    const servidor = servidorFalso({ alAplicar: () => detenida })
    const motor = crearMotor({ db, servidor, enLinea: () => true })
    const a = motor.sincronizar()
    const b = motor.sincronizar({ ignorarEspera: true })
    const c = motor.sincronizar()
    expect(motor.obtenerEstado().sincronizando).toBe(true)
    liberar()
    await Promise.all([a, b, c])
    expect(servidor.llamadas.filter((l) => l.tipo === 'aplicar')).toHaveLength(1)
    expect(servidor.llamadas.filter((l) => l.tipo === 'descargar')).toHaveLength(ORDEN_DESCARGA.length)
    expect(motor.obtenerEstado().sincronizando).toBe(false)
    motor.detener()
  })

  it('sin conexión no se intenta nada', async () => {
    const db = nuevaBase()
    const servidor = servidorFalso()
    const motor = crearMotor({ db, servidor, enLinea: () => false })
    await motor.sincronizar({ ignorarEspera: true })
    expect(servidor.llamadas).toHaveLength(0)
    motor.detener()
  })

  it('sin sesión (servidor nulo) no se hace ninguna llamada y el modo es "solo_local"', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    await recorridoConPlanta(s)
    const motor = crearMotor({ db, servidor: null, enLinea: () => true })
    expect(motor.obtenerEstado().modo).toBe('solo_local')
    await motor.sincronizar({ ignorarEspera: true })
    expect(await db.cola.count()).toBeGreaterThan(0) // nada salió
    await expect(motor.descartarRechazo({ entidad: 'hojas', registro_id: 'x' })).rejects.toThrow('Sin sesión')
    motor.detener()
  })

  it('5 s después de la última escritura local programa una sincronización', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const programadas: Array<{ ms: number }> = []
    const motor = crearMotor({ db, servidor: servidorFalso(), programar: (_fn, ms) => { programadas.push({ ms }); return () => undefined }, enLinea: () => true })
    await recorridoConPlanta(s)
    expect(programadas.some((p) => p.ms === 5_000)).toBe(true)
    motor.detener()
  })
})

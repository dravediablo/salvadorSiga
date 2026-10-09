// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hf, iiPlanta, resumen, type GradoGauhl, type PoligonoKml } from '@/dominio'
import { consultas as crearConsultasReales } from './index'
import { contarPendientes, esperarEscrituras, listarPendientes } from './cola'
import { crearConsultas } from './consultas'
import { ENTIDADES, SigatokaDB } from './db'
import { leerPoligonos } from './importarKmz'
import { crearRepoPlantas } from './repos/plantas'
import { crearRepoRancho } from './repos/rancho'
import { crearRepoRecorridos } from './repos/recorridos'
import { crearRepoTablas } from './repos/tablas'
import { crearSesion } from './sesion'

void crearConsultasReales // fuerza a que el índice cargue sin errores (crea la base real, vacía)

let contador = 0
const abiertas: SigatokaDB[] = []
function nuevaBase(nombre = `prueba-${++contador}-${Math.random().toString(36).slice(2)}`): SigatokaDB {
  const db = new SigatokaDB(nombre)
  abiertas.push(db)
  return db
}

const kmz = (): Uint8Array => new Uint8Array(readFileSync(resolve(process.cwd(), 'src/datos/__fixtures__/sintetico.kmz')))

async function sembrar(db: SigatokaDB) {
  const poligonos = await leerPoligonos(kmz(), 'sintetico.kmz')
  const rancho = crearRepoRancho(db)
  const { rancho: r, usuarios, membresias, omitidas } = await rancho.configurarInicial({ nombre: 'Rancho de prueba', poligonos })
  const tablas = (await db.tablas.toArray()).sort((a, b) => a.codigo.localeCompare(b.codigo))
  return {
    rancho: r,
    omitidas,
    usuarios,
    membresias,
    tablas,
    recorridos: crearRepoRecorridos(db),
    plantas: crearRepoPlantas(db),
    repoTablas: crearRepoTablas(db),
    consultas: crearConsultas(db),
  }
}

async function nuevaPlantaConGrados(s: Awaited<ReturnType<typeof sembrar>>, evaluacionId: string, grados: GradoGauhl[]) {
  const { planta, hojas } = await s.plantas.crear(evaluacionId)
  await s.plantas.cambiarTotalHojas(planta.id, grados.length)
  const actuales = (await s.consultas.plantasConHojas(evaluacionId)).find((x) => x.planta.id === planta.id)!.hojas
  void hojas
  for (let i = 0; i < grados.length; i++) await s.plantas.calificarHoja(actuales[i].id, grados[i])
  return planta
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(async () => {
  for (const db of abiertas.splice(0)) {
    await esperarEscrituras(db)
    db.close()
  }
})

describe('configuración inicial', () => {
  it('crea rancho, 3 usuarios con membresías y las tablas del KMZ sintético (sin las franjas buffer)', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    expect(s.usuarios.map((u) => u.nombre)).toEqual(['Propietario', 'Operador 1', 'Operador 2'])
    expect(s.membresias.map((m) => m.rol)).toEqual(['administrador', 'operador', 'operador'])
    expect(s.membresias.every((m) => m.rancho_id === s.rancho.id && m.activo)).toBe(true)
    expect(s.tablas.map((t) => t.codigo)).toEqual(['1', '2', '3'])
    expect(s.tablas.every((t) => t.activa)).toBe(true)
    expect(await db.tablas.count()).toBe(3) // los 2 buffer del archivo no entraron
    expect(s.omitidas).toEqual(['Tabla 2A Buffer 0.30', 'Tabla 3 BUFFER 0.20'])
    expect(s.tablas.every((t) => t.origen === 'kmz' && t.geometria?.type === 'Polygon' && (t.superficie_ha ?? 0) > 0)).toBe(true)
  })
  it('no permite configurar dos veces ni sin nombre', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const otra = crearRepoRancho(db)
    await expect(otra.configurarInicial({ nombre: 'Otro', poligonos: [] })).rejects.toThrow('ya tiene un rancho')
    const vacia = crearRepoRancho(nuevaBase())
    await expect(vacia.configurarInicial({ nombre: '  ', poligonos: [] })).rejects.toThrow('nombre del rancho')
    expect(s.rancho.nombre).toBe('Rancho de prueba')
  })
})

describe('recorridos y cola de pendientes', () => {
  it('crear un recorrido con 3 tablas crea 3 evaluaciones y sus entradas en la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const antes = (await listarPendientes(db)).length
    const { recorrido, evaluaciones } = await s.recorridos.crear({
      rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: s.tablas.map((t) => t.id),
    })
    expect(recorrido).toMatchObject({ semana_iso: '2026-W41', estado: 'en_curso' })
    expect(evaluaciones).toHaveLength(3)
    expect(await db.evaluaciones.count()).toBe(3)
    const nuevas = (await listarPendientes(db)).slice(antes)
    expect(nuevas.map((p) => p.entidad)).toEqual(['recorridos', 'evaluaciones', 'evaluaciones', 'evaluaciones'])
    expect(nuevas.map((p) => p.registro_id)).toEqual([recorrido.id, ...evaluaciones.map((e) => e.id)])
    expect(nuevas.every((p) => p.updated_at)).toBe(true)
  })

  it('agregar tablas ignora las que ya están', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { recorrido } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const nuevas = await s.recorridos.agregarTablas(recorrido.id, [s.tablas[0].id, s.tablas[1].id])
    expect(nuevas).toHaveLength(1)
    expect(await db.evaluaciones.count()).toBe(2)
  })

  it('cola de una entrada por registro: cada registro modificado tiene exactamente una, con su updated_at', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { recorrido, evaluaciones } = await s.recorridos.crear({
      rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id, s.tablas[1].id],
    })
    const p = await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 1, 2, 3])
    // Muchas escrituras al mismo registro no deben multiplicar sus entradas.
    for (let i = 0; i < 5; i++) await s.plantas.actualizar(p.id, { hmj_pizca: i + 1 })
    await s.plantas.actualizar(p.id, { observaciones: 'x' })
    await s.plantas.cambiarTotalHojas(p.id, 2)
    await s.recorridos.terminarTabla(evaluaciones[0].id)
    await s.repoTablas.editar(s.tablas[0].id, { variedad: 'Gran Enano' })
    await s.recorridos.cerrar(recorrido.id)
    await s.recorridos.reabrir(recorrido.id)
    await s.plantas.eliminar(p.id)
    await s.recorridos.eliminar(recorrido.id)

    const cola = await listarPendientes(db)
    let registros = 0
    for (const entidad of ENTIDADES) {
      for (const fila of await db.table(entidad).toArray()) {
        registros++
        const suyas = cola.filter((c) => c.entidad === entidad && c.registro_id === fila.id)
        expect(suyas, `${entidad}/${fila.id}: debe haber exactamente una entrada`).toHaveLength(1)
        expect(suyas[0].updated_at, `${entidad}/${fila.id}`).toBe(fila.updated_at)
      }
    }
    // Ninguna entrada huérfana: la cola y los registros son uno a uno.
    expect(cola).toHaveLength(registros)
    expect(await contarPendientes(db)).toBe(registros)
  })

  it('la entrada de un registro se sobrescribe con el updated_at más reciente (la cola no crece)', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const { planta } = await s.plantas.crear(evaluaciones[0].id)
    const antes = await contarPendientes(db)
    const marcas: string[] = []
    for (let i = 0; i < 4; i++) marcas.push((await s.plantas.actualizar(planta.id, { hmj_pizca: i + 1 })).updated_at)
    expect(await contarPendientes(db)).toBe(antes)
    expect(await db.cola.get(['plantas', planta.id])).toEqual({ entidad: 'plantas', registro_id: planta.id, updated_at: marcas[3] })
    expect(new Set(marcas).size).toBe(4)
  })

  it('una transacción que falla a la mitad no deja ni el cambio ni la entrada en la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const colaAntes = (await listarPendientes(db)).length
    const original = db.cola.put.bind(db.cola)
    let llamadas = 0
    vi.spyOn(db.cola, 'put').mockImplementation(((...args: Parameters<typeof original>) => {
      // La 1.ª (recorrido) y la 2.ª (primera evaluación) pasan; la 3.ª falla a la mitad.
      if (++llamadas === 3) return Promise.reject(new Error('fallo simulado'))
      return original(...args)
    }) as typeof original)
    await expect(
      s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: s.tablas.map((t) => t.id) }),
    ).rejects.toThrow('fallo simulado')
    expect(await db.recorridos.count()).toBe(0)
    expect(await db.evaluaciones.count()).toBe(0)
    expect((await listarPendientes(db)).length).toBe(colaAntes)

    // La base sigue usable y en orden después del fallo.
    vi.restoreAllMocks()
    const ok = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    expect(ok.evaluaciones).toHaveLength(1)
  })

  it('si falla la entrada de la cola tampoco queda el registro', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const colaAntes = (await listarPendientes(db)).length
    // Falla la entrada de la cola justo después de escribir el registro: el registro también debe deshacerse.
    vi.spyOn(db.cola, 'put').mockRejectedValue(new Error('disco lleno'))
    await expect(
      s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] }),
    ).rejects.toThrow('disco lleno')
    expect((await listarPendientes(db)).length).toBe(colaAntes)
    expect(await db.recorridos.count()).toBe(0)
  })

  it('las escrituras llegan en el orden pedido aunque nadie espere a la anterior', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const { hojas } = await s.plantas.crear(evaluaciones[0].id)
    const colaAntes = (await listarPendientes(db)).length
    const promesas: Promise<unknown>[] = []
    for (let g = 0; g < 14; g++) promesas.push(s.plantas.calificarHoja(hojas[0].id, (g % 7) as GradoGauhl))
    await Promise.all(promesas)
    expect((await db.hojas.get(hojas[0].id))?.grado_gauhl).toBe(6) // 13 % 7
    const nuevas = (await listarPendientes(db)).slice(colaAntes)
    // Las 14 escrituras son al mismo registro: una sola entrada, con la marca de la última.
    expect(nuevas).toHaveLength(0)
    expect(await db.cola.get(['hojas', hojas[0].id])).toMatchObject({ updated_at: (await db.hojas.get(hojas[0].id))?.updated_at })
  })
})

describe('plantas y hojas: cambio de TH', () => {
  async function planta10() {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const evId = evaluaciones[0].id
    const planta = await nuevaPlantaConGrados(s, evId, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2])
    return { db, s, evId, planta }
  }
  const vivas = async (db: SigatokaDB, plantaId: string) =>
    (await db.hojas.where('planta_id').equals(plantaId).toArray()).filter((h) => !h.eliminado).sort((a, b) => a.numero_hoja - b.numero_hoja)

  it('una planta nueva hereda el TH de la anterior y arranca sin calificar', async () => {
    const { s, evId } = await planta10()
    const { planta, hojas } = await s.plantas.crear(evId)
    expect(planta.numero_planta).toBe(2)
    expect(planta.total_hojas).toBe(10)
    expect(hojas).toHaveLength(10)
    expect(hojas.every((h) => h.grado_gauhl === null)).toBe(true)
    expect(planta).toMatchObject({ hmj_pizca: null, hmj_estria: null, hmj_mancha: null })
  })

  it('al bajar el TH, las hojas mayores se marcan eliminadas y las demás conservan su grado', async () => {
    const { db, s, planta } = await planta10()
    await s.plantas.cambiarTotalHojas(planta.id, 8)
    const hs = await vivas(db, planta.id)
    expect(hs.map((h) => h.numero_hoja)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(hs.map((h) => h.grado_gauhl)).toEqual([0, 1, 2, 3, 4, 5, 6, 0])
    const eliminadas = (await db.hojas.where('planta_id').equals(planta.id).toArray()).filter((h) => h.eliminado)
    expect(eliminadas.map((h) => h.numero_hoja).sort()).toEqual([10, 9])
    expect((await db.plantas.get(planta.id))?.total_hojas).toBe(8)
  })

  it('al subir el TH, revive las eliminadas con su id y sin calificar; crea solo las que nunca existieron', async () => {
    const { db, s, planta } = await planta10()
    const originales = new Map((await vivas(db, planta.id)).map((h) => [h.numero_hoja, h.id]))
    await s.plantas.cambiarTotalHojas(planta.id, 8)
    await s.plantas.cambiarTotalHojas(planta.id, 12)
    const hs = await vivas(db, planta.id)
    expect(hs.map((h) => h.numero_hoja)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(hs[8].id).toBe(originales.get(9))
    expect(hs[9].id).toBe(originales.get(10))
    expect(hs[8].grado_gauhl).toBeNull()
    expect(hs[9].grado_gauhl).toBeNull()
    expect(hs[10].grado_gauhl).toBeNull()
    expect(originales.has(11)).toBe(false)
    expect(hs.slice(0, 8).map((h) => h.grado_gauhl)).toEqual([0, 1, 2, 3, 4, 5, 6, 0])
    // 10 originales + 2 nuevas (11 y 12): ninguna hoja se duplicó.
    expect(await db.hojas.where('planta_id').equals(planta.id).count()).toBe(12)
  })

  it('invariante: nunca hay dos hojas vivas con el mismo [planta_id+numero_hoja] (secuencia aleatoria)', async () => {
    const { db, s, planta } = await planta10()
    let semilla = 7
    const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296)
    for (let i = 0; i < 40; i++) {
      const th = 1 + Math.floor(azar() * 16)
      await s.plantas.cambiarTotalHojas(planta.id, th)
      const hs = await vivas(db, planta.id)
      expect(hs.map((h) => h.numero_hoja)).toEqual(Array.from({ length: th }, (_, k) => k + 1))
      const pares = (await db.hojas.where('[planta_id+numero_hoja]').between([planta.id, 0], [planta.id, 99]).toArray()).filter((h) => !h.eliminado)
      expect(new Set(pares.map((h) => h.numero_hoja)).size).toBe(pares.length)
    }
    expect(await db.hojas.where('planta_id').equals(planta.id).count()).toBeLessThanOrEqual(16)
  })

  it('rechaza un TH inválido', async () => {
    const { s, planta } = await planta10()
    await expect(s.plantas.cambiarTotalHojas(planta.id, 0)).rejects.toThrow('mayor que cero')
    await expect(s.plantas.cambiarTotalHojas(planta.id, 3.5)).rejects.toThrow('entero')
  })
})

describe('borrado lógico en cascada', () => {
  it('eliminar una planta elimina sus hojas y nada se borra físicamente', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const a = await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 1, 2])
    const b = await nuevaPlantaConGrados(s, evaluaciones[0].id, [3, 4, 5])
    await s.plantas.eliminar(a.id)
    expect((await db.plantas.get(a.id))?.eliminado).toBe(true)
    expect((await db.hojas.where('planta_id').equals(a.id).toArray()).every((h) => h.eliminado)).toBe(true)
    expect((await db.hojas.where('planta_id').equals(b.id).toArray()).every((h) => !h.eliminado)).toBe(true)
    // Las 3 hojas de la planta (más 7 sobrantes del TH 10 inicial) siguen físicamente en la base.
    expect(await db.hojas.where('planta_id').equals(a.id).count()).toBe(10)
    expect((await s.consultas.plantasConHojas(evaluaciones[0].id)).map((x) => x.planta.id)).toEqual([b.id])
  })

  it('eliminar un recorrido elimina evaluaciones, plantas y hojas', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { recorrido, evaluaciones } = await s.recorridos.crear({
      rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id, s.tablas[1].id],
    })
    await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 1, 2])
    await nuevaPlantaConGrados(s, evaluaciones[1].id, [3, 4])
    await s.recorridos.eliminar(recorrido.id)
    for (const tabla of ['recorridos', 'evaluaciones', 'plantas', 'hojas'] as const) {
      const filas = await db.table(tabla).toArray()
      expect(filas.length).toBeGreaterThan(0)
      expect(filas.every((f: { eliminado: boolean }) => f.eliminado), tabla).toBe(true)
    }
    expect(await s.consultas.tarjetasRecorridos()).toEqual([])
    expect(await s.consultas.detalleRecorrido(recorrido.id)).toBeUndefined()
  })
})

describe('persistencia y cálculos', () => {
  it('los datos persisten al abrir una nueva instancia de la base', async () => {
    const nombre = `persistente-${Math.random().toString(36).slice(2)}`
    const db1 = nuevaBase(nombre)
    const s = await sembrar(db1)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 2, 4])
    const colaAntes = await contarPendientes(db1)
    await esperarEscrituras(db1)
    db1.close()

    const db2 = nuevaBase(nombre)
    const c = crearConsultas(db2)
    expect((await c.rancho())?.nombre).toBe('Rancho de prueba')
    expect(await contarPendientes(db2)).toBe(colaAntes)
    const plantas = await c.plantasConHojas(evaluaciones[0].id)
    expect(plantas).toHaveLength(1)
    expect(plantas[0].hojas.map((h) => h.grado_gauhl)).toEqual([0, 2, 4])
  })

  it('el II de una tabla leído de la base coincide con los casos conocidos del dominio', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id, s.tablas[1].id] })
    // Caso de la tarea 4 del hito 1: A [0,0,6] y B [0,0,0,0,0,0] → 11,11 (no 16,67).
    await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 0, 6])
    await nuevaPlantaConGrados(s, evaluaciones[0].id, [0, 0, 0, 0, 0, 0])
    const tabla = await s.consultas.plantasConHojas(evaluaciones[0].id)
    expect(resumen(tabla).ii).toBeCloseTo(11.11, 2)
    expect(resumen(tabla).hojas_evaluadas).toBe(9)
    // Planta [0,0,0,1,2,3,3,4,5,6] → II 40 y HF 8.
    await nuevaPlantaConGrados(s, evaluaciones[1].id, [0, 0, 0, 1, 2, 3, 3, 4, 5, 6])
    const [x] = await s.consultas.plantasConHojas(evaluaciones[1].id)
    expect(iiPlanta(x.hojas)).toBeCloseTo(40, 2)
    expect(hf(x.hojas)).toBe(8)
  })

  it('una hoja sin calificar queda fuera del II (planta [0, 2, sin calificar] → 16,67)', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const { evaluaciones } = await s.recorridos.crear({ rancho_id: s.rancho.id, fecha: '2026-10-09', usuario_id: s.usuarios[1].id, tabla_ids: [s.tablas[0].id] })
    const { planta } = await s.plantas.crear(evaluaciones[0].id)
    await s.plantas.cambiarTotalHojas(planta.id, 3)
    const [{ hojas }] = await s.consultas.plantasConHojas(evaluaciones[0].id)
    await s.plantas.calificarHoja(hojas[0].id, 0)
    await s.plantas.calificarHoja(hojas[1].id, 2)
    const [x] = await s.consultas.plantasConHojas(evaluaciones[0].id)
    expect(iiPlanta(x.hojas)).toBeCloseTo(16.67, 2)
  })
})

describe('tablas: importar y reimportar', () => {
  const pol = (nombre: string): PoligonoKml => ({
    nombre,
    anillo: [[-103.5, 18.5], [-103.497, 18.5], [-103.497, 18.498], [-103.5, 18.5]],
  })

  it('reimportar actualiza por código, desactiva las que faltan y nunca elimina', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const antes = await db.tablas.count()
    const r = await s.repoTablas.importar(s.rancho.id, [pol('Tabla 1. Sup. 1 ha.'), pol('Tabla 7. Sup. 2 ha.')], { desactivarFaltantes: true })
    expect(r).toMatchObject({ nuevas: 1, actualizadas: 1, desactivadas: 2 })
    const todas = await db.tablas.toArray()
    expect(todas).toHaveLength(antes + 1)
    expect(todas.every((t) => !t.eliminado)).toBe(true)
    const porCodigo = Object.fromEntries(todas.map((t) => [t.codigo, t]))
    expect(porCodigo['1'].activa).toBe(true)
    expect(porCodigo['2'].activa).toBe(false) // no venía en el archivo
    expect(porCodigo['3'].activa).toBe(false)
    expect(porCodigo['7'].activa).toBe(true)
    expect(porCodigo['1'].id).toBe(s.tablas.find((t) => t.codigo === '1')!.id) // mismo id, se actualizó
  })

  it('sin la opción, las que faltan siguen activas', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const r = await s.repoTablas.importar(s.rancho.id, [pol('Tabla 1.')], { desactivarFaltantes: false })
    expect(r.desactivadas).toBe(0)
    expect((await db.tablas.toArray()).find((t) => t.codigo === '2')?.activa).toBe(true)
  })

  it('reimportar actualiza solo geometría y nombre: conserva superficie, variedad y estado', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const uno = s.tablas.find((t) => t.codigo === '1')!
    await s.repoTablas.editar(uno.id, { superficie_ha: 6.82, variedad: 'Gran Enano', activa: false })
    const r = await s.repoTablas.importar(s.rancho.id, [pol('Tabla 1. Nombre nuevo')], { desactivarFaltantes: false })
    const despues = (await db.tablas.get(uno.id))!
    expect(despues.nombre).toBe('Tabla 1. Nombre nuevo')
    expect(despues.geometria).not.toEqual(uno.geometria)
    expect(despues.superficie_ha).toBe(6.82)
    expect(despues.variedad).toBe('Gran Enano')
    expect(despues.activa).toBe(false) // no se reactiva sola
    // El polígono de prueba mide ~3,5 ha frente a 6,82 guardadas: se informa, sin aplicarlo.
    expect(r.cambiosSuperficie).toHaveLength(1)
    expect(r.cambiosSuperficie[0]).toMatchObject({ tabla_id: uno.id, codigo: '1', guardada: 6.82 })
    expect(r.cambiosSuperficie[0].poligono).not.toBe(6.82)
    expect(r.cambiosSuperficie[0].diferencia).toBeGreaterThan(0.05)
  })

  it('no avisa cuando la superficie del polígono difiere 5 % o menos; aplicar la nueva es una edición normal', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const uno = s.tablas.find((t) => t.codigo === '1')!
    const poligonos = await leerPoligonos(kmz(), 'sintetico.kmz')
    // Mismo archivo: superficies idénticas a las guardadas → nada que avisar.
    const igual = await s.repoTablas.importar(s.rancho.id, poligonos, { desactivarFaltantes: false })
    expect(igual.cambiosSuperficie).toEqual([])
    await s.repoTablas.editar(uno.id, { superficie_ha: (uno.superficie_ha ?? 0) * 1.04 })
    expect((await s.repoTablas.importar(s.rancho.id, poligonos, { desactivarFaltantes: false })).cambiosSuperficie).toEqual([])
    await s.repoTablas.editar(uno.id, { superficie_ha: (uno.superficie_ha ?? 0) * 1.5 })
    const r = await s.repoTablas.importar(s.rancho.id, poligonos, { desactivarFaltantes: false })
    expect(r.cambiosSuperficie.map((c) => c.codigo)).toEqual(['1'])
    expect((await db.tablas.get(uno.id))?.superficie_ha).toBeCloseTo((uno.superficie_ha ?? 0) * 1.5, 5) // sin aplicar
    await s.repoTablas.editar(uno.id, { superficie_ha: r.cambiosSuperficie[0].poligono }) // "aplicar la nueva"
    expect((await db.tablas.get(uno.id))?.superficie_ha).toBe(uno.superficie_ha)
  })

  it('reimportar el KMZ sintético lista los buffer como omitidos y no crea tablas', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const r = await s.repoTablas.importar(s.rancho.id, await leerPoligonos(kmz(), 'sintetico.kmz'), { desactivarFaltantes: true })
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 3, desactivadas: 0, buffersEliminados: 0 })
    expect(r.omitidas).toEqual(['Tabla 2A Buffer 0.30', 'Tabla 3 BUFFER 0.20'])
    expect(await db.tablas.count()).toBe(3)
  })

  it('reimportar da de baja (eliminado = true) las tablas buffer que ya existían, con su entrada en la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    // Una tabla buffer importada por una versión anterior de la app.
    const buffer = { ...s.tablas[0], id: crypto.randomUUID(), codigo: '2A buffer', nombre: 'Tabla 2A Buffer 0.30', activa: false }
    await db.tablas.put(buffer)
    const r = await s.repoTablas.importar(s.rancho.id, [pol('Tabla 1.')], { desactivarFaltantes: false })
    expect(r.buffersEliminados).toBe(1)
    const despues = (await db.tablas.get(buffer.id))!
    expect(despues.eliminado).toBe(true)
    expect(await db.cola.get(['tablas', buffer.id])).toMatchObject({ updated_at: despues.updated_at })
  })

  it('editar una tabla guarda el cambio y lo manda a la cola', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const antes = (await listarPendientes(db)).length
    await s.repoTablas.editar(s.tablas[0].id, { variedad: 'Gran Enano', superficie_ha: 7.5, activa: false })
    expect(await db.tablas.get(s.tablas[0].id)).toMatchObject({ variedad: 'Gran Enano', superficie_ha: 7.5, activa: false })
    // La tabla ya estaba en la cola: la entrada se sobrescribe con el updated_at nuevo.
    expect((await listarPendientes(db)).length).toBe(antes)
    expect(await db.cola.get(['tablas', s.tablas[0].id])).toMatchObject({ updated_at: (await db.tablas.get(s.tablas[0].id))?.updated_at })
  })
})

describe('importar KMZ', () => {
  it('lee los 5 polígonos del KMZ sintético (3 tablas y 2 buffer; los buffer se omiten al importar)', async () => {
    const p = await leerPoligonos(kmz(), 'sintetico.kmz')
    expect(p.map((x) => x.nombre)).toEqual(['Tabla 1. Sup. 6.8 ha.', 'tabla 2. Sup. 5.1 ha.', 'Tabla 3. Sup. 4.2 ha.', 'Tabla 2A Buffer 0.30', 'Tabla 3 BUFFER 0.20'])
    expect(p.every((x) => x.anillo.length === 5)).toBe(true)
  })
  it('acepta un KML suelto', async () => {
    const kml = '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>T</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 0,1 1,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>'
    expect((await leerPoligonos(new TextEncoder().encode(kml), 'x.kml'))[0].nombre).toBe('T')
  })
  it('acepta un Blob', async () => {
    const p = await leerPoligonos(new Blob([kmz().slice().buffer]), 'sintetico.kmz')
    expect(p).toHaveLength(5)
  })
  it('un KMZ dañado o sin KML da un error en español', async () => {
    await expect(leerPoligonos(new Uint8Array([1, 2, 3]), 'malo.kmz')).rejects.toThrow('dañado')
    const JSZip = (await import('jszip')).default
    const vacio = await new JSZip().file('nota.txt', 'hola').generateAsync({ type: 'uint8array' })
    await expect(leerPoligonos(vacio, 'vacio.kmz')).rejects.toThrow('no contiene un archivo KML')
  })
})

describe('sesión simulada', () => {
  it('por defecto el primer usuario (administrador); fijar cambia el usuario actual', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const sesion = crearSesion(db)
    expect((await sesion.actual())?.membresia.rol).toBe('administrador')
    await sesion.fijar(s.usuarios[2].id)
    expect((await sesion.actual())?.usuario.nombre).toBe('Operador 2')
    expect((await sesion.disponibles()).map((x) => x.usuario.nombre)).toEqual(['Propietario', 'Operador 1', 'Operador 2'])
    await sesion.fijar('no-existe')
    expect((await sesion.actual())?.usuario.nombre).toBe('Propietario')
  })
  it('sin rancho no hay usuario', async () => {
    expect(await crearSesion(nuevaBase()).actual()).toBeNull()
  })
  it('cambiar de usuario no entra en la cola de pendientes', async () => {
    const db = nuevaBase()
    const s = await sembrar(db)
    const antes = (await listarPendientes(db)).length
    await crearSesion(db).fijar(s.usuarios[1].id)
    expect((await listarPendientes(db)).length).toBe(antes)
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarBases } from '../pruebas.util'
import type { ItemLote, Servidor } from '../servidor'
import { claveCursor } from '../descarga'
import { crearMotor } from '../motor'
import { nuevaBase } from '../pruebas.util'
import { clienteDe, cuenta, dispositivo, limpiarCaptura, pausa, RANCHO, sql, TABLAS, USUARIOS, type Dispositivo } from './entorno'

/**
 * Integración contra Supabase local: dos (o tres) dispositivos simulados, cada uno con su base Dexie y su sesión.
 * Requiere `supabase start` y la semilla de supabase/seed.sql (`supabase db reset`).
 */

beforeAll(async () => {
  await Promise.all([clienteDe('admin'), clienteDe('op1'), clienteDe('op2')])
})
beforeEach(() => {
  limpiarCaptura()
})
afterAll(async () => {
  await cerrarBases()
})

/** Un recorrido de `tablas` tablas con `plantas` plantas de 3 hojas calificadas; opcionalmente cerrado. Todo local, sin sincronizar. */
async function capturar(d: Dispositivo, opciones: { tablas?: number; plantas?: number; cerrar?: boolean; fecha?: string } = {}) {
  const { tablas = 2, plantas = 3, cerrar = false, fecha = '2026-10-05' } = opciones
  const { recorrido, evaluaciones } = await d.recorridos.crear({ rancho_id: RANCHO, fecha, usuario_id: d.usuarioId, tabla_ids: TABLAS.slice(0, tablas) })
  const hojas: string[] = []
  for (let i = 0; i < plantas; i++) {
    const { planta } = await d.plantas.crear(evaluaciones[i % evaluaciones.length].id)
    await d.plantas.cambiarTotalHojas(planta.id, 3)
    for (const [k, h] of (await d.db.hojas.where('planta_id').equals(planta.id).toArray()).filter((x) => !x.eliminado).sort((a, b) => a.numero_hoja - b.numero_hoja).entries()) {
      await d.plantas.calificarHoja(h.id, ((i + k) % 7) as 0)
      hojas.push(h.id)
    }
  }
  if (cerrar) await d.recorridos.cerrar(recorrido.id)
  return { recorrido, evaluaciones, hojas }
}

const grado = async (d: Dispositivo, hojaId: string) => (await d.db.hojas.get(hojaId))?.grado_gauhl
const gradoServidor = (hojaId: string) => Number(sql(`select grado_gauhl from public.hoja where id = '${hojaId}'`))

describe('sincronización contra Supabase local', () => {
  it('a. op1 captura sin conexión un recorrido de 2 tablas con 3 plantas y lo cierra; al sincronizar todo se aplica y la cola queda vacía; el admin lo ve cerrado y completo', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar() // baja el rancho, las tablas y los usuarios (el dispositivo "tenía señal" al abrir)
    const { recorrido, hojas } = await capturar(op1, { tablas: 2, plantas: 3, cerrar: true })
    expect(await op1.db.cola.count()).toBeGreaterThan(10)

    await op1.sincronizar()
    expect(await op1.db.cola.count()).toBe(0)
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(cuenta('recorrido', `id = '${recorrido.id}' and estado = 'cerrado'`)).toBe(1)
    expect(cuenta('evaluacion_tabla')).toBe(2)
    expect(cuenta('planta')).toBe(3)
    expect(cuenta('hoja', 'not eliminado')).toBe(hojas.length)

    const admin = await dispositivo('admin')
    await admin.sincronizar()
    const r = await admin.db.recorridos.get(recorrido.id)
    expect(r?.estado).toBe('cerrado')
    expect(await admin.db.evaluaciones.where('recorrido_id').equals(recorrido.id).count()).toBe(2)
    expect((await admin.db.plantas.toArray()).filter((p) => !p.eliminado)).toHaveLength(3)
    expect((await admin.db.hojas.toArray()).filter((h) => !h.eliminado)).toHaveLength(hojas.length)
    expect(await admin.db.cola.count()).toBe(0)
    for (const id of hojas) expect(await grado(admin, id)).toBe(await grado(op1, id))
  })

  it('b. el admin corrige una hoja de ese recorrido; op1 recibe la corrección sin entrada nueva en su cola', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    const { hojas } = await capturar(op1, { cerrar: true })
    await op1.sincronizar()
    const admin = await dispositivo('admin')
    await admin.sincronizar()

    const hoja = hojas[0]
    const nuevo = ((await grado(admin, hoja)) as number) === 6 ? 0 : 6
    await admin.plantas.calificarHoja(hoja, nuevo as 0)
    await admin.sincronizar()
    expect(gradoServidor(hoja)).toBe(nuevo)

    await op1.sincronizar()
    expect(await grado(op1, hoja)).toBe(nuevo)
    expect(await op1.db.cola.count()).toBe(0)
    expect(await op1.db.rechazos.count()).toBe(0)
  })

  describe('c. edición concurrente de la misma hoja de un recorrido en curso, sin conexión', () => {
    const escenario = async (primero: 'op1' | 'admin', ordenes: Array<'op1' | 'admin'>) => {
      const op1 = await dispositivo('op1')
      await op1.sincronizar()
      const { hojas } = await capturar(op1, { plantas: 1, tablas: 1 })
      await op1.sincronizar()
      const admin = await dispositivo('admin')
      await admin.sincronizar()
      const hoja = hojas[0]
      const dispositivos = { op1, admin }
      const segundo = primero === 'op1' ? 'admin' : 'op1'
      await dispositivos[primero].plantas.calificarHoja(hoja, 1)
      await pausa()
      await dispositivos[segundo].plantas.calificarHoja(hoja, 5) // la marca mayor
      for (const quien of ordenes) await dispositivos[quien].sincronizar()
      return { op1, admin, hoja, ganador: 5 }
    }

    it('gana la marca mayor sincronizando op1, admin, op1, admin', async () => {
      const { op1, admin, hoja, ganador } = await escenario('op1', ['op1', 'admin', 'op1', 'admin'])
      expect(await grado(op1, hoja)).toBe(ganador)
      expect(await grado(admin, hoja)).toBe(ganador)
      expect(gradoServidor(hoja)).toBe(ganador)
      expect(await op1.db.cola.count()).toBe(0)
      expect(await admin.db.cola.count()).toBe(0)
    })

    it('gana la marca mayor sincronizando primero el admin (el cambio de op1 es el más nuevo)', async () => {
      const { op1, admin, hoja, ganador } = await escenario('admin', ['admin', 'op1', 'admin', 'op1'])
      expect(await grado(op1, hoja)).toBe(ganador)
      expect(await grado(admin, hoja)).toBe(ganador)
      expect(gradoServidor(hoja)).toBe(ganador)
    })

    it('y también cuando el más nuevo sincroniza primero y el viejo después', async () => {
      const { op1, admin, hoja, ganador } = await escenario('op1', ['admin', 'op1', 'admin', 'op1'])
      expect(await grado(op1, hoja)).toBe(ganador)
      expect(await grado(admin, hoja)).toBe(ganador)
      expect(gradoServidor(hoja)).toBe(ganador)
    })
  })

  it('d. op1 edita una hoja de un recorrido que el servidor ya tiene cerrado: se marca rechazada con motivo, la cola queda vacía y el registro local sigue; "Descartar mi cambio" deja la versión del servidor', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    const { recorrido, hojas } = await capturar(op1, { plantas: 1, tablas: 1 })
    await op1.sincronizar()

    // El admin cierra el recorrido en el servidor.
    const admin = await dispositivo('admin')
    await admin.sincronizar()
    await admin.recorridos.cerrar(recorrido.id)
    await admin.sincronizar()
    expect(cuenta('recorrido', `id = '${recorrido.id}' and estado = 'cerrado'`)).toBe(1)

    // op1 todavía no lo sabe: edita una hoja y sincroniza.
    const hoja = hojas[0]
    const delServidor = gradoServidor(hoja)
    const nuevo = delServidor === 6 ? 0 : 6
    await op1.plantas.calificarHoja(hoja, nuevo as 0)
    await op1.sincronizar()

    expect(await op1.db.cola.count()).toBe(0)
    const rechazos = await op1.db.rechazos.toArray()
    expect(rechazos).toHaveLength(1)
    expect(rechazos[0]).toMatchObject({ entidad: 'hojas', registro_id: hoja })
    expect(rechazos[0].motivo).toMatch(/cerrado/)
    expect(await grado(op1, hoja)).toBe(nuevo) // el registro local sigue (la descarga no lo pisa)
    expect(gradoServidor(hoja)).toBe(delServidor)
    await op1.sincronizar() // otra sincronización tampoco lo pisa ni lo reenvía
    expect(await grado(op1, hoja)).toBe(nuevo)
    expect(await op1.db.rechazos.count()).toBe(1)

    await op1.motor.descartarRechazo(rechazos[0])
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(await grado(op1, hoja)).toBe(delServidor)
    expect(await op1.db.cola.count()).toBe(0)
  })

  it('d2. "Reintentar envío": el admin cierra, op1 edita y es rechazado, el admin reabre, op1 reintenta → aplicado', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    const { recorrido, hojas } = await capturar(op1, { plantas: 1, tablas: 1 })
    await op1.sincronizar()
    const admin = await dispositivo('admin')
    await admin.sincronizar()

    await admin.recorridos.cerrar(recorrido.id)
    await admin.sincronizar()
    await op1.sincronizar() // op1 se entera del cierre
    const hoja = hojas[0]
    const original = gradoServidor(hoja)
    const nuevo = original === 6 ? 0 : 6
    await op1.plantas.calificarHoja(hoja, nuevo as 0)
    await op1.sincronizar()
    const rechazo = await op1.db.rechazos.get(['hojas', hoja])
    expect(rechazo?.motivo).toMatch(/cerrado/)
    expect(gradoServidor(hoja)).toBe(original)

    await admin.recorridos.reabrir(recorrido.id) // el motivo del rechazo ya no existe
    await admin.sincronizar()
    await op1.sincronizar()
    expect(await op1.db.rechazos.get(['hojas', hoja])).toBeDefined() // seguía esperando una decisión
    const marca = (await op1.db.hojas.get(hoja))!.updated_at

    await op1.motor.reintentarEnvio({ entidad: 'hojas', registro_id: hoja })
    expect(op1.motor.obtenerEstado().ultimoError).toBeNull()
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(await op1.db.cola.count()).toBe(0)
    expect(gradoServidor(hoja)).toBe(nuevo)
    expect(sql(`select updated_at from public.hoja where id = '${hoja}'`).startsWith(marca.slice(0, 10))).toBe(true)
    expect((await op1.db.hojas.get(hoja))!.updated_at).toBe(marca) // la marca no cambió
  })

  it('e0. descarga por llave: 2500 hojas y una modificación hecha por otro dispositivo a mitad de la descarga no deja ninguna sin bajar', async () => {
    const R = RANCHO
    sql(`
      insert into public.recorrido (id, created_at, updated_at, rancho_id, fecha, semana_iso, usuario_id, estado)
        values ('e0000000-0000-4000-8000-0000000000ff', now(), now(), '${R}', '2026-10-05', '2026-W41', '${USUARIOS.op1.id}', 'en_curso');
      insert into public.evaluacion_tabla (id, created_at, updated_at, rancho_id, recorrido_id, tabla_id)
        values ('e1000000-0000-4000-8000-0000000000ff', now(), now(), '${R}', 'e0000000-0000-4000-8000-0000000000ff', '${TABLAS[0]}');
      insert into public.planta (id, created_at, updated_at, rancho_id, evaluacion_tabla_id, numero_planta, total_hojas)
        select ('e2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, now(), now(), '${R}', 'e1000000-0000-4000-8000-0000000000ff', n, 25
        from generate_series(1, 100) n;
      insert into public.hoja (id, created_at, updated_at, rancho_id, planta_id, numero_hoja, grado_gauhl)
        select ('e3000000-0000-4000-8000-' || lpad((((p - 1) * 25) + h)::text, 12, '0'))::uuid, now(), now(), '${R}',
               ('e2000000-0000-4000-8000-' || lpad(p::text, 12, '0'))::uuid, h, 1
        from generate_series(1, 100) p, generate_series(1, 25) h;
    `)
    expect(cuenta('hoja')).toBe(2500)
    const primera = sql('select id from public.hoja order by server_updated_at, id limit 1') // cae en la página 1

    const op1 = await dispositivo('op1')
    await op1.sincronizar() // op1 baja las 2500
    expect((await op1.db.hojas.toArray()).length).toBe(2500)

    let paginasDeHojas = 0
    const admin = await dispositivo('admin', (real: Servidor): Servidor => ({
      ...real,
      descargar: async (entidad, desde, despuesDe, limite) => {
        if (entidad === 'hoja') {
          paginasDeHojas++
          if (paginasDeHojas === 2) {
            // Otro dispositivo modifica una fila que el admin YA recibió en la página 1: su server_updated_at sube y pasa al final.
            await op1.plantas.calificarHoja(primera, 6)
            await op1.sincronizar()
          }
        }
        return real.descargar(entidad, desde, despuesDe, limite)
      },
    }))
    await admin.sincronizar()
    expect(paginasDeHojas).toBeGreaterThanOrEqual(3)
    const idsServidor = sql('select id from public.hoja order by id').split('\n')
    const idsAdmin = (await admin.db.hojas.toArray()).map((h) => h.id).sort()
    expect(idsAdmin).toEqual(idsServidor) // ninguna hoja quedó sin descargar
    expect(await grado(admin, primera)).toBe(6) // y la modificada también llegó
    // Lo que el admin tiene coincide con el servidor en todas.
    expect(sql("select count(*) from public.hoja where grado_gauhl <> 1")).toBe('1')
  })

  it('e. repetir la sincronización 3 veces seguidas no cambia nada ni duplica registros', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    await capturar(op1, { plantas: 3, cerrar: true })
    await op1.sincronizar()
    const foto = async () =>
      JSON.stringify({
        local: await Promise.all(['recorridos', 'evaluaciones', 'plantas', 'hojas'].map(async (t) => (await op1.db.table(t).toArray()).sort((a, b) => a.id.localeCompare(b.id)))),
        cola: await op1.db.cola.count(),
        rechazos: await op1.db.rechazos.count(),
        servidor: ['recorrido', 'evaluacion_tabla', 'planta', 'hoja'].map((t) => cuenta(t)),
        serverStamp: sql('select max(server_updated_at) from public.hoja'),
      })
    const antes = await foto()
    for (let i = 0; i < 3; i++) await op1.sincronizar()
    expect(await foto()).toBe(antes)
  })

  it('f. 450 hojas pendientes se envían en 3 lotes y todas quedan aplicadas', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    await capturar(op1, { tablas: 1, plantas: 15 }) // 15 plantas × 3 hojas…
    // …llevadas a 30 hojas cada una: 450 hojas.
    for (const p of await op1.db.plantas.toArray()) await op1.plantas.cambiarTotalHojas(p.id, 30)
    expect((await op1.db.hojas.toArray()).filter((h) => !h.eliminado)).toHaveLength(450)
    const pendientes = await op1.db.cola.count()
    expect(pendientes).toBeGreaterThan(450)
    expect(pendientes).toBeLessThanOrEqual(600)

    await op1.sincronizar()
    expect(op1.llamadasAplicar).toEqual([200, 200, pendientes - 400])
    expect(op1.llamadasAplicar).toHaveLength(3)
    expect(await op1.db.cola.count()).toBe(0)
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(cuenta('hoja', 'not eliminado')).toBe(450)
    expect(cuenta('planta')).toBe(15)
  })

  it('f2. un recorrido CERRADO con más de 200 pendientes se envía en varios lotes: sus plantas y hojas entran antes del cierre', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    const { recorrido } = await capturar(op1, { tablas: 2, plantas: 12, cerrar: true })
    for (const p of await op1.db.plantas.toArray()) await op1.plantas.cambiarTotalHojas(p.id, 30) // 360 hojas
    expect(await op1.db.cola.count()).toBeGreaterThan(200)

    await op1.sincronizar()
    expect(op1.llamadasAplicar.length).toBeGreaterThanOrEqual(2)
    expect(await op1.db.cola.count()).toBe(0)
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(cuenta('hoja', 'not eliminado')).toBe(360)
    expect(cuenta('recorrido', `id = '${recorrido.id}' and estado = 'cerrado'`)).toBe(1)
    // Repetir no cambia nada.
    await op1.sincronizar()
    expect(await op1.db.cola.count()).toBe(0)
  })

  it('g. si la llamada se corta después de que el servidor aplicó, al reintentar todo queda ignorado_version o aplicado, sin duplicados y la cola vacía', async () => {
    let cortar = true
    const resultados: string[] = []
    const op1 = await dispositivo('op1', (real: Servidor): Servidor => ({
      ...real,
      aplicarCambios: async (lote: ItemLote[]) => {
        const r = await real.aplicarCambios(lote) // el servidor SÍ aplicó…
        resultados.push(...r.map((x) => x.resultado))
        if (cortar) {
          cortar = false
          throw new Error('Se perdió la conexión') // …pero la respuesta nunca llegó
        }
        return r
      },
    }))
    await op1.sincronizar()
    const { hojas } = await capturar(op1, { plantas: 2, cerrar: true })
    const pendientes = await op1.db.cola.count()

    await expect(op1.sincronizar()).rejects.toThrow('Se perdió la conexión')
    expect(await op1.db.cola.count()).toBe(pendientes) // no se dio nada por enviado
    expect(cuenta('hoja', 'not eliminado')).toBe(hojas.length) // pero el servidor ya lo tenía

    resultados.length = 0
    await op1.sincronizar()
    expect(resultados.length).toBe(pendientes)
    expect(new Set(resultados)).toEqual(new Set(['ignorado_version']))
    expect(await op1.db.cola.count()).toBe(0)
    expect(await op1.db.rechazos.count()).toBe(0)
    expect(cuenta('hoja', 'not eliminado')).toBe(hojas.length)
    expect(cuenta('recorrido', "estado = 'cerrado'")).toBe(1)
  })

  it('h. una fila confirmada tarde (server_updated_at un minuto antes del cursor, insertada como postgres) se descarga igual', async () => {
    const op1 = await dispositivo('op1')
    await op1.sincronizar()
    await capturar(op1, { tablas: 1, plantas: 1 })
    await op1.sincronizar()
    const admin = await dispositivo('admin')
    await admin.sincronizar()
    const cursor = (await admin.db.ajustes.get(claveCursor('recorridos')))?.valor as string
    expect(cursor).toBeTruthy()

    const id = 'd9000000-0000-4000-8000-000000000001'
    sql(`
      alter table public.recorrido disable trigger recorrido_server_updated_at;
      insert into public.recorrido (id, created_at, updated_at, server_updated_at, rancho_id, fecha, semana_iso, usuario_id, estado)
        values ('${id}', now(), now(), '${cursor}'::timestamptz - interval '1 minute', '${RANCHO}', '2026-10-05', '2026-W41', '${op1.usuarioId}', 'en_curso');
      alter table public.recorrido enable trigger recorrido_server_updated_at;
    `)
    await admin.sincronizar()
    expect(await admin.db.recorridos.get(id)).toBeDefined()
  })

  it('i. sin sesión no se intenta ninguna llamada al servidor', async () => {
    const db = nuevaBase()
    const fetchEspia = vi.spyOn(globalThis, 'fetch')
    const motor = crearMotor({ db, servidor: null, enLinea: () => true })
    expect(motor.obtenerEstado().modo).toBe('solo_local')
    await motor.sincronizar({ ignorarEspera: true })
    await motor.sincronizar()
    expect(fetchEspia).not.toHaveBeenCalled()
    motor.detener()
    fetchEspia.mockRestore()
  })
})

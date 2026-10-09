import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { borrarBaseAntigua, hayBaseAntigua, subidaConfirmada, subirDatosLocales } from '../../repos/migracion'
import { cerrarBases, nuevaBase, recorridoConPlanta, sembrar } from '../pruebas.util'
import { clienteDe, clienteNuevo, clienteServicio, cuenta, dispositivoConCliente, llamarFuncion, RANCHO, sql } from './entorno'

/**
 * Cuentas reales (hito 5) contra Supabase local con las funciones del servidor: alta de propietario con código,
 * operadores con PIN, bloqueos, permisos, desactivación, sesión revocada y migración de la etapa sin servidor.
 * Requiere `supabase start` (con el edge runtime) y `npm run preparar-local` (PIMIENTA local).
 */

const azar = (n = 6): string => Array.from({ length: n }, () => 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)]).join('')
const GENERICO = 'Código, usuario o PIN incorrectos.'

beforeAll(() => {
  sql('select 1')
})
afterAll(async () => {
  await cerrarBases()
  await Dexie.delete('sigatoka')
})

/** Alta de un propietario nuevo con un código de alta recién creado. Devuelve su cliente con sesión. */
async function propietarioNuevo() {
  const codigo = `ALTA${Math.floor(1000 + Math.random() * 9000)}${azar(2).toUpperCase()}`.slice(0, 8)
  sql(`insert into public.codigo_alta (codigo) values ('${codigo}')`)
  const cliente = clienteNuevo()
  const correo = `${azar(8)}@correo.test`
  const { data, error } = await cliente.auth.signUp({ email: correo, password: 'contrasena-larga-1', options: { data: { nombre: 'Dueña de Prueba' } } })
  if (error || !data.session || !data.user) throw new Error(`No se pudo registrar: ${error?.message}`)
  return { cliente, correo, codigo, usuarioId: data.user.id, token: data.session.access_token }
}

async function ranchoNuevo() {
  const p = await propietarioNuevo()
  const { data, error } = await p.cliente.rpc('crear_rancho', { p_nombre: `Rancho ${azar(4)}`, p_codigo_alta: p.codigo })
  if (error) throw new Error(error.message)
  const ranchoId = data as string
  const codigoRancho = sql(`select codigo from public.rancho where id = '${ranchoId}'`)
  return { ...p, ranchoId, codigoRancho }
}

/** El administrador crea un operador por la función `operadores`. */
async function operadorNuevo(token: string, ranchoId: string, nombre = `Op${azar(5)}`) {
  const r = await llamarFuncion('operadores', { accion: 'crear', rancho_id: ranchoId, nombre }, token)
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200)
  return r.cuerpo as { usuario_id: string; alias: string; pin: string; codigo_rancho: string }
}

async function entrar(c: { codigo_rancho: string; alias: string; pin: string }) {
  return llamarFuncion('entrar_operador', { codigo_rancho: c.codigo_rancho, alias: c.alias, pin: c.pin })
}

/** Cliente con la sesión que entregó `entrar_operador`. */
async function clienteDeSesion(cuerpo: Record<string, unknown>) {
  const cliente = clienteNuevo()
  const { error } = await cliente.auth.setSession({ access_token: cuerpo.access_token as string, refresh_token: cuerpo.refresh_token as string })
  if (error) throw new Error(error.message)
  return cliente
}

const pinIncorrecto = (pin: string): string => (pin === '000000' ? '111111' : '000000')

describe('cuentas reales contra Supabase local', () => {
  it('a. el propietario se registra con un código válido y crea su rancho; con un código usado o inexistente no puede', async () => {
    const p = await propietarioNuevo()
    // Sin rancho todavía: su perfil existe (trigger) con el nombre de los metadatos.
    expect(sql(`select nombre from public.usuario where id = '${p.usuarioId}'`)).toBe('Dueña de Prueba')

    const inexistente = await p.cliente.rpc('crear_rancho', { p_nombre: 'X', p_codigo_alta: 'NOEXISTE' })
    expect(inexistente.error?.message).toBe('El código de alta no es válido.')
    const sinCodigo = await p.cliente.rpc('crear_rancho', { p_nombre: 'X' })
    expect(sinCodigo.error?.message).toBe('Escribe tu código de alta.')
    expect(cuenta('rancho', `nombre = 'X'`)).toBe(0)

    const ok = await p.cliente.rpc('crear_rancho', { p_nombre: 'Rancho de Dueña', p_codigo_alta: p.codigo.toLowerCase() })
    expect(ok.error).toBeNull()
    expect(sql(`select usado_por from public.codigo_alta where codigo = '${p.codigo}'`)).toBe(p.usuarioId)
    const rancho = sql(`select codigo from public.rancho where id = '${ok.data}'`)
    expect(rancho).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    // Es administrador y ve su rancho.
    const mio = await p.cliente.from('rancho').select('id, codigo').eq('id', ok.data as string)
    expect(mio.data).toHaveLength(1)

    // Un código ya usado no sirve para otra persona.
    const otra = await propietarioNuevo()
    const usado = await otra.cliente.rpc('crear_rancho', { p_nombre: 'Otro', p_codigo_alta: p.codigo })
    expect(usado.error?.message).toBe('Ese código de alta ya se usó.')
    expect(cuenta('rancho', `nombre = 'Otro'`)).toBe(0)
  })

  it('b. el admin crea un operador y recibe alias, PIN y código; el operador entra con entrar_operador y sincroniza', async () => {
    const admin = await ranchoNuevo()
    const op = await operadorNuevo(admin.token, admin.ranchoId, 'Juan Pérez')
    expect(op.alias).toBe('juan')
    expect(op.pin).toMatch(/^\d{6}$/)
    expect(op.codigo_rancho).toBe(admin.codigoRancho)
    const segundo = await operadorNuevo(admin.token, admin.ranchoId, 'Juan López')
    expect(segundo.alias).toBe('juan2')
    // El PIN no se guarda en ningún lado: ni en cuenta_operador ni en el perfil.
    expect(sql(`select count(*) from public.cuenta_operador where usuario_id = '${op.usuario_id}' and (to_jsonb(cuenta_operador)::text like '%${op.pin}%')`)).toBe('0')
    expect(sql(`select count(*) from public.usuario where to_jsonb(usuario)::text like '%${op.pin}%'`)).toBe('0')
    expect(sql(`select email from auth.users where id = '${op.usuario_id}'`)).toMatch(/^op-[0-9a-f-]{36}@operadores\.invalid$/)

    const r = await entrar({ codigo_rancho: op.codigo_rancho.toLowerCase(), alias: ' JUAN ', pin: op.pin })
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo.usuario_id).toBe(op.usuario_id)

    const cliente = await clienteDeSesion(r.cuerpo)
    const d = await dispositivoConCliente(cliente, op.usuario_id)
    await d.sincronizar()
    expect((await d.db.ranchos.toArray()).map((x) => x.id)).toEqual([admin.ranchoId])
    expect(d.motor.obtenerEstado().membresias).toEqual([{ rancho_id: admin.ranchoId, rol: 'operador', activo: true }])
    // Su membresía descargada es de operador y NO ve cuentas de operador (RLS).
    expect((await d.db.membresias.toArray()).map((m) => m.rol)).toContain('operador')
    const cuentas = await cliente.from('cuenta_operador').select('alias')
    expect(cuentas.data).toEqual([])
    // mi_estado actualizó su última sincronización.
    expect(sql(`select ultima_sincronizacion is not null from public.cuenta_operador where usuario_id = '${op.usuario_id}'`)).toBe('t')
  })

  it('c. 5 PIN incorrectos bloquean 15 min (con el PIN correcto también); a los 10, permanente; restablecer_pin lo libera', async () => {
    const admin = await ranchoNuevo()
    const op = await operadorNuevo(admin.token, admin.ranchoId)
    const mal = pinIncorrecto(op.pin)
    for (let i = 1; i <= 4; i++) {
      const r = await entrar({ ...op, pin: mal })
      expect(r.estado, `intento ${i}`).toBe(401)
      expect(r.cuerpo.error).toBe(GENERICO)
    }
    const quinto = await entrar({ ...op, pin: mal })
    expect(quinto.estado).toBe(423)
    expect(quinto.cuerpo.bloqueado).toBe('temporal')
    expect(String(quinto.cuerpo.error)).toMatch(/Demasiados intentos\. Vuelve a intentar después de las \d\d:\d\d\./)
    expect(sql(`select intentos_fallidos from public.cuenta_operador where usuario_id = '${op.usuario_id}'`)).toBe('5')

    // Con el PIN correcto también responde bloqueado, y no entrega sesión.
    const correctoBloqueado = await entrar(op)
    expect(correctoBloqueado.estado).toBe(423)
    expect(correctoBloqueado.cuerpo.access_token).toBeUndefined()

    // Pasan los 15 minutos (se simula) y los fallos siguientes llevan a 10.
    for (let i = 6; i <= 10; i++) {
      sql(`update public.cuenta_operador set bloqueado_hasta = now() - interval '1 minute' where usuario_id = '${op.usuario_id}'`)
      const r = await entrar({ ...op, pin: mal })
      expect(r.estado, `intento ${i}`).toBe(423)
    }
    const permanente = await entrar({ ...op, pin: mal })
    expect(permanente.cuerpo.bloqueado).toBe('permanente')
    expect(String(permanente.cuerpo.error)).toMatch(/PIN nuevo/)
    expect(sql(`select bloqueado_permanente from public.cuenta_operador where usuario_id = '${op.usuario_id}'`)).toBe('t')
    // El PIN correcto tampoco sirve ya, ni cuando pase el tiempo.
    sql(`update public.cuenta_operador set bloqueado_hasta = null where usuario_id = '${op.usuario_id}'`)
    expect((await entrar(op)).estado).toBe(423)

    // restablecer_pin lo libera: PIN nuevo, intentos en cero; el PIN viejo ya no sirve.
    const nuevo = await llamarFuncion('operadores', { accion: 'restablecer_pin', rancho_id: admin.ranchoId, usuario_id: op.usuario_id }, admin.token)
    expect(nuevo.estado).toBe(200)
    const pinNuevo = nuevo.cuerpo.pin as string
    expect(pinNuevo).toMatch(/^\d{6}$/)
    expect(sql(`select intentos_fallidos || bloqueado_permanente::text from public.cuenta_operador where usuario_id = '${op.usuario_id}'`)).toBe('0false')
    expect((await entrar({ ...op, pin: pinNuevo })).estado).toBe(200)
    expect((await entrar({ ...op, pin: op.pin })).estado).toBe(401)
  })

  it('d. un alias o un código de rancho inexistente responde el mismo error genérico (y tarda parecido)', async () => {
    const admin = await ranchoNuevo()
    const op = await operadorNuevo(admin.token, admin.ranchoId)
    const casos = {
      pinMal: () => entrar({ ...op, pin: pinIncorrecto(op.pin) }),
      sinAlias: () => entrar({ codigo_rancho: op.codigo_rancho, alias: 'nadie', pin: '123456' }),
      sinRancho: () => entrar({ codigo_rancho: 'ZZZZZ9', alias: op.alias, pin: '123456' }),
    }
    await casos.sinAlias() // calentamiento de la función (la primera llamada arranca el worker)
    const tiempos: Record<string, number[]> = { pinMal: [], sinAlias: [], sinRancho: [] }
    for (let ronda = 0; ronda < 3; ronda++) {
      for (const [nombre, caso] of Object.entries(casos)) {
        const r = await caso()
        expect(r.estado, nombre).toBe(401)
        expect(r.cuerpo, nombre).toEqual({ error: GENERICO })
        tiempos[nombre].push(r.ms)
      }
    }
    // Tiempos parecidos (cota holgada: cada caso hace una llamada a Auth). Los PIN incorrectos de esta cuenta no la bloquean (3 < 5).
    const promedios = Object.values(tiempos).map((t) => t.reduce((a, b) => a + b, 0) / t.length)
    expect(Math.max(...promedios) / Math.min(...promedios)).toBeLessThan(3)
    // Datos mal formados.
    expect((await entrar({ codigo_rancho: op.codigo_rancho, alias: op.alias, pin: '12' })).estado).toBe(400)
  })

  it('e. un operador o el admin de otro rancho no pueden usar "operadores" sobre el rancho A', async () => {
    const a = await ranchoNuevo()
    const b = await ranchoNuevo()
    const opA = await operadorNuevo(a.token, a.ranchoId)
    const sesionOp = await entrar(opA)
    const tokenOp = sesionOp.cuerpo.access_token as string

    // Un operador de A.
    for (const accion of [{ accion: 'crear', nombre: 'Colado' }, { accion: 'restablecer_pin', usuario_id: opA.usuario_id }, { accion: 'desactivar', usuario_id: opA.usuario_id }]) {
      const r = await llamarFuncion('operadores', { ...accion, rancho_id: a.ranchoId }, tokenOp)
      expect(r.estado, JSON.stringify(accion)).toBe(403)
    }
    // El administrador de B sobre el rancho A.
    for (const accion of [{ accion: 'crear', nombre: 'Colado' }, { accion: 'restablecer_pin', usuario_id: opA.usuario_id }, { accion: 'desactivar', usuario_id: opA.usuario_id }, { accion: 'renombrar', usuario_id: opA.usuario_id, nombre: 'X' }]) {
      const r = await llamarFuncion('operadores', { ...accion, rancho_id: a.ranchoId }, b.token)
      expect(r.estado, JSON.stringify(accion)).toBe(403)
    }
    // El administrador de B sobre SU rancho, pero con un operador de A.
    for (const accion of ['restablecer_pin', 'desactivar', 'reactivar']) {
      const r = await llamarFuncion('operadores', { accion, rancho_id: b.ranchoId, usuario_id: opA.usuario_id }, b.token)
      expect(r.estado, accion).toBe(404)
    }
    // Sin sesión y con la llave pública sola.
    expect((await llamarFuncion('operadores', { accion: 'crear', rancho_id: a.ranchoId, nombre: 'X' })).estado).toBe(401)
    // Nada cambió en A.
    expect(cuenta('cuenta_operador', `rancho_id = '${a.ranchoId}'`)).toBe(1)
    expect(sql(`select activo from public.membresia where usuario_id = '${opA.usuario_id}'`)).toBe('t')
    expect((await entrar(opA)).estado).toBe(200) // su PIN sigue sirviendo
  })

  it('f. desactivar: el siguiente ciclo detecta la membresía inactiva, deja de sincronizar y borra los datos locales del rancho; entrar_operador ya no da sesión', async () => {
    const admin = await ranchoNuevo()
    const op = await operadorNuevo(admin.token, admin.ranchoId)
    const sesion = await entrar(op)
    const d = await dispositivoConCliente(await clienteDeSesion(sesion.cuerpo), op.usuario_id)
    await d.sincronizar()
    expect(await d.db.ranchos.count()).toBe(1)

    // El administrador crea una tabla (el operador la baja) y el operador deja un cambio sin enviar.
    sql(`insert into public.tabla (id, created_at, updated_at, rancho_id, codigo) values (gen_random_uuid(), now(), now(), '${admin.ranchoId}', '1')`)
    await d.sincronizar()
    expect(await d.db.tablas.count()).toBe(1)
    const tabla = (await d.db.tablas.toArray())[0]
    await d.recorridos.crear({ rancho_id: admin.ranchoId, fecha: '2026-10-05', usuario_id: op.usuario_id, tabla_ids: [tabla.id] })
    expect(await d.db.cola.count()).toBeGreaterThan(0)

    const r = await llamarFuncion('operadores', { accion: 'desactivar', rancho_id: admin.ranchoId, usuario_id: op.usuario_id }, admin.token)
    expect(r.estado).toBe(200)

    await d.sincronizar() // el ciclo empieza con mi_estado
    const estado = d.motor.obtenerEstado()
    expect(estado.desactivado).toBe(true)
    expect(estado.membresias).toEqual([{ rancho_id: admin.ranchoId, rol: 'operador', activo: false }])
    // Se borraron los datos locales de ese rancho, incluida la cola, y NO se envió lo pendiente.
    for (const t of ['ranchos', 'tablas', 'recorridos', 'evaluaciones', 'membresias']) expect(await d.db.table(t).count(), t).toBe(0)
    expect(await d.db.cola.count()).toBe(0)
    expect(cuenta('recorrido', `rancho_id = '${admin.ranchoId}'`)).toBe(0)
    // Deja de sincronizar: otro intento no llama a nada.
    const llamadasAntes = d.llamadasAplicar.length
    await d.motor.sincronizar({ ignorarEspera: true })
    expect(d.llamadasAplicar.length).toBe(llamadasAntes)
    expect(await d.db.ranchos.count()).toBe(0)

    const entra = await entrar(op)
    expect(entra.estado).toBe(403)
    expect(entra.cuerpo.error).toBe('Tu acceso a este rancho está desactivado.')
    expect(entra.cuerpo.access_token).toBeUndefined()

    // Reactivar: vuelve a poder entrar y baja todo de nuevo.
    expect((await llamarFuncion('operadores', { accion: 'reactivar', rancho_id: admin.ranchoId, usuario_id: op.usuario_id }, admin.token)).estado).toBe(200)
    const otra = await entrar(op)
    expect(otra.estado).toBe(200)
    const d2 = await dispositivoConCliente(await clienteDeSesion(otra.cuerpo), op.usuario_id)
    await d2.sincronizar()
    expect(await d2.db.tablas.count()).toBe(1)
  })

  it('g. sesión revocada con datos pendientes: no se borra nada; al volver a entrar se envían', async () => {
    const admin = await ranchoNuevo()
    sql(`insert into public.tabla (id, created_at, updated_at, rancho_id, codigo) values (gen_random_uuid(), now(), now(), '${admin.ranchoId}', '1')`)
    const op = await operadorNuevo(admin.token, admin.ranchoId)
    const sesion = await entrar(op)
    const cliente = await clienteDeSesion(sesion.cuerpo)
    const d = await dispositivoConCliente(cliente, op.usuario_id)
    await d.sincronizar()

    // Captura sin enviar.
    const tabla = (await d.db.tablas.toArray())[0]
    const { recorrido } = await d.recorridos.crear({ rancho_id: admin.ranchoId, fecha: '2026-10-05', usuario_id: op.usuario_id, tabla_ids: [tabla.id] })
    const pendientes = await d.db.cola.count()
    expect(pendientes).toBeGreaterThan(0)

    // El servidor revoca la sesión (todas las de la cuenta) y la renovación falla.
    await clienteServicio().auth.admin.signOut(sesion.cuerpo.access_token as string, 'global')
    expect((await cliente.auth.refreshSession()).error).not.toBeNull() // la renovación falla…
    // …y supabase-js, al vencer el token de acceso (≈1 h; hasta entonces el servidor lo sigue aceptando), olvida la sesión:
    await cliente.auth.signOut({ scope: 'local' })

    await d.motor.sincronizar({ ignorarEspera: true })
    expect(d.motor.obtenerEstado().sesionVencida).toBe(true)
    expect(d.motor.obtenerEstado().desactivado).toBe(false)
    // No se borró nada.
    expect(await d.db.cola.count()).toBe(pendientes)
    expect(await d.db.recorridos.get(recorrido.id)).toBeDefined()
    expect(await d.db.ranchos.count()).toBe(1)
    expect(cuenta('recorrido', `id = '${recorrido.id}'`)).toBe(0)

    // Vuelve a entrar con la misma cuenta (PIN): misma base, y se envía lo pendiente.
    const otra = await entrar(op)
    expect(otra.estado).toBe(200)
    const d2 = await dispositivoConCliente(await clienteDeSesion(otra.cuerpo), op.usuario_id, { db: d.db })
    await d2.sincronizar()
    expect(await d2.db.cola.count()).toBe(0)
    expect(await d2.db.rechazos.count()).toBe(0)
    expect(cuenta('recorrido', `id = '${recorrido.id}'`)).toBe(1)
  })

  it('h. migración: una base "sigatoka" con tablas y un recorrido sube al rancho nuevo y queda todo aplicado en el servidor', async () => {
    // La base de la etapa sin servidor: rancho simulado, 3 tablas y un recorrido con una planta.
    const antigua = nuevaBase('sigatoka')
    const s = await sembrar(antigua)
    const { recorrido } = await recorridoConPlanta(s, [0, 1, 2])
    await s.recorridos.cerrar(recorrido.id)
    const tablasAntiguas = (await antigua.tablas.toArray()).map((t) => t.id)
    antigua.close()
    expect(await hayBaseAntigua()).toBe(true)

    const dueno = await ranchoNuevo()
    const d = await dispositivoConCliente(dueno.cliente, dueno.usuarioId)
    await d.sincronizar() // baja el rancho nuevo
    const resumen = await subirDatosLocales(d.db, { ranchoId: dueno.ranchoId, usuarioId: dueno.usuarioId, incluirRecorridos: true })
    expect(resumen).toMatchObject({ tablas: 3, recorridos: 1, plantas: 1 })
    expect(await subidaConfirmada(d.db)).toBe(false) // todavía en la cola
    await d.sincronizar()
    expect(await d.db.cola.count()).toBe(0)
    expect(await d.db.rechazos.count()).toBe(0)
    expect(await subidaConfirmada(d.db)).toBe(true)

    // En el servidor: mismas ids de tablas y de recorrido, con el rancho nuevo y a nombre del propietario.
    expect(sql(`select string_agg(id::text, ',' order by id) from public.tabla where rancho_id = '${dueno.ranchoId}'`)).toBe([...tablasAntiguas].sort().join(','))
    expect(sql(`select usuario_id || ':' || estado from public.recorrido where id = '${recorrido.id}'`)).toBe(`${dueno.usuarioId}:cerrado`)
    expect(cuenta('hoja', `rancho_id = '${dueno.ranchoId}' and not eliminado`)).toBe(3)
    expect(cuenta('planta', `rancho_id = '${dueno.ranchoId}'`)).toBe(1)
    expect(sql(`select count(*) from public.tabla where rancho_id = '${dueno.ranchoId}' and geometria is not null`)).toBe('3')

    // La base antigua sigue ahí hasta que se borra a propósito.
    expect(await hayBaseAntigua()).toBe(true)
    await borrarBaseAntigua()
    expect(await hayBaseAntigua()).toBe(false)
  })

  it('h2. migración sin recorridos (la casilla desmarcada): solo suben las tablas', async () => {
    const antigua = nuevaBase('sigatoka')
    const s = await sembrar(antigua)
    await recorridoConPlanta(s)
    antigua.close()
    const dueno = await ranchoNuevo()
    const d = await dispositivoConCliente(dueno.cliente, dueno.usuarioId)
    await d.sincronizar()
    const resumen = await subirDatosLocales(d.db, { ranchoId: dueno.ranchoId, usuarioId: dueno.usuarioId, incluirRecorridos: false })
    expect(resumen).toMatchObject({ tablas: 3, recorridos: 0 })
    await d.sincronizar()
    expect(cuenta('tabla', `rancho_id = '${dueno.ranchoId}'`)).toBe(3)
    expect(cuenta('recorrido', `rancho_id = '${dueno.ranchoId}'`)).toBe(0)
    await borrarBaseAntigua()
  })

  it('i. la contraseña derivada no sirve para entrar con signInWithPassword usando solo el PIN', async () => {
    const admin = await ranchoNuevo()
    const op = await operadorNuevo(admin.token, admin.ranchoId)
    const correo = (await clienteServicio().auth.admin.getUserById(op.usuario_id)).data.user?.email as string
    expect(correo).toMatch(/@operadores\.invalid$/)
    for (const contrasena of [op.pin, op.pin + op.pin, `${op.usuario_id}:${op.pin}`, 'prueba123']) {
      const r = await clienteNuevo().auth.signInWithPassword({ email: correo, password: contrasena })
      expect(r.error, contrasena).not.toBeNull()
      expect(r.data.session).toBeNull()
    }
  })

  it('el seed: el rancho de prueba tiene el código PRUEBA y las cuentas de contraseña siguen sirviendo para las pruebas', async () => {
    expect(sql(`select codigo from public.rancho where id = '${RANCHO}'`)).toBe('PRUEBA')
    expect(await clienteDe('admin')).toBeDefined()
  })
})

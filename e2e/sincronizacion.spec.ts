import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

/**
 * Cuentas y sincronización de punta a punta (pantalla de celular, servidor de desarrollo + Supabase local con la semilla):
 * el operador entra con código, usuario y PIN, captura sin conexión y, al volver la señal, el encabezado pasa de
 * "N por enviar" a "Al día" sin tocar nada; el propietario agrega un operador y ve el diálogo con el PIN.
 */

const CONTENEDOR = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_salvador'
const sql = (consulta: string): string =>
  execFileSync('docker', ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', consulta], { encoding: 'utf8' }).trim()
const estado = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as { API_URL: string; ANON_KEY: string }

async function llamar(ruta: string, cuerpo: object, token?: string) {
  const r = await fetch(`${estado.API_URL}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: estado.ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  })
  return (await r.json()) as Record<string, string>
}

/** Un operador nuevo en el rancho de prueba, creado por el administrador de la semilla. */
async function operadorNuevo(): Promise<{ codigo_rancho: string; alias: string; pin: string }> {
  const sesion = await llamar('/auth/v1/token?grant_type=password', { email: 'admin@prueba.test', password: 'prueba123' })
  const nombre = `Op${Math.random().toString(36).slice(2, 8)}`
  return (await llamar('/functions/v1/operadores', { accion: 'crear', rancho_id: 'd1000000-0000-4000-8000-000000000001', nombre }, sesion.access_token)) as { codigo_rancho: string; alias: string; pin: string }
}

test.beforeEach(() => {
  sql('truncate table public.hoja, public.planta, public.evaluacion_tabla, public.recorrido, public.aplicacion')
})

async function entrarComoOperador(page: Page, op: { codigo_rancho: string; alias: string; pin: string }) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await page.getByLabel('Código del rancho').fill(op.codigo_rancho)
  await page.getByLabel('Usuario').fill(op.alias)
  await page.getByLabel('PIN de 6 dígitos').fill(op.pin)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  // La primera sincronización baja el rancho; luego aparece la lista de recorridos y el encabezado queda "Al día".
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 30_000 })
}

test('el operador entra con código, usuario y PIN, captura sin conexión y al volver la señal el encabezado pasa a "Al día" solo', async ({ page, context }) => {
  const op = await operadorNuevo()
  expect(op.pin).toMatch(/^\d{6}$/)
  await entrarComoOperador(page, op)

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar recorrido (1 tabla)' }).click()
  await page.getByRole('button', { name: /^1 Sin iniciar/ }).click()
  await page.getByRole('button', { name: /^Nueva planta/ }).click()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Restar total de hojas' }).click()
  await page.getByRole('button', { name: /^Calificar las 5 hojas/ }).click()
  for (const g of [0, 1, 2, 3, 4]) await page.getByRole('button', { name: new RegExp(`^Grado ${g}:`) }).click()
  await expect(page.getByText('Todas las hojas calificadas')).toBeVisible()
  await page.getByRole('button', { name: 'Volver a la planta' }).click()

  // Sin conexión nada sale: el encabezado cuenta lo pendiente.
  await expect(page.getByRole('button', { name: /Sin conexión · \d+ por enviar/ })).toBeVisible()
  expect(sql('select count(*) from public.recorrido')).toBe('0')

  // Vuelve la señal: se sincroniza sola, sin tocar nada.
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 30_000 })
  expect(sql('select count(*) from public.recorrido')).toBe('1')
  expect(sql('select count(*) from public.planta')).toBe('1')
  expect(sql('select count(*) from public.hoja where not eliminado and grado_gauhl is not null')).toBe('5')
})

test('un PIN incorrecto muestra el error genérico y no entra', async ({ page }) => {
  const op = await operadorNuevo()
  await page.goto('/')
  await page.getByLabel('Código del rancho').fill(op.codigo_rancho)
  await page.getByLabel('Usuario').fill(op.alias)
  await page.getByLabel('PIN de 6 dígitos').fill(op.pin === '000000' ? '111111' : '000000')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Código, usuario o PIN incorrectos.')
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toHaveCount(0)
})

test('el propietario agrega un operador y ve el diálogo con el PIN', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Soy propietario' }).click()
  await page.getByLabel('Correo').fill('admin@prueba.test')
  await page.getByLabel('Contraseña').fill('prueba123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Operadores' }).click()
  await page.getByRole('button', { name: 'Agregar operador' }).click()
  const nombre = `María ${Math.random().toString(36).slice(2, 7)}`
  await page.getByLabel('Nombre del operador').fill(nombre)
  await page.getByRole('button', { name: 'Crear operador' }).click()

  const dialogo = page.getByRole('alertdialog', { name: 'Datos de acceso del operador' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo).toContainText('Código del rancho: PRUEBA')
  await expect(dialogo).toContainText(/Usuario: maria/)
  await expect(dialogo.locator('.pin')).toHaveText(/^\d{6}$/)
  await expect(dialogo.getByRole('link', { name: 'Compartir por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/)
  await expect(dialogo.getByRole('button', { name: 'Copiar' })).toBeVisible()
  await dialogo.getByRole('button', { name: /Listo/ }).click()
  const fila = page.locator('li', { hasText: nombre })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Activo', { exact: true })).toBeVisible()

  // Desactivar pide confirmación y avisa lo que se pierde.
  await fila.getByRole('button', { name: 'Desactivar' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Si tiene cambios sin enviar en su celular, se perderán. Pídele que sincronice antes.')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click()
  await expect(fila.getByText('Desactivado')).toBeVisible()
})

test('crear cuenta de propietario con un código de alta y crear su rancho', async ({ page }) => {
  const codigo = `ALTA${Math.floor(1000 + Math.random() * 9000)}`
  sql(`insert into public.codigo_alta (codigo) values ('${codigo}')`)
  await page.goto('/')
  await page.getByRole('tab', { name: 'Soy propietario' }).click()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.getByLabel('Tu nombre').fill('Dueña E2E')
  await page.getByLabel('Correo').fill(`e2e-${Date.now()}@correo.test`)
  await page.getByLabel('Contraseña (mínimo 8 caracteres)').fill('contrasena-larga')
  await page.getByLabel('Código de alta').fill(codigo)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.getByLabel('Nombre del rancho').fill('Rancho E2E')
  await page.getByRole('button', { name: 'Crear mi rancho' }).click()
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible({ timeout: 30_000 })
  expect(sql(`select usado_por is not null from public.codigo_alta where codigo = '${codigo}'`)).toBe('t')
})

test('"Ahora no" oculta el aviso de campo, pero "Subir los datos de antes de las cuentas" sigue en Estado y sube las tablas', async ({ page }) => {
  const codigo = `MIG${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  // Datos de la etapa sin servidor: la base local "sigatoka" (la que usa la app mientras no hay sesión) con una tabla.
  await page.evaluate(async (c) => {
    const abrir = indexedDB.open('sigatoka')
    const db = await new Promise<IDBDatabase>((ok, mal) => {
      abrir.onsuccess = () => ok(abrir.result)
      abrir.onerror = () => mal(abrir.error)
    })
    const t = '2026-10-01T12:00:00.000Z'
    await new Promise<void>((ok, mal) => {
      const tx = db.transaction('tablas', 'readwrite')
      tx.objectStore('tablas').put({
        id: crypto.randomUUID(), rancho_id: 'rancho-antiguo', codigo: c, nombre: `Tabla ${c}`, superficie_ha: 3.5, variedad: 'Gran Enano', geometria: null, activa: true, origen: 'manual',
        created_at: t, updated_at: t, server_updated_at: null, eliminado: false,
      })
      tx.oncomplete = () => ok()
      tx.onerror = () => mal(tx.error)
    })
    db.close()
  }, codigo)

  await page.getByRole('tab', { name: 'Soy propietario' }).click()
  await page.getByLabel('Correo').fill('admin@prueba.test')
  await page.getByLabel('Contraseña').fill('prueba123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible({ timeout: 30_000 })

  // El aviso aparece en campo; "Ahora no" lo oculta…
  await expect(page.getByRole('heading', { name: 'Subir los datos de antes de las cuentas' })).toBeVisible()
  await page.getByRole('button', { name: 'Ahora no' }).click()
  await expect(page.getByRole('heading', { name: 'Subir los datos de antes de las cuentas' })).toHaveCount(0)
  // …pero sigue disponible en Estado.
  await page.getByRole('button', { name: 'Estado' }).click()
  await expect(page.getByRole('heading', { name: 'Subir los datos de antes de las cuentas' })).toBeVisible()
  await page.getByRole('button', { name: 'Subir a mi rancho' }).click()
  await expect.poll(() => sql(`select count(*) from public.tabla where codigo = '${codigo}' and rancho_id = 'd1000000-0000-4000-8000-000000000001'`), { timeout: 30_000 }).toBe('1')
  await expect(page.getByRole('heading', { name: 'Tus datos ya están en tu rancho' })).toBeVisible({ timeout: 30_000 })
})

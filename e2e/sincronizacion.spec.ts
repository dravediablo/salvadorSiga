import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

/**
 * Sincronización de punta a punta: sesión de desarrollo como op1, captura sin conexión y, al volver la
 * señal, el encabezado pasa de "N por enviar" a "Al día" sin tocar nada. Requiere Supabase local con la semilla.
 */

const CONTENEDOR = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_salvador'
const sql = (consulta: string): string =>
  execFileSync('docker', ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', consulta], { encoding: 'utf8' }).trim()

test.beforeEach(() => {
  sql('truncate table public.hoja, public.planta, public.evaluacion_tabla, public.recorrido, public.aplicacion')
})

async function entrarComoOp1(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Acceso de desarrollo (temporal)' })).toBeVisible()
  await page.getByLabel('Correo').fill('op1@prueba.test')
  await page.getByLabel('Contraseña').fill('prueba123')
  await page.getByRole('button', { name: 'Iniciar sesión de desarrollo' }).click()
  // La primera sincronización baja el rancho; luego aparece la lista de recorridos y el encabezado queda "Al día".
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 30_000 })
}

test('op1 captura sin conexión, vuelve la señal y el encabezado pasa de "N por enviar" a "Al día" solo', async ({ page, context }) => {
  await entrarComoOp1(page)
  await expect(page.getByText('Operador 1 (operador)')).toBeVisible() // el rol sale de la membresía del servidor

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
  expect(sql("select count(*) from public.hoja where not eliminado and grado_gauhl is not null")).toBe('5')
})

test('el botón "Sincronizar ahora" y el detalle del encabezado', async ({ page }) => {
  await entrarComoOp1(page)
  await page.getByRole('button', { name: /Al día/ }).click()
  await expect(page.getByText('Última sincronización correcta:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sincronizar ahora' })).toBeEnabled()
})

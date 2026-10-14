import { expect, test, type Page } from '@playwright/test'

const KMZ = 'src/datos/__fixtures__/sintetico.kmz'
const GRADOS = [0, 1, 2, 3, 4]

async function entrarComo(page: Page, etiqueta: string) {
  await page.getByLabel('Usuario (simulación de roles)').selectOption({ label: etiqueta })
}

/** Rancho con el KMZ sintético y un recorrido cerrado de la tabla 1 con una planta completa. */
async function sembrarRecorrido(page: Page) {
  await page.goto('/')
  await page.getByLabel('Nombre del rancho').fill('Rancho de prueba')
  await page.getByLabel('Archivo KMZ o KML').setInputFiles(KMZ)
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible()
  await entrarComo(page, 'Operador 1 (operador)')
  await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar recorrido (1 tabla)' }).click()
  await page.getByRole('button', { name: /^1 Sin iniciar/ }).click()
  await page.getByRole('button', { name: /^Nueva planta/ }).click()
  for (let i = 0; i < 10 - GRADOS.length; i++) await page.getByRole('button', { name: 'Restar total de hojas' }).click()
  await page.getByRole('button', { name: 'Hoja más joven con pizca: hoja 2' }).click()
  await page.getByRole('button', { name: 'Hoja más joven con estría: hoja 3' }).click()
  await page.getByRole('button', { name: 'Hoja más joven con mancha o quema: hoja 4' }).click()
  await page.getByRole('button', { name: /^Calificar las 5 hojas/ }).click()
  for (const g of GRADOS) await page.getByRole('button', { name: new RegExp(`^Grado ${g}:`) }).click()
  await page.getByRole('button', { name: 'Volver a la planta' }).click()
  await page.getByRole('button', { name: 'Tabla 1', exact: true }).click()
  await page.getByRole('button', { name: 'Terminar tabla' }).click()
  await page.getByRole('button', { name: 'Cerrar recorrido' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar recorrido' }).click()
  await expect(page.getByText('No tienes recorridos abiertos')).toBeVisible()
}

test('el tablero lo ve el administrador con el mapa y los datos; el operador no lo ve', async ({ page }) => {
  await sembrarRecorrido(page)

  // El operador no tiene la pestaña.
  const nav = page.getByRole('navigation', { name: 'Secciones' })
  await expect(nav.getByRole('button', { name: 'Tablero' })).toHaveCount(0)

  // El administrador sí: mapa con un polígono por tabla del KMZ (3; las franjas buffer no se importan) y el II de la planta sembrada (33.3).
  await entrarComo(page, 'Propietario (admin)')
  await nav.getByRole('button', { name: 'Tablero' }).click()
  await expect(page.getByRole('heading', { name: 'Tablero', exact: true })).toBeVisible()
  const mapa = page.getByRole('img', { name: 'Mapa de tablas por índice de infección' })
  await expect(mapa).toBeVisible()
  await expect(mapa.locator('polygon')).toHaveCount(3)
  await expect(mapa.locator('polygon[data-tabla="1"]')).toBeVisible()
  await expect(mapa.getByText('33.3', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Estado por tabla' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Detalle por planta y hoja' })).toBeVisible()
  // El rango de fechas se puede cambiar y "Volver a hoy" lo restablece (no se guarda entre sesiones).
  await expect(page.getByRole('button', { name: 'Volver a hoy' })).toHaveCount(0)
  await page.getByLabel('Desde').fill('2020-01-01')
  await page.getByRole('button', { name: 'Volver a hoy' }).click()
  await expect(page.getByRole('button', { name: 'Volver a hoy' })).toHaveCount(0)
  await expect(mapa.getByText('33.3', { exact: true })).toBeVisible()
  // En 390 px la página no se desborda a lo ancho: las tablas anchas deslizan dentro de su contenedor.
  expect(await page.evaluate(() => (document.querySelector('main') as HTMLElement).scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  // Sin aplicaciones ni clima, los paneles lo dicen en vez de quedar vacíos.
  await expect(page.getByText('Sin aplicaciones registradas.').first()).toBeVisible()
  await expect(page.getByText('Sin datos de clima.')).toBeVisible()

  // Volver a operador: la pestaña desaparece y la app no se queda en el tablero.
  await entrarComo(page, 'Operador 1 (operador)')
  await expect(nav.getByRole('button', { name: 'Tablero' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tablero', exact: true })).toHaveCount(0)
})

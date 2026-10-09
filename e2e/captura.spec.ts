import { expect, test, type Page } from '@playwright/test'

const KMZ = 'src/datos/__fixtures__/sintetico.kmz'
// Grados de cada planta: HF 5 e II = 10 / (6 × 5) × 100 = 33.3 % (formato es-MX: punto decimal).
const GRADOS = [0, 1, 2, 3, 4]
const TH = GRADOS.length

async function configurarRancho(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Configura el rancho' })).toBeVisible()
  await page.getByLabel('Nombre del rancho').fill('Rancho de prueba')
  await page.getByLabel('Archivo KMZ o KML').setInputFiles(KMZ)
  await expect(page.getByRole('heading', { name: 'Recorridos' })).toBeVisible()
}

async function entrarComo(page: Page, etiqueta: string) {
  await page.getByLabel('Usuario (simulación de roles)').selectOption({ label: etiqueta })
}

/** Deja la planta con TH 5 (el valor inicial es 10), útil para capturar rápido. */
async function ponerTh(page: Page) {
  for (let i = 0; i < 10 - TH; i++) await page.getByRole('button', { name: 'Restar total de hojas' }).click()
  await expect(page.getByLabel('total de hojas actual')).toHaveText(String(TH))
}

async function capturarSintomas(page: Page) {
  await page.getByRole('button', { name: 'Hoja más joven con pizca: hoja 2' }).click()
  await page.getByRole('button', { name: 'Hoja más joven con estría: hoja 3' }).click()
  await page.getByRole('button', { name: 'Hoja más joven con mancha o quema: hoja 4' }).click()
}

async function calificar(page: Page, grados: number[]) {
  for (const g of grados) await page.getByRole('button', { name: new RegExp(`^Grado ${g}:`) }).click()
}

/** Crea una planta nueva desde la tabla (o desde la planta anterior) y la deja completa. */
async function plantaCompleta(page: Page, desde: 'tabla' | 'planta') {
  if (desde === 'tabla') await page.getByRole('button', { name: /^Nueva planta/ }).click()
  else await page.getByRole('button', { name: 'Guardar y nueva planta' }).click()
  await expect(page.getByLabel('número de planta actual')).toBeVisible()
  // La planta nueva hereda el TH de la anterior; solo la primera necesita ajustarlo.
  if ((await page.getByLabel('total de hojas actual').textContent()) !== String(TH)) await ponerTh(page)
  await capturarSintomas(page)
  await page.getByRole('button', { name: /^Calificar las 5 hojas/ }).click()
  await calificar(page, GRADOS)
  await expect(page.getByText('Todas las hojas calificadas')).toBeVisible()
  await page.getByRole('button', { name: 'Volver a la planta' }).click()
}

test('flujo de captura: KMZ, recorrido de 2 tablas, 5 plantas (2 sin conexión), recarga y cierre', async ({ page, context }) => {
  // 1. Configurar el rancho con el KMZ sintético.
  await configurarRancho(page)
  await page.evaluate(() => navigator.serviceWorker.ready) // el cascarón queda en caché para el modo sin conexión

  // 2. Entrar como operador.
  await entrarComo(page, 'Operador 1 (operador)')
  await expect(page.getByText('No tienes recorridos abiertos')).toBeVisible()

  // 3. Crear un recorrido de 2 tablas (la franja "2A buffer" entra desactivada y no se ofrece).
  await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
  await expect(page.getByRole('button', { name: '2A buffer' })).toHaveCount(0)
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar recorrido (2 tablas)' }).click()
  await expect(page.getByRole('heading', { name: /^Recorrido del/ })).toBeVisible()
  await page.getByRole('button', { name: /^1 Sin iniciar/ }).click()
  await expect(page.getByRole('heading', { name: 'Tabla 1' })).toBeVisible()

  // 4. Capturar 3 plantas completas con conexión.
  await plantaCompleta(page, 'tabla')
  // Primera captura: se pidió almacenamiento persistente y el resultado quedó registrado.
  const registro = await page.evaluate(() => JSON.parse(localStorage.getItem('sigatoka.persistencia') ?? '[]') as Array<{ resultado: string }>)
  expect(registro.length).toBeGreaterThan(0)
  expect(['concedida', 'ya_concedida', 'rechazada', 'no_disponible', 'error']).toContain(registro[0].resultado)
  await plantaCompleta(page, 'planta')
  await plantaCompleta(page, 'planta')
  await expect(page.getByText('Planta 3 de 3')).toBeVisible()

  // 5. Sin conexión: la planta 4 completa y la 5 a medias.
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: /Sin señal/ })).toBeVisible()
  await plantaCompleta(page, 'planta')
  await page.getByRole('button', { name: 'Guardar y nueva planta' }).click()
  await expect(page.getByText('Planta 5 de 5')).toBeVisible()
  await capturarSintomas(page)
  await page.getByLabel('Observaciones').fill('a mitad de la quinta')
  await page.getByRole('button', { name: /^Calificar las 5 hojas/ }).click()
  await calificar(page, [0, 1]) // faltan 3 hojas
  await expect(page.getByText('Hoja 3 de 5')).toBeVisible()
  await expect(page.getByRole('button', { name: /\d+ sin enviar/ })).toBeVisible()
  await page.waitForTimeout(500) // deja que las escrituras en segundo plano terminen

  // 6. Recargar a mitad de la quinta planta (aún sin conexión): vuelve a esa planta con sus datos.
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Calificar hojas' })).toBeVisible()
  await expect(page.getByText('Hoja 3 de 5')).toBeVisible() // retoma en la primera hoja sin calificar
  await expect(page.getByRole('dialog', { name: 'Calificar hojas' }).getByText(/HF 2, II 8\.3/)).toBeVisible() // [0, 1] → II = 1 / (6 × 2) × 100
  await calificar(page, [2, 3, 4])
  await expect(page.getByText('Todas las hojas calificadas')).toBeVisible()
  await page.getByRole('button', { name: 'Volver a la planta' }).click()
  await expect(page.getByLabel('Observaciones')).toHaveValue('a mitad de la quinta')
  await expect(page.getByRole('button', { name: 'Hoja más joven con estría: hoja 3' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Planta 5 de 5')).toBeVisible()

  // Tabla 1: 5 plantas, todas con II 33.3.
  await page.getByRole('button', { name: /^Tabla 1/ }).click()
  await expect(page.getByText('Completa')).toHaveCount(5)
  await expect(page.getByText('33.3').first()).toBeVisible()
  await page.getByRole('button', { name: 'Terminar tabla' }).click()
  await context.setOffline(false)

  // 7. Cerrar el recorrido (la tabla 2 quedó sin plantas: el diálogo lo avisa).
  await page.getByRole('button', { name: 'Cerrar recorrido' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('1 tabla(s) sin plantas capturadas')
  await page.getByRole('button', { name: 'Cerrar recorrido' }).last().click()
  await expect(page.getByText('No tienes recorridos abiertos')).toBeVisible()

  // 8. El administrador lo ve cerrado; el operador ya no lo ve.
  await entrarComo(page, 'Propietario (admin)')
  await expect(page.getByRole('heading', { name: 'Cerrados' })).toBeVisible()
  await page.getByRole('button', { name: /Operador 1: 2 tablas, 5 plantas/ }).click()
  await expect(page.getByText('Cerrado, por enviar').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reabrir recorrido' })).toBeVisible()
  await expect(page.getByText('II del recorrido (%)')).toBeVisible()
  await page.getByRole('button', { name: 'Recorridos' }).click()
  await entrarComo(page, 'Operador 1 (operador)')
  await expect(page.getByText('No tienes recorridos abiertos')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cerrados' })).toHaveCount(0)

  // Nada se perdió: 5 plantas con sus hojas y cambios en la cola, guardados en IndexedDB.
  const datos = await page.evaluate(async () => {
    const abrir = indexedDB.open('sigatoka')
    const db = await new Promise<IDBDatabase>((ok, mal) => {
      abrir.onsuccess = () => ok(abrir.result)
      abrir.onerror = () => mal(abrir.error)
    })
    const todo = (tabla: string) =>
      new Promise<unknown[]>((ok, mal) => {
        const r = db.transaction(tabla).objectStore(tabla).getAll()
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
    const plantas = (await todo('plantas')) as Array<{ eliminado: boolean }>
    const hojas = (await todo('hojas')) as Array<{ eliminado: boolean; grado_gauhl: number | null }>
    const pendientes = await todo('pendientes')
    return { plantas: plantas.filter((p) => !p.eliminado).length, hojasCalificadas: hojas.filter((h) => !h.eliminado && h.grado_gauhl != null).length, pendientes: pendientes.length }
  })
  expect(datos.plantas).toBe(5)
  expect(datos.hojasCalificadas).toBe(25)
  expect(datos.pendientes).toBeGreaterThan(50)
})

test('12 hojas seguidas sin esperar: la interfaz avanza al instante y todo se guarda en orden', async ({ page }) => {
  await configurarRancho(page)
  await entrarComo(page, 'Operador 1 (operador)')
  await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar recorrido (1 tabla)' }).click()
  await page.getByRole('button', { name: /^1 Sin iniciar/ }).click()
  await page.getByRole('button', { name: /^Nueva planta/ }).click()
  await page.getByRole('button', { name: 'Sumar total de hojas' }).click()
  await page.getByRole('button', { name: 'Sumar total de hojas' }).click()
  await expect(page.getByLabel('total de hojas actual')).toHaveText('12')
  await page.getByRole('button', { name: /^Calificar las 12 hojas/ }).click()

  const grados = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]
  const t0 = Date.now()
  for (const [i, g] of grados.entries()) {
    await page.getByRole('button', { name: new RegExp(`^Grado ${g}:`) }).click()
    // Cada toque se refleja de inmediato: la hoja calificada muestra su grado en la planta dibujada.
    await expect(page.getByRole('button', { name: `Hoja ${i + 1}, grado ${g}` })).toBeVisible({ timeout: 1500 })
  }
  console.log(`12 hojas calificadas en ${Date.now() - t0} ms (incluye la sobrecarga de Playwright)`)
  await expect(page.getByText('Todas las hojas calificadas')).toBeVisible()
  await page.getByRole('button', { name: 'Volver a la planta' }).click()

  // Lo guardado en la base coincide, en orden, con lo tocado.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const abrir = indexedDB.open('sigatoka')
        const db = await new Promise<IDBDatabase>((ok, mal) => {
          abrir.onsuccess = () => ok(abrir.result)
          abrir.onerror = () => mal(abrir.error)
        })
        const hojas = await new Promise<Array<{ numero_hoja: number; grado_gauhl: number | null; eliminado: boolean }>>((ok, mal) => {
          const r = db.transaction('hojas').objectStore('hojas').getAll()
          r.onsuccess = () => ok(r.result)
          r.onerror = () => mal(r.error)
        })
        return hojas.filter((h) => !h.eliminado).sort((a, b) => a.numero_hoja - b.numero_hoja).map((h) => h.grado_gauhl)
      }),
    )
    .toEqual(grados)
})

test.describe('iPhone sin instalar', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })

  test('avisa y bloquea "Nuevo recorrido" hasta que se confirme capturar en el navegador', async ({ page }) => {
    await configurarRancho(page)
    await expect(page.getByText('Instala la app antes de capturar: en iPhone, lo que captures en el navegador no aparece en la app instalada.')).toBeVisible()
    await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
    const dialogo = page.getByRole('alertdialog', { name: 'Instala la app antes de capturar' })
    await expect(dialogo).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nuevo recorrido' })).toHaveCount(0)
    // "Ver cómo instalar" no deja pasar: lleva a las instrucciones.
    await dialogo.getByRole('button', { name: 'Ver cómo instalar' }).click()
    await expect(page.getByRole('heading', { name: 'Instalar la app' })).toBeVisible()
    await expect(page.getByText('Agregar a inicio').first()).toBeVisible()
    // Confirmar explícitamente permite capturar.
    await page.getByRole('button', { name: 'Campo' }).click()
    await page.getByRole('button', { name: 'Nuevo recorrido' }).click()
    await page.getByRole('button', { name: 'Capturar aquí de todos modos' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo recorrido' })).toBeVisible()
  })
})

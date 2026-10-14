# Reporte del hito 6A: Tablero en la PWA

Trabajo directo en `main` (decisión del responsable), sin push. El código clave y las pruebas están en el handoff.

## Diagnóstico (Fase 0)
- **Código previo del tablero:** no hay. `git log --all -S "Tablero"` solo toca el primer commit (CLAUDE.md/prototipo) y `src/ui/estilos.css` ya traía los estilos `/* tablero */` portados (`.filtros`, `.rej-tab`, `.panel`, `.mapa`, `.seg`, `table.datos`, `.barra-h`, `.apilada`…). No hay pantalla en `src/ui/`.
- **Dominio que ya cubría el prototipo:** `INDICADORES`, `filas`, `serie`, `valorEn`, `previa`, `ultimaAplicacion`, `repeticionesFrac`, `efectoAplicacion` (`analisis.ts`); `resumen`, `distribucion`, `hf`, `iiPlanta`, `semaforo`, `promedio`, `GRADOS_GAUHL` (`calculos.ts`); `porSemana` (`clima.ts`); fechas y `proyección` de KML (`fechas.ts`, `geo.ts`).
- **Faltaba en dominio** (estaba incrustado en el componente `Tablero`/`MapaTablas`/gráficas del prototipo): `escalaNice`, semana por defecto, estado por tabla en la semana activa (con la regla de "hasta 2 semanas previas"), tablas que empeoran, tablas por revisar (regla provisional), semanas con repunte, clima con desfase y la proyección de polígonos del mapa. Se agregaron en `src/dominio/tablero.ts`.
- **Consultas:** `consultas` solo tenía lecturas por recorrido/tabla/planta; no había lectura de aplicaciones ni de clima. Se agregó `datosTablero()` (una sola lectura de tablas, usuarios, recorridos, evaluaciones con plantas y hojas, aplicaciones y clima, sin eliminados). Lee las tablas completas y agrupa en memoria en vez de consultar planta por planta.
- Sin cambios al modelo de datos ni al esquema de Dexie/Supabase.

## 1. Resumen
Pestaña "Tablero" (solo administrador) con: filtros (fechas, semana de corte, operador, tablas), cuatro "respuestas" (qué tablas empeoran, cuándo aplicar, si funcionó la última aplicación, qué clima precedió los repuntes), mapa de riesgo en SVG con los umbrales del rancho, estado por tabla, tendencia semanal (II, TH, HF, HMJE, HMJM y Pizca) con marcadores de aplicaciones y clima con desfase, comparativo de la semana, efecto de las aplicaciones y detalle por planta y hoja con la distribución de grados por posición. Aplicaciones y clima ya se leen de Dexie; vacíos muestran "Sin aplicaciones registradas." y "Sin datos de clima." Gráficas en SVG propio (sin librerías).

## 2. Criterios de aceptación
- [x] Pestaña solo para administrador; el operador no la ve — e2e `tablero.spec.ts` (pestaña ausente como operador, presente como administrador).
- [x] Mapa con polígonos coloreados por semáforo con umbrales del rancho — e2e: 3 polígonos del KMZ sintético, tabla 1 con II 33.3.
- [x] Filtros, series, comparativo, detalle por tabla/planta/hoja — portados; lógica de cálculo cubierta por pruebas de dominio.
- [x] Estados vacíos de aplicaciones y clima — e2e.
- [x] Lecturas solo por `@/datos` (`consultas.datosTablero`) con `useLiveQuery`; sin Dexie directo en la UI.
- [x] Funciones nuevas de dominio con pruebas (13) y consulta nueva con fake-indexeddb (4, incluye rendimiento con 200 recorridos × 20 plantas × 13 hojas).
- [x] Sin desborde horizontal del contenido principal a 390 px — e2e.
- [~] Revisión visual en celular real de 390 px y en computadora: pendiente del responsable (no hubo dispositivo; solo se comprobó estructura y desborde por prueba).
- [x] `typecheck`, `lint`, `test`, `build`, `e2e` de captura y tablero en verde. Ver sección 4 sobre 3 pruebas de `sincronizacion`.

## 3. Decisiones tomadas y por qué
- **Sin dependencias nuevas.** Gráficas, mapa y escalas en SVG propio, como el prototipo.
- Cálculos movidos a `src/dominio/tablero.ts` (puros, ejecutables en el servidor).
- `datosTablero()` carga todo y agrupa en memoria: con 200 recorridos tarda poco (prueba < 1.5 s en fake-indexeddb). Si el volumen crece, se puede limitar por rango de fechas más adelante.
- La serie "total" (sin filtro de fechas) se usa para el efecto de las aplicaciones, igual que el prototipo, para poder comparar con evaluaciones fuera del rango.
- Los filtros de fechas se guardan en `localStorage` (preferencia de este dispositivo, con try/catch); operador/tablas/semana no se guardan.
- Umbrales del semáforo y días de alerta salen de `rancho` (`ii_umbral_medio`, `ii_umbral_alto`, `dias_alerta_aplicacion`); el prototipo usaba `ii_verde`/`ii_amarillo`.
- Textos del prototipo que remitían a "Administración" para cargar clima o aplicaciones se cambiaron por estados vacíos neutros, porque esas pantallas llegan en los hitos 6B/7.
- Promedios de HMJ siguen la regla vigente (excluir "no presenta"); la KPI de Pizca ahora también indica cuántas plantas no la presentan (el prototipo lo mostraba solo para estría y mancha). La regla sigue pendiente del agrónomo.
- La regla "cuándo aplicar" es provisional (semáforo medio/alto y N+ días sin aplicación); está en una función (`tablasPorRevisar`) fácil de cambiar.

## 4. Desviaciones del plan o de este documento
- `playwright.config.ts`: el proyecto `captura` ahora también ejecuta `tablero.spec.ts`.
- **Tres pruebas e2e de `sincronizacion` fallan, también en `main` limpio (verificado con `git stash`)** — no son del tablero: `operadorNuevo()` recibe una respuesta de la función `operadores` del Supabase local sin `pin` (`expect(op.pin).toMatch(...)` con `undefined`). Pasan las 2 otras de ese proyecto. Sospecho de la función `operadores` local o de su configuración (PIMIENTA/entorno), pero no lo investigué porque está fuera del alcance.
- Exportar a CSV queda fuera, como se indicó (el panel "Exportar" del prototipo no se portó).

## 5. Salida completa
Ver bloque al final (typecheck, lint, test en dos zonas horarias, build y e2e).

## 6. Archivos clave para revisión
- `src/dominio/tablero.ts`: cálculos nuevos del tablero (escala, semana por defecto, estado por tabla, repuntes, clima con desfase, proyección del mapa).
- `src/dominio/tablero.test.ts`: pruebas con resultados conocidos.
- `src/datos/consultas.ts`: `datosTablero()`.
- `src/datos/consultas.tablero.test.ts`: pruebas de la consulta (fake-indexeddb).
- `src/ui/tablero/Tablero.tsx`: pantalla del tablero.
- `src/ui/tablero/Graficas.tsx`, `MapaTablas.tsx`: gráficas y mapa en SVG.
- `src/ui/App.tsx`, `navegacion.ts`, `iconos.tsx`: pestaña y navegación.
- `e2e/tablero.spec.ts`: prueba de extremo a extremo.

## 7. Dudas o riesgos abiertos
- Falta ver el tablero en un celular real y con datos reales (varias semanas, varias tablas): colores, legibilidad de gráficas y tamaño de objetivos táctiles de las filas.
- Desborde de 9 px a 390 px en el encabezado (botón de conexión junto al selector de roles de simulación) cuando el administrador está en modo sin servidor; ya existía, no es del tablero.
- Los filtros de fechas por defecto muestran las últimas 16 semanas.
- Las pruebas de `sincronizacion` rotas en `main` (sección 4) conviene revisarlas antes del siguiente hito.
- Preaviso biológico: el tablero solo muestra evaluaciones `stover`, como indica `filas`.

## Salida de los comandos
```text
> sigatoka@0.1.0 typecheck
> tsc --noEmit
> sigatoka@0.1.0 lint
> eslint . --max-warnings 0
> sigatoka@0.1.0 test
> TZ=America/Mexico_City vitest run && TZ=UTC vitest run
 RUN  v5.0.3 /Users/dravechacon/Dev/salvador
[rendimiento] tarjetasRecorridos con 200 recorridos × 20 plantas × 13 hojas: 21 ms, 22 ms, 26 ms
 Test Files  20 passed (20)
      Tests  275 passed (275)
   Start at  15:03:17
   Duration  2.25s (tests 70%, environment 13%, transform 12%, import 5%, worker 1%)
 RUN  v5.0.3 /Users/dravechacon/Dev/salvador
[rendimiento] tarjetasRecorridos con 200 recorridos × 20 plantas × 13 hojas: 21 ms, 35 ms, 42 ms
 Test Files  20 passed (20)
      Tests  275 passed (275)
   Start at  21:03:20
   Duration  2.26s (tests 75%, transform 12%, environment 9%, import 4%, worker 1%)
> sigatoka@0.1.0 build
> tsc --noEmit && vite build && node scripts/verificar-dist.mjs
vite v8.3.4 building client environment for production...
transforming...
✓ 100 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                                            0.52 kB
dist/index.html                                                      1.07 kB │ gzip:   0.49 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BbWidj28.woff    14.02 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-BK6Glc0m.woff    14.29 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2   17.20 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2   17.52 kB
dist/assets/index-BruoiLKe.css                                      16.23 kB │ gzip:   4.27 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js                      5.65 kB │ gzip:   2.20 kB
dist/assets/jszip.min-CMEPP0JV.js                                   95.93 kB │ gzip:  28.47 kB
dist/assets/index-BzFyCI24.js                                      459.05 kB │ gzip: 140.42 kB
✓ built in 87ms
PWA v2.0.0
mode      generateSW
precache  20 entries (643.37 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
dist/ limpia: 8 archivos revisados, sin acceso de desarrollo ni llaves secretas.
> sigatoka@0.1.0 e2e
> playwright test
Running 10 tests using 1 worker
  ✓   1 [captura] › e2e/captura.spec.ts:50:1 › flujo de captura: KMZ, recorrido de 2 tablas, 5 plantas (2 sin conexión), recarga y cierre (4.1s)
12 hojas calificadas en 400 ms (incluye la sobrecarga de Playwright)
  ✓   2 [captura] › e2e/captura.spec.ts:163:1 › 12 hojas seguidas sin esperar: la interfaz avanza al instante y todo se guarda en orden (1.1s)
  ✓   3 [captura] › e2e/captura.spec.ts:207:1 › si IndexedDB falla al guardar: aviso fijo con Reintentar, el recorrido no se puede cerrar y al reintentar se guarda (975ms)
  ✓   4 [captura] › e2e/captura.spec.ts:271:3 › iPhone sin instalar › avisa y bloquea "Nuevo recorrido" hasta que se confirme capturar en el navegador (443ms)
  ✓   5 [captura] › e2e/tablero.spec.ts:36:1 › el tablero lo ve el administrador con el mapa y los datos; el operador no lo ve (1.4s)
  ✘   6 [sincronizacion] › e2e/sincronizacion.spec.ts:47:1 › el operador entra con código, usuario y PIN, captura sin conexión y al volver la señal el encabezado pasa a "Al día" solo (569ms)
  ✘   7 [sincronizacion] › e2e/sincronizacion.spec.ts:76:1 › un PIN incorrecto muestra el error genérico y no entra (440ms)
  ✘   8 [sincronizacion] › e2e/sincronizacion.spec.ts:87:1 › el propietario agrega un operador y ve el diálogo con el PIN (11.0s)
  ✓   9 [sincronizacion] › e2e/sincronizacion.spec.ts:120:1 › crear cuenta de propietario con un código de alta y crear su rancho (1.2s)
  ✓  10 [sincronizacion] › e2e/sincronizacion.spec.ts:137:1 › "Ahora no" oculta el aviso de campo, pero "Subir los datos de antes de las cuentas" sigue en Estado y sube las tablas (6.3s)
  1) [sincronizacion] › e2e/sincronizacion.spec.ts:47:1 › el operador entra con código, usuario y PIN, captura sin conexión y al volver la señal el encabezado pasa a "Al día" solo 
    TypeError: expect(received).toMatch(expected)
    Matcher error: received value must be a string
    Received has value: undefined
      47 | test('el operador entra con código, usuario y PIN, captura sin conexión y al volver la señal el encabezado pasa a "Al día" solo', async ({ page, context }) => {
      48 |   const op = await operadorNuevo()
    > 49 |   expect(op.pin).toMatch(/^\d{6}$/)
         |                  ^
      50 |   await entrarComoOperador(page, op)
      51 |
      52 |   await context.setOffline(true)
        at /Users/dravechacon/Dev/salvador/e2e/sincronizacion.spec.ts:49:18
    Error Context: test-results/sincronizacion-el-operador-74f98-cabezado-pasa-a-Al-día-solo-sincronizacion/error-context.md
    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/sincronizacion-el-operador-74f98-cabezado-pasa-a-Al-día-solo-sincronizacion/trace.zip
    Usage:
        npx playwright show-trace test-results/sincronizacion-el-operador-74f98-cabezado-pasa-a-Al-día-solo-sincronizacion/trace.zip
    ────────────────────────────────────────────────────────────────────────────────────────────────
  2) [sincronizacion] › e2e/sincronizacion.spec.ts:76:1 › un PIN incorrecto muestra el error genérico y no entra 
    Error: locator.fill: value: expected string, got undefined
      77 |   const op = await operadorNuevo()
      78 |   await page.goto('/')
    > 79 |   await page.getByLabel('Código del rancho').fill(op.codigo_rancho)
         |                                              ^
      80 |   await page.getByLabel('Usuario').fill(op.alias)
      81 |   await page.getByLabel('PIN de 6 dígitos').fill(op.pin === '000000' ? '111111' : '000000')
      82 |   await page.getByRole('button', { name: 'Entrar', exact: true }).click()
        at /Users/dravechacon/Dev/salvador/e2e/sincronizacion.spec.ts:79:46
    Error Context: test-results/sincronizacion-un-PIN-inco-21eee-l-error-genérico-y-no-entra-sincronizacion/error-context.md
    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/sincronizacion-un-PIN-inco-21eee-l-error-genérico-y-no-entra-sincronizacion/trace.zip
    Usage:
        npx playwright show-trace test-results/sincronizacion-un-PIN-inco-21eee-l-error-genérico-y-no-entra-sincronizacion/trace.zip
    ────────────────────────────────────────────────────────────────────────────────────────────────
  3) [sincronizacion] › e2e/sincronizacion.spec.ts:87:1 › el propietario agrega un operador y ve el diálogo con el PIN 
    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('alertdialog', { name: 'Datos de acceso del operador' })
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found
    Call log:
      - Expect "toBeVisible" getByRole('alertdialog', { name: 'Datos de acceso del operador' }) with timeout 10000ms
      - waiting for getByRole('alertdialog', { name: 'Datos de acceso del operador' })
      100 |
      101 |   const dialogo = page.getByRole('alertdialog', { name: 'Datos de acceso del operador' })
    > 102 |   await expect(dialogo).toBeVisible()
          |                         ^
      103 |   await expect(dialogo).toContainText('Código del rancho: PRUEBA')
      104 |   await expect(dialogo).toContainText(/Usuario: maria/)
      105 |   await expect(dialogo.locator('.pin')).toHaveText(/^\d{6}$/)
        at /Users/dravechacon/Dev/salvador/e2e/sincronizacion.spec.ts:102:25
    Error Context: test-results/sincronizacion-el-propieta-d1303--y-ve-el-diálogo-con-el-PIN-sincronizacion/error-context.md
    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/sincronizacion-el-propieta-d1303--y-ve-el-diálogo-con-el-PIN-sincronizacion/trace.zip
    Usage:
        npx playwright show-trace test-results/sincronizacion-el-propieta-d1303--y-ve-el-diálogo-con-el-PIN-sincronizacion/trace.zip
    ────────────────────────────────────────────────────────────────────────────────────────────────
  3 failed
    [sincronizacion] › e2e/sincronizacion.spec.ts:47:1 › el operador entra con código, usuario y PIN, captura sin conexión y al volver la señal el encabezado pasa a "Al día" solo 
    [sincronizacion] › e2e/sincronizacion.spec.ts:76:1 › un PIN incorrecto muestra el error genérico y no entra 
    [sincronizacion] › e2e/sincronizacion.spec.ts:87:1 › el propietario agrega un operador y ve el diálogo con el PIN 
  7 passed (42.6s)
```

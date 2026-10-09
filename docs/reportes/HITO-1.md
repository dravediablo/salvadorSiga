# Reporte del hito 1: base del proyecto, dominio con pruebas y cascarón PWA

Rama: `hito-1-base-pwa-dominio` (3 commits, sin subir a ningún remoto). Fecha: 2026-10-09.

**Estado: parcial.** El código, las pruebas, la compilación y el despliegue están terminados. Quedan pendientes las pruebas en celulares reales; ver "Criterios de aceptación" y "Dudas o riesgos abiertos".

## 1. Resumen

- Proyecto Vite 8 + React 19 + TypeScript 6 estricto, con alias `@/` → `src/`, ESLint, Vitest y los scripts pedidos.
- `src/dominio` portado desde `referencia/prototipo.html` (Modelo, Calc, Analisis, Clima, Geo) a funciones tipadas y puras. Las funciones de análisis reciben los datos como parámetros.
- Plantas y hojas son entidades separadas (`Planta`, `Hoja`) con llave foránea; `PlantaConHojas` es el tipo de entrada de `resumen` y `distribucion`.
- La regla del promedio de HMJ vive en una sola función, `resumenSintoma`, con el parámetro `estrategia` (único valor: `'excluir_no_presenta'`).
- 77 pruebas, incluidos todos los casos de la tarea 4. Se ejecutan con `TZ=America/Mexico_City` y con `TZ=UTC`. Cobertura de `src/dominio`: 99,6 % de líneas.
- Cascarón PWA: manifest, íconos provisionales, service worker con `registerType: 'prompt'`, pantalla de inicio con estado, instalación (Android, iPhone en Safari y en otro navegador), aviso de actualización y solicitud de almacenamiento persistente con registro.
- `vercel.json` con reescritura de rutas y encabezados de caché. Desplegado en Vercel: producción `https://salvadorsiga.vercel.app`, desde `main`.

## 2. Criterios de aceptación

**Calidad del código**

- [x] `typecheck`, `lint`, `test` y `build` pasan sin errores ni advertencias. Salida completa en la sección 5.
- [x] Todos los casos de la tarea 4 están implementados y pasan; cobertura de `src/dominio` 99,6 % de líneas (sección 5).
- [x] Importar `react`, `@/ui`, `@/pwa` o `dexie` desde `src/dominio` hace fallar el lint. Intento temporal (archivo `src/dominio/_intento.ts`, ya borrado):

  ```
  1:1  error  'react' import is restricted from being used by a pattern. src/dominio no puede importar React                             no-restricted-imports
  2:1  error  '@/ui/App' import is restricted from being used by a pattern. src/dominio no puede depender de datos, ui ni pwa            no-restricted-imports
  3:1  error  '@/pwa/persistencia' import is restricted from being used by a pattern. src/dominio no puede depender de datos, ui ni pwa  no-restricted-imports
  4:1  error  'dexie' import is restricted from being used by a pattern. src/dominio no puede importar Dexie ni Supabase                 no-restricted-imports
  ✖ 4 problems (4 errors, 0 warnings)
  ```
- [x] Ningún archivo de `src/dominio` usa `new Date('AAAA-MM-DD')`, `localStorage`, `window` ni `document`. `grep` sobre los archivos que no son de prueba: la única coincidencia de `DOMParser` está en `geo.ts`. Los `new Date(...)` son `new Date(Date.UTC(...))`, `new Date()` en `hoy()` y en `ahora()` de `modelo.ts` (para `created_at`/`updated_at`).

**PWA**

- [~] **Lighthouse sobre `https://salvadorsiga.vercel.app` (producción, desplegada desde `main`).** Lighthouse 13.5.0 ya no incluye la sección PWA ni auditorías de instalación, así que el criterio tal como está escrito no se puede cumplir con esa herramienta; la instalación queda a cargo de las pruebas en celulares. Resultado de la primera corrida: rendimiento 99, accesibilidad 95, buenas prácticas 100, SEO 82. Fallos que importaban y se corrigieron: contraste 4,28:1 en la etiqueta verde "Sí" (ahora usa `--leaf`) y falta de meta descripción. Los otros fallos son `robots.txt`, `llms.txt` y `ard-schema`, sin relevancia para el piloto. Segunda corrida tras el arreglo (misma URL): rendimiento 100, accesibilidad 100, buenas prácticas 100, SEO 91; solo fallan `robots-txt`, `llms-txt` y `ard-schema`.
- [x] Verificado contra producción con `curl -I`: `sw.js`, `index.html` y `manifest.webmanifest` con `Cache-Control: no-cache`; `/assets/*` con `public, max-age=31536000, immutable`; `/` con `max-age=0, must-revalidate`; una ruta inexistente devuelve `index.html`; el manifest sale como `application/manifest+json`.

**Pruebas en celulares reales: ninguna realizada** (no tengo acceso a dispositivos). Falta registrar fecha, modelo y versión del sistema de cada una:

- [ ] Android con Chrome: botón "Instalar", instalación y apertura en pantalla completa.
- [ ] iPhone con Safari: instalación siguiendo las instrucciones y apertura en pantalla completa.
- [ ] Ambos: modo avión, cerrar por completo y volver a abrir.
- [ ] Ambos: al publicar una versión nueva aparece el aviso y la app no se recarga sola. En el código: `onNeedRefresh` solo enciende el aviso, y la única llamada a `skipWaiting` en `dist/sw.js` está detrás del mensaje `SKIP_WAITING` que envía el botón "Actualizar ahora".
- [ ] Ambos: se muestra y queda registrado el resultado de `navigator.storage.persist()` (se muestra en pantalla y se guarda en `localStorage` bajo `sigatoka.persistencia`, últimas 20 solicitudes).

**Entrega**

- [x] Este archivo sigue la plantilla de `CLAUDE.md`.

## 3. Decisiones tomadas y por qué

**Dependencias nuevas** (todas con versiones estables actuales):

| Dependencia | Para qué |
|---|---|
| `react`, `react-dom` | Interfaz (stack de `CLAUDE.md`). |
| `dexie` | Instalada sin uso, como permite el hito. |
| `vite`, `@vitejs/plugin-react`, `typescript` | Herramientas del stack. |
| `vite-plugin-pwa` | Manifest y service worker con Workbox. |
| `vitest`, `@vitest/coverage-v8`, `jsdom` | Pruebas; `jsdom` solo para `geo.test.ts` (`DOMParser`). |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals` | Lint y regla de dependencias. |
| `@fontsource/atkinson-hyperlegible` | **No estaba en la lista.** El prototipo cargaba la fuente desde Google Fonts, que no funciona sin conexión. Así se incluye en el precache. |
| `sharp` (desarrollo) | Exportar los SVG de los íconos a PNG (`scripts/iconos.mjs`). |
| `@types/react`, `@types/react-dom`, `@types/node` | Tipos. |

**Decisiones de diseño**

- `semaforo` recibe `{ ii_umbral_medio, ii_umbral_alto }`, los nombres de `rancho` en `CLAUDE.md`, no `ii_verde`/`ii_amarillo` del prototipo.
- `nuevaPlanta` devuelve `{ planta, hojas }` y `ajustarHojas(planta, hojas, th)` recibe y devuelve arreglos de `Hoja`, porque ahora son entidades separadas. Se agregaron `nuevaHoja`, `nuevoRancho` y `nuevaMembresia`.
- No se portaron `aDocumentosMes`, `todosLosDias`, `catalogoEjemplo`, `configInicial`, `nuevoUsuario` ni la lectura de KMZ: dependen del almacén del prototipo, de la descompresión (hito 6) o de datos de ejemplo.
- `validar` y `resumen` ignoran hojas y plantas con `eliminado = true`.
- El `test` corre dos veces (`TZ=America/Mexico_City` y `TZ=UTC`), con lo que la comprobación de zona horaria está en el script y no depende de que alguien la recuerde.
- Los archivos de prueba van junto al código (`*.test.ts`). `ayudas.test-util.ts` es un ayudante de pruebas excluido de la cobertura.
- Se pide almacenamiento persistente automáticamente al abrir la app ya instalada, y con un botón manual en cualquier momento (para poder probar también desde el navegador).
- El aviso de "instala antes de capturar" aparece en cualquier iPhone o iPad sin instalar, tanto en Safari como en otros navegadores.
- La versión de compilación es `hash de commit · fecha UTC`; sin repositorio, solo la fecha.

## 4. Desviaciones del plan o de este documento

- `HITO-1.md` y `prototipo.html` estaban en la raíz, no en `docs/hitos/` ni `referencia/`. Se copiaron a esas rutas. **Las copias de la raíz siguen ahí** (están en `.gitignore`); conviene borrarlas.
- `Tablas/Tablas El Salvador.kmz` (geometría real de los lotes) está en la raíz y **no se incluyó en el repositorio**: es información del productor y se usa en el hito 6. Decide si debe versionarse.
- El proyecto de Vercel venía con otro preset y hubo que cambiarlo a Vite (Settings → Build & Development) para que el push de `main` lo desplegara. El repositorio remoto es privado: `github.com/dravediablo/salvadorSiga`.
- `vite-plugin-pwa` 2.0 y Vite 8 son versiones muy recientes; no hubo incompatibilidades, pero conviene tenerlo presente si algo falla en un dispositivo.
- Los íconos son provisionales (hoja verde sobre fondo claro), como pide el hito; se revisaron como PNG, no en un celular.

## 5. Salida completa

### `npm run typecheck`

```

> sigatoka@0.1.0 typecheck
> tsc --noEmit

```

### `npm run lint`

```

> sigatoka@0.1.0 lint
> eslint . --max-warnings 0

```

### `npm run test`

```

> sigatoka@0.1.0 test
> TZ=America/Mexico_City vitest run && TZ=UTC vitest run


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador


 Test Files  6 passed (6)
      Tests  77 passed (77)
   Start at  13:11:30
   Duration  414ms (environment 59%, transform 24%, tests 8%, import 7%, worker 2%)


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador


 Test Files  6 passed (6)
      Tests  77 passed (77)
   Start at  19:11:30
   Duration  298ms (environment 48%, transform 31%, tests 9%, import 9%, worker 3%)

```

### `npm run build`

```

> sigatoka@0.1.0 build
> tsc --noEmit && vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 28 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                                                0.52 kB
dist/index.html                                                          0.93 kB │ gzip:  0.43 kB
dist/assets/atkinson-hyperlegible-latin-ext-400-normal-Bbz-b3yf.woff     7.35 kB
dist/assets/atkinson-hyperlegible-latin-ext-700-normal-CKkU2Dpt.woff     7.35 kB
dist/assets/atkinson-hyperlegible-latin-ext-700-normal-BoVPHkS0.woff2    9.37 kB
dist/assets/atkinson-hyperlegible-latin-ext-400-normal-DRk46D-x.woff2    9.38 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BbWidj28.woff        14.02 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-BK6Glc0m.woff        14.29 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2       17.20 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2       17.52 kB
dist/assets/index-NnY-GFqD.css                                           4.68 kB │ gzip:  1.63 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js                          5.65 kB │ gzip:  2.20 kB
dist/assets/index-DlPyZzFX.js                                          229.12 kB │ gzip: 72.13 kB

✓ built in 65ms

PWA v2.0.0
mode      generateSW
precache  25 entries (374.07 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```

### `npm run test:cobertura`

```

> sigatoka@0.1.0 test:cobertura
> TZ=America/Mexico_City vitest run --coverage


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador
      Coverage enabled with v8


 Test Files  6 passed (6)
      Tests  77 passed (77)
   Start at  13:11:32
   Duration  334ms (environment 41%, transform 31%, worker 13%, import 9%, tests 7%)

 % Coverage report from v8
-------------|---------|----------|---------|---------|-------------------
File         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------|---------|----------|---------|---------|-------------------
All files    |    99.7 |    97.98 |     100 |    99.6 |                   
 analisis.ts |    98.8 |      100 |     100 |   98.36 | 161               
 calculos.ts |     100 |      100 |     100 |     100 |                   
 clima.ts    |     100 |      100 |     100 |     100 |                   
 fechas.ts   |     100 |    83.33 |     100 |     100 | 38                
 geo.ts      |     100 |    89.28 |     100 |     100 | 52,56             
 modelo.ts   |     100 |      100 |     100 |     100 |                   
-------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 99.7% ( 338/339 )
Branches     : 97.98% ( 195/199 )
Functions    : 100% ( 116/116 )
Lines        : 99.6% ( 251/252 )
================================================================================
```

## 6. Archivos clave para revisión

| Ruta | Contenido |
|---|---|
| `src/dominio/calculos.ts` | HF, II, `resumen`, `distribucion`, `validar`, `semaforo` y la regla de HMJ (`resumenSintoma`). |
| `src/dominio/fechas.ts` | Semana ISO y aritmética de fechas con `Date.UTC`. |
| `src/dominio/calculos.test.ts`, `fechas.test.ts` | Casos con resultado conocido de la tarea 4. |
| `src/dominio/analisis.ts` | Series semanales, FRAC repetido y efecto de una aplicación. |
| `src/dominio/modelo.ts`, `tipos.ts` | Fábricas y entidades de `CLAUDE.md`. |
| `src/dominio/geo.ts`, `clima.ts` | Parser de KML con área y centroide; CSV y agregación semanal de clima. |
| `eslint.config.js` | Regla `no-restricted-imports` para `src/dominio`. |
| `vite.config.ts` | Sección PWA (manifest, `registerType: 'prompt'`, Workbox) y configuración de Vitest. |
| `vercel.json` | Reescritura a `index.html` y encabezados de caché. |
| `src/pwa/*.ts` | Instalación, actualización, persistencia, conexión y detección de plataforma. |
| `src/ui/App.tsx`, `PanelInstalacion.tsx`, `AvisoActualizacion.tsx` | Pantalla de inicio provisional. |
| `public/` y `scripts/iconos.mjs` | Íconos provisionales y su generador. |

## 7. Dudas o riesgos abiertos

- **Pruebas en dispositivos pendientes** (lista en la sección 2). El mayor riesgo del piloto sigue sin validarse: instalación desde un enlace y apertura sin conexión en Android y iPhone.
- **Detección de navegador en iPhone** por `userAgent` (CriOS, FxiOS, etc.): puede fallar con navegadores poco comunes, que caerían en "abre el enlace en Safari" o en las instrucciones de Safari.
- **Persistencia en Safari:** `navigator.storage.persist()` puede responder "rechazada" en iOS aunque los datos se conserven; hay que interpretarlo con los resultados de los celulares reales.
- **Decisiones pendientes de `CLAUDE.md` sin tocar:** promedio de HMJ (hay una sola función para cambiarlo), umbrales definitivos del semáforo, preaviso biológico y texto de privacidad. Los umbrales 20/30 de `nuevoRancho` son provisionales.
- **Cambios al modelo de datos propuestos (no aplicados):** ninguno. `ClimaDiario` y `AplicacionTabla` no heredan `Registro` porque `CLAUDE.md` no les asigna `id`; `CLAUDE.md` sí dice que todas las entidades llevan `created_at`, `updated_at`, `server_updated_at` y `eliminado`, así que conviene decidir qué hacer con ellas antes del hito 3.

## 8. Ajustes posteriores al hito (2026-10-09)

Aplicados después de la revisión, antes de empezar el hito 2:

- `CLAUDE.md` reemplazado por la versión nueva (el KMZ pasa al hito 2; `tabla_ids` dentro de `aplicacion`; `id` en todas las entidades; datos reales fuera del repositorio).
- Modelo: `Aplicacion.tabla_ids: string[]` y se elimina `AplicacionTabla`; `ClimaDiario` pasa a `extends Registro` (con `id`). `aplicacionesDeTabla`, `ultimaAplicacion` y `repeticionesFrac` ya no reciben enlaces. Se agregó una prueba de una aplicación sobre varias tablas (78 pruebas).
- Copias sueltas de `HITO-1.md` y `prototipo.html` en la raíz borradas (eran idénticas a las de `docs/hitos/` y `referencia/`).
- El KMZ real se movió a `datos-locales/`, que está en `.gitignore` (nunca estuvo en el historial de Git).
- KMZ sintético de 3 polígonos en `src/datos/__fixtures__/sintetico.kmz`, generado por `scripts/generar-kmz-sintetico.mjs`.
- `HITO-2.md` guardado en `docs/hitos/`.
- La lista de ajustes original no llegó a esta sesión; se aplicó según los seis puntos que la nombran. El punto "revisión de la fuente" no se pudo interpretar y queda pendiente de aclarar.

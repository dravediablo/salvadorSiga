# Reporte del hito 2: almacenamiento local, importación de KMZ y captura en campo

Rama: `hito-2-captura-local` (a partir de `main`, **sin fusionar**). Vista previa de Vercel: la compilación de la rama terminó con éxito; la URL esperada es `https://salvadorsiga-git-hito-2-captura-local-dravediablos-projects.vercel.app`, pero responde 302 al inicio de sesión de Vercel (ver riesgos). Fecha: 2026-10-09.

**Estado: parcial.** El código, las pruebas automáticas (133 unitarias y 3 de extremo a extremo) y la compilación pasan. Faltan las cuatro pruebas en celulares reales, que hace el responsable (lista en la sección 2).

## 1. Resumen

- **Base local** con Dexie: una tabla por entidad más `pendientes` (la cola) y `ajustes` (posición en la app y usuario simulado). Toda escritura pasa por un repositorio, que guarda el registro y su entrada en la cola **en la misma transacción**; si una falla, fallan las dos.
- **Repositorios** de rancho, tablas, recorridos y plantas/hojas, con borrado lógico en cascada y las reglas de hojas al cambiar el TH (baja: eliminar; sube: revivir con el mismo `id` y sin calificar; invariante de una sola hoja viva por `[planta_id+numero_hoja]`).
- **Orden de escritura**: todas las escrituras de la base pasan por una fila (`enOrden`), así que la interfaz puede avanzar sin esperarlas sin que se reordenen.
- **Rancho local y usuarios simulados**: configuración inicial (nombre + KMZ), tres usuarios de prueba con membresías, selector en el encabezado y `src/datos/sesion.ts` como único módulo del "usuario actual" (marcado `TEMPORAL`, a sustituir en el hito 5).
- **Permisos por rol** como funciones puras en `src/dominio/permisos.ts`, con pruebas.
- **Importación de KMZ/KML** (`jszip`, cargado solo al importar): código de tabla deducido del nombre del polígono, superficie calculada y editable, reimportación por código y desactivación opcional de las que no vienen; nunca se elimina una tabla.
- **Interfaz de captura** portada del prototipo: lista de recorridos, nuevo recorrido, recorrido, tabla, planta y modal de hojas; diálogos propios; indicador de conexión y de pendientes; pantalla de tablas del administrador; pestaña Estado (lo que era la pantalla del hito 1). La posición se guarda y se restaura al reabrir.
- **Calidad**: regla de ESLint que impide a la interfaz importar Dexie o `@/datos/*`, y otra que prohíbe `alert`, `confirm` y `prompt`.
- **Pruebas**: repositorios con `fake-indexeddb`, permisos, importación de tablas y 3 pruebas de extremo a extremo con Playwright en 390 × 844.

## 2. Criterios de aceptación

**Calidad del código**

- [x] `typecheck`, `lint`, `test`, `e2e` y `build` pasan sin errores ni advertencias (sección 5).
- [x] La interfaz no importa Dexie directo. Regla `no-restricted-imports` en `src/ui/**` (`dexie`, `@/datos/*`, `**/datos/*`; solo se permite `@/datos`). Intento temporal con `import Dexie from 'dexie'` y `import { SigatokaDB } from '@/datos/db'`:
  ```
  1:1  error  'dexie' import is restricted from being used. La interfaz no importa Dexie: usa @/datos (consultas y repos)
  2:1  error  '@/datos/db' import is restricted from being used by a pattern. Importa solo desde "@/datos"; las escrituras deben pasar por los repositorios
  ```
  `dexie-react-hooks` sí se permite: solo lee. La capa `src/datos` tampoco puede importar React, `ui` ni `pwa` (intento con `react` rechazado).
- [x] Toda escritura de los repositorios genera su entrada en `pendientes` en la misma transacción. Pruebas en `src/datos/repos.test.ts`:
  - *crear un recorrido con 3 tablas crea 3 evaluaciones y sus 4 entradas en la cola, en orden*;
  - *cada escritura deja su entrada* recorre todas las operaciones de los repositorios y comprueba, para **cada fila de cada tabla**, que su última entrada en la cola tiene el mismo `updated_at`;
  - dos pruebas de transacción fallida: si falla la 3.ª entrada de la cola, no queda ni el recorrido, ni las evaluaciones, ni ninguna entrada; si falla la entrada de la cola justo después del registro, el registro también se deshace.
- [x] Ningún código usa `alert`, `confirm` ni `prompt`. Reglas `no-restricted-globals` y `no-restricted-properties` (`window.`, `globalThis.`, `self.`). Intento temporal: `alert('hola')`, `window.confirm('seguro')` y `prompt('x')` fallaron el lint. Las confirmaciones usan `confirmar()` de `src/ui/dialogos.tsx`.

**Pruebas automáticas pedidas en la tarea 5**

- [x] Crear un recorrido con 3 tablas → 3 evaluaciones y entradas en la cola.
- [x] Bajar y subir el TH respeta las reglas e invariantes: pruebas de baja (conserva grados 1–8), subida (revive 9 y 10 con su `id` y `grado = null`, crea 11 y 12 nuevas, 12 filas en total) y una secuencia aleatoria de 40 cambios de TH que comprueba la invariante contra el índice `[planta_id+numero_hoja]`.
- [x] Borrado lógico en cascada (planta → hojas; recorrido → evaluaciones, plantas y hojas); las filas siguen en la base con `eliminado = true`.
- [x] Una transacción que falla a la mitad no deja ni el cambio ni la entrada.
- [x] Los datos persisten al abrir una nueva instancia de la base (mismo nombre, otra instancia): rancho, conteo de pendientes y calificaciones.
- [x] El II de una tabla leída de la base coincide con `src/dominio`: A `[0,0,6]` y B `[0,0,0,0,0,0]` → 11,11; planta `[0,0,0,1,2,3,3,4,5,6]` → II 40 y HF 8; planta `[0, 2, sin calificar]` → 16,67.
- [x] Permisos: todos los casos de operador y administrador (`src/dominio/permisos.test.ts`).
- [x] Extremo a extremo con Playwright (`e2e/captura.spec.ts`, 390 × 844, contra `vite preview`), los 8 pasos del hito: rancho con el KMZ sintético; entrar como operador; recorrido de 2 tablas; 3 plantas completas; `context.setOffline(true)` y 2 plantas más (la 5.ª a medias); **recarga sin conexión** a mitad de la 5.ª (la app carga desde el service worker y reabre el modal de hojas en la hoja 3, con "HF 2, II 8.3", observaciones y síntomas intactos); cierre del recorrido con aviso de tabla vacía; el administrador lo ve cerrado y el operador no. Además verifica en IndexedDB 5 plantas, 25 hojas calificadas y más de 50 entradas en la cola, y que se registró la solicitud de almacenamiento persistente.
- [x] `npm run e2e` agregado.

**Pruebas en celulares reales** (las hace el responsable; instalar la app desde la URL de vista previa y anotar fecha, modelo y versión del sistema de cada una):

- [ ] Importar el KMZ real de El Salvador (desde la pestaña Tablas, o en la configuración inicial) muestra todas las tablas con su superficie. Esperado: 15 polígonos = 13 tablas activas y 2 franjas "buffer" desactivadas. En una prueba local con el archivo real de `datos-locales/` (no versionado): 15 polígonos leídos; las superficies calculadas quedan a ±1,2 % de las que trae cada nombre (las franjas, hasta 6 %).
- [ ] En modo avión, capturar una tabla de al menos 10 plantas con todas sus hojas.
- [ ] Cerrar la app por completo a mitad de una planta y reabrirla: vuelve a esa planta, sin pérdida de datos.
- [ ] Calificar 12 hojas seguidas, a ritmo de campo, no se siente lento en el Android económico de prueba. En escritorio (Chrome headless, 390 × 844) las 12 hojas tardan 400 ms incluida la sobrecarga de Playwright, y cada toque se refleja de inmediato; falta el dispositivo real.
- [ ] Adicional sugerido: abrir la app con la pestaña Estado y anotar el resultado de almacenamiento persistente tras la primera captura (la prueba en iPhone con Safari no está en la lista del hito, pero conviene).

**Entrega**

- [x] Este reporte y el handoff con el formato de `CLAUDE.md`.


## 3. Decisiones tomadas y por qué

**Dependencias nuevas**

| Dependencia | Para qué |
|---|---|
| `dexie-react-hooks` | `useLiveQuery` para leer de la base (lo pide el hito). |
| `jszip` | Descomprimir el KMZ. Se importa de forma diferida: no entra en el arranque (el bundle principal pasó de 475 kB a 379 kB; JSZip son 96 kB aparte, que el service worker precarga igual para que funcione sin conexión). |
| `fake-indexeddb` (dev) | IndexedDB en las pruebas de repositorios. |
| `@playwright/test` (dev) | Pruebas de extremo a extremo. Se usa el Chrome instalado (`channel: 'chrome'`) para no descargar otro navegador. |

**Decisiones de diseño**

- **Interfaz sin Dexie.** `src/datos/index.ts` expone solo `repos`, `consultas`, `ajustes` y `sesion` ya enlazados a la base. Los repositorios son fábricas (`crearRepo…(db)`) para poder probarlos con una base de prueba. La lectura son funciones sin efectos que la interfaz envuelve en `useLiveQuery`.
- **Cola.** Una entrada por cada escritura (`entidad`, `registro_id`, `updated_at`, `creado_en`). El número que se muestra ("12 sin enviar") cuenta **registros distintos** (`uniqueKeys` sobre `registro_id`), no entradas, porque calificar 12 hojas de una planta crea 12 entradas. Esto último lo consolida el hito 4.
- **Respuesta inmediata.** El modal de hojas guarda el grado en una copia local y llama al repositorio sin esperar; las escrituras van en orden por la fila `enOrden`. Los campos de la planta (TH, síntomas, observaciones) usan un borrador local con el mismo esquema.
- **Posición guardada.** `ajustes` (tabla local, no sincroniza) guarda pantalla, recorrido, tabla, planta y si el modal de hojas estaba abierto. Al reabrir, el modal retoma en la primera hoja sin calificar. Si el recorrido guardado ya no es accesible para el usuario actual, se vuelve a la lista.
- **Pestañas.** Campo, Tablas (solo administrador) y Estado. La pantalla de inicio del hito 1 pasó a "Estado" (instalación, conexión, almacenamiento persistente, versión) y sigue disponible para operadores, que son quienes necesitan las instrucciones de instalación.
- **Índices.** `rancho_id` en todas las tablas que tienen ese campo; `ranchos` y `usuarios` solo por `id` porque no lo tienen. Además `usuario_id` y `estado` en `recorridos`, `usuario_id` en `membresias` y `[rancho_id+fecha]` en `clima`.
- **Código de tabla desde el nombre del polígono.** "Tabla 1. Sup. 6.82 ha." → `1`; "tabla 3. …" → `3`; "Tabla 2A. …" → `2A`; sin patrón "Tabla N", el nombre recortado a 40 caracteres. El texto completo se conserva en `nombre`.
- **Franjas "buffer".** "Tabla 2A Buffer 0.30" y "Tabla 12 BUFFER 0.33 ha" se importan con código `2A buffer` / `12 buffer` y **desactivadas**, y la importación avisa. Es una suposición mía (ver dudas).
- **Reimportar.** Mismo código → se actualizan polígono, superficie y nombre, y se reactiva (salvo las franjas buffer). Desactivar las que faltan viene marcado por defecto. Códigos repetidos dentro del archivo se renombran "1 (2)" y se avisa.
- **Permisos.** Operador: ve y edita solo sus recorridos abiertos y puede cerrarlos; administrador: ve todo, cierra, reabre y elimina. Quien cierra deja de ver el recorrido si es operador.
- **iPhone sin instalar.** El aviso aparece en cualquier iPhone o iPad sin instalar; "Nuevo recorrido" pide confirmar "Capturar aquí de todos modos" (se recuerda en `ajustes`) u ofrece "Ver cómo instalar".
- **Almacenamiento persistente.** `asegurarPersistencia` se llama al crear la primera planta; si ya se concedió no repite, y si no, lo intenta una vez por sesión. El resultado queda en `localStorage` (`sigatoka.persistencia`), igual que en el hito 1.
- **Decimales.** El formato es es-MX (punto decimal: "33.3"), como el prototipo, aunque el hito 1 escribía los casos con coma.
- **Tema.** Solo modo claro (el prototipo también tenía oscuro y automático; `CLAUDE.md` pide claro por defecto y no pide el selector).

## 4. Desviaciones del plan o de este documento

- **La lista de ajustes del hito 1 no llegó a esta sesión.** Se aplicó según los seis puntos que la nombran: `CLAUDE.md` nuevo, copias sueltas borradas, KMZ real a `datos-locales/`, KMZ sintético, `id` en todas las entidades con `tabla_ids` en `aplicacion`, y "revisión de la fuente", que **no pude interpretar** y queda pendiente. Detalle en `docs/reportes/HITO-1.md`, sección 8.
- El hito pide `ranchos` y `usuarios` con "`rancho_id` en todas" las tablas: esas dos no tienen el campo en `CLAUDE.md`, así que no se indexan por él.
- No hay pantallas de aplicaciones, tablero, exportación ni clima (hitos 6 y 7); las tablas `aplicaciones` y `clima` solo están declaradas.
- La pantalla de tablas del administrador edita código, variedad, superficie y activa, como pide el hito; no edita el nombre ni la geometría.
- Se quitó el selector de tema claro/oscuro del prototipo.

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


 Test Files  9 passed (9)
      Tests  133 passed (133)
   Start at  14:00:46
   Duration  547ms (environment 42%, transform 26%, tests 23%, import 8%, worker 2%)


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador


 Test Files  9 passed (9)
      Tests  133 passed (133)
   Start at  20:00:47
   Duration  575ms (environment 42%, tests 26%, transform 23%, import 7%, worker 2%)

```

### `npm run build`

```

> sigatoka@0.1.0 build
> tsc --noEmit && vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 69 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                                                0.52 kB
dist/index.html                                                          1.07 kB │ gzip:   0.49 kB
dist/assets/atkinson-hyperlegible-latin-ext-400-normal-Bbz-b3yf.woff     7.35 kB
dist/assets/atkinson-hyperlegible-latin-ext-700-normal-CKkU2Dpt.woff     7.35 kB
dist/assets/atkinson-hyperlegible-latin-ext-700-normal-BoVPHkS0.woff2    9.37 kB
dist/assets/atkinson-hyperlegible-latin-ext-400-normal-DRk46D-x.woff2    9.38 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BbWidj28.woff        14.02 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-BK6Glc0m.woff        14.29 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2       17.20 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2       17.52 kB
dist/assets/index-CMbK6O7D.css                                          16.60 kB │ gzip:   4.37 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js                          5.65 kB │ gzip:   2.20 kB
dist/assets/jszip.min-DLCUNKAa.js                                       95.93 kB │ gzip:  28.47 kB
dist/assets/index-B8W6LB-I.js                                          379.43 kB │ gzip: 118.36 kB

✓ built in 70ms

PWA v2.0.0
mode      generateSW
precache  26 entries (626.32 KiB)
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


 Test Files  9 passed (9)
      Tests  133 passed (133)
   Start at  14:00:49
   Duration  643ms (environment 36%, transform 24%, tests 23%, worker 10%, import 7%)

 % Coverage report from v8
----------------|---------|----------|---------|---------|-------------------
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
----------------|---------|----------|---------|---------|-------------------
All files       |   99.74 |    97.34 |     100 |   99.65 |                   
 analisis.ts    |   98.76 |      100 |     100 |   98.33 | 155               
 calculos.ts    |     100 |      100 |     100 |     100 |                   
 clima.ts       |     100 |      100 |     100 |     100 |                   
 fechas.ts      |     100 |    83.33 |     100 |     100 | 38                
 geo.ts         |     100 |    89.28 |     100 |     100 | 52,56             
 importacion.ts |     100 |       90 |     100 |     100 | 6                 
 modelo.ts      |     100 |      100 |     100 |     100 |                   
 permisos.ts    |     100 |      100 |     100 |     100 |                   
----------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 99.74% ( 386/387 )
Branches     : 97.34% ( 220/226 )
Functions    : 100% ( 132/132 )
Lines        : 99.65% ( 293/294 )
================================================================================
```

### `npm run e2e`

```

> sigatoka@0.1.0 e2e
> playwright test


Running 3 tests using 1 worker

  ✓  1 e2e/captura.spec.ts:50:1 › flujo de captura: KMZ, recorrido de 2 tablas, 5 plantas (2 sin conexión), recarga y cierre (4.1s)
12 hojas calificadas en 400 ms (incluye la sobrecarga de Playwright)
  ✓  2 e2e/captura.spec.ts:153:1 › 12 hojas seguidas sin esperar: la interfaz avanza al instante y todo se guarda en orden (1.0s)
  ✓  3 e2e/captura.spec.ts:200:3 › iPhone sin instalar › avisa y bloquea "Nuevo recorrido" hasta que se confirme capturar en el navegador (436ms)

  3 passed (8.1s)
```

## 6. Archivos clave para revisión

| Ruta | Contenido |
|---|---|
| `src/datos/db.ts` | Esquema de Dexie, tipo `Pendiente` y lista de entidades. |
| `src/datos/cola.ts` | `guardar` (registro + entrada en la cola), fila de escritura en orden, `escribir` (transacción), lecturas de la cola. |
| `src/datos/repos/plantas.ts` | Repositorio de plantas y hojas: crear, actualizar, cambio de TH, calificar, eliminar en cascada. |
| `src/datos/repos/recorridos.ts` | Crear (con evaluaciones), agregar tablas, terminar, cerrar, reabrir, eliminar en cascada. |
| `src/datos/repos/tablas.ts`, `rancho.ts` | Importación/edición de tablas y configuración inicial. |
| `src/datos/consultas.ts`, `sesion.ts`, `importarKmz.ts`, `index.ts` | Lecturas, usuario simulado (TEMPORAL), lectura de KMZ y la única puerta que usa la interfaz. |
| `src/datos/repos.test.ts` | 28 pruebas de repositorios con `fake-indexeddb`. |
| `src/dominio/permisos.ts` y `.test.ts` | Reglas por rol. |
| `src/dominio/importacion.ts` y `.test.ts` | Código de tabla desde el nombre del polígono y plan de reimportación. |
| `src/ui/captura/ModalHojas.tsx` | Calificación hoja por hoja con guardado en segundo plano. |
| `src/ui/captura/VistaPlanta.tsx`, `VistaTabla.tsx`, `VistaRecorrido.tsx`, `ListaRecorridos.tsx`, `NuevoRecorrido.tsx` | Pantallas de captura. |
| `src/ui/dialogos.tsx` | Diálogos y avisos propios. |
| `eslint.config.js` | Reglas de dependencias, de Dexie en la interfaz y de diálogos nativos. |
| `e2e/captura.spec.ts`, `playwright.config.ts` | Pruebas de extremo a extremo. |

## 7. Dudas o riesgos abiertos

- **La vista previa está protegida por Vercel.** La URL de la rama responde 302 al inicio de sesión (Deployment Protection). Para instalar la app en celulares reales hay que quitar la protección de las vistas previas del proyecto (Settings → Deployment Protection) o generar un enlace con "Protection Bypass". Instalar la PWA desde una página con inicio de sesión de Vercel no es una prueba fiel. Pendiente de decidir por el responsable.
- **Franjas "buffer" del KMZ real** (2 de 15 polígonos): las importé desactivadas por suposición. Si son zonas que también se evalúan, hay que activarlas desde la pestaña Tablas; si nunca se evalúan, quizá convenga no importarlas. Pregunta para el agrónomo o el responsable.
- **Reimportar sobrescribe la superficie** de las tablas con el mismo código, también si el administrador la había corregido a mano. Alternativa: conservar la edición manual. Decisión pendiente.
- **La lista de ajustes del hito 1 no llegó**: se aplicó por lo que nombra el mensaje. "Revisión de la fuente" sigue sin interpretar; si se refería a la tipografía (se autoaloja Atkinson Hyperlegible desde el hito 1), a la fuente de datos o a otra cosa, hay que decirlo.
- **Los ids de usuario no son los de `auth.users`.** Los tres usuarios de prueba tienen UUID locales. En el hito 5 habrá que reconciliar los registros capturados con las cuentas reales; los recorridos ya capturados llevan el `usuario_id` simulado.
- **Cola sin consolidar.** Cada cambio es una entrada: una planta de 12 hojas genera ~30 entradas. El hito 4 debe consolidar por `(entidad, registro_id)` antes de enviar. No se probó el tamaño de la base tras semanas de captura.
- **Escritura en segundo plano:** si una escritura falla (por ejemplo, almacenamiento lleno), la interfaz ya avanzó. Hoy se avisa con un mensaje ("No se pudo guardar…"), pero el dato visible y el guardado pueden diferir hasta recargar. En la práctica solo ocurre con el disco lleno o sin permiso de almacenamiento; no hay reintento.
- **Safari/iPhone**: lo cubre solo la simulación del navegador (agente de usuario). El comportamiento real de `useLiveQuery` y de IndexedDB en iOS (más estricto con el almacenamiento) no se probó.
- **GPS** se porta del prototipo pero no se probó (el navegador de pruebas no concede ubicación).
- **No se probó** el modo de actualización de la PWA con datos capturados (aviso "Hay una versión nueva" con una captura abierta); sí sigue sin recargar solo.
- **Accesibilidad al sol**: se subió a 48 px los objetivos táctiles que el prototipo tenía en 44; la tira de hojas dibujadas (`.cuad`) mide 30 px pero es solo indicador, el botón que la envuelve y el de "Calificar hojas" son los objetivos táctiles.

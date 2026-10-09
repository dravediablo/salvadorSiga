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

- [ ] Importar el KMZ real de El Salvador (desde la pestaña Tablas, o en la configuración inicial) muestra todas las tablas con su superficie. Esperado: 15 polígonos = 13 tablas (las 2 franjas "buffer" se omiten y el resumen las lista). En una prueba local con el archivo real de `datos-locales/` (no versionado): 15 polígonos leídos; las superficies calculadas quedan a ±1,2 % de las que trae cada nombre (las franjas, hasta 6 %).
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
- **Franjas "buffer".** *(Actualizado en la sección 8.)* Ya no se importan: el productor indicó omitirlas.
- **Reimportar.** *(Actualizado en la sección 8.)* Mismo código → se actualizan solo polígono y nombre; la superficie se conserva. Desactivar las que faltan viene marcado por defecto. Códigos repetidos dentro del archivo se renombran "1 (2)" y se avisa.
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

(Actualizada tras la revisión del supervisor.)

### `npm run typecheck`

```
> sigatoka@0.1.0 typecheck
> tsc --noEmit

exit 0
```

### `npm run lint`

```
> sigatoka@0.1.0 lint
> eslint . --max-warnings 0

exit 0
```

### `npm test`

```
> sigatoka@0.1.0 test
> TZ=America/Mexico_City vitest run && TZ=UTC vitest run


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador


 Test Files  12 passed (12)
      Tests  167 passed (167)
   Start at  14:25:17
   Duration  609ms (transform 32%, environment 30%, tests 25%, import 11%, worker 2%)


 RUN  v5.0.3 /Users/dravechacon/Dev/salvador


 Test Files  12 passed (12)
      Tests  167 passed (167)
   Start at  20:25:18
   Duration  610ms (transform 32%, environment 30%, tests 25%, import 12%, worker 2%)

exit 0
```

### `npm run build`

```
> sigatoka@0.1.0 build
> tsc --noEmit && vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 72 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                                            0.52 kB
dist/index.html                                                      1.07 kB │ gzip:   0.49 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BbWidj28.woff    14.02 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-BK6Glc0m.woff    14.29 kB
dist/assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2   17.20 kB
dist/assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2   17.52 kB
dist/assets/index-C98SJBAm.css                                      15.66 kB │ gzip:   4.16 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js                      5.65 kB │ gzip:   2.20 kB
dist/assets/jszip.min-45h5Ks-2.js                                   95.93 kB │ gzip:  28.47 kB
dist/assets/index-BdjZD7tj.js                                      384.04 kB │ gzip: 119.84 kB

✓ built in 69ms

PWA v2.0.0
mode      generateSW
precache  20 entries (569.56 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
exit 0
```

### `npm run e2e`

```
> sigatoka@0.1.0 e2e
> playwright test


Running 4 tests using 1 worker

  ✓  1 e2e/captura.spec.ts:50:1 › flujo de captura: KMZ, recorrido de 2 tablas, 5 plantas (2 sin conexión), recarga y cierre (4.1s)
12 hojas calificadas en 401 ms (incluye la sobrecarga de Playwright)
  ✓  2 e2e/captura.spec.ts:162:1 › 12 hojas seguidas sin esperar: la interfaz avanza al instante y todo se guarda en orden (1.1s)
  ✓  3 e2e/captura.spec.ts:206:1 › si IndexedDB falla al guardar: aviso fijo con Reintentar, el recorrido no se puede cerrar y al reintentar se guarda (974ms)
  ✓  4 e2e/captura.spec.ts:270:3 › iPhone sin instalar › avisa y bloquea "Nuevo recorrido" hasta que se confirme capturar en el navegador (460ms)

  4 passed (10.1s)
exit 0
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
- **Franjas "buffer" del KMZ real:** resuelto, el productor indicó omitirlas (sección 8).
- **Reimportar y superficie:** resuelto, se conserva la guardada y se avisa si difiere más de 5 % (sección 8).
- **La lista de ajustes del hito 1 no llegó**: se aplicó por lo que nombra el mensaje. "Revisión de la fuente" sigue sin interpretar; si se refería a la tipografía (se autoaloja Atkinson Hyperlegible desde el hito 1), a la fuente de datos o a otra cosa, hay que decirlo.
- **Los ids de usuario no son los de `auth.users`.** Los tres usuarios de prueba tienen UUID locales. En el hito 5 habrá que reconciliar los registros capturados con las cuentas reales; los recorridos ya capturados llevan el `usuario_id` simulado.
- **Cola consolidada** (sección 8): una entrada por registro. No se probó el tamaño de la base tras semanas de captura.
- **Escritura en segundo plano:** resuelto para la captura (aviso fijo con Reintentar, sección 8). Las acciones de botón siguen con aviso emergente.
- **Safari/iPhone**: lo cubre solo la simulación del navegador (agente de usuario). El comportamiento real de `useLiveQuery` y de IndexedDB en iOS (más estricto con el almacenamiento) no se probó.
- **GPS** se porta del prototipo pero no se probó (el navegador de pruebas no concede ubicación).
- **No se probó** el modo de actualización de la PWA con datos capturados (aviso "Hay una versión nueva" con una captura abierta); sí sigue sin recargar solo.
- **Accesibilidad al sol**: se subió a 48 px los objetivos táctiles que el prototipo tenía en 44; la tira de hojas dibujadas (`.cuad`) mide 30 px pero es solo indicador, el botón que la envuelve y el de "Calificar hojas" son los objetivos táctiles.

## 8. Revisión del supervisor (ronda 2): cambios

1. **Cola de una entrada por registro.** `pendientes` (`++id`) se reemplaza por `cola` con llave `[entidad+registro_id]` e índice `updated_at`. `guardar` hace `put` con el `updated_at` más reciente. `contarPendientes` es `count()` y `listarPendientes` ordena por `updated_at`. Esquema de Dexie **v2** (nace `cola` y se consolidan las entradas viejas: una por registro, con el `updated_at` mayor) y **v3** (se retira `pendientes`). Dexie no permite cambiar la llave primaria de una tabla, por eso la cola nueva tiene otro nombre. Pruebas: `repos.test.ts` (exactamente una entrada por registro modificado, con su `updated_at`; cinco ediciones del mismo registro no hacen crecer la cola) y `migracion.test.ts`.
2. **`updated_at` monótono.** `src/datos/reloj.ts`: un solo generador por base; nunca devuelve una hora igual o anterior a la última (última + 1 ms). La última marca se guarda en `ajustes` (`reloj.ultima_marca`) dentro de la misma transacción de cada escritura (una vez por transacción, no por registro). Pruebas en `reloj.test.ts`: reloj que retrocede 1 hora y 20 escrituras en el mismo milisegundo → todas estrictamente crecientes, también con la base real y tras "reiniciar" la app.
3. **Fallos de escritura en segundo plano.** `src/datos/fallos.ts` (almacén de fallos con reintento) y aviso fijo en el encabezado: "No se pudo guardar: …" con botón **Reintentar**. El cambio fallido se conserva (la tarea se guarda y se reintenta tal cual; la captura sigue en pantalla). Una escritura más nueva del mismo dato (misma clave) reemplaza al fallo, para que un reintento no pise un valor más reciente. "Cerrar recorrido" queda deshabilitado mientras haya fallos y `cerrar()` también lo verifica. Pruebas: `fallos.test.ts` (fallo simulado sobre la base real) y un e2e que rompe `IDBObjectStore.put`. **Alcance:** esto cubre las escrituras de captura que se guardan solas (calificar hoja, TH, síntomas, observaciones, GPS, edición de tablas). Las acciones de botón (nueva planta, eliminar, terminar tabla, cerrar…) siguen mostrando un aviso emergente y se repiten tocando el botón: su cierre incluye diálogos y navegación, que no se pueden reintentar a ciegas.
4. **Reimportar KMZ.** Si la tabla existe, solo se actualizan `geometria` y `nombre`; `superficie_ha` se conserva (si estaba vacía, se toma la del polígono). Si el polígono difiere más de 5 % de la guardada, el resumen lo lista (tabla, guardada, polígono, %) con un botón "Usar N ha" por tabla; sin tocar nada se conserva la guardada. Ya **no se reactiva** una tabla desactivada al reimportar (antes sí), ni se cambia su `origen`.
5. **Fuente.** `main.tsx` importa `latin-400.css` y `latin-700.css` (antes `400.css`/`700.css`, que traían latino + latino extendido + cirílico, etc.) y el precache solo incluye `.woff2`. Verificado en `dist/sw.js`: el precache contiene exactamente `atkinson-hyperlegible-latin-400-normal-*.woff2` y `…-700-…woff2` (17,2 kB y 17,5 kB); ya no entran `latin-ext` ni `.woff`. Precache total: 20 entradas, 569,6 KiB. El subconjunto latino cubre todo el español (á é í ó ú ñ ü ¿ ¡ y la puntuación general).
6. **Franjas "buffer" omitidas.** Los polígonos cuyo nombre contenga "buffer" (sin importar mayúsculas) no se importan; el resumen los lista como omitidos y no cuentan para códigos repetidos ni "faltantes". Las tablas buffer que ya existían se marcan `eliminado = true`: en la migración v3 de Dexie y también al reimportar (con su entrada en la cola). El KMZ sintético ahora tiene 5 polígonos (3 tablas y 2 buffer, uno en mayúsculas). **Con el KMZ real de El Salvador quedan 13 tablas** (15 polígonos; omitidos: "Tabla 2A Buffer 0.30" y "Tabla 12 BUFFER 0.33 ha").

**Desviaciones nuevas:**
- `CLAUDE.md` ganó la sección "Importación de tablas" (la pedía el ajuste 6) en el mismo commit que la versión nueva.
- La cola ya no guarda `creado_en` (con una entrada por registro no tiene sentido).
- Se retiraron las advertencias de "buffer desactivadas" y el campo `buffer` de `TablaImportada`; `codigoDeNombre` ahora devuelve solo el código.

**Riesgo nuevo:** una tabla buffer dada de baja que tuviera evaluaciones capturadas (solo si alguien la activó a mano antes) quedaría con evaluaciones que apuntan a una tabla eliminada (se muestran como "?"). No es el caso de los datos de prueba; lo menciono por si algún celular piloto ya la usó.


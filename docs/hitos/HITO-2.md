# Hito 2: almacenamiento local, importación de KMZ y captura en campo

Lee primero `CLAUDE.md` completo. Trabaja en la rama `hito-2-captura-local`, a partir de `main`, y prueba en su URL de vista previa de Vercel. No fusiones a `main`.

## Objetivo

Al terminar este hito, un operador puede usar la app instalada, sin conexión y sin servidor, para:

1. importar las tablas del rancho desde un KMZ,
2. crear un recorrido,
3. capturar plantas y calificar sus hojas,
4. y cerrar la app en cualquier momento sin perder nada.

Cada cambio queda además en una cola de pendientes, lista para que el hito 4 la envíe al servidor.

## Alcance

**Incluye:**

- Base de datos local con Dexie y repositorios.
- Cola de pendientes, escrita en la misma transacción que cada cambio.
- Configuración inicial del rancho local con usuarios simulados.
- Importación de KMZ/KML.
- Las pantallas de captura del prototipo:
  - lista de recorridos y nuevo recorrido,
  - recorrido y tabla,
  - planta y modal de hojas,
  - diálogos propios de la app.
- Indicador de pendientes.
- Pruebas de repositorios y una prueba de extremo a extremo del flujo de captura.

**No incluye:**

- Supabase, envío o descarga de la cola, ni inicio de sesión real (hitos 3 a 5).
- Aplicaciones de fungicida, tablero, exportación y clima (hitos 6 y 7).

## Tareas

### 1. Base de datos local (`src/datos/`)

- **Esquema de Dexie con una tabla por entidad** de `CLAUDE.md`: `ranchos`, `usuarios`, `membresias`, `tablas`, `recorridos`, `evaluaciones`, `plantas`, `hojas`, `aplicaciones` y `clima`.
  - Las dos últimas solo se declaran; no tienen pantallas en este hito.
  - Índices mínimos: `rancho_id` en todas; `recorrido_id` en evaluaciones; `evaluacion_tabla_id` en plantas; `planta_id` en hojas; `[planta_id+numero_hoja]` en hojas.
- **Tabla `pendientes` (la cola):**
  - Campos: `id` autoincremental, `entidad`, `registro_id`, `updated_at` y `creado_en`.
  - **Toda escritura de un repositorio agrega su entrada en la misma transacción de Dexie que el cambio.** Si una falla, fallan las dos.
  - Varias escrituras al mismo registro pueden dejar varias entradas; el hito 4 las consolidará. No envíes nada todavía.
- **Repositorios por entidad.** Son la única puerta de escritura: la interfaz nunca toca Dexie directo.
  - Cada escritura actualiza `updated_at`.
  - Nada se borra físicamente: borrar es `eliminado = true`.
  - Usan las fábricas y validaciones de `src/dominio`.
- **Reglas de hojas al cambiar el TH de una planta:**
  - **Si baja:** las hojas con `numero_hoja` mayor que el TH nuevo se marcan `eliminado = true`.
  - **Si sube:** las hojas de esos números que ya existían y estaban eliminadas se reviven conservando su `id`, pero con `grado_gauhl = null`. Solo se crean hojas nuevas para números que nunca existieron.
  - **Invariante:** nunca existen dos hojas no eliminadas con la misma `[planta_id+numero_hoja]`. Agrégala como prueba.
- **Borrado en cascada lógico:**
  - Eliminar una planta elimina sus hojas.
  - Eliminar un recorrido elimina sus evaluaciones, plantas y hojas.
- **Lectura para la interfaz.** Usa `useLiveQuery` de `dexie-react-hooks`. Para resúmenes, arma `PlantaConHojas` y calcula con `src/dominio`; no dupliques cálculos.
- **Almacenamiento persistente.** Llama a `navigator.storage.persist()` en la primera captura si no se concedió antes, y guarda el resultado.

### 2. Rancho local provisional y usuarios simulados

- **Sin rancho en el dispositivo:** se muestra la configuración inicial, como en el prototipo.
  - Nombre del rancho e importación del KMZ.
  - Se crean tres usuarios de prueba (un administrador y dos operadores) con sus membresías.
- **Selector de usuario en el encabezado,** igual que en el prototipo, para simular roles.
  - Ponle un comentario `// TEMPORAL: se reemplaza por inicio de sesión en el hito 5`.
  - Aísla toda la lógica del usuario actual en un solo módulo (`src/datos/sesion.ts`) que el hito 5 pueda sustituir.
- **Permisos de roles,** como en el prototipo:
  - El operador solo ve y edita sus recorridos abiertos.
  - El administrador ve todo, puede reabrir y eliminar.
  - Concentra las reglas en funciones puras de `src/dominio/permisos.ts`, con pruebas; Supabase repetirá las mismas reglas en el hito 3.

### 3. Importación de KMZ/KML

- **Lectura:** descomprime el KMZ con JSZip en `src/datos/importarKmz.ts` y pasa el KML a `parseKml` de `src/dominio/geo.ts`.
- **Superficie:** se calcula del polígono y es editable.
- **Pantalla de tablas del administrador:** lista editable con código, variedad, superficie y activa.
- **Reimportar:**
  - Las tablas con el mismo código se actualizan.
  - Opción "Desactivar las tablas que no vengan en el archivo", marcada por defecto.
  - Las tablas nunca se eliminan: sus datos históricos se conservan.
- **Pruebas:** con el KMZ sintético de `__fixtures__`. El KMZ real de El Salvador se prueba a mano, desde `datos-locales/`, y nunca se versiona.

### 4. Pantallas de captura

Porta el comportamiento de `referencia/prototipo.html`. La experiencia debe sentirse igual o mejor.

- **Navegación lineal:** Recorridos → Nuevo recorrido → Recorrido → Tabla → Planta → modal de hojas → siguiente planta.
  - La posición actual (pantalla y registro) se guarda en el dispositivo.
  - Al reabrir la app, el operador vuelve exactamente a donde estaba.
- **Planta:**
  - Botones +/− para número de planta y TH.
  - Fichas "No presenta", 1…TH para pizca, estría y mancha.
  - Tira de hojas, observaciones y GPS opcional.
  - Una planta nueva hereda el TH de la anterior; los síntomas arrancan sin capturar.
- **Modal de hojas:**
  - La planta dibujada con hojas alternadas en los colores de la escala de Gauhl.
  - Botones 0–6 grandes, con su rango de porcentaje.
  - Avance automático a la siguiente hoja sin calificar, regreso a la anterior y resumen al final.
- **Validaciones:**
  - Errores que bloquean "Siguiente planta".
  - Avisos que solo informan.
  - Diálogo propio para "Faltan N hojas por calificar".
- **Diálogos propios para todo,** sin `alert`, `confirm` ni `prompt`: cerrar recorrido, eliminar planta, eliminar recorrido, reabrir.
- **Encabezado:** indicador de conexión y número de pendientes ("12 sin enviar").
  - Mientras no exista servidor, aclara en su detalle que los datos están solo en este dispositivo.
- **iPhone sin instalar:** el aviso de instalar antes de capturar bloquea el botón "Nuevo recorrido" hasta que el usuario confirme explícitamente que quiere capturar en el navegador.
- **Respuesta inmediata:** calificar una hoja debe actualizar la interfaz sin retraso perceptible. Guarda en segundo plano; no esperes la escritura para avanzar a la siguiente hoja, pero sin perder el orden de las escrituras.

### 5. Pruebas

- **Repositorios** con `fake-indexeddb` en Vitest:
  - crear un recorrido con 3 tablas crea 3 evaluaciones y sus entradas en la cola;
  - bajar y subir el TH respeta las reglas e invariantes de hojas;
  - el borrado lógico en cascada;
  - una transacción que falla a la mitad no deja ni el cambio ni la entrada en la cola;
  - los datos persisten al abrir una nueva instancia de la base;
  - el II de una tabla leída de la base coincide con `src/dominio` (usa los casos con resultado conocido del hito 1).
- **Permisos** en `src/dominio/permisos.ts`, con todos los casos de operador y administrador.
- **Extremo a extremo con Playwright,** en pantalla de celular (390 × 844), contra `vite preview`:
  1. configurar el rancho con el KMZ sintético;
  2. entrar como operador;
  3. crear un recorrido de 2 tablas;
  4. capturar 3 plantas completas;
  5. **sin conexión** (`context.setOffline(true)`), capturar 2 plantas más;
  6. recargar a mitad de la quinta planta y comprobar que vuelve a esa planta con sus datos;
  7. cerrar el recorrido;
  8. verificar que el administrador lo ve cerrado y que el operador ya no lo ve.
- Agrega el script `npm run e2e`.

## Criterios de aceptación

**Calidad del código**

- [ ] `typecheck`, `lint`, `test`, `e2e` y `build` pasan sin errores ni advertencias.
- [ ] La interfaz no importa Dexie directo; todas las escrituras pasan por los repositorios. Agrega una regla de ESLint que lo impida.
- [ ] Toda escritura de los repositorios genera su entrada en `pendientes` en la misma transacción. Demuéstralo con una prueba.
- [ ] Ningún código usa `alert`, `confirm` ni `prompt`. Demuéstralo con una búsqueda en el repositorio o con una regla de ESLint.

**Pruebas en celulares reales**, con la app instalada desde la URL de vista previa. Las hace el responsable; tú preparas la lista en el reporte:

- [ ] Importar el KMZ real de El Salvador muestra todas las tablas con su superficie.
- [ ] En modo avión, capturar una tabla de al menos 10 plantas con todas sus hojas.
- [ ] Cerrar la app por completo a mitad de una planta y reabrirla: vuelve a esa planta, sin pérdida de datos.
- [ ] Calificar 12 hojas seguidas, a ritmo de campo, no se siente lento en el Android económico de prueba.

**Entrega**

- [ ] Reporte en `docs/reportes/HITO-2.md` y handoff con el formato de `CLAUDE.md`.

## Archivos que deben ir completos en el handoff

- `src/datos/db.ts` (esquema de Dexie)
- El repositorio de plantas y hojas (cambio de TH y borrado en cascada)
- El módulo de la cola de pendientes
- `src/dominio/permisos.ts` y sus pruebas
- Las pruebas de repositorios
- La prueba de extremo a extremo
- El componente del modal de hojas (si pasa de 300 líneas, solo la lógica, sin estilos)

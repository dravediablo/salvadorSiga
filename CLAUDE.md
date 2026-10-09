# Sigatoka: app de monitoreo de Sigatoka negra

## Qué es

App web progresiva (PWA) para monitorear Sigatoka negra (*Pseudocercospora fijiensis*) en plátano y banano con el método de Stover modificado por Gauhl.

- **No es una app nativa.** Se distribuye como un enlace: el usuario lo abre en el navegador del celular y lo guarda como acceso directo en la pantalla de inicio. No hay tiendas de apps.
- **Etapa actual:** piloto gratuito con algunos productores ("sigatokeros") de la región de Tecomán, Colima.
- **Idioma:** toda la interfaz, los mensajes de error y los textos van en español de México. Los identificadores del dominio también van en español (`tabla`, `recorrido`, `planta`, `hoja`, `aplicacion`) para que coincidan con el esquema de la base de datos.

**Referencia obligatoria.** `referencia/prototipo.html` es un prototipo funcional ya validado por el cliente. Es la fuente de verdad del comportamiento de la interfaz y de los cálculos. No copies su capa de almacenamiento: usaba IndexedDB y el almacén interno de un artifact de Claude (`window.claude.use`), que aquí no existe.

## Usuarios y condiciones de uso

- **Operador ("sigatokero" de campo).** Recorre las tablas (lotes) cada semana y captura plantas con el celular. Trabaja bajo el sol, con una mano, muchas veces sin señal.
  - Crea recorridos, captura evaluaciones y registra aplicaciones.
  - Solo ve y edita sus recorridos abiertos.
- **Propietario / administrador.** Consulta el tablero desde celular o computadora.
  - Administra tablas, operadores y umbrales.
  - Corrige cualquier registro.
- **Varios ranchos.** Cada productor del piloto es un rancho distinto. Una persona puede pertenecer a más de un rancho, con un rol en cada uno.

## Reglas del dominio (no cambiar sin aprobación del supervisor)

### Muestreo de Stover modificado

- **Plantas evaluadas.** Se evalúan solo plantas paridas (con racimo emitido).
  - Son distintas cada semana; no se marcan ni se siguen individualmente.
  - `numero_planta` es solo el consecutivo dentro de la tabla.
- **Estructura.** Un recorrido es la salida semanal de un operador: fecha, operador y una o varias tablas. Por tabla se evalúan normalmente 18 a 20 plantas, pero el número no es fijo.
- **Datos por planta:**
  - **TH (total de hojas):** todas las hojas en pie, incluidas las muy dañadas.
  - **Hoja más joven con pizca, con estría y con mancha/quema:** número de hoja, o "no presenta".
  - **Grado de Gauhl (0–6) de cada hoja,** de la 1 a la TH.
  - **Observaciones** y **GPS** opcional.
- **Numeración de hojas.** La hoja 1 es la más joven completamente abierta; el cigarro no cuenta. Se cuenta hacia abajo.

### Escala de Gauhl

| Grado | Severidad |
|---|---|
| 0 | Sin síntomas |
| 1 | Hasta 10 manchas, o menos de 1 % del área foliar |
| 2 | 1–5 % |
| 3 | 6–15 % |
| 4 | 16–33 % |
| 5 | 34–50 % |
| 6 | 51–100 % |

### Cálculos

- **Hojas funcionales (HF).** Número de hojas con grado 0 a 4. Siempre se calcula, nunca se captura.
- **Índice de infección (II).** `II = Σ(n × b) / ((N − 1) × T) × 100`, con N = 7 grados y T = hojas evaluadas.
  - **Por tabla o recorrido:** se juntan todas las hojas de todas las plantas (T = total de hojas evaluadas). **No** es el promedio de los II de cada planta.
  - **Planta incompleta** (hojas sin calificar): el II se calcula sobre las hojas calificadas y la planta se marca como incompleta.
- **Hoja más joven con síntoma (`hmj_pizca`, `hmj_estria`, `hmj_mancha`).** Valores posibles:
  - `n ≥ 1`: número de hoja.
  - `0`: "no presenta".
  - `null`: sin capturar.
- **Promedios de HMJ.** Excluyen los "no presenta" y reportan aparte cuántas plantas no presentan el síntoma. Esta regla está pendiente de confirmar con el agrónomo (ver Decisiones pendientes); implementarla de forma que sea fácil cambiarla.
- **Validaciones de la planta:**
  - **Bloquean:** HMJ mayor que TH.
  - **Solo avisan:** que no se cumpla pizca ≤ estría ≤ mancha, campos sin capturar u hojas sin calificar.
- **Semanas.** Se usa la semana ISO 8601 (`AAAA-Www`). Las fechas son cadenas `AAAA-MM-DD` sin zona horaria; nunca uses `new Date('AAAA-MM-DD')`, porque se interpreta en UTC y cambia de día.
- **Semáforo por II.** Los umbrales se configuran por rancho. Los valores por defecto (bajo < 20, alto ≥ 30) son provisionales.
- **Efecto de una aplicación.** Se compara el II de la semana de la aplicación (o la evaluación previa más cercana) contra el de 2 y 4 semanas después, con una semana de tolerancia.
- **Resistencia.** Alertar cuando una tabla recibe dos aplicaciones consecutivas con el mismo grupo FRAC.

### Lo que no debes asumir

- **Preaviso biológico (Fouré)** — plantas no paridas, marcadas y seguidas, con estado evolutivo:
  - No implementes coeficientes, escalas de densidad ni umbrales hasta que el supervisor los entregue.
  - El modelo solo deja espacio: `tipo = 'preaviso'` en la evaluación y la entidad `planta_marcada`.
- **Recomendaciones de fungicidas, dosis o productos:** la app registra, no recomienda.
- **Cualquier ambigüedad agronómica:** pregunta, no adivines.

## Arquitectura

### Stack

- **App:** Vite, React y TypeScript en modo estricto. Para la PWA, `vite-plugin-pwa` (Workbox).
- **Almacenamiento local:** Dexie sobre IndexedDB.
- **Servidor:** Supabase (Postgres, inicio de sesión, reglas de acceso por fila o RLS, funciones del servidor) a partir del hito 3.
- **Funciones del servidor (Supabase Edge Functions, `supabase/functions/`):** son el único lugar donde se usa la llave `service_role`, que vive en los secretos del proyecto y nunca en el repositorio ni en el cliente.
- **Alojamiento:** Vercel.
- **Pruebas:** Vitest.
- Usa las versiones estables actuales. Toda dependencia nueva se justifica en el reporte del hito.

### Capas y regla de dependencias

```
src/
  dominio/   Lógica pura: tipos, fechas, fábricas, cálculos, análisis, clima, geo.
             Sin React, Dexie, Supabase ni APIs del navegador (salvo crypto.randomUUID y DOMParser).
  datos/     Dexie, repositorios, cola de sincronización, cliente de Supabase. Depende de dominio.
  ui/        Componentes y pantallas de React. Depende de dominio y datos.
  pwa/       Registro del service worker, instalación, actualizaciones, persistencia del almacenamiento.
supabase/
  migrations/  Migraciones SQL versionadas.
referencia/
  prototipo.html
```

`src/dominio` no puede importar nada de `datos`, `ui`, `pwa`, React, Dexie ni Supabase. Haz cumplir esta regla con ESLint (`no-restricted-imports`). La lógica del dominio debe poder ejecutarse también en el servidor.

### Funcionamiento sin conexión (local-first)

1. Toda escritura va primero a IndexedDB; la interfaz nunca espera al servidor para guardar.
2. Cada cambio entra en una cola de pendientes, que se envía en lotes cuando hay conexión (hito 4). La cola guarda **una entrada por registro** (llave `[entidad+registro_id]`), que se sobrescribe con el `updated_at` más reciente; se envía el estado actual del registro, no la lista de cambios.
3. La descarga trae lo cambiado desde la última sincronización. El cursor es `server_updated_at`, que pone el servidor, porque el reloj de los celulares no es confiable.
4. Conflictos: gana la versión con `updated_at` más reciente.
5. Nada se borra físicamente: los registros llevan `eliminado = true`.
6. Los IDs son UUID generados en el cliente (`crypto.randomUUID()`).
7. Todo registro lleva `created_at`, `updated_at` (cliente) y `server_updated_at` (servidor; vacío hasta sincronizar). El `updated_at` de un dispositivo nunca retrocede: si el reloj da una hora igual o anterior a la última emitida, se usa la última más 1 ms.
8. Guardado automático continuo: cerrar la app nunca pierde datos.
9. Escrituras al servidor: solo por la función `aplicar_cambios` de Postgres. Los clientes no tienen permisos de INSERT, UPDATE ni DELETE directos. La función aplica permisos, "gana la más reciente" y el orden entre entidades en una sola transacción. Las lecturas se protegen con RLS.
10. Descarga: por entidad, filas con `server_updated_at` mayor que (cursor − 2 minutos), para no perder cambios que se confirmaron en el servidor con retraso. Los repetidos se resuelven con "gana la más reciente".
11. Al recibir un registro remoto, el generador de marcas local avanza hasta su `updated_at` (si no está más de 24 h en el futuro), para que la siguiente edición local nunca pierda contra una marca remota.
12. Los cambios que el servidor rechaza no se reintentan solos: pasan a una lista visible de rechazos con su motivo. Si el registro se vuelve a editar, entra otra vez a la cola.

### Varios ranchos

- Todas las tablas de datos llevan `rancho_id`.
- Las reglas de acceso de Postgres (RLS) garantizan que un usuario solo lee y escribe en los ranchos donde tiene membresía, con permisos según su rol.
- En el servidor el operador puede leer también sus recorridos cerrados (la sincronización lo necesita); la interfaz le sigue mostrando solo los abiertos.
- Esto se valida con pruebas en el hito 3.

## Modelo de datos

| Entidad | Campos | Notas |
|---|---|---|
| `rancho` | id, nombre, lat, lon, ii_umbral_medio, ii_umbral_alto, dias_alerta_aplicacion | |
| `usuario` | id (= `auth.users.id`), nombre, email | |
| `membresia` | id, rancho_id, usuario_id, rol (`operador` \| `administrador`), activo | |
| `tabla` | id, rancho_id, codigo, nombre, superficie_ha, variedad, geometria, activa, origen (`kmz` \| `manual`) | `geometria` es un Polygon GeoJSON |
| `recorrido` | id, rancho_id, fecha, semana_iso, usuario_id, estado (`en_curso` \| `cerrado`) | "sincronizado" se calcula a partir de `server_updated_at` |
| `evaluacion_tabla` | id, rancho_id, recorrido_id, tabla_id, tipo (`stover` \| `preaviso`), hora_inicio, hora_fin | |
| `planta` | id, rancho_id, evaluacion_tabla_id, numero_planta, total_hojas, hmj_pizca, hmj_estria, hmj_mancha, observaciones, gps_lat, gps_lon, gps_precision_m | |
| `hoja` | id, rancho_id, planta_id, numero_hoja, grado_gauhl (0–6 o null) | |
| `aplicacion` | id, rancho_id, fecha, tabla_ids (`uuid[]`), producto, ingrediente_activo, grupo_frac, dosis, unidad, volumen_mezcla, metodo, usuario_id, responsable, observaciones | Ver nota 1 |
| `clima_diario` | id, rancho_id, fecha, temp_max, temp_min, temp_media, hr_media, precipitacion, horas_hr_alta, fuente | Ver nota 2 |
| `planta_marcada` | id, rancho_id, tabla_id, fecha_marcado | Futuro: preaviso |

Además, todas las entidades llevan `id` (UUID), `created_at`, `updated_at`, `server_updated_at` y `eliminado`. Sin excepciones: la sincronización trata todo registro igual.

1. **Tablas de una aplicación.** Van en el arreglo `tabla_ids` dentro de la misma aplicación; no hay tabla intermedia.
   - Así, cambiar las tablas de una aplicación es una sola escritura y la regla de "gana la más reciente" se aplica completa. Con una tabla intermedia, dos celulares editando la misma aplicación podían dejar una mezcla de ambas versiones.
   - En Postgres: índice GIN sobre `tabla_ids`, y un trigger que rechace ids de tablas que no pertenezcan al mismo `rancho_id`.
2. **Clima.** Restricción única `(rancho_id, fecha)`. Lo escribe el servidor (tarea diaria) con *upsert* sobre esa restricción; el cliente solo lo descarga. Si más adelante se permite importar CSV, también será *upsert* sobre `(rancho_id, fecha)`.

### Importación de tablas

- **Fuente:** KMZ/KML del rancho. Cada polígono es una tabla; el código sale del nombre ("Tabla 1. Sup. 6.8 ha." → `1`).
- **Franjas "buffer".** El productor indicó omitirlas.
  - Los polígonos cuyo nombre contenga "buffer" (sin importar mayúsculas) **no se importan**: el resumen de la importación los lista como omitidos y no se suman a la superficie de ninguna tabla.
  - Las tablas buffer que ya existieran en la base local se marcan `eliminado = true`.
- **Reimportar.** Si la tabla ya existe (mismo código):
  - Se actualizan **solo** `geometria` y `nombre`; `superficie_ha` se conserva, porque puede estar corregida a mano.
  - Si la superficie del polígono difiere más de 5 % de la guardada, el resumen lo muestra y deja aplicar la nueva por tabla.
  - Nunca se borran tablas; las que no vengan en el archivo solo se pueden desactivar.

## PWA: instalación desde un enlace

La instalación es el punto más delicado del piloto: si un productor no logra instalarla o pierde datos, el piloto fracasa.

- **Manifest:**
  - `name`, `short_name: "Sigatoka"`, `lang: "es-MX"`, `display: "standalone"`.
  - `start_url: "/"`, `scope: "/"`, `background_color` blanco y `theme_color`.
  - Íconos de 192 y 512 px, uno "maskable", y `apple-touch-icon` de 180 px.
- **Android (Chrome):** captura `beforeinstallprompt` y muestra un botón propio de "Instalar".
- **iPhone:** no existe aviso de instalación automático. Muestra instrucciones con ilustración: botón Compartir → "Agregar a inicio".
  - Detecta si la app ya está instalada con `matchMedia('(display-mode: standalone)')` o `navigator.standalone`.
- **iPhone, almacenamiento separado:** la app instalada no ve los datos capturados en Safari, y viceversa. Pide instalar antes de la primera captura y avisa si alguien captura desde el navegador sin instalar.
- **Persistencia:** llama a `navigator.storage.persist()` después de instalar o en la primera captura, y registra el resultado.
- **Actualizaciones:**
  - El service worker se registra en modo `prompt`. Nunca recargues la app automáticamente: podría pasar a mitad de una captura.
  - Muestra el aviso "Hay una versión nueva" y aplica la actualización cuando el usuario lo decide o al volver a la lista de recorridos.
- **Requisitos:** HTTPS (Vercel lo da). Al abrir la app instalada en modo avión debe cargar completa.
- **Ruteo:** reescrituras en Vercel para que cualquier ruta sirva `index.html`.

## Principios de UI/UX

- Diseño pensado primero para el celular, alto contraste y modo claro por defecto (lectura al sol).
- Tipografía grande y objetivos táctiles de al menos 48 px.
- Captura con el mínimo de toques:
  - Botones +/− para números.
  - Fichas numeradas para la hoja más joven con cada síntoma.
  - Botones 0–6 grandes, con el color de la escala de Gauhl, para calificar cada hoja.
- Navegación lineal en campo: Recorrido → Tabla → Planta → Hojas → Siguiente planta.
- Indicador siempre visible de conexión y de registros pendientes de enviar.
- No uses `alert()`, `confirm()` ni `prompt()` del navegador: usa diálogos propios de la app (así se hizo en el prototipo).
- Los textos describen acciones concretas ("Cerrar recorrido", no "Enviar"). Los errores dicen qué pasó y cómo resolverlo.

## Convenciones de código

- TypeScript estricto, sin `any`; si alguno es inevitable, coméntalo.
- Toda función de `src/dominio` tiene pruebas. Los casos con resultado conocido de cada hito son obligatorios.
- **Semilla de desarrollo.** `supabase/seed.sql` tiene cuentas de prueba con contraseña conocida y SOLO se usa en el servidor local. Prohibido correr `supabase db reset --linked` o cualquier comando que cargue la semilla en un proyecto remoto; las migraciones al proyecto real se aplican solo con `supabase db push`. La semilla aborta si la base no es la local (guardia sobre el JWT secret público por defecto).
- Secretos:
  - Nunca subas secretos al repositorio; usa `.env.local`.
  - En el cliente solo va la llave pública (anon) de Supabase. La llave `service_role` nunca va en el cliente.
- **Datos reales de productores** (KMZ de ranchos, exportaciones, respaldos):
  - Nunca van en el repositorio. Van en `datos-locales/`, que está en `.gitignore`.
  - Las pruebas usan datos sintéticos en `src/**/__fixtures__/`, por ejemplo un KMZ inventado de 3 polígonos.
- Commits pequeños y descriptivos, en español. Una rama por hito: `hito-N-descripcion`.
- Comandos que siempre deben pasar antes de reportar: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

## Forma de trabajo con el supervisor

Trabajas un hito a la vez. Un supervisor (Claude, en otra conversación con el responsable del proyecto) revisa cada hito antes de avanzar.

### Hitos

1. Base del proyecto, dominio portado con pruebas y cascarón PWA instalable desplegado en Vercel.
2. Almacenamiento local (Dexie, repositorios y cola de pendientes), importación de KMZ e interfaz de captura portada del prototipo, solo local.
3. Esquema de Postgres en Supabase con reglas de acceso por rancho y pruebas de esas reglas.
4. Sincronización: cola de pendientes, envío, descarga y conflictos.
5. Cuentas reales: propietarios con correo y contraseña (alta con código), operadores con código de rancho, usuario y PIN (función del servidor con bloqueo por intentos), gestión de operadores, migración de datos locales y paso a producción.
6. Tablero, aplicaciones y exportación portados del prototipo.
7. Clima diario automático (Open-Meteo) desde el servidor.
8. Preparación del piloto: aviso de privacidad, registro de errores, respaldos, guía de una página y pruebas en dispositivos reales.

### Reglas

- No empieces un hito sin sus instrucciones (`docs/hitos/HITO-N.md`).
- **Fusión a `main`.** Mientras no haya productores usando la app, cada hito se fusiona a `main` en cuanto `typecheck`, `lint`, `test`, `e2e` y `build` pasen; no esperes la aprobación del supervisor ni las pruebas en celulares. El responsable prueba siempre en https://salvadorsiga.vercel.app. Si la revisión del supervisor pide correcciones, se hacen después en `main` o en una rama corta que también se fusiona.
- Antes del piloto con productores (hito 8) se separa `main` (lo que usan los productores) de una rama de pruebas con su propia URL.
- No hagas trabajo de hitos futuros.
- Si algo del hito choca con este documento, detente y repórtalo en lugar de elegir por tu cuenta.
- Cambios al modelo de datos fuera de lo indicado: proponlos en el reporte, no los apliques.

### Reporte al terminar cada hito

Guarda el reporte en `docs/reportes/HITO-N.md` con estas secciones:

1. **Resumen:** qué se hizo, en 5 a 10 líneas.
2. **Criterios de aceptación:** cada uno marcado como cumplido o no, con evidencia.
3. **Decisiones tomadas y por qué**, incluidas las dependencias nuevas.
4. **Desviaciones del plan o de este documento.**
5. **Salida completa** de `typecheck`, `lint`, `test` y `build`.
6. **Archivos clave para revisión:** ruta y una línea de qué contiene.
7. **Dudas o riesgos abiertos.**

### Handoff para el supervisor (obligatorio)

Cada vez que termines un hito, o te detengas porque falta algo, prepara un handoff para el supervisor. El responsable no debe seleccionar ni copiar texto a mano.

1. **Escribe el archivo.** El handoff completo va en `docs/handoff/HITO-N.md`; agrega `docs/handoff/` a `.gitignore`.
   - Debe bastar por sí solo, porque el supervisor no tiene acceso al repositorio.
   - Incluye completos los archivos que el hito pida revisar. Si alguno pasa de 300 líneas, incluye solo las partes relevantes e indica qué omitiste.
2. **Cópialo al portapapeles** con el comando de tu sistema y verifica que se copió completo (compara el número de caracteres):
   - **macOS:** `pbcopy < docs/handoff/HITO-N.md`. Verifica con `pbpaste | wc -c`.
   - **Windows (PowerShell):** `Get-Content -Raw -Encoding UTF8 docs/handoff/HITO-N.md | Set-Clipboard`. Evita `clip`, que daña los acentos.
   - **Linux:** `wl-copy < …` (Wayland) o `xclip -selection clipboard < …` (X11).
   - **WSL:** `powershell.exe -NoProfile -Command "Get-Content -Raw -Encoding UTF8 '<ruta de Windows>' | Set-Clipboard"`.
3. **Tu último mensaje en la terminal** es solo una línea, por ejemplo: `Handoff del hito N copiado al portapapeles (N caracteres) y guardado en docs/handoff/HITO-N.md.` Si no pudiste copiarlo, dilo y da la ruta: el responsable arrastrará el archivo a la conversación con el supervisor.

Plantilla del archivo:

````text
HANDOFF — Hito N: <título>
Rama: <rama> · Commits: <n> · Último commit: <hash corto> <mensaje>
Estado: COMPLETO | INCOMPLETO (falta: …)

## Verificación
typecheck: ok/falla · lint: ok/falla · test: <n> en verde (TZ probadas: …) · build: ok/falla · cobertura dominio: <x> %

## Criterios de aceptación
- [x] … (evidencia en una línea)
- [ ] … (por qué no)

## Decisiones y dependencias nuevas
- …

## Desviaciones
- …

## Necesito del responsable o del supervisor
1. …

## Archivos para revisión
### ruta/archivo.ts
```ts
<contenido>
```
````

## Instrucciones del supervisor

Cuando un mensaje del supervisor pida actualizar `CLAUDE.md` o crear un archivo de `docs/hitos/`, hazlo tú con el contenido indicado y commitéalo. El responsable no copia archivos a mano.

## Decisiones pendientes (no resolver por cuenta propia)

- **Promedio de HMJ** cuando la planta no presenta el síntoma: excluir (actual) o asignar TH + 1.
- **Umbrales definitivos** del semáforo y regla de "cuándo aplicar".
- **Preaviso biológico:** coeficientes del estado evolutivo, escala de densidad y umbrales.
- **Texto del aviso de privacidad** (LFPDPPP): lo entrega el responsable del proyecto.

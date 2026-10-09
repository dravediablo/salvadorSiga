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
2. Cada cambio entra en una cola de pendientes, que se envía en lotes cuando hay conexión (hito 4).
3. La descarga trae lo cambiado desde la última sincronización. El cursor es `server_updated_at`, que pone el servidor, porque el reloj de los celulares no es confiable.
4. Conflictos: gana la versión con `updated_at` más reciente.
5. Nada se borra físicamente: los registros llevan `eliminado = true`.
6. Los IDs son UUID generados en el cliente (`crypto.randomUUID()`).
7. Todo registro lleva `created_at`, `updated_at` (cliente) y `server_updated_at` (servidor; vacío hasta sincronizar).
8. Guardado automático continuo: cerrar la app nunca pierde datos.

### Varios ranchos

- Todas las tablas de datos llevan `rancho_id`.
- Las reglas de acceso de Postgres (RLS) garantizan que un usuario solo lee y escribe en los ranchos donde tiene membresía, con permisos según su rol.
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
| `aplicacion` | id, rancho_id, fecha, producto, ingrediente_activo, grupo_frac, dosis, unidad, volumen_mezcla, metodo, usuario_id, responsable, observaciones | |
| `aplicacion_tabla` | aplicacion_id, tabla_id | Relación de muchos a muchos |
| `clima_diario` | rancho_id, fecha, temp_max, temp_min, temp_media, hr_media, precipitacion, horas_hr_alta, fuente | |
| `planta_marcada` | id, rancho_id, tabla_id, fecha_marcado | Futuro: preaviso |

Además, todas las entidades llevan `created_at`, `updated_at`, `server_updated_at` y `eliminado`.

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
- Secretos:
  - Nunca subas secretos al repositorio; usa `.env.local`.
  - En el cliente solo va la llave pública (anon) de Supabase. La llave `service_role` nunca va en el cliente.
- Commits pequeños y descriptivos, en español. Una rama por hito: `hito-N-descripcion`.
- Comandos que siempre deben pasar antes de reportar: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

## Forma de trabajo con el supervisor

Trabajas un hito a la vez. Un supervisor (Claude, en otra conversación con el responsable del proyecto) revisa cada hito antes de avanzar.

### Hitos

1. Base del proyecto, dominio portado con pruebas y cascarón PWA instalable desplegado en Vercel.
2. Almacenamiento local (Dexie y repositorios) e interfaz de captura portada del prototipo, solo local.
3. Esquema de Postgres en Supabase con reglas de acceso por rancho y pruebas de esas reglas.
4. Sincronización: cola de pendientes, envío, descarga y conflictos.
5. Inicio de sesión con código de 6 dígitos por correo, creación de rancho e invitación de operadores.
6. Tablero, aplicaciones, exportación e importación de KMZ portados del prototipo.
7. Clima diario automático (Open-Meteo) desde el servidor.
8. Preparación del piloto: aviso de privacidad, registro de errores, respaldos, guía de una página y pruebas en dispositivos reales.

### Reglas

- No empieces un hito sin sus instrucciones (`docs/hitos/HITO-N.md`).
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

## Decisiones pendientes (no resolver por cuenta propia)

- **Promedio de HMJ** cuando la planta no presenta el síntoma: excluir (actual) o asignar TH + 1.
- **Umbrales definitivos** del semáforo y regla de "cuándo aplicar".
- **Preaviso biológico:** coeficientes del estado evolutivo, escala de densidad y umbrales.
- **Texto del aviso de privacidad** (LFPDPPP): lo entrega el responsable del proyecto.

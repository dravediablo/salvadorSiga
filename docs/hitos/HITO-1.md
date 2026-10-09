# Hito 1: base del proyecto, dominio con pruebas y cascarón PWA instalable

Lee primero `CLAUDE.md` completo. Este hito no incluye Supabase, inicio de sesión, captura ni tablero.

## Objetivo

Al terminar este hito deben quedar tres cosas:

1. Un repositorio con la estructura y las reglas de arquitectura de `CLAUDE.md`.
2. Toda la lógica de cálculo del prototipo portada a TypeScript, con pruebas.
3. Una PWA mínima desplegada en Vercel que se instale desde un enlace en Android y iPhone y abra sin conexión.

La instalación se valida desde ahora porque es el mayor riesgo del piloto. Si falla en algún celular, hay que saberlo antes de construir encima.

## Alcance

**Incluye:**

- Proyecto Vite, React y TypeScript estricto.
- Estructura de carpetas.
- Configuración de ESLint, Vitest y scripts.
- `src/dominio` completo, con pruebas.
- Manifest, íconos, service worker, pantalla de instalación, aviso de actualización y persistencia del almacenamiento.
- Despliegue en Vercel.

**No incluye:**

- Dexie: puede quedar instalado, pero sin uso.
- Supabase.
- Inicio de sesión.
- Pantallas de captura o tablero.
- Importación de KMZ desde un archivo. El parser del KML sí entra; la descompresión del KMZ va en el hito 6.

## Tareas

### 1. Proyecto y herramientas

- **Proyecto:**
  - Crea el proyecto con Vite (plantilla React y TypeScript), `strict: true` y alias `@/` → `src/`.
  - Copia el prototipo a `referencia/prototipo.html` (te lo entregan junto con este archivo).
- **Scripts de npm:** `dev`, `build`, `preview`, `test`, `test:watch`, `lint` y `typecheck`.
- **ESLint:** regla `no-restricted-imports` que impida que cualquier archivo de `src/dominio/**` importe:
  - `react` y `react-dom`,
  - `dexie` y `@supabase/*`,
  - y cualquier ruta de `@/datos`, `@/ui` o `@/pwa`.
- **Vitest:** entorno `node` por defecto. Si el parser de KML usa `DOMParser`, usa entorno `jsdom` solo para esas pruebas (comentario `// @vitest-environment jsdom`).
- **Repositorio:** `.gitignore` con `.env*.local`.
- **README breve:** cómo correr el proyecto, las pruebas y la compilación.

### 2. Estructura

```
src/
  dominio/
    tipos.ts       Interfaces de todas las entidades de CLAUDE.md, incluidas rancho y membresia
    fechas.ts      semanaISO, lunesDeSemana, sumarDias, sumarSemanas, rangoSemanas, diasEntre, hoy
    modelo.ts      Fábricas (nuevaTabla, nuevoRecorrido, nuevaEvaluacion, nuevaPlanta, nuevaAplicacion…) y ajustarHojas
    calculos.ts    GRADOS_GAUHL, hf, ii, iiPlanta, completa, resumen, distribucion, validar, semaforo
    analisis.ts    Agregación semanal por tabla, valor previo, última aplicación, repeticionesFrac, efectoAplicacion
    clima.ts       parseCSV, porSemana; simular solo para demostración y pruebas
    geo.ts         parseKml(texto) → polígonos, areaHa, centroide
    index.ts       Exportaciones públicas
  pwa/
  ui/
  datos/           Vacío por ahora (puede tener un .gitkeep)
docs/
  hitos/HITO-1.md
  reportes/
referencia/prototipo.html
```

### 3. Portar el dominio

- **Qué portar.** La lógica de `Modelo`, `Calc`, `Analisis`, `Clima` y `Geo` del prototipo, a funciones tipadas y puras. Las funciones de análisis reciben los datos como parámetros, sin acceso a un almacén global.
- **Fechas.** Siempre cadenas `AAAA-MM-DD`. Haz los cálculos con `Date.UTC` sobre las partes de la fecha, nunca con `new Date('AAAA-MM-DD')`. La única excepción es `hoy()`, que usa la fecha local del dispositivo.
- **Registros.** Las fábricas generan UUID con `crypto.randomUUID()` y reciben `rancho_id`. Llenan `created_at` y `updated_at`; `server_updated_at` queda en `null` y `eliminado` en `false`.
- **Tipos:**
  - `hmj_*` es `number | null`, donde `0` significa "no presenta" (documéntalo con JSDoc en el tipo).
  - `grado_gauhl` es `0 | 1 | 2 | 3 | 4 | 5 | 6 | null`.
- **Regla configurable.** Deja la regla del promedio de HMJ en una sola función, con un parámetro de estrategia cuyo único valor implementado sea `'excluir_no_presenta'`. Así será fácil cambiarla si el agrónomo decide otra cosa.
- **Modelo de datos.** Plantas y hojas son entidades separadas, cada una con su `id` y llave foránea, como en `CLAUDE.md`. El prototipo las anidaba dentro de la evaluación; para `resumen` y `distribucion` define un tipo de entrada `PlantaConHojas`.

### 4. Pruebas obligatorias (casos con resultado conocido)

Estos valores se verificaron contra el prototipo. Si alguno no coincide, el error está en el código portado, no en la prueba.

**Índice de infección y hojas funcionales**

| Caso | Resultado esperado |
|---|---|
| Planta con grados [0,0,0,1,2,3,3,4,5,6] | II = 40,00 y HF = 8 |
| 12 hojas en grado 0 | II = 0 y HF = 12 |
| 8 hojas en grado 6 | II = 100 y HF = 0 |
| Planta [0, 2, sin calificar] | II = 16,67 (sobre las 2 hojas calificadas) y `completa = false` |
| Tabla con planta A [0,0,6] y planta B [0,0,0,0,0,0] | II = 11,11, no 16,67: todas las hojas juntas, no promedio de plantas |

**Hoja más joven con síntoma**

| Caso | Resultado esperado |
|---|---|
| Estría en plantas con valores [3, 0, 5, null] | promedio 4, no presenta 1, sin capturar 1 |

**Validaciones**

| Caso | Resultado esperado |
|---|---|
| TH 10, pizca 12 | 1 error (bloquea) |
| TH 10, pizca 5, estría 3, mancha 6 | 0 errores y un aviso de orden pizca/estría |
| TH 10, pizca "no presenta" (0), estría 4, mancha 6 | sin aviso de orden |

**Semanas ISO y fechas**

| Caso | Resultado esperado |
|---|---|
| `semanaISO('2026-01-01')` | `2026-W01` |
| `semanaISO('2026-12-31')` | `2026-W53` |
| `semanaISO('2027-01-01')` | `2026-W53` |
| `semanaISO('2024-12-30')` | `2025-W01` |
| `semanaISO('2026-10-09')` | `2026-W41` |
| `lunesDeSemana('2026-W41')` | `2026-10-05` |
| `rangoSemanas('2026-W52', '2027-W02')` | `['2026-W52', '2026-W53', '2027-W01', '2027-W02']` |
| `diasEntre('2026-02-27', '2026-03-01')` | 2 |
| `diasEntre('2028-02-27', '2028-03-01')` | 3 (año bisiesto) |
| Funciones de fecha con `TZ=America/Mexico_City` y con `TZ=UTC` | mismos resultados |

**Semáforo** (umbral medio 20, alto 30)

| Valor de II | Resultado esperado |
|---|---|
| 19,99 | verde |
| 20 | amarillo |
| 29,99 | amarillo |
| 30 | rojo |
| null | sin datos |

**Geo**

| Caso | Resultado esperado |
|---|---|
| Rectángulo [-103.9, 18.88] → [-103.897, 18.877] | 10,48 ha (±1 %) |
| KML con 2 Placemark de polígono y 1 punto | 2 polígonos con su nombre; el anillo se cierra si viene abierto |
| KML sin polígonos | error con mensaje en español |

**Otros**

| Caso | Resultado esperado |
|---|---|
| `ajustarHojas`: TH de 10 a 8 | conserva las hojas 1–8 con sus grados |
| `ajustarHojas`: TH de 8 a 10 | agrega las hojas 9 y 10 sin calificar, con `planta_id` correcto |
| `porSemana` | suma lluvia y horas de HR alta; promedia temperaturas y HR |
| `repeticionesFrac`: dos aplicaciones consecutivas FRAC 11 en la misma tabla | 1 alerta |
| `repeticionesFrac`: FRAC 11 en una tabla y FRAC 11 en otra | 0 alertas |
| `efectoAplicacion` | con evaluaciones en S30 (antes), S32 y S34 devuelve los tres valores; sin evaluación previa, `antes = null` |

La cobertura de `src/dominio` debe ser de al menos 90 % de líneas. Incluye el reporte de cobertura en el reporte del hito.

### 5. Cascarón PWA

- **Manifest** según `CLAUDE.md`.
  - Íconos provisionales: una hoja de plátano simple en verde sobre fondo claro (SVG exportado a PNG de 192, 512 y 512 maskable, más `apple-touch-icon` de 180).
- **Meta etiquetas para iPhone:**
  - `apple-mobile-web-app-capable` y `apple-mobile-web-app-title`.
  - `viewport` con `viewport-fit=cover`, y respeto de las zonas seguras con `env(safe-area-inset-*)`.
- **Service worker** con `vite-plugin-pwa`:
  - `registerType: 'prompt'` y precarga de todo el cascarón.
  - Sin recarga automática bajo ninguna circunstancia.
- **Pantalla de inicio provisional:**
  - Nombre de la app y estado: instalada o no, con conexión o sin ella, almacenamiento persistente sí o no.
  - El resultado de `navigator.storage.persist()`.
  - La versión de la compilación (hash de commit o fecha), para saber qué versión tiene cada celular.
- **Instalación:**
  - **Android:** botón "Instalar" que usa el evento `beforeinstallprompt` capturado.
  - **iPhone en Safari:** instrucciones paso a paso: botón Compartir → "Agregar a inicio" → "Agregar".
  - **iPhone en otro navegador:** pide abrir el enlace en Safari si ese navegador no permite agregar a inicio.
  - **Ya instalada:** no muestra nada de esto.
  - **iPhone sin instalar:** aviso visible: "Instala la app antes de capturar: en iPhone, lo que captures en el navegador no aparece en la app instalada".
- **Aviso de actualización:** "Hay una versión nueva" con el botón "Actualizar ahora", y la opción de cerrarlo.
- **Estilo:** modo claro, alto contraste, tipografía Atkinson Hyperlegible con fuentes de respaldo del sistema, y botones de al menos 48 px. Toma los colores del prototipo.

### 6. Despliegue

- Proyecto en Vercel conectado al repositorio, con vista previa por rama y producción desde `main`.
- `vercel.json` con reescritura de todas las rutas a `/index.html`.
- Encabezados: `Cache-Control: no-cache` para `sw.js` y `index.html`, y caché larga para los archivos con hash.

## Criterios de aceptación

**Calidad del código**

- [ ] `typecheck`, `lint`, `test` y `build` pasan sin errores ni advertencias.
- [ ] Todos los casos de la tarea 4 están implementados y pasan, y la cobertura de `src/dominio` es de al menos 90 %.
- [ ] Importar `react` (o algo de `@/ui`) desde `src/dominio` hace fallar el lint. Demuéstralo en el reporte con un intento temporal.
- [ ] Ningún archivo de `src/dominio` usa `new Date('AAAA-MM-DD')`, `localStorage`, `window` ni `document` (`DOMParser` se permite solo en `geo.ts`).

**PWA**

- [ ] Lighthouse (sección PWA o "Installable") sin errores en la URL de Vercel. Incluye captura o la salida en el reporte.

**Pruebas en celulares reales**, cada una con fecha, modelo y versión del sistema en el reporte:

- [ ] Android con Chrome: aparece el botón "Instalar", se instala y abre en pantalla completa sin barra del navegador.
- [ ] iPhone con Safari: se instala siguiendo las instrucciones de la app y abre en pantalla completa.
- [ ] En ambos: con la app instalada y el teléfono en modo avión, cerrar la app por completo y volver a abrirla carga la pantalla de inicio.
- [ ] En ambos: al publicar una versión nueva aparece el aviso de actualización y la app no se recarga sola.
- [ ] En ambos: se muestra y queda registrado el resultado de la solicitud de almacenamiento persistente.

**Entrega**

- [ ] `docs/reportes/HITO-1.md` sigue la plantilla de `CLAUDE.md`.

## Entrega al supervisor

Al terminar, el responsable del proyecto pasará al supervisor:

- el reporte del hito,
- el contenido de `src/dominio/calculos.ts`, `src/dominio/fechas.ts` y sus pruebas,
- la configuración de ESLint, `vite.config.ts` (sección PWA), el manifest y `vercel.json`,
- y la URL de Vercel.

No empieces el hito 2 hasta recibir aprobación.

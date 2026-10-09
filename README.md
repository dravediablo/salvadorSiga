# Sigatoka

App web progresiva (PWA) para monitorear Sigatoka negra en plátano y banano con el método de Stover modificado por Gauhl. Lee `CLAUDE.md` para las reglas del proyecto.

## Requisitos

Node.js 22 o superior y npm.

## Comandos

```bash
npm install            # instala dependencias
npm run dev            # servidor de desarrollo
npm test               # pruebas (corre con TZ=America/Mexico_City y con TZ=UTC)
npm run test:cobertura # pruebas con reporte de cobertura de src/dominio
npm run lint           # ESLint (incluye la regla de dependencias de src/dominio)
npm run typecheck      # TypeScript estricto
npm run build          # compila a dist/ (incluye el service worker)
npm run e2e            # pruebas de extremo a extremo (Playwright, 390 × 844, usa el Chrome instalado)
npm run preview        # sirve dist/ localmente en http://localhost:4173
node scripts/iconos.mjs  # regenera los PNG de public/ desde los SVG
node scripts/generar-kmz-sintetico.mjs  # regenera el KMZ sintético de pruebas
```

Antes de reportar un hito deben pasar `typecheck`, `lint`, `test`, `build` y, desde el hito 2, `e2e`.

`npm run e2e` necesita Google Chrome instalado (usa `channel: 'chrome'`); compila la app y la sirve con `vite preview` en el puerto 4174.

## Estructura

- `src/dominio/`: lógica pura (tipos, fechas, cálculos, análisis, clima, geo). No importa React, Dexie, Supabase ni `datos`/`ui`/`pwa`.
- `src/pwa/`: service worker, instalación, actualizaciones, persistencia del almacenamiento.
- `src/ui/`: componentes de React.
- `src/datos/`: Dexie (`db.ts`), cola de pendientes de una entrada por registro (`cola.ts`), generador de `updated_at` monótono (`reloj.ts`), escrituras fallidas en segundo plano (`fallos.ts`), repositorios (`repos/`), consultas, sesión simulada e importación de KMZ. La interfaz solo importa de `@/datos`.
- `referencia/prototipo.html`: prototipo validado por el cliente (fuente de verdad de la interfaz y los cálculos).
- `datos-locales/` (ignorada por Git): archivos reales de productores, como el KMZ del rancho. Nunca se versionan; las pruebas usan `src/**/__fixtures__/`.
- `docs/hitos/` y `docs/reportes/`: instrucciones y reportes de cada hito.

## Despliegue

Vercel sirve `dist/` y reescribe todas las rutas a `index.html` (ver `vercel.json`). Producción sale de `main`; cada rama genera una vista previa.

## Base de datos (hito 3)

Postgres con Supabase local (requiere Docker y la CLI de Supabase). Los puertos son 563xx para no chocar con otros proyectos.

- `supabase start` levanta el servidor local; `npm run db:reset` aplica las migraciones de `supabase/migrations/` desde cero.
- `npm run db:test` corre las pruebas pgTAP de `supabase/tests/`; `npm run db:lint`, el análisis de las funciones.
- `npm run db:tipos` regenera `src/datos/supabase/tipos.gen.ts`; `tipos.check.ts` verifica en `npm run typecheck` que el dominio y las filas coinciden.
- Los clientes solo leen (RLS); escriben únicamente con la función `aplicar_cambios`.

## Sincronización (hito 4)

- Sin sesión (como la app publicada) todo es "solo este dispositivo": no se hace ninguna llamada al servidor.
- Para probar con el servidor local: `npm run preparar-local` (crea `supabase/.env` con la PIMIENTA local), `supabase start && supabase db reset` (carga `supabase/seed.sql`: propietario `admin@prueba.test`, contraseña `prueba123`; rancho de prueba con código `PRUEBA`), copia `.env.example` a `.env.development.local` con la URL y la llave anon locales, y `npm run dev`.
- `npm run test:integracion` corre las pruebas de integración (dos o tres dispositivos simulados contra Supabase local). `npm run e2e` agrega la prueba de sincronización si `supabase start` está corriendo.
- `npm run build` termina con `scripts/verificar-dist.mjs`: falla si `dist/` contiene el acceso de desarrollo o alguna URL o llave de Supabase.

## Cuentas (hito 5)

- **Propietario:** correo y contraseña de Supabase Auth (sin confirmación de correo). Crea su rancho con un **código de alta** de un solo uso: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/crear-codigo-alta.mjs 3`. Si olvida su contraseña: `node scripts/restablecer-contrasena.mjs correo@ejemplo.com` (contraseña temporal).
- **Operador:** código del rancho + usuario + PIN de 6 dígitos, por la función `entrar_operador` (bloqueo por intentos). El propietario los gestiona en la pestaña Operadores (función `operadores`).
- Las funciones están en `supabase/functions/` (Deno) y son el único lugar donde se usa la llave `service_role`. La **PIMIENTA** que protege los PIN es un secreto del proyecto: en local sale de `supabase/.env` (sin versionar); en el proyecto real, `supabase secrets set PIMIENTA=…`. Nunca en el repositorio.
- A producción solo `supabase db push` y `supabase functions deploy`. **Nunca** `supabase db reset --linked`.


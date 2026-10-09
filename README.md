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

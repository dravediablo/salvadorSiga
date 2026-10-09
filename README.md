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
npm run preview        # sirve dist/ localmente en http://localhost:4173
node scripts/iconos.mjs  # regenera los PNG de public/ desde los SVG
```

Antes de reportar un hito deben pasar `typecheck`, `lint`, `test` y `build`.

## Estructura

- `src/dominio/`: lógica pura (tipos, fechas, cálculos, análisis, clima, geo). No importa React, Dexie, Supabase ni `datos`/`ui`/`pwa`.
- `src/pwa/`: service worker, instalación, actualizaciones, persistencia del almacenamiento.
- `src/ui/`: componentes de React.
- `src/datos/`: vacío hasta el hito 2.
- `referencia/prototipo.html`: prototipo validado por el cliente (fuente de verdad de la interfaz y los cálculos).
- `docs/hitos/` y `docs/reportes/`: instrucciones y reportes de cada hito.

## Despliegue

Vercel sirve `dist/` y reescribe todas las rutas a `index.html` (ver `vercel.json`). Producción sale de `main`; cada rama genera una vista previa.

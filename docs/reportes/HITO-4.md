# Reporte del hito 4: sincronización

Rama `hito-4-sincronizacion` (desde `main`). Detalle completo y código en el handoff.

## 1. Resumen
Cliente de Supabase (solo con configuración y sesión), envío por lotes con `aplicar_cambios`, descarga con cursor y margen, fusión con `aplicarRemoto`, rechazos visibles, motor con disparadores y espera creciente, indicador de estado, semilla y acceso de desarrollo, y pruebas unitarias, de integración (a–i más f2) y e2e.

## 2. Criterios de aceptación
- [x] typecheck, lint, test (217), test:integracion (12), e2e (6) y build en verde; pgTAP (353) sigue en verde.
- [x] La compilación no contiene el acceso de desarrollo ni URL o llave de Supabase (`scripts/verificar-dist.mjs`, parte de `npm run build`, con prueba propia).
- [x] Casos de integración a–i implementados y en verde (más f2: recorrido cerrado con más de 200 pendientes).
- [x] Sin variables de Supabase la app publicada es "Solo en este dispositivo".
- [x] Handoff.

## 3. Decisiones, 4. Desviaciones, 7. Riesgos
Ver el handoff.

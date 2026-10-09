# Reporte del hito 3: esquema en Supabase y reglas de acceso

Rama `hito-3-supabase` (desde `hito-2-captura-local`). Sin fusionar. Detalle completo, con todo el SQL, en el handoff.

## 1. Resumen
Postgres local (Supabase CLI 2.105, puertos 563xx) con las 11 entidades, RLS de lectura, sin escritura directa, `crear_rancho`, `aplicar_cambios` y 337 asserts pgTAP. Tipos generados y comprobados contra el dominio en `npm run typecheck`.

## 2. Criterios de aceptación
- [x] `supabase db reset` aplica las 4 migraciones desde cero sin errores.
- [x] `supabase test db`: 3 archivos, 337 asserts, todos en verde.
- [x] `supabase db lint`: "No schema errors found".
- [x] `typecheck`, `lint`, `test` (177), `build` y `e2e` (4) pasan, incluida la comprobación de tipos.
- [x] Handoff con el formato de CLAUDE.md.

## 3. Decisiones
Ver el handoff ("Decisiones y dependencias nuevas"). Sin dependencias nuevas de npm.

## 4. Desviaciones
Ver el handoff.

## 5. Salida completa
Ver el handoff (sección Verificación).

## 6. Archivos clave
`supabase/migrations/*.sql`, `supabase/tests/*.test.sql`, `src/datos/supabase/tipos.check.ts`.

## 7. Dudas o riesgos abiertos
Ver el handoff ("Necesito del responsable o del supervisor").

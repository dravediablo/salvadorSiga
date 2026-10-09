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

## 8. Ajustes de la revisión del supervisor
Migración nueva `20261009120400_ajustes_revision.sql` (las anteriores no se tocan):
- **Funciones cerradas por defecto** (`alter default privileges`, global para PUBLIC y por esquema para anon/authenticated en `public` y `privado`). Prueba **n**: la lista exacta de funciones de `public` ejecutables por `authenticated` es {aplicar_cambios, comparte_rancho_con, crear_rancho, es_miembro, rol_en}; `anon` no ejecuta ninguna; nada de `privado`; una función nueva creada en la prueba queda cerrada.
- **semana_iso coherente con la fecha**: CHECK `semana_iso = to_char(fecha, 'IYYY-"W"IW')`, traducido a "La semana no corresponde a la fecha." Pruebas: 2026-12-31/2026-W53 aceptado, 2027-01-01/2027-W01 rechazado, 2024-12-30/2025-W01 aceptado (más 2027-01-01/2026-W53 aceptado).
- **usuario.email lo pone el servidor** (el de `auth.users`): prueba de un correo ajeno que se ignora.
- La prueba **l.** no cambió de conteos (11 tablas, 11 políticas). Total: 353 asserts.


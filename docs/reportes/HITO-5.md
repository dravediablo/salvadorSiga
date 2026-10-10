# Reporte del hito 5: cuentas reales y paso a producción

Rama `hito-5-cuentas` (+ `hito-5-ajustes`), fusionadas a `main`. El código completo y los archivos para revisión están en el handoff.

## 1. Resumen
Propietarios con correo y contraseña (alta con código de un solo uso); operadores con código de rancho + usuario + PIN por la función `entrar_operador` (bloqueo por intentos); gestión de operadores con la función `operadores`; perfil automático; `mi_estado()` para detectar la desactivación; sesión vencida sin perder datos; cierre de sesión con aviso; migración de la etapa sin servidor; scripts del responsable; proyecto real de Supabase con migraciones, funciones y PIMIENTA.

## 2. Criterios de aceptación
- [x] typecheck, lint, test, test:integracion (26), e2e (9), build y supabase test db (419) en verde.
- [x] Migraciones aplicadas al proyecto real con `supabase db push`; funciones desplegadas; PIMIENTA definida (rotada una vez, mostrada una sola vez al responsable).
- [~] Auth del proyecto real: contraseña mínima de 8 verificada (el proyecto rechaza 7 caracteres); **la confirmación de correo sigue ACTIVADA** según `/auth/v1/settings` (`mailer_autoconfirm: false`) — pendiente del responsable.
- [x] Ninguna llave secreta ni la PIMIENTA en el repositorio ni en `dist/`.
- [x] Handoff.

## 3. Verificación de punta a punta en el proyecto REAL (y su borrado)
Se hizo con una prueba de una sola vez (no versionada) que usó un código de alta aparte (no los 3 entregados), la API de administración y la llave service_role leída con la CLI a variables de entorno de ese comando (nunca impresa ni guardada):
1. Código de alta nuevo → cuenta de propietario de prueba (por la API de administración: el proyecto real valida el dominio del correo y, con la confirmación activada, `signUp` mandaría un correo de verdad) → el trigger creó su perfil ("Prueba Verificación") → inicio de sesión → `crear_rancho` con el código (rancho con código `TN78PT`) → `operadores.crear` (alias `operadora`, PIN de 6 dígitos) → `entrar_operador` con PIN incorrecto: 401 genérico; con el PIN correcto: sesión → `mi_estado` y descarga → recorrido cerrado con una planta y 3 hojas calificadas → sincronización: cola local 0, rechazos 0, recorrido `cerrado` y 3 hojas vivas en el servidor. Todo con la PIMIENTA nueva.
2. Contraseña mínima: `signUp` con 7 caracteres → "Password should be at least 8 characters." (rechazado).
3. **Borrado total** (con la llave service_role, en el orden de las llaves foráneas), con conteos: hojas 10 (3 vivas y 7 eliminadas), plantas 1, evaluaciones 1, recorridos 1, aplicaciones 0, clima 0, plantas marcadas 0, cuenta_operador 1, membresías 2, tablas 1, código de alta 1 (el usado), rancho 1, perfiles `usuario` 2 y cuentas de Auth 2 (propietario y operadora; `auth.admin.deleteUser`). Resultado comprobado: 0 ranchos, 0 membresías, 0 cuentas de operador, 0 recorridos; `usuario`: 1 (la cuenta señuelo); Auth: solo la cuenta señuelo `op-00000000-0000-4000-8000-0000000000aa@operadores.invalid`; `codigo_alta`: solo los 3 códigos originales sin usar (RV8V3UJR, K9Q6WF97, R436RDMP).
4. Un primer intento de la prueba falló antes de crear nada (Auth rechazó el dominio `correo.test`); su limpieza dejó el proyecto como estaba (solo se había creado y borrado el código de alta de prueba).

## 4. Cambios de esta ronda (revisión del supervisor)
- Contraseña de propietario: mínimo 8 en la app (texto de ayuda, validación y mensaje de error), en `config.toml` local (`minimum_password_length = 8`) y en el proyecto real. Prueba de integración nueva (7 caracteres rechazados, 8 aceptados).
- "Ahora no" en la migración solo oculta el aviso de la pantalla de campo; "Subir los datos de antes de las cuentas" sigue en la pestaña Estado mientras la base `sigatoka` tenga datos. e2e nuevo (siembra la base antigua, "Ahora no", Estado, subida y confirmación).
- CLAUDE.md: sección "Riesgos aceptados del piloto" (bloqueo de un operador por terceros; revocación de sesión al vencer el token; pérdida de la PIMIENTA).
- Higiene: ramas locales ya fusionadas, rama `hito-4-sincronizacion` (con la llave del stack local) y el tag/refs de respaldo borrados; no se publicó ninguna rama vieja.

## 5. Desviaciones y riesgos
- La confirmación de correo del proyecto real sigue activada (ver 2).
- No se corrió pgTAP contra el proyecto real (trunca tablas dentro de una transacción); se verificó con consultas de solo lectura y con la prueba de punta a punta de arriba.
- Los límites de Auth del proyecto real (inicios de sesión por IP) se comparten entre todos los operadores porque salen de la función del servidor; el responsable ya subió "Sign-ups and sign-ins" a 100.

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

## 8. Ajustes de la revisión del supervisor (rama `hito-4-ajustes`)
1. **Descarga por llave, no por posición.** Orden `(server_updated_at, id)`; la página siguiente pide `server_updated_at > último O (= último Y id > último_id)` con el valor EXACTO que mandó el servidor (microsegundos, como texto). La interfaz `Servidor.descargar(entidad, desde, despuesDe, limite)` ya no tiene desplazamiento; `servidorFalso` compara marcas con precisión de microsegundos. Pruebas: unitaria (entre la página 1 y la 2 se modifica una fila ya recibida → no se omite ninguna; con 35 filas y páginas de 10), empates de `server_updated_at` entre páginas, y de integración (`e0`: 2500 hojas, otro dispositivo modifica una hoja ya descargada a mitad de la descarga; el admin termina con las 2500 ids del servidor y el valor nuevo).
2. **"Reintentar envío"** en la pantalla de rechazos: devuelve la entrada a la cola con el `updated_at` actual del registro (sin cambiarlo), borra el rechazo y sincroniza. Integración `d2`: el admin cierra, op1 edita y es rechazado, el admin reabre, op1 reintenta → aplicado (la marca local no cambia).
3. **`visibilitychange`**: al volver a estar visible la app sincroniza respetando la espera creciente (no ignora la espera; oculta no hace nada). Prueba unitaria (jsdom).
4. **"Sincronizado" eficiente**: `recorridosConAlgoPendiente` parte de la cola y de los rechazos y sube hoja → planta → evaluación → recorrido en bloque; un recorrido cerrado es "Sincronizado" si no está en ese conjunto. Prueba de rendimiento (`consultas.rendimiento.test.ts`): 200 recorridos cerrados × 20 plantas × 13 hojas (52 000 hojas), cola vacía, `tarjetasRecorridos` en **20, 20 y 23 ms** en fake-indexeddb (límite: 300 ms). Prueba de corrección con cola, rechazos y evaluaciones pendientes.
5. **Semilla**: CLAUDE.md (Convenciones de código) ya dice que `seed.sql` solo se usa en local, que no se corre `db reset --linked` y que a producción solo `supabase db push`. `seed.sql` empieza con una guardia que aborta si `app.settings.jwt_secret` no es el secreto público por defecto de Supabase local (un proyecto remoto tiene el suyo). Verificada: pasa en local y aborta con otro secreto. **Límite honesto**: un Supabase autoalojado que dejara el secreto por defecto pasaría la guardia; el proyecto real es alojado, así que no aplica.

## 9. Pendientes del hito 5 (anotados)
- **Sesión expirada o revocada sin perder datos locales**: hoy el motor solo reintenta con espera creciente y muestra el error; falta una pantalla "vuelve a iniciar sesión" que conserve la base local y la cola.
- **Avisar antes de cerrar sesión si hay pendientes** (cola o rechazos) y qué hacer con ellos.
- **Qué pasa con los datos locales si se desactiva la membresía de alguien**: el servidor deja de dejarlo leer y escribir; su cola quedaría rechazada y su base local con datos que ya no debería ver. Definir si se borran, se conservan o se exportan.
- **Migración de los datos capturados en la etapa sin servidor** (base local `sigatoka`, rancho y usuarios simulados) hacia el rancho real; hoy con sesión se usa una base aparte (`sigatoka-<id>`) y la anterior no se toca.


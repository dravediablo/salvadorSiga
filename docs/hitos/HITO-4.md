# Hito 4: sincronización

Objetivo: la cola local se envía al servidor con aplicar_cambios, y los cambios hechos en otros dispositivos se descargan solos. Sin conexión la app sigue igual; al volver la señal se sincroniza sola. Lo que el servidor rechaza queda visible con su motivo, nunca se pierde en silencio.

Entorno: Supabase local (supabase start) como en el hito 3. La app se conecta al servidor solo si existen VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en .env.local, sin versionar). NO configures estas variables en Vercel: la app publicada sigue en modo "solo este dispositivo" hasta el hito 5.

Incluye: cliente de Supabase en src/datos/supabase/, envío y descarga, rechazos, disparadores, indicador de estado, semilla de desarrollo, un acceso de desarrollo y pruebas unitarias, de integración y de extremo a extremo.
No incluye: inicio de sesión real ni invitaciones (hito 5), migración de los datos locales de la etapa sin servidor (hito 5), tablero ni clima.

1. Sesión de desarrollo (temporal)
- supabase/seed.sql: crea en auth.users (con contraseña) a admin, op1 y op2, sus perfiles, un rancho "Rancho de prueba" con 3 tablas y sus membresías.
- En la pestaña Estado, solo cuando import.meta.env.DEV, un formulario de acceso con correo y contraseña de esos usuarios. Coméntalo como TEMPORAL; el hito 5 lo reemplaza. No debe existir en la compilación de producción: agrega una prueba que busque su texto en dist/ y falle si aparece.
- Con sesión, el rancho activo y el rol salen del servidor (membresías). Sin sesión, la app funciona exactamente como hoy (rancho local, usuarios simulados) y la sincronización está apagada.

2. Envío (src/datos/sincronizacion/)
- Toma de la cola hasta 200 registros, ordenados por updated_at. Arma el lote { entidad, registro } con el registro COMPLETO, traduciendo nombres de entidad (Dexie en plural → tabla del servidor en singular) y quitando campos solo locales. El servidor ordena por dependencias; el cliente no necesita hacerlo.
- Por cada resultado, en una transacción de Dexie:
  - 'aplicado' o 'ignorado_version': borra la entrada de la cola SOLO si su updated_at sigue siendo el que se envió. Si cambió, hubo una edición local más nueva y debe quedarse.
  - 'rechazado': quita la entrada de la cola y guarda { entidad, registro_id, updated_at, motivo, fecha } en una tabla local nueva, rechazos (versión de Dexie nueva). El registro local NO se borra. Si después se edita, guardar() lo vuelve a poner en la cola y su rechazo anterior se borra.
- Errores de red o del servidor (no de un registro): nada se borra de la cola; se reintenta con espera creciente (5 s, 15 s, 1 min, 5 min, máximo 5 min).
- Si hay más de 200 pendientes, se envían lotes seguidos hasta vaciar la cola.

3. Descarga
- Por entidad, en orden de dependencias: rancho, usuario, membresia, tabla, recorrido, evaluacion_tabla, planta, hoja, aplicacion, clima_diario.
- Pide las filas con server_updated_at > (cursor − 2 minutos), ordenadas por server_updated_at, en páginas de 1000. El cursor de cada entidad se guarda en ajustes con el mayor server_updated_at recibido.
- Fusión, por registro remoto:
  - Si el local tiene una entrada en la cola con updated_at mayor que el remoto, se conserva el local.
  - En cualquier otro caso se escribe el remoto tal cual: con su updated_at y su server_updated_at, sin pasar por el generador de marcas y SIN agregar entrada a la cola. Escribe esto como una función propia de los repositorios (aplicarRemoto), separada de guardar().
- El generador de marcas avanza hasta el updated_at remoto más alto recibido, si no está más de 24 h en el futuro; si lo está, no avanza y se registra un aviso.
- Los registros eliminados también se descargan y se aplican.

4. Cuándo se sincroniza
- Al abrir la app, al volver la conexión (evento online), cada 60 s mientras haya conexión y la app esté visible, 5 s después de la última escritura local, y con un botón "Sincronizar ahora".
- Nunca dos sincronizaciones a la vez. Cada sincronización es primero envío y luego descarga.
- Ninguna sincronización bloquea la captura ni recarga la pantalla.

5. Estado visible
- Encabezado: "Al día", "N por enviar", "Sincronizando…", "Sin conexión" o "Solo en este dispositivo" (sin sesión). Detalle: última sincronización correcta y número de rechazos.
- Pantalla de rechazos: lista con entidad, descripción legible (por ejemplo "Hoja 3 de la planta 7, tabla 4") y motivo del servidor. Botón "Descartar mi cambio", que trae la versión del servidor y borra el rechazo.
- Un recorrido se muestra "Sincronizado" cuando está cerrado y ni él ni sus evaluaciones, plantas u hojas tienen entradas en la cola ni rechazos.

6. Pruebas
- Unitarias (sin servidor, con un cliente simulado):
  - traducción de nombres y campos;
  - la cola se borra solo si updated_at no cambió;
  - un rechazo pasa a la lista y una edición posterior lo devuelve a la cola;
  - fusión: local más nuevo se conserva y remoto más nuevo se aplica, sin entrada en la cola;
  - el cursor con margen no duplica registros;
  - el reloj avanza con marcas remotas y no con una de 2 días en el futuro;
  - espera creciente;
  - no hay dos sincronizaciones a la vez.
- Integración contra Supabase local (script npm run test:integracion; requiere supabase start). Dos dispositivos simulados, cada uno con su propia base Dexie y su sesión:
  a. op1 captura sin conexión un recorrido de 2 tablas con 3 plantas calificadas y lo cierra. Al sincronizar, todo aplicado y la cola vacía. El admin descarga y ve el recorrido cerrado con todas sus plantas y hojas.
  b. El admin corrige una hoja de ese recorrido y sincroniza; op1 descarga y recibe la corrección, sin entrada nueva en su cola.
  c. Edición concurrente: op1 y el admin editan la misma hoja de un recorrido en curso, sin conexión, con marcas distintas. Sincronizando en cualquier orden, ambos terminan con el valor de marca mayor.
  d. Rechazo: op1 edita localmente una hoja de un recorrido que el servidor ya tiene cerrado. La sincronización lo marca rechazado con motivo, la cola queda vacía y el registro local sigue. "Descartar mi cambio" deja la versión del servidor.
  e. Repetir la sincronización 3 veces seguidas no cambia nada ni duplica registros.
  f. 450 hojas pendientes se envían en 3 lotes y todas quedan aplicadas.
  g. Falla de red a mitad del envío (simula que la llamada se corta después de que el servidor aplicó): al reintentar, todo queda 'ignorado_version' o 'aplicado', sin duplicados, y la cola termina vacía.
  h. Cambio confirmado tarde: una fila con server_updated_at 1 minuto anterior al cursor (insertada como postgres) se descarga igual.
  i. Sin sesión: no se intenta ninguna llamada al servidor.
- Extremo a extremo (Playwright contra vite preview y Supabase local): iniciar sesión de desarrollo como op1, capturar sin conexión (setOffline), volver a la conexión y ver que el encabezado pasa de "N por enviar" a "Al día" sin tocar nada.

Criterios de aceptación
- [ ] typecheck, lint, test, test:integracion, e2e y build en verde.
- [ ] La compilación de producción no contiene el acceso de desarrollo ni ninguna URL o llave de Supabase (prueba sobre dist/).
- [ ] Todos los casos de integración a–i implementados y en verde.
- [ ] La app publicada (sin variables de Supabase) se comporta igual que antes del hito: "Solo en este dispositivo".
- [ ] Handoff con el formato de CLAUDE.md, con COMPLETOS: el módulo de sincronización (envío, descarga, fusión, disparadores), aplicarRemoto, la migración de Dexie de rechazos, seed.sql y las pruebas de integración.

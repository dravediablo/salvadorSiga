# Hito 5: cuentas reales y paso a producción

Objetivo: propietarios y operadores entran con cuentas reales; el propietario gestiona a sus operadores desde la app; los datos del dispositivo de la etapa sin servidor se pueden subir al rancho; y la app publicada pasa a usar el proyecto real de Supabase.

Modelo de acceso
- Propietario: correo y contraseña de Supabase Auth, con la confirmación de correo DESACTIVADA (no hay servicio de correo en el piloto). Para crear un rancho necesita un código de alta de un solo uso que reparte el responsable del proyecto.
- Operador: entra con código del rancho + usuario + PIN de 6 dígitos, por una función del servidor que aplica el bloqueo por intentos. No conoce ni usa una contraseña de Supabase directamente.

1. Base de datos (migraciones nuevas; las aplicadas no se tocan)
- Perfil automático: trigger en auth.users (after insert) que crea la fila de public.usuario con el nombre de raw_user_meta_data->>'nombre' (o '') y el correo de la cuenta.
- rancho.codigo: texto de 6 caracteres de un alfabeto sin ambigüedades (A–Z y 2–9, sin O, I, 0 ni 1), único, generado por el servidor al crear el rancho.
- codigo_alta: tabla con codigo (único), usado_por (usuario), usado_en, creado_en. Sin acceso para anon ni authenticated: la usa solo crear_rancho. Script scripts/crear-codigo-alta.mjs para que el responsable genere códigos contra el proyecto real (lee la URL y la llave service_role de variables de entorno; nunca las guarda).
- crear_rancho(nombre, lat, lon, codigo_alta): rechaza códigos inexistentes o usados; marca el código como usado en la misma transacción.
- cuenta_operador: usuario_id (PK, FK a usuario), rancho_id, alias (único por rancho; minúsculas, sin acentos ni espacios), intentos_fallidos, bloqueado_hasta, bloqueado_permanente, ultima_sincronizacion. Lectura: administradores del rancho (RLS). Escritura: solo funciones del servidor.
- mi_estado() (SECURITY DEFINER, authenticated): devuelve las membresías de auth.uid() INCLUIDAS las inactivas, con rancho_id, rol y activo; y actualiza cuenta_operador.ultima_sincronizacion si existe. La sincronización la llama al empezar cada ciclo.
- Actualiza la prueba n (funciones expuestas) con las nuevas, y agrega pruebas pgTAP de: perfil automático; códigos de alta (válido, usado, inexistente, sin código); que nadie lea codigo_alta; RLS de cuenta_operador (el admin de A la lee, los operadores no, B nada); mi_estado con membresía inactiva.

2. Función del servidor "operadores" (supabase/functions/operadores; Deno; usa service_role)
Verifica en cada llamada que quien llama sea administrador activo del rancho indicado (con su JWT). Acciones:
- crear { rancho_id, nombre }: genera el alias a partir del nombre (único en el rancho: juan, juan2…) y un PIN aleatorio de 6 dígitos (crypto). Crea el usuario de Auth con correo sintético op-<uuid>@operadores.invalid (dominio reservado, nunca recibe correo), contraseña = HMAC-SHA256(PIMIENTA, usuario_id + ':' + PIN) en base64url, y email_confirm true. Crea el perfil, la membresía de operador y la fila de cuenta_operador. Devuelve { alias, pin, codigo_rancho }. El PIN no se guarda en ningún lado.
- restablecer_pin { usuario_id }: PIN nuevo, actualiza la contraseña derivada, reinicia intentos y bloqueos. Devuelve el PIN.
- desactivar / reactivar { usuario_id }: membresia.activo = false/true (con updated_at nuevo, como una escritura normal).
- renombrar { usuario_id, nombre }: cambia el nombre del perfil (el alias no cambia).
La PIMIENTA es un secreto del proyecto (supabase secrets set), nunca en el repositorio.

3. Función del servidor "entrar_operador" (pública, sin JWT)
- Entrada { codigo_rancho, alias, pin }. Busca la cuenta; si no existe, responde el mismo error genérico que con PIN incorrecto ("Código, usuario o PIN incorrectos") y con el mismo tiempo aproximado.
- Si está bloqueada: error que dice hasta cuándo (o que pida al propietario un PIN nuevo si es permanente).
- Inicia sesión con la contraseña derivada. Si falla: intentos_fallidos + 1; a los 5, bloqueado_hasta = ahora + 15 min; a los 10, bloqueado_permanente. Si funciona: reinicia intentos y devuelve access_token y refresh_token; el cliente usa auth.setSession.
- Membresía inactiva: no entrega sesión ("Tu acceso a este rancho está desactivado").

4. Cliente
- Pantalla de entrada con dos pestañas: "Soy operador" (código del rancho, usuario y PIN con teclado numérico) y "Soy propietario" (correo y contraseña, más "Crear cuenta": nombre, correo, contraseña y código de alta, y luego nombre del rancho).
- Sin Supabase configurado (variables vacías), la app sigue en "Solo en este dispositivo" como hoy. Con Supabase configurado y sin sesión, se muestra la pantalla de entrada.
- Pantalla "Operadores" (solo administrador):
  - lista con nombre, alias, estado (activo, bloqueado, desactivado) y última sincronización;
  - "Agregar operador" muestra UNA vez alias, PIN y código del rancho, con el botón "Compartir por WhatsApp" (enlace wa.me con el texto y la dirección de la app) y "Copiar";
  - "Nuevo PIN", "Desactivar" y "Reactivar", con confirmación propia.
  - Al desactivar, el aviso dice: "Si tiene cambios sin enviar en su celular, se perderán. Pídele que sincronice antes."
- Se retira el acceso de desarrollo del hito 4 (las cuentas de seed.sql siguen para las pruebas locales).
- Sesión expirada o revocada: si la renovación falla, pantalla "Vuelve a entrar" SIN borrar la base local. Al entrar de nuevo con la misma cuenta se usa la misma base y se envía lo pendiente.
- Cerrar sesión: si hay pendientes o rechazos, avisa cuántos y que se enviarán la próxima vez que esa cuenta entre en este celular. Opción "Cerrar sesión y borrar los datos de este celular", disponible solo si no hay pendientes.
- Membresía desactivada (mi_estado lo indica): se detiene la sincronización, se muestra "Tu acceso a este rancho fue desactivado" y se borran los datos locales de ese rancho.
- Migración de la etapa sin servidor: la primera vez que un propietario entra y crea su rancho en un dispositivo que tiene datos en la base local "sigatoka", se le ofrece "Subir los datos de este celular a tu rancho":
  - las tablas (con geometría, superficie y variedad) se copian a su base con el rancho_id nuevo y los mismos ids;
  - opcionalmente, casilla desmarcada por defecto, los recorridos con sus evaluaciones, plantas y hojas, asignados al propietario;
  - todo entra a la cola. La base "sigatoka" no se borra hasta que la subida se confirme sincronizada; entonces se ofrece borrarla.
- Scripts del responsable (leen la llave service_role de una variable de entorno, nunca la guardan): scripts/crear-codigo-alta.mjs y scripts/restablecer-contrasena.mjs <correo> (contraseña temporal para un propietario).

5. Proyecto real
- Pide al responsable que corra `supabase login` y la contraseña de la base para `supabase link`. Aplica las migraciones SOLO con `supabase db push`. NUNCA `db reset --linked`.
- Configura Auth del proyecto real: confirmación de correo desactivada y registro con correo habilitado. Si la CLI no puede (config push), da al responsable los pasos exactos del panel.
- Despliega las dos funciones y define la PIMIENTA con supabase secrets set.
- Genera 3 códigos de alta y entrégalos en el handoff.
- Da al responsable los valores exactos de VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (la llave pública) para Vercel, con los pasos. Tú no los pones en el repositorio.

6. Pruebas
- pgTAP: las del punto 1.
- Integración contra Supabase local (con edge runtime activado en config.toml):
  a. el propietario se registra con un código válido y crea su rancho; con un código usado o inexistente no puede;
  b. el admin crea un operador y recibe alias, PIN y código; el operador entra con entrar_operador y sincroniza;
  c. 5 PIN incorrectos bloquean 15 min (con el PIN correcto también responde bloqueado); a los 10, permanente; restablecer_pin lo libera;
  d. un alias inexistente responde el mismo error genérico;
  e. un operador o el admin de otro rancho no pueden usar "operadores" sobre el rancho A;
  f. desactivar: el siguiente ciclo detecta la membresía inactiva, deja de sincronizar y borra los datos locales del rancho; entrar_operador ya no da sesión;
  g. sesión revocada con datos pendientes: no se borra nada; al volver a entrar se envían;
  h. migración: una base "sigatoka" con tablas y un recorrido sube al rancho nuevo, y queda todo aplicado en el servidor;
  i. la contraseña derivada no sirve para entrar con signInWithPassword usando solo el PIN.
- E2E: el operador entra con código, usuario y PIN en pantalla de celular, captura sin conexión y sincroniza; el propietario agrega un operador y ve el diálogo con el PIN.
- verificar-dist sigue limpia: el script debe aceptar la URL y la llave pública del proyecto real en producción (ahora sí van), pero fallar con cualquier llave secreta o service_role.

Criterios de aceptación
- [ ] typecheck, lint, test, test:integracion, e2e, build y supabase test db en verde.
- [ ] Migraciones aplicadas al proyecto real con db push, funciones desplegadas, PIMIENTA definida y Auth configurado.
- [ ] Ninguna llave secreta ni la PIMIENTA en el repositorio ni en dist/ (busca también en el historial de git).
- [ ] Handoff con COMPLETOS: las migraciones nuevas, las dos funciones del servidor, sus pruebas, el flujo de sesión del cliente (entrada, expiración, cierre, desactivación) y la migración de datos locales. Más los 3 códigos de alta y los valores y pasos para Vercel.

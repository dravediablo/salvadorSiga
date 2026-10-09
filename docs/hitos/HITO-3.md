# Hito 3: esquema en Supabase y reglas de acceso

Objetivo: la base de datos de Postgres (Supabase local) con el modelo de CLAUDE.md; lecturas protegidas por RLS; escrituras solo por la función aplicar_cambios; y pruebas pgTAP que demuestren que nadie lee ni escribe datos de otro rancho ni se salta los permisos de su rol. La app todavía no se conecta al servidor (eso es el hito 4).

Requisitos: Supabase CLI y Docker; todo corre local con supabase start. Si falta alguno, detente y repórtalo. No uses un proyecto remoto en este hito.

Incluye: supabase init, migraciones, funciones crear_rancho y aplicar_cambios, pruebas pgTAP (supabase test db), tipos TypeScript generados y supabase db lint sin errores.
No incluye: cliente de Supabase en la app, inicio de sesión, invitaciones, tarea de clima ni proyecto remoto. No modifiques código de la app salvo los tipos generados y su prueba de tipos.

1. Tablas (supabase/migrations/)
- Una tabla por entidad de CLAUDE.md, en singular: rancho, usuario, membresia, tabla, recorrido, evaluacion_tabla, planta, hoja, aplicacion, clima_diario, planta_marcada.
- Columnas comunes:
  - id uuid primary key, generado por el cliente (sin default, salvo en rancho).
  - created_at y updated_at timestamptz not null, los manda el cliente.
  - server_updated_at timestamptz not null: lo pone un trigger con clock_timestamp() en cada insert y update; el valor que mande el cliente se ignora.
  - eliminado boolean not null default false.
- usuario.id references auth.users(id).
- rancho_id not null, con FK a rancho, en todas las tablas de datos.
- Coherencia entre ranchos con llaves foráneas compuestas: cada padre tiene unique (id, rancho_id) y el hijo referencia (padre_id, rancho_id). Así un hijo nunca apunta a un padre de otro rancho. Aplica a evaluacion_tabla→recorrido, evaluacion_tabla→tabla, planta→evaluacion_tabla, hoja→planta, planta_marcada→tabla y membresia→rancho.
- aplicacion.tabla_ids uuid[] not null, con índice GIN y un trigger que rechace ids que no sean tablas del mismo rancho.
- Restricciones:
  - grado_gauhl entre 0 y 6, o null; hmj_* >= 0, o null.
  - total_hojas entre 1 y 30; numero_hoja >= 1; numero_planta >= 1.
  - semana_iso con formato AAAA-Www.
  - estado en (en_curso, cerrado); rol en (operador, administrador); tipo en (stover, preaviso).
  - clima_diario: unique (rancho_id, fecha).
- Índice único parcial en hoja: (planta_id, numero_hoja) where not eliminado.
- Índice (rancho_id, server_updated_at) en todas las tablas de datos, para la sincronización.
- Umbrales del rancho con defaults 20, 30 y 14.

2. Lecturas (RLS)
- RLS activado en todas las tablas de public. Revoca INSERT, UPDATE y DELETE a anon y authenticated en todas; anon no tiene ni SELECT.
- Funciones auxiliares SECURITY DEFINER, STABLE, con set search_path = '': es_miembro(rancho_id) y rol_en(rancho_id). Solo cuentan membresías activas y no eliminadas.
- Políticas SELECT:
  - rancho, tabla, aplicacion, clima_diario, planta_marcada y membresia: miembros activos del rancho.
  - usuario: el propio y los que comparten algún rancho con él.
  - recorrido y sus hijos (evaluacion_tabla, planta, hoja): el administrador ve todo su rancho; el operador ve solo los recorridos con usuario_id = auth.uid(), abiertos y cerrados, y sus hijos.
  - Los registros eliminados se leen igual: la sincronización necesita enterarse de las bajas.

3. crear_rancho(nombre, lat, lon): devuelve el id. Crea el rancho y la membresía de administrador de auth.uid() en una sola transacción. Si el usuario no tiene fila en usuario, error claro.

4. aplicar_cambios(lote jsonb) returns jsonb
- SECURITY DEFINER, set search_path = '', ejecutable solo por authenticated.
- Entrada: arreglo de { entidad, registro }. entidad es el nombre de la tabla del servidor; registro es la fila completa. Usa jsonb_populate_record. Máximo 500 elementos: más es error claro.
- Todo en una sola transacción, en orden de dependencias: rancho, tabla, recorrido, evaluacion_tabla, planta, hoja, aplicacion.
  - Los cierres de recorrido se aplican AL FINAL: un recorrido que llega cerrado se escribe primero con su estado actual en el servidor (en_curso si es nuevo), y el cierre se aplica después de todo lo demás.
  - Motivo: un operador puede capturar un recorrido entero sin señal y cerrarlo; sus plantas y hojas deben entrar antes del cierre.
- Permisos. src/dominio/permisos.ts y sus pruebas son la especificación. El estado de los recorridos se toma del servidor ANTES de aplicar el lote.
  - Siempre:
    - el usuario es miembro activo del rancho_id del registro;
    - un registro existente no cambia de rancho_id;
    - nada se borra físicamente.
  - Administrador: todo lo de su rancho, incluidos rancho (nombre y umbrales), tablas y aplicaciones. Excepto membresia y clima_diario, que llegan en los hitos 5 y 7.
  - Operador:
    - recorrido:
      - crea solo con usuario_id propio y estado en_curso;
      - actualiza solo si es suyo y está en_curso en el servidor;
      - puede cerrarlo;
      - no reabre, no cambia usuario_id ni marca eliminado.
    - evaluacion_tabla, planta y hoja: solo si el recorrido es suyo y está en_curso en el servidor, o es nuevo en este mismo lote. Puede marcar eliminadas plantas y hojas, no evaluaciones.
    - aplicacion: crea; edita solo las suyas (usuario_id); no elimina.
    - tabla, rancho, membresia y usuario ajeno: nada.
  - usuario: cada quien solo su propia fila.
- Gana la más reciente: si el registro existe y el updated_at que llega es menor o igual al guardado, se ignora (no es error).
- Resultado: un arreglo { entidad, id, resultado: 'aplicado' | 'ignorado_version' | 'rechazado', motivo }, en el orden de entrada.
  - Un rechazo no aborta el lote: usa un bloque BEGIN … EXCEPTION por registro.
  - Las violaciones de restricciones salen como 'rechazado' con un motivo legible en español.

5. Tipos: supabase gen types typescript --local > src/datos/supabase/tipos.gen.ts. Agrega una comprobación de tipos, compilada por npm run typecheck, de que cada entidad de src/dominio/tipos.ts coincide en campos y tipos con su fila. Si hay diferencias, repórtalas; no las ocultes con casts.

6. Pruebas pgTAP en supabase/tests/ (obligatorias)
- Preparación:
  - 2 ranchos, A y B.
  - En A: administrador A, operador A1, operador A2 y un usuario con membresía inactiva.
  - En B: administrador B.
  - Simula sesiones con set local role authenticated y set local request.jwt.claims (sub = id del usuario).
- Casos:
  a. Aislamiento: para CADA tabla, los usuarios de A ven 0 filas de B y viceversa; anon ve 0 en todas; un usuario sin rancho ve 0.
  b. Membresía inactiva: no ve nada y aplicar_cambios le rechaza todo.
  c. Escritura directa: INSERT, UPDATE y DELETE en cada tabla fallan para authenticated, incluido insertarse una membresía en B.
  d. Con aplicar_cambios se rechazan:
     - un registro con rancho_id ajeno;
     - un cambio de rancho_id de un registro existente;
     - un hijo cuyo padre es de otro rancho;
     - una aplicación con tabla_ids de otro rancho.
  e. Operador: crea un recorrido propio. No puede:
     - crear a nombre de otro;
     - editar el de A2;
     - reabrir;
     - eliminar un recorrido;
     - cambiar usuario_id;
     - tocar tablas o el rancho.
  f. Lote sin señal: A1 manda en un solo lote un recorrido nuevo ya cerrado, 2 evaluaciones, 3 plantas y sus hojas → todo aplicado y el recorrido queda cerrado.
  g. Con ese recorrido ya cerrado en el servidor, A1 manda un cambio a una de sus hojas → rechazado. El administrador A sí puede.
  h. Administrador A: reabre, elimina, edita tablas y umbrales de A; no puede nada en B.
  i. Gana la más reciente:
     - updated_at menor → ignorado_version; igual → ignorado_version; mayor → aplicado;
     - server_updated_at lo pone el servidor aunque el cliente mande otro valor, y crece en cada aplicación.
  j. Restricciones: grado 7, total_hojas 0 o dos hojas vivas con el mismo número → rechazado con motivo; el resto del lote sí se aplica.
  k. Lectura del operador: A1 ve sus recorridos (abiertos y cerrados) y sus hijos; no los de A2.
  l. Todas las tablas de public tienen RLS activado (consulta a pg_class) y ninguna política permite INSERT, UPDATE ni DELETE.
  m. Un lote de más de 500 elementos → error claro.

Criterios de aceptación
- [ ] supabase db reset aplica todas las migraciones desde cero sin errores.
- [ ] supabase test db: todas las pruebas en verde.
- [ ] supabase db lint sin errores.
- [ ] typecheck, lint, test y build del proyecto siguen pasando, incluida la comprobación de tipos (o las diferencias quedan reportadas).
- [ ] Handoff con el formato de CLAUDE.md. Incluye COMPLETAS todas las migraciones SQL y todas las pruebas pgTAP, aunque pasen de 300 líneas: en este hito la revisión es línea por línea. Incluye también la comprobación de tipos y solo el tamaño de tipos.gen.ts.

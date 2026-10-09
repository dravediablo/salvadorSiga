-- Hito 3: aplicar_cambios(lote jsonb). Única puerta de escritura de los clientes.
--
-- Aplica, en UNA transacción: permisos por rol (src/dominio/permisos.ts es la especificación),
-- "gana la más reciente" y el orden de dependencias entre entidades. Un registro rechazado no
-- aborta el lote: cada uno corre en su propio subbloque (BEGIN ... EXCEPTION).
--
-- Las piezas internas viven en el esquema privado, al que ningún cliente tiene acceso.

-- ---------------------------------------------------------------------------
-- Piezas internas
-- ---------------------------------------------------------------------------

-- Orden de dependencias. Lo desconocido va al final y se rechaza.
create function privado.orden_entidad(p_entidad text) returns integer
language sql immutable
set search_path = ''
as $$
  select case p_entidad
    when 'usuario' then 0
    when 'rancho' then 1
    when 'tabla' then 2
    when 'recorrido' then 3
    when 'evaluacion_tabla' then 4
    when 'planta' then 5
    when 'hoja' then 6
    when 'aplicacion' then 7
    else 99
  end;
$$;

-- Rol de una persona en un rancho (solo membresías activas y no eliminadas).
create function privado.rol_activo(p_uid uuid, p_rancho_id uuid) returns text
language sql stable
set search_path = ''
as $$
  select m.rol from public.membresia m
  where m.rancho_id = p_rancho_id and m.usuario_id = p_uid and m.activo and not m.eliminado
  limit 1;
$$;

-- Si el operador NO puede escribir en este recorrido (no existe, es de otra persona, está cerrado o
-- eliminado en el servidor), el motivo; si puede, null. El estado se lee del servidor, que durante el
-- lote solo cambia para los recorridos nuevos (nacen en_curso; los cierres se aplican al final).
create function privado.motivo_recorrido_no_operable(p_uid uuid, p_recorrido_id uuid) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  r public.recorrido;
begin
  select * into r from public.recorrido where id = p_recorrido_id;
  if not found then
    return 'El recorrido no existe.';
  elsif r.usuario_id <> p_uid then
    return 'Este recorrido es de otra persona.';
  elsif r.eliminado then
    return 'El recorrido fue eliminado.';
  elsif r.estado <> 'en_curso' then
    return 'El recorrido ya está cerrado; solo un administrador puede corregirlo.';
  end if;
  return null;
end;
$$;

create function privado.recorrido_de_evaluacion(p_evaluacion_id uuid) returns uuid
language sql stable
set search_path = ''
as $$
  select e.recorrido_id from public.evaluacion_tabla e where e.id = p_evaluacion_id;
$$;

create function privado.recorrido_de_planta(p_planta_id uuid) returns uuid
language sql stable
set search_path = ''
as $$
  select e.recorrido_id
  from public.planta p
  join public.evaluacion_tabla e on e.id = p.evaluacion_tabla_id
  where p.id = p_planta_id;
$$;

-- Motivo legible en español para un error de Postgres.
create function privado.traducir_error(p_sqlstate text, p_mensaje text, p_restriccion text, p_columna text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    -- Mensajes que escribimos nosotros (RAISE EXCEPTION): ya vienen en español.
    when p_sqlstate = 'P0001' then p_mensaje
    when p_sqlstate = '23514' then case p_restriccion
      when 'hoja_grado_gauhl_check' then 'El grado de Gauhl debe estar entre 0 y 6.'
      when 'hoja_numero_hoja_check' then 'El número de hoja debe ser 1 o mayor.'
      when 'planta_total_hojas_check' then 'El total de hojas debe estar entre 1 y 30.'
      when 'planta_numero_planta_check' then 'El número de planta debe ser 1 o mayor.'
      when 'planta_hmj_pizca_check' then 'La hoja más joven con pizca no puede ser negativa.'
      when 'planta_hmj_estria_check' then 'La hoja más joven con estría no puede ser negativa.'
      when 'planta_hmj_mancha_check' then 'La hoja más joven con mancha no puede ser negativa.'
      when 'recorrido_semana_iso_check' then 'La semana ISO debe tener el formato AAAA-Www (por ejemplo 2026-W41).'
      when 'recorrido_estado_check' then 'El estado del recorrido debe ser en_curso o cerrado.'
      when 'membresia_rol_check' then 'El rol debe ser operador o administrador.'
      when 'evaluacion_tabla_tipo_check' then 'El tipo de evaluación debe ser stover o preaviso.'
      when 'tabla_origen_check' then 'El origen de la tabla debe ser kmz o manual.'
      when 'tabla_geometria_check' then 'La geometría de la tabla debe ser un polígono.'
      when 'tabla_superficie_check' then 'La superficie no puede ser negativa.'
      when 'rancho_umbrales_check' then 'Los umbrales deben cumplir 0 <= medio <= alto.'
      when 'rancho_nombre_check' then 'El nombre del rancho no puede estar vacío.'
      else 'Un dato está fuera del rango permitido (' || coalesce(p_restriccion, 'sin nombre') || ').'
    end
    when p_sqlstate = '23503' then 'Hace referencia a un registro que no existe o que es de otro rancho.'
    when p_sqlstate = '23505' then case p_restriccion
      when 'hoja_planta_numero_viva_idx' then 'La planta ya tiene una hoja viva con ese número.'
      when 'membresia_vigente_idx' then 'La persona ya tiene una membresía vigente en este rancho.'
      else 'Ya existe un registro igual (' || coalesce(p_restriccion, 'sin nombre') || ').'
    end
    when p_sqlstate = '23502' then 'Falta el dato obligatorio «' || coalesce(p_columna, '?') || '».'
    when p_sqlstate in ('22P02', '22007', '22008', '22003', '22001', '22023') then 'Un dato tiene un formato o un valor inválido (' || p_mensaje || ').'
    else 'No se pudo guardar el registro (' || p_sqlstate || ': ' || p_mensaje || ').'
  end;
$$;

-- Aplica UN registro. Devuelve el resultado; lo inesperado lo lanza como excepción y quien llama
-- la convierte en 'rechazado' (el subbloque deshace las escrituras de este registro).
create function privado.aplicar_uno(p_uid uuid, p_entidad text, p_reg jsonb, out resultado text, out motivo text)
language plpgsql
set search_path = ''
as $$
declare
  -- El registro que llega, con la forma de su tabla (uno por entidad: así el análisis estático lo entiende).
  r_usuario public.usuario;
  r_rancho public.rancho;
  r_tabla public."tabla";
  r_recorrido public.recorrido;
  r_evaluacion public.evaluacion_tabla;
  r_planta public.planta;
  r_hoja public.hoja;
  r_aplicacion public.aplicacion;
  j jsonb;                  -- el mismo registro como jsonb, para lo que es común a todas las entidades
  v_id uuid;
  v_updated timestamptz;
  v_eliminado boolean;
  ex_j jsonb;               -- la fila actual del servidor (null si no existe)
  v_rancho uuid;
  v_rol text;
  v_motivo text;
  v_estado text;
begin
  resultado := 'rechazado';

  if p_entidad is null or p_entidad not in ('usuario', 'rancho', 'tabla', 'recorrido', 'evaluacion_tabla', 'planta', 'hoja', 'aplicacion') then
    motivo := case
      when p_entidad in ('membresia', 'clima_diario', 'planta_marcada') then 'Esta información todavía no se puede enviar desde la app.'
      else 'Entidad desconocida.'
    end;
    return;
  end if;
  if p_reg is null or jsonb_typeof(p_reg) <> 'object' then
    motivo := 'El registro viene vacío o mal formado.';
    return;
  end if;

  -- 1. Leer el registro con la forma de su tabla.
  case p_entidad
    when 'usuario' then r_usuario := jsonb_populate_record(null::public.usuario, p_reg); j := to_jsonb(r_usuario);
    when 'rancho' then r_rancho := jsonb_populate_record(null::public.rancho, p_reg); j := to_jsonb(r_rancho);
    when 'tabla' then r_tabla := jsonb_populate_record(null::public."tabla", p_reg); j := to_jsonb(r_tabla);
    when 'recorrido' then r_recorrido := jsonb_populate_record(null::public.recorrido, p_reg); j := to_jsonb(r_recorrido);
    when 'evaluacion_tabla' then r_evaluacion := jsonb_populate_record(null::public.evaluacion_tabla, p_reg); j := to_jsonb(r_evaluacion);
    when 'planta' then r_planta := jsonb_populate_record(null::public.planta, p_reg); j := to_jsonb(r_planta);
    when 'hoja' then r_hoja := jsonb_populate_record(null::public.hoja, p_reg); j := to_jsonb(r_hoja);
    when 'aplicacion' then r_aplicacion := jsonb_populate_record(null::public.aplicacion, p_reg); j := to_jsonb(r_aplicacion);
  end case;
  v_id := (j ->> 'id')::uuid;
  v_updated := (j ->> 'updated_at')::timestamptz;
  v_eliminado := coalesce((j ->> 'eliminado')::boolean, false);

  if j ->> 'id' is null then
    motivo := 'Falta el id del registro.';
    return;
  end if;
  if j ->> 'updated_at' is null or j ->> 'created_at' is null then
    motivo := 'Faltan las marcas de tiempo (created_at y updated_at).';
    return;
  end if;

  -- 2. Perfil de usuario: cada quien solo el suyo.
  if p_entidad = 'usuario' then
    if v_id <> p_uid then
      motivo := 'Cada persona solo puede modificar su propio perfil.';
      return;
    end if;
    select to_jsonb(u) into ex_j from public.usuario u where u.id = v_id for update;
    if ex_j is not null and v_updated <= (ex_j ->> 'updated_at')::timestamptz then
      resultado := 'ignorado_version';
      return;
    end if;
    insert into public.usuario (id, created_at, updated_at, eliminado, nombre, email)
    values (r_usuario.id, r_usuario.created_at, r_usuario.updated_at, r_usuario.eliminado, r_usuario.nombre, r_usuario.email)
    on conflict (id) do update
      set updated_at = excluded.updated_at, eliminado = excluded.eliminado, nombre = excluded.nombre, email = excluded.email;
    resultado := 'aplicado';
    return;
  end if;

  -- 3. Pertenencia al rancho (siempre).
  v_rancho := case when p_entidad = 'rancho' then (j ->> 'id')::uuid else (j ->> 'rancho_id')::uuid end;
  if v_rancho is null then
    motivo := 'Falta el rancho_id del registro.';
    return;
  end if;
  v_rol := privado.rol_activo(p_uid, v_rancho);
  if v_rol is null then
    motivo := case when p_entidad = 'rancho'
      then 'No eres miembro activo de este rancho (los ranchos nuevos se crean con crear_rancho).'
      else 'No eres miembro activo de este rancho.'
    end;
    return;
  end if;

  -- 4. Fila actual del servidor (bloqueada hasta el final de la transacción).
  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', p_entidad) into ex_j using (j ->> 'id')::uuid;
  if ex_j is not null and coalesce((ex_j ->> 'rancho_id')::uuid, (ex_j ->> 'id')::uuid) <> v_rancho then
    motivo := 'No se puede cambiar el rancho de un registro.';
    return;
  end if;

  -- 5. Gana la más reciente: igual o más vieja se ignora (no es error).
  if ex_j is not null and v_updated <= (ex_j ->> 'updated_at')::timestamptz then
    resultado := 'ignorado_version';
    return;
  end if;

  -- 6. Nada se borra físicamente; un rancho ni siquiera se da de baja desde un lote.
  if p_entidad = 'rancho' and v_eliminado then
    motivo := 'Un rancho no se puede eliminar.';
    return;
  end if;

  -- 7. Permisos por rol.
  if v_rol = 'operador' then
    case p_entidad
      when 'rancho' then
        motivo := 'Solo un administrador puede cambiar los datos del rancho.';
        return;
      when 'tabla' then
        motivo := 'Solo un administrador puede modificar las tablas.';
        return;

      when 'recorrido' then
        if ex_j is null then
          if r_recorrido.usuario_id <> p_uid then
            motivo := 'Solo puedes crear recorridos a tu nombre.';
            return;
          end if;
          if v_eliminado then
            motivo := 'Solo un administrador puede eliminar recorridos.';
            return;
          end if;
        else
          v_motivo := privado.motivo_recorrido_no_operable(p_uid, v_id);
          if v_motivo is not null then
            motivo := v_motivo;
            return;
          end if;
          if r_recorrido.usuario_id <> (ex_j ->> 'usuario_id')::uuid then
            motivo := 'No se puede cambiar de quién es el recorrido.';
            return;
          end if;
          if v_eliminado then
            motivo := 'Solo un administrador puede eliminar recorridos.';
            return;
          end if;
        end if;

      when 'evaluacion_tabla' then
        v_motivo := privado.motivo_recorrido_no_operable(p_uid, r_evaluacion.recorrido_id);
        if v_motivo is null and ex_j is not null then
          v_motivo := privado.motivo_recorrido_no_operable(p_uid, (ex_j ->> 'recorrido_id')::uuid);
        end if;
        if v_motivo is not null then
          motivo := v_motivo;
          return;
        end if;
        if v_eliminado then
          motivo := 'No puedes eliminar tablas de un recorrido.';
          return;
        end if;

      when 'planta' then
        v_motivo := privado.motivo_recorrido_no_operable(p_uid, privado.recorrido_de_evaluacion(r_planta.evaluacion_tabla_id));
        if v_motivo is null and ex_j is not null then
          v_motivo := privado.motivo_recorrido_no_operable(p_uid, privado.recorrido_de_evaluacion((ex_j ->> 'evaluacion_tabla_id')::uuid));
        end if;
        if v_motivo is not null then
          motivo := v_motivo;
          return;
        end if;

      when 'hoja' then
        v_motivo := privado.motivo_recorrido_no_operable(p_uid, privado.recorrido_de_planta(r_hoja.planta_id));
        if v_motivo is null and ex_j is not null then
          v_motivo := privado.motivo_recorrido_no_operable(p_uid, privado.recorrido_de_planta((ex_j ->> 'planta_id')::uuid));
        end if;
        if v_motivo is not null then
          motivo := v_motivo;
          return;
        end if;

      when 'aplicacion' then
        if r_aplicacion.usuario_id is distinct from p_uid then
          motivo := 'Solo puedes registrar aplicaciones a tu nombre.';
          return;
        end if;
        if ex_j is not null and (ex_j ->> 'usuario_id')::uuid is distinct from p_uid then
          motivo := 'Solo puedes editar tus propias aplicaciones.';
          return;
        end if;
        if v_eliminado then
          motivo := 'Solo un administrador puede eliminar aplicaciones.';
          return;
        end if;
    end case;
  end if;

  -- 8. Escribir. rancho_id y created_at no cambian nunca en una actualización.
  case p_entidad
    when 'rancho' then
      update public.rancho
        set updated_at = r_rancho.updated_at, nombre = r_rancho.nombre, lat = r_rancho.lat, lon = r_rancho.lon,
            ii_umbral_medio = r_rancho.ii_umbral_medio, ii_umbral_alto = r_rancho.ii_umbral_alto,
            dias_alerta_aplicacion = r_rancho.dias_alerta_aplicacion
        where id = r_rancho.id;

    when 'tabla' then
      insert into public."tabla" (id, created_at, updated_at, eliminado, rancho_id, codigo, nombre, superficie_ha, variedad, geometria, activa, origen)
      values (r_tabla.id, r_tabla.created_at, r_tabla.updated_at, r_tabla.eliminado, r_tabla.rancho_id, r_tabla.codigo, r_tabla.nombre, r_tabla.superficie_ha, r_tabla.variedad, r_tabla.geometria, r_tabla.activa, r_tabla.origen)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, codigo = excluded.codigo, nombre = excluded.nombre,
            superficie_ha = excluded.superficie_ha, variedad = excluded.variedad, geometria = excluded.geometria,
            activa = excluded.activa, origen = excluded.origen;

    when 'recorrido' then
      -- Un recorrido que llega cerrado se escribe con su estado actual (en_curso si es nuevo); el cierre
      -- lo aplica aplicar_cambios al final, cuando ya entraron sus evaluaciones, plantas y hojas.
      v_estado := case when r_recorrido.estado = 'cerrado' then coalesce(ex_j ->> 'estado', 'en_curso') else r_recorrido.estado end;
      insert into public.recorrido (id, created_at, updated_at, eliminado, rancho_id, fecha, semana_iso, usuario_id, estado)
      values (r_recorrido.id, r_recorrido.created_at, r_recorrido.updated_at, r_recorrido.eliminado, r_recorrido.rancho_id, r_recorrido.fecha, r_recorrido.semana_iso, r_recorrido.usuario_id, v_estado)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, fecha = excluded.fecha,
            semana_iso = excluded.semana_iso, usuario_id = excluded.usuario_id, estado = excluded.estado;

    when 'evaluacion_tabla' then
      insert into public.evaluacion_tabla (id, created_at, updated_at, eliminado, rancho_id, recorrido_id, tabla_id, tipo, hora_inicio, hora_fin)
      values (r_evaluacion.id, r_evaluacion.created_at, r_evaluacion.updated_at, r_evaluacion.eliminado, r_evaluacion.rancho_id, r_evaluacion.recorrido_id, r_evaluacion.tabla_id, r_evaluacion.tipo, r_evaluacion.hora_inicio, r_evaluacion.hora_fin)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, recorrido_id = excluded.recorrido_id,
            tabla_id = excluded.tabla_id, tipo = excluded.tipo, hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin;

    when 'planta' then
      insert into public.planta (id, created_at, updated_at, eliminado, rancho_id, evaluacion_tabla_id, numero_planta, total_hojas,
                                 hmj_pizca, hmj_estria, hmj_mancha, observaciones, gps_lat, gps_lon, gps_precision_m)
      values (r_planta.id, r_planta.created_at, r_planta.updated_at, r_planta.eliminado, r_planta.rancho_id, r_planta.evaluacion_tabla_id, r_planta.numero_planta, r_planta.total_hojas,
              r_planta.hmj_pizca, r_planta.hmj_estria, r_planta.hmj_mancha, r_planta.observaciones, r_planta.gps_lat, r_planta.gps_lon, r_planta.gps_precision_m)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, evaluacion_tabla_id = excluded.evaluacion_tabla_id,
            numero_planta = excluded.numero_planta, total_hojas = excluded.total_hojas, hmj_pizca = excluded.hmj_pizca,
            hmj_estria = excluded.hmj_estria, hmj_mancha = excluded.hmj_mancha, observaciones = excluded.observaciones,
            gps_lat = excluded.gps_lat, gps_lon = excluded.gps_lon, gps_precision_m = excluded.gps_precision_m;

    when 'hoja' then
      insert into public.hoja (id, created_at, updated_at, eliminado, rancho_id, planta_id, numero_hoja, grado_gauhl)
      values (r_hoja.id, r_hoja.created_at, r_hoja.updated_at, r_hoja.eliminado, r_hoja.rancho_id, r_hoja.planta_id, r_hoja.numero_hoja, r_hoja.grado_gauhl)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, planta_id = excluded.planta_id,
            numero_hoja = excluded.numero_hoja, grado_gauhl = excluded.grado_gauhl;

    when 'aplicacion' then
      insert into public.aplicacion (id, created_at, updated_at, eliminado, rancho_id, fecha, tabla_ids, producto, ingrediente_activo,
                                     grupo_frac, dosis, unidad, volumen_mezcla, metodo, usuario_id, responsable, observaciones)
      values (r_aplicacion.id, r_aplicacion.created_at, r_aplicacion.updated_at, r_aplicacion.eliminado, r_aplicacion.rancho_id, r_aplicacion.fecha, r_aplicacion.tabla_ids, r_aplicacion.producto, r_aplicacion.ingrediente_activo,
              r_aplicacion.grupo_frac, r_aplicacion.dosis, r_aplicacion.unidad, r_aplicacion.volumen_mezcla, r_aplicacion.metodo, r_aplicacion.usuario_id, r_aplicacion.responsable, r_aplicacion.observaciones)
      on conflict (id) do update
        set updated_at = excluded.updated_at, eliminado = excluded.eliminado, fecha = excluded.fecha, tabla_ids = excluded.tabla_ids,
            producto = excluded.producto, ingrediente_activo = excluded.ingrediente_activo, grupo_frac = excluded.grupo_frac,
            dosis = excluded.dosis, unidad = excluded.unidad, volumen_mezcla = excluded.volumen_mezcla, metodo = excluded.metodo,
            usuario_id = excluded.usuario_id, responsable = excluded.responsable, observaciones = excluded.observaciones;
  end case;

  resultado := 'aplicado';
end;
$$;

-- Cierra un recorrido ya escrito. Se llama al final del lote, solo para los que se aplicaron.
create function privado.cerrar_recorrido(p_uid uuid, p_recorrido_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  r public.recorrido;
begin
  select * into r from public.recorrido where id = p_recorrido_id for update;
  if not found then
    raise exception 'El recorrido no existe.';
  end if;
  if privado.rol_activo(p_uid, r.rancho_id) is distinct from 'administrador'
     and (r.usuario_id <> p_uid or r.estado <> 'en_curso') then
    raise exception 'No puedes cerrar este recorrido.';
  end if;
  update public.recorrido set estado = 'cerrado' where id = p_recorrido_id and estado <> 'cerrado';
end;
$$;

-- ---------------------------------------------------------------------------
-- aplicar_cambios
-- ---------------------------------------------------------------------------
create function public.aplicar_cambios(lote jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c_maximo constant integer := 500;
  v_uid uuid := auth.uid();
  v_n integer;
  v_res jsonb[];
  v_item record;
  v_out record;
  v_resultado text;
  v_motivo text;
  v_estado text;
  v_msg text;
  v_restriccion text;
  v_columna text;
  v_cierres integer[] := array[]::integer[];
  v_i integer;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para sincronizar.';
  end if;
  if lote is null or jsonb_typeof(lote) <> 'array' then
    raise exception 'El lote debe ser un arreglo de cambios { entidad, registro }.';
  end if;
  v_n := jsonb_array_length(lote);
  if v_n > c_maximo then
    raise exception 'El lote trae % cambios y el máximo es %. Envíalo en partes.', v_n, c_maximo;
  end if;
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  v_res := array_fill(null::jsonb, array[v_n]);

  -- Orden de dependencias. Dentro de cada entidad, primero las bajas (así un número de hoja libre
  -- queda disponible antes de que otra hoja lo use) y luego el orden en que llegaron.
  for v_item in
    select o.i::integer as i, o.e as e
    from jsonb_array_elements(lote) with ordinality as o (e, i)
    order by privado.orden_entidad(o.e ->> 'entidad'),
             case when (o.e -> 'registro' ->> 'eliminado') = 'true' then 0 else 1 end,
             o.i
  loop
    begin
      select * into v_out from privado.aplicar_uno(v_uid, v_item.e ->> 'entidad', v_item.e -> 'registro');
      v_resultado := v_out.resultado;
      v_motivo := v_out.motivo;
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_restriccion = constraint_name, v_columna = column_name;
      v_resultado := 'rechazado';
      v_motivo := privado.traducir_error(v_estado, v_msg, v_restriccion, v_columna);
    end;

    v_res[v_item.i] := jsonb_build_object(
      'entidad', v_item.e ->> 'entidad',
      'id', v_item.e -> 'registro' ->> 'id',
      'resultado', v_resultado,
      'motivo', v_motivo
    );

    if v_resultado = 'aplicado' and v_item.e ->> 'entidad' = 'recorrido' and v_item.e -> 'registro' ->> 'estado' = 'cerrado' then
      v_cierres := v_cierres || v_item.i;
    end if;
  end loop;

  -- Los cierres van al final: un operador puede capturar un recorrido entero sin señal y cerrarlo;
  -- sus plantas y hojas deben entrar antes del cierre.
  foreach v_i in array v_cierres
  loop
    begin
      perform privado.cerrar_recorrido(v_uid, (lote -> (v_i - 1) -> 'registro' ->> 'id')::uuid);
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_restriccion = constraint_name, v_columna = column_name;
      v_res[v_i] := jsonb_build_object(
        'entidad', 'recorrido',
        'id', lote -> (v_i - 1) -> 'registro' ->> 'id',
        'resultado', 'rechazado',
        'motivo', privado.traducir_error(v_estado, v_msg, v_restriccion, v_columna)
      );
    end;
  end loop;

  return to_jsonb(v_res);
end;
$$;

revoke execute on function public.aplicar_cambios(jsonb) from public, anon;
grant execute on function public.aplicar_cambios(jsonb) to authenticated;
revoke all on all functions in schema privado from public, anon, authenticated;

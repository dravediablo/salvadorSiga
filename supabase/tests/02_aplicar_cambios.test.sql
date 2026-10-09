-- Hito 3, pruebas de aplicar_cambios.
-- Casos del hito: b (inactiva), d (aislamiento), e (operador), f (lote sin señal), g (recorrido cerrado),
-- h (administrador), i (gana la más reciente), j (restricciones) y m (máximo de 500).
begin;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Preparación (se deshace con el rollback final)
--   Rancho A: administrador A, operador A1, operador A2 y un usuario con membresía inactiva.
--   Rancho B: administrador B.   Además, "solo": una cuenta sin ningún rancho.
-- ---------------------------------------------------------------------------
create extension if not exists pgtap with schema extensions;

create schema tap_h;
grant usage on schema tap_h to anon, authenticated;

create table tap_h.ids (nombre text primary key, id uuid not null);
grant select on tap_h.ids to anon, authenticated;
create function tap_h.id(p text) returns uuid language sql stable as $$ select id from tap_h.ids where nombre = p $$;
grant execute on function tap_h.id(text) to anon, authenticated;

insert into tap_h.ids (nombre, id) values
  ('admin_a',  'a1000000-0000-0000-0000-000000000001'),
  ('op1',      'a2000000-0000-0000-0000-000000000002'),
  ('op2',      'a3000000-0000-0000-0000-000000000003'),
  ('inactivo', 'a4000000-0000-0000-0000-000000000004'),
  ('admin_b',  'b1000000-0000-0000-0000-000000000001'),
  ('solo',     'c1000000-0000-0000-0000-000000000001'),
  ('rancho_a', 'aa000000-0000-0000-0000-00000000000a'),
  ('rancho_b', 'bb000000-0000-0000-0000-00000000000b'),
  ('m_admin_a','a1100000-0000-0000-0000-000000000001'),
  ('m_op1',    'a1200000-0000-0000-0000-000000000002'),
  ('m_op2',    'a1300000-0000-0000-0000-000000000003'),
  ('m_inact',  'a1400000-0000-0000-0000-000000000004'),
  ('m_admin_b','b1100000-0000-0000-0000-000000000001'),
  ('t_a1',     'a5100000-0000-0000-0000-000000000001'),
  ('t_a2',     'a5200000-0000-0000-0000-000000000002'),
  ('t_b1',     'b5100000-0000-0000-0000-000000000001'),
  ('rec_op1',  'a6100000-0000-0000-0000-000000000001'),
  ('rec_op2',  'a6200000-0000-0000-0000-000000000002'),
  ('rec_cer',  'a6300000-0000-0000-0000-000000000003'),
  ('rec_b',    'b6100000-0000-0000-0000-000000000001'),
  ('ev_op1',   'a7100000-0000-0000-0000-000000000001'),
  ('ev_op2',   'a7200000-0000-0000-0000-000000000002'),
  ('ev_cer',   'a7300000-0000-0000-0000-000000000003'),
  ('ev_b',     'b7100000-0000-0000-0000-000000000001'),
  ('pl_op1',   'a8100000-0000-0000-0000-000000000001'),
  ('pl_op2',   'a8200000-0000-0000-0000-000000000002'),
  ('pl_cer',   'a8300000-0000-0000-0000-000000000003'),
  ('pl_b',     'b8100000-0000-0000-0000-000000000001'),
  ('ho_op1',   'a9100000-0000-0000-0000-000000000001'),
  ('ho_op2',   'a9200000-0000-0000-0000-000000000002'),
  ('ho_cer',   'a9300000-0000-0000-0000-000000000003'),
  ('ho_b',     'b9100000-0000-0000-0000-000000000001'),
  ('ap_op1',   'ac100000-0000-0000-0000-000000000001'),
  ('ap_admin', 'ac200000-0000-0000-0000-000000000002'),
  ('ap_b',     'bc100000-0000-0000-0000-000000000001'),
  ('cl_a',     'ad100000-0000-0000-0000-000000000001'),
  ('cl_b',     'bd100000-0000-0000-0000-000000000001'),
  ('pm_a',     'ae100000-0000-0000-0000-000000000001'),
  ('pm_b',     'be100000-0000-0000-0000-000000000001');

insert into auth.users (id, instance_id, aud, role, email)
select tap_h.id(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', n || '@prueba.test'
from unnest(array['admin_a', 'op1', 'op2', 'inactivo', 'admin_b', 'solo']) as n;

-- "solo" tiene cuenta pero ningún rancho; todos los demás tienen perfil.
insert into public.usuario (id, created_at, updated_at, nombre, email)
select tap_h.id(n), now(), now(), n, n || '@prueba.test'
from unnest(array['admin_a', 'op1', 'op2', 'inactivo', 'admin_b', 'solo']) as n;

insert into public.rancho (id, created_at, updated_at, nombre) values
  (tap_h.id('rancho_a'), now(), now(), 'Rancho A'),
  (tap_h.id('rancho_b'), now(), now(), 'Rancho B');

insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo) values
  (tap_h.id('m_admin_a'), now(), now(), tap_h.id('rancho_a'), tap_h.id('admin_a'), 'administrador', true),
  (tap_h.id('m_op1'),     now(), now(), tap_h.id('rancho_a'), tap_h.id('op1'),      'operador', true),
  (tap_h.id('m_op2'),     now(), now(), tap_h.id('rancho_a'), tap_h.id('op2'),      'operador', true),
  (tap_h.id('m_inact'),   now(), now(), tap_h.id('rancho_a'), tap_h.id('inactivo'), 'operador', false),
  (tap_h.id('m_admin_b'), now(), now(), tap_h.id('rancho_b'), tap_h.id('admin_b'),  'administrador', true);

insert into public."tabla" (id, created_at, updated_at, rancho_id, codigo, nombre, superficie_ha) values
  (tap_h.id('t_a1'), now(), now(), tap_h.id('rancho_a'), '1', 'Tabla 1', 6.8),
  (tap_h.id('t_a2'), now(), now(), tap_h.id('rancho_a'), '2', 'Tabla 2', 5.1),
  (tap_h.id('t_b1'), now(), now(), tap_h.id('rancho_b'), '1', 'Tabla 1 de B', 4.0);

insert into public.recorrido (id, created_at, updated_at, rancho_id, fecha, semana_iso, usuario_id, estado) values
  (tap_h.id('rec_op1'), now(), now(), tap_h.id('rancho_a'), '2026-10-05', '2026-W41', tap_h.id('op1'), 'en_curso'),
  (tap_h.id('rec_op2'), now(), now(), tap_h.id('rancho_a'), '2026-10-05', '2026-W41', tap_h.id('op2'), 'en_curso'),
  (tap_h.id('rec_cer'), now(), now(), tap_h.id('rancho_a'), '2026-09-28', '2026-W40', tap_h.id('op1'), 'cerrado'),
  (tap_h.id('rec_b'),   now(), now(), tap_h.id('rancho_b'), '2026-10-05', '2026-W41', tap_h.id('admin_b'), 'en_curso');

insert into public.evaluacion_tabla (id, created_at, updated_at, rancho_id, recorrido_id, tabla_id) values
  (tap_h.id('ev_op1'), now(), now(), tap_h.id('rancho_a'), tap_h.id('rec_op1'), tap_h.id('t_a1')),
  (tap_h.id('ev_op2'), now(), now(), tap_h.id('rancho_a'), tap_h.id('rec_op2'), tap_h.id('t_a1')),
  (tap_h.id('ev_cer'), now(), now(), tap_h.id('rancho_a'), tap_h.id('rec_cer'), tap_h.id('t_a1')),
  (tap_h.id('ev_b'),   now(), now(), tap_h.id('rancho_b'), tap_h.id('rec_b'),   tap_h.id('t_b1'));

insert into public.planta (id, created_at, updated_at, rancho_id, evaluacion_tabla_id, numero_planta, total_hojas) values
  (tap_h.id('pl_op1'), now(), now(), tap_h.id('rancho_a'), tap_h.id('ev_op1'), 1, 10),
  (tap_h.id('pl_op2'), now(), now(), tap_h.id('rancho_a'), tap_h.id('ev_op2'), 1, 10),
  (tap_h.id('pl_cer'), now(), now(), tap_h.id('rancho_a'), tap_h.id('ev_cer'), 1, 10),
  (tap_h.id('pl_b'),   now(), now(), tap_h.id('rancho_b'), tap_h.id('ev_b'),   1, 10);

insert into public.hoja (id, created_at, updated_at, rancho_id, planta_id, numero_hoja, grado_gauhl) values
  (tap_h.id('ho_op1'), now(), now(), tap_h.id('rancho_a'), tap_h.id('pl_op1'), 1, 2),
  (tap_h.id('ho_op2'), now(), now(), tap_h.id('rancho_a'), tap_h.id('pl_op2'), 1, 2),
  (tap_h.id('ho_cer'), now(), now(), tap_h.id('rancho_a'), tap_h.id('pl_cer'), 1, 2),
  (tap_h.id('ho_b'),   now(), now(), tap_h.id('rancho_b'), tap_h.id('pl_b'),   1, 2);

insert into public.aplicacion (id, created_at, updated_at, rancho_id, fecha, tabla_ids, producto, usuario_id) values
  (tap_h.id('ap_op1'),   now(), now(), tap_h.id('rancho_a'), '2026-10-01', array[tap_h.id('t_a1')], 'Producto A', tap_h.id('op1')),
  (tap_h.id('ap_admin'), now(), now(), tap_h.id('rancho_a'), '2026-10-02', array[tap_h.id('t_a2')], 'Producto A2', tap_h.id('admin_a')),
  (tap_h.id('ap_b'),     now(), now(), tap_h.id('rancho_b'), '2026-10-01', array[tap_h.id('t_b1')], 'Producto B', tap_h.id('admin_b'));

insert into public.clima_diario (id, created_at, updated_at, rancho_id, fecha) values
  (tap_h.id('cl_a'), now(), now(), tap_h.id('rancho_a'), '2026-10-01'),
  (tap_h.id('cl_b'), now(), now(), tap_h.id('rancho_b'), '2026-10-01');

insert into public.planta_marcada (id, created_at, updated_at, rancho_id, tabla_id, fecha_marcado) values
  (tap_h.id('pm_a'), now(), now(), tap_h.id('rancho_a'), tap_h.id('t_a1'), '2026-10-01'),
  (tap_h.id('pm_b'), now(), now(), tap_h.id('rancho_b'), tap_h.id('t_b1'), '2026-10-01');

-- ---------------------------------------------------------------------------
-- Ayudantes de las pruebas
-- ---------------------------------------------------------------------------
-- Inicia sesión como una persona (rol authenticated + JWT con su sub). Se llama siempre desde postgres.
create function tap_h.como(p_nombre text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tap_h.id(p_nombre), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tap_h.id(p_nombre)::text, true);
  set local role authenticated;
end;
$$;
-- Visitante sin sesión.
create function tap_h.como_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end;
$$;

create function tap_h.tablas() returns text[] language sql immutable as $$
  select array['rancho', 'usuario', 'membresia', 'tabla', 'recorrido', 'evaluacion_tabla', 'planta', 'hoja', 'aplicacion', 'clima_diario', 'planta_marcada']
$$;

-- Filas de un rancho que ve quien está conectado. En rancho y usuario no hay rancho_id: se cuenta por id de la persona de B / el rancho.
create function tap_h.visibles(p_tabla text, p_rancho text) returns bigint language plpgsql as $$
declare n bigint;
begin
  if p_tabla = 'rancho' then
    execute 'select count(*) from public.rancho where id = $1' into n using tap_h.id(p_rancho);
  elsif p_tabla = 'usuario' then
    -- La persona representativa de ese rancho: admin_a / admin_b.
    execute 'select count(*) from public.usuario where id = $1' into n using tap_h.id(case p_rancho when 'rancho_a' then 'admin_a' else 'admin_b' end);
  else
    execute format('select count(*) from public.%I where rancho_id = $1', p_tabla) into n using tap_h.id(p_rancho);
  end if;
  return n;
end;
$$;
create function tap_h.total(p_tabla text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_tabla) into n;
  return n;
end;
$$;

-- SQLSTATE con el que falla una sentencia ('ok' si no falla). Deshace sus efectos.
create function tap_h.sqlstate_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

grant execute on all functions in schema tap_h to anon, authenticated;

-- Registro de aplicar_cambios a partir de la fila actual, con cambios y updated_at más nuevo (+1 h).
create function tap_h.mod(p_entidad text, p_id uuid, p_cambios jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare fila jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_entidad) into fila using p_id;
  return jsonb_build_object('entidad', p_entidad,
    'registro', fila || jsonb_build_object('updated_at', (fila ->> 'updated_at')::timestamptz + interval '1 hour') || p_cambios);
end;
$$;
-- Igual, pero con el updated_at exacto que se indique.
create function tap_h.mod_en(p_entidad text, p_id uuid, p_updated_at timestamptz, p_cambios jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare fila jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_entidad) into fila using p_id;
  return jsonb_build_object('entidad', p_entidad, 'registro', fila || jsonb_build_object('updated_at', p_updated_at) || p_cambios);
end;
$$;
-- Registro nuevo.
create function tap_h.nuevo(p_entidad text, p_registro jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('entidad', p_entidad, 'registro',
    jsonb_build_object('created_at', now(), 'updated_at', now(), 'eliminado', false) || p_registro)
$$;
-- Aplicación nueva con todas sus columnas (el cliente siempre manda la fila completa).
create function tap_h.aplic(p_rancho uuid, p_usuario uuid, p_tabla_ids jsonb, p_producto text default 'x') returns jsonb language sql immutable as $$
  select tap_h.nuevo('aplicacion', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', p_rancho, 'fecha', '2026-10-09', 'tabla_ids', p_tabla_ids,
    'producto', p_producto, 'ingrediente_activo', '', 'grupo_frac', '', 'dosis', null, 'unidad', '', 'volumen_mezcla', null, 'metodo', '',
    'usuario_id', p_usuario, 'responsable', '', 'observaciones', ''))
$$;
create function tap_h.resultado(p_respuesta jsonb, p_i integer) returns text language sql immutable as $$
  select p_respuesta -> p_i ->> 'resultado'
$$;
create function tap_h.motivo(p_respuesta jsonb, p_i integer) returns text language sql immutable as $$
  select p_respuesta -> p_i ->> 'motivo'
$$;
grant execute on all functions in schema tap_h to anon, authenticated;

-- Cuántas filas hay en una tabla (sin RLS: siempre se llama como postgres).
create function tap_h.cuenta(p_tabla text, p_donde text default 'true') returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where %s', p_tabla, p_donde) into n;
  return n;
end;
$$;

-- ===========================================================================
-- Sin sesión o sin permiso de ejecución
-- ===========================================================================
select tap_h.como_anon();
select is(tap_h.sqlstate_de($$select public.aplicar_cambios('[]'::jsonb)$$), '42501', 'anon no puede ejecutar aplicar_cambios');
select is(tap_h.sqlstate_de($$select public.crear_rancho('X')$$), '42501', 'anon no puede ejecutar crear_rancho');
reset role;

-- ===========================================================================
-- b. Membresía inactiva: aplicar_cambios le rechaza todo
-- ===========================================================================
select tap_h.como('inactivo');
create temp table r_b on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod('hoja', tap_h.id('ho_op1'), '{"grado_gauhl": 5}'),
    tap_h.mod('tabla', tap_h.id('t_a1'), '{"nombre": "x"}'),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09',
      'semana_iso', '2026-W41', 'usuario_id', tap_h.id('inactivo'), 'estado', 'en_curso'))
  )) as r;
grant select on r_b to public;
select is(tap_h.resultado((select r from r_b), 0), 'rechazado', 'b. inactiva: se rechaza el cambio a una hoja');
select is(tap_h.resultado((select r from r_b), 1), 'rechazado', 'b. inactiva: se rechaza el cambio a una tabla');
select is(tap_h.resultado((select r from r_b), 2), 'rechazado', 'b. inactiva: se rechaza crear un recorrido');
select matches(tap_h.motivo((select r from r_b), 0), 'miembro activo', 'b. inactiva: el motivo explica que no es miembro activo');
reset role;
select is((select grado_gauhl from public.hoja where id = tap_h.id('ho_op1')), 2::smallint, 'b. inactiva: la hoja no cambió');

-- ===========================================================================
-- d. Aislamiento entre ranchos
-- ===========================================================================
select tap_h.como('admin_a');
create temp table r_d on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    -- 0: registro con rancho_id ajeno (tabla nueva en B)
    tap_h.nuevo('tabla', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_b'), 'codigo', '9', 'nombre', 'intruso',
      'variedad', '', 'activa', true, 'origen', 'manual')),
    -- 1: cambio de rancho_id de un registro existente (la tabla de A pasa a B)
    tap_h.mod('tabla', tap_h.id('t_a1'), jsonb_build_object('rancho_id', tap_h.id('rancho_b'))),
    -- 2: registro de B reclamado como si fuera de A (mismo id, rancho_id de A)
    tap_h.mod('tabla', tap_h.id('t_b1'), jsonb_build_object('rancho_id', tap_h.id('rancho_a'), 'nombre', 'robada')),
    -- 3: hijo cuyo padre es de otro rancho (evaluación de A sobre el recorrido de B)
    tap_h.nuevo('evaluacion_tabla', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'),
      'recorrido_id', tap_h.id('rec_b'), 'tabla_id', tap_h.id('t_a1'), 'tipo', 'stover')),
    -- 4: evaluación de A sobre la tabla de B
    tap_h.nuevo('evaluacion_tabla', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'),
      'recorrido_id', tap_h.id('rec_op1'), 'tabla_id', tap_h.id('t_b1'), 'tipo', 'stover')),
    -- 5: hoja de A colgada de una planta de B
    tap_h.nuevo('hoja', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'),
      'planta_id', tap_h.id('pl_b'), 'numero_hoja', 5, 'grado_gauhl', 1)),
    -- 6: aplicación de A con tabla_ids de B
    tap_h.aplic(tap_h.id('rancho_a'), tap_h.id('admin_a'), jsonb_build_array(tap_h.id('t_b1')), 'x'),
    -- 7: aplicación de A con una mezcla de tablas de A y de B
    tap_h.aplic(tap_h.id('rancho_a'), tap_h.id('admin_a'), jsonb_build_array(tap_h.id('t_a1'), tap_h.id('t_b1')), 'x'),
    -- 8: planta de A sobre una evaluación de B
    tap_h.nuevo('planta', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'),
      'evaluacion_tabla_id', tap_h.id('ev_b'), 'numero_planta', 2, 'total_hojas', 10, 'observaciones', ''))
  )) as r;
grant select on r_d to public;
select is(tap_h.resultado((select r from r_d), 0), 'rechazado', 'd. se rechaza un registro con rancho_id ajeno');
select matches(tap_h.motivo((select r from r_d), 0), 'miembro activo', 'd. …porque no es miembro de B');
select is(tap_h.resultado((select r from r_d), 1), 'rechazado', 'd. se rechaza mover un registro existente a otro rancho (hacia un rancho ajeno)');
select is(tap_h.resultado((select r from r_d), 2), 'rechazado', 'd. se rechaza reclamar para A un registro existente de B');
select matches(tap_h.motivo((select r from r_d), 2), 'cambiar el rancho', 'd. …el motivo dice que no se puede cambiar el rancho de un registro');
select is(tap_h.resultado((select r from r_d), 3), 'rechazado', 'd. se rechaza un hijo cuyo padre (recorrido) es de otro rancho');
select matches(tap_h.motivo((select r from r_d), 3), 'otro rancho', 'd. …con motivo legible');
select is(tap_h.resultado((select r from r_d), 4), 'rechazado', 'd. se rechaza una evaluación sobre una tabla de otro rancho');
select is(tap_h.resultado((select r from r_d), 5), 'rechazado', 'd. se rechaza una hoja sobre una planta de otro rancho');
select is(tap_h.resultado((select r from r_d), 6), 'rechazado', 'd. se rechaza una aplicación con tabla_ids de otro rancho');
select matches(tap_h.motivo((select r from r_d), 6), 'otro rancho', 'd. …con motivo legible');
select is(tap_h.resultado((select r from r_d), 7), 'rechazado', 'd. se rechaza una aplicación con tablas de A y de B mezcladas');
select is(tap_h.resultado((select r from r_d), 8), 'rechazado', 'd. se rechaza una planta sobre una evaluación de otro rancho');
reset role;
select is(tap_h.cuenta('tabla', 'true'), 3::bigint, 'd. no se creó ninguna tabla');
select is((select rancho_id from public."tabla" where id = tap_h.id('t_a1')), tap_h.id('rancho_a'), 'd. la tabla de A sigue en A');
select is((select rancho_id from public."tabla" where id = tap_h.id('t_b1')), tap_h.id('rancho_b'), 'd. la tabla de B sigue en B');
select is((select nombre from public."tabla" where id = tap_h.id('t_b1')), 'Tabla 1 de B', 'd. la tabla de B no cambió de nombre');
select is(tap_h.cuenta('evaluacion_tabla'), 4::bigint, 'd. no se creó ninguna evaluación');
select is(tap_h.cuenta('hoja'), 4::bigint, 'd. no se creó ninguna hoja');
select is(tap_h.cuenta('planta'), 4::bigint, 'd. no se creó ninguna planta');
select is(tap_h.cuenta('aplicacion'), 3::bigint, 'd. no se creó ninguna aplicación');

-- ===========================================================================
-- e. Operador A1
-- ===========================================================================
select tap_h.como('op1');
create temp table r_e on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    -- 0: crea un recorrido propio
    tap_h.nuevo('recorrido', jsonb_build_object('id', 'a6400000-0000-0000-0000-000000000004', 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09',
      'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    -- 1: crea a nombre de otro
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09',
      'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op2'), 'estado', 'en_curso')),
    -- 2: edita el de A2
    tap_h.mod('recorrido', tap_h.id('rec_op2'), '{"fecha": "2026-10-01"}'),
    -- 3: reabre el suyo cerrado
    tap_h.mod('recorrido', tap_h.id('rec_cer'), '{"estado": "en_curso"}'),
    -- 4: elimina un recorrido propio
    tap_h.mod('recorrido', tap_h.id('rec_op1'), '{"eliminado": true}'),
    -- 5: cambia usuario_id de su recorrido
    tap_h.mod('recorrido', tap_h.id('rec_op1'), jsonb_build_object('usuario_id', tap_h.id('op2'))),
    -- 6: toca una tabla
    tap_h.mod('tabla', tap_h.id('t_a1'), '{"nombre": "cambiada"}'),
    -- 7: toca el rancho
    tap_h.mod('rancho', tap_h.id('rancho_a'), '{"nombre": "Mío"}'),
    -- 8: elimina una evaluación propia
    tap_h.mod('evaluacion_tabla', tap_h.id('ev_op1'), '{"eliminado": true}'),
    -- 9: marca eliminada una planta propia (permitido)
    tap_h.mod('planta', tap_h.id('pl_op1'), '{"eliminado": true}'),
    -- 10: marca eliminada una hoja propia (permitido)
    tap_h.mod('hoja', tap_h.id('ho_op1'), '{"eliminado": true}'),
    -- 11: edita la planta de A2
    tap_h.mod('planta', tap_h.id('pl_op2'), '{"observaciones": "ajena"}'),
    -- 12: edita la hoja de A2
    tap_h.mod('hoja', tap_h.id('ho_op2'), '{"grado_gauhl": 6}'),
    -- 13: crea una aplicación propia
    tap_h.aplic(tap_h.id('rancho_a'), tap_h.id('op1'), jsonb_build_array(tap_h.id('t_a1')), 'Nuevo'),
    -- 14: edita una aplicación propia
    tap_h.mod('aplicacion', tap_h.id('ap_op1'), '{"producto": "Editado"}'),
    -- 15: elimina una aplicación propia
    tap_h.mod('aplicacion', tap_h.id('ap_op1'), '{"eliminado": true}'),
    -- 16: edita la aplicación del administrador
    tap_h.mod('aplicacion', tap_h.id('ap_admin'), '{"producto": "Ajeno"}'),
    -- 17: crea una aplicación a nombre de otro
    tap_h.aplic(tap_h.id('rancho_a'), tap_h.id('op2'), jsonb_build_array(tap_h.id('t_a1')), 'x'),
    -- 18: su propio perfil (permitido)
    tap_h.mod('usuario', tap_h.id('op1'), '{"nombre": "Operador Uno"}'),
    -- 19: el perfil de otra persona
    tap_h.mod('usuario', tap_h.id('op2'), '{"nombre": "Suplantado"}'),
    -- 20: membresías: nadie las escribe desde aquí
    tap_h.mod('membresia', tap_h.id('m_op1'), '{"rol": "administrador"}'),
    -- 21: clima
    tap_h.mod('clima_diario', tap_h.id('cl_a'), '{"fuente": "x"}'),
    -- 22: entidad inexistente
    jsonb_build_object('entidad', 'tabla_secreta', 'registro', jsonb_build_object('id', gen_random_uuid()))
  )) as r;
grant select on r_e to public;
select is(tap_h.resultado((select r from r_e), 0), 'aplicado', 'e. el operador crea un recorrido propio');
select is(tap_h.resultado((select r from r_e), 1), 'rechazado', 'e. no puede crear un recorrido a nombre de otro');
select is(tap_h.resultado((select r from r_e), 2), 'rechazado', 'e. no puede editar el recorrido de A2');
select is(tap_h.resultado((select r from r_e), 3), 'rechazado', 'e. no puede reabrir un recorrido cerrado');
select is(tap_h.resultado((select r from r_e), 4), 'rechazado', 'e. no puede eliminar un recorrido');
select is(tap_h.resultado((select r from r_e), 5), 'rechazado', 'e. no puede cambiar el usuario_id de su recorrido');
select is(tap_h.resultado((select r from r_e), 6), 'rechazado', 'e. no puede tocar tablas');
select is(tap_h.resultado((select r from r_e), 7), 'rechazado', 'e. no puede tocar el rancho');
select is(tap_h.resultado((select r from r_e), 8), 'rechazado', 'e. no puede eliminar evaluaciones');
select is(tap_h.resultado((select r from r_e), 9), 'aplicado', 'e. sí puede marcar eliminada una planta propia');
select is(tap_h.resultado((select r from r_e), 10), 'aplicado', 'e. sí puede marcar eliminada una hoja propia');
select is(tap_h.resultado((select r from r_e), 11), 'rechazado', 'e. no puede editar la planta de A2');
select is(tap_h.resultado((select r from r_e), 12), 'rechazado', 'e. no puede editar la hoja de A2');
select is(tap_h.resultado((select r from r_e), 13), 'aplicado', 'e. crea una aplicación propia: ' || coalesce(tap_h.motivo((select r from r_e), 13), 'sin motivo'));
select is(tap_h.resultado((select r from r_e), 14), 'aplicado', 'e. edita una aplicación propia');
select is(tap_h.resultado((select r from r_e), 15), 'rechazado', 'e. no elimina aplicaciones');
select is(tap_h.resultado((select r from r_e), 16), 'rechazado', 'e. no edita la aplicación del administrador');
select is(tap_h.resultado((select r from r_e), 17), 'rechazado', 'e. no crea aplicaciones a nombre de otro');
select is(tap_h.resultado((select r from r_e), 18), 'aplicado', 'e. sí actualiza su propio perfil');
select is(tap_h.resultado((select r from r_e), 19), 'rechazado', 'e. no toca el perfil de otra persona');
select is(tap_h.resultado((select r from r_e), 20), 'rechazado', 'e. no escribe membresías');
select is(tap_h.resultado((select r from r_e), 21), 'rechazado', 'e. no escribe clima');
select is(tap_h.resultado((select r from r_e), 22), 'rechazado', 'e. una entidad desconocida se rechaza');
reset role;
select is((select nombre from public."tabla" where id = tap_h.id('t_a1')), 'Tabla 1', 'e. la tabla no cambió');
select is((select nombre from public.rancho where id = tap_h.id('rancho_a')), 'Rancho A', 'e. el rancho no cambió');
select is((select estado from public.recorrido where id = tap_h.id('rec_cer')), 'cerrado', 'e. el recorrido cerrado sigue cerrado');
select is((select usuario_id from public.recorrido where id = tap_h.id('rec_op1')), tap_h.id('op1'), 'e. el recorrido sigue siendo suyo');
select ok(not (select eliminado from public.recorrido where id = tap_h.id('rec_op1')), 'e. el recorrido no se eliminó');
select ok((select eliminado from public.planta where id = tap_h.id('pl_op1')), 'e. la planta propia quedó eliminada (lógicamente)');
select is(tap_h.cuenta('planta'), 4::bigint, 'e. nada se borra físicamente');
select is((select grado_gauhl from public.hoja where id = tap_h.id('ho_op2')), 2::smallint, 'e. la hoja de A2 no cambió');
select is((select producto from public.aplicacion where id = tap_h.id('ap_op1')), 'Editado', 'e. la aplicación propia quedó editada');
select is((select nombre from public.usuario where id = tap_h.id('op2')), 'op2', 'e. el perfil ajeno no cambió');

-- ===========================================================================
-- f. Lote sin señal: un recorrido completo ya cerrado, en un solo lote y en desorden
-- ===========================================================================
select tap_h.como('op1');
create temp table r_f on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    -- Hojas primero y el recorrido al final, a propósito: el servidor ordena por dependencias.
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000001', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000001', 'numero_hoja', 1, 'grado_gauhl', 0)),
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000002', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000001', 'numero_hoja', 2, 'grado_gauhl', 3)),
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000003', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000002', 'numero_hoja', 1, 'grado_gauhl', 6)),
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000004', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000002', 'numero_hoja', 2, 'grado_gauhl', null)),
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000005', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000003', 'numero_hoja', 1, 'grado_gauhl', 4)),
    tap_h.nuevo('hoja', jsonb_build_object('id', 'f9000000-0000-0000-0000-000000000006', 'rancho_id', tap_h.id('rancho_a'), 'planta_id', 'f8000000-0000-0000-0000-000000000003', 'numero_hoja', 2, 'grado_gauhl', 1)),
    tap_h.nuevo('planta', jsonb_build_object('id', 'f8000000-0000-0000-0000-000000000001', 'rancho_id', tap_h.id('rancho_a'), 'evaluacion_tabla_id', 'f7000000-0000-0000-0000-000000000001', 'numero_planta', 1, 'total_hojas', 2, 'observaciones', '')),
    tap_h.nuevo('planta', jsonb_build_object('id', 'f8000000-0000-0000-0000-000000000002', 'rancho_id', tap_h.id('rancho_a'), 'evaluacion_tabla_id', 'f7000000-0000-0000-0000-000000000001', 'numero_planta', 2, 'total_hojas', 2, 'observaciones', '')),
    tap_h.nuevo('planta', jsonb_build_object('id', 'f8000000-0000-0000-0000-000000000003', 'rancho_id', tap_h.id('rancho_a'), 'evaluacion_tabla_id', 'f7000000-0000-0000-0000-000000000002', 'numero_planta', 1, 'total_hojas', 2, 'observaciones', '')),
    tap_h.nuevo('evaluacion_tabla', jsonb_build_object('id', 'f7000000-0000-0000-0000-000000000001', 'rancho_id', tap_h.id('rancho_a'), 'recorrido_id', 'f6000000-0000-0000-0000-000000000001', 'tabla_id', tap_h.id('t_a1'), 'tipo', 'stover')),
    tap_h.nuevo('evaluacion_tabla', jsonb_build_object('id', 'f7000000-0000-0000-0000-000000000002', 'rancho_id', tap_h.id('rancho_a'), 'recorrido_id', 'f6000000-0000-0000-0000-000000000001', 'tabla_id', tap_h.id('t_a2'), 'tipo', 'stover')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', 'f6000000-0000-0000-0000-000000000001', 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09', 'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op1'), 'estado', 'cerrado'))
  )) as r;
grant select on r_f to public;
select is((select count(*) from r_f, jsonb_array_elements((select r from r_f)) e where e ->> 'resultado' = 'aplicado'), 12::bigint, 'f. los 12 registros del lote sin señal se aplican');
select is((select count(*) from r_f, jsonb_array_elements((select r from r_f)) e where e ->> 'resultado' <> 'aplicado'), 0::bigint, 'f. ninguno se rechaza ni se ignora');
reset role;
select is((select estado from public.recorrido where id = 'f6000000-0000-0000-0000-000000000001'), 'cerrado', 'f. el recorrido quedó cerrado');
select is(tap_h.cuenta('evaluacion_tabla', $$recorrido_id = 'f6000000-0000-0000-0000-000000000001'$$), 2::bigint, 'f. entraron las 2 evaluaciones');
select is(tap_h.cuenta('planta', $$id::text like 'f8%'$$), 3::bigint, 'f. entraron las 3 plantas');
select is(tap_h.cuenta('hoja', $$id::text like 'f9%'$$), 6::bigint, 'f. entraron las 6 hojas');
select is(tap_h.cuenta('hoja', $$id::text like 'f9%' and grado_gauhl is null$$), 1::bigint, 'f. una hoja sin calificar entró con grado nulo');

-- ===========================================================================
-- g. Con ese recorrido ya cerrado en el servidor
-- ===========================================================================
select tap_h.como('op1');
create temp table r_g1 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod('hoja', 'f9000000-0000-0000-0000-000000000001', '{"grado_gauhl": 5}'),
    tap_h.mod('planta', 'f8000000-0000-0000-0000-000000000001', '{"observaciones": "tarde"}'),
    tap_h.mod('evaluacion_tabla', 'f7000000-0000-0000-0000-000000000001', '{"tipo": "stover"}'),
    tap_h.mod('recorrido', 'f6000000-0000-0000-0000-000000000001', '{"fecha": "2026-10-01"}')
  )) as r;
grant select on r_g1 to public;
select is(tap_h.resultado((select r from r_g1), 0), 'rechazado', 'g. A1 no puede cambiar una hoja de un recorrido cerrado');
select matches(tap_h.motivo((select r from r_g1), 0), 'cerrado', 'g. …el motivo dice que está cerrado');
select is(tap_h.resultado((select r from r_g1), 1), 'rechazado', 'g. ni una planta');
select is(tap_h.resultado((select r from r_g1), 2), 'rechazado', 'g. ni una evaluación');
select is(tap_h.resultado((select r from r_g1), 3), 'rechazado', 'g. ni el recorrido');
reset role;
select is((select grado_gauhl from public.hoja where id = 'f9000000-0000-0000-0000-000000000001'), 0::smallint, 'g. la hoja no cambió');
select tap_h.como('admin_a');
create temp table r_g2 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod('hoja', 'f9000000-0000-0000-0000-000000000001', '{"grado_gauhl": 5}')
  )) as r;
grant select on r_g2 to public;
select is(tap_h.resultado((select r from r_g2), 0), 'aplicado', 'g. el administrador A sí puede corregir esa hoja');
reset role;
select is((select grado_gauhl from public.hoja where id = 'f9000000-0000-0000-0000-000000000001'), 5::smallint, 'g. la corrección del administrador quedó guardada');

-- ===========================================================================
-- h. Administrador A: todo en A, nada en B
-- ===========================================================================
select tap_h.como('admin_a');
create temp table r_h on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod('recorrido', tap_h.id('rec_cer'), '{"estado": "en_curso"}'),
    tap_h.mod('recorrido', tap_h.id('rec_op1'), '{"eliminado": true}'),
    tap_h.mod('tabla', tap_h.id('t_a1'), '{"nombre": "Tabla uno", "variedad": "Gran Enano"}'),
    tap_h.mod('rancho', tap_h.id('rancho_a'), '{"nombre": "Rancho A2", "ii_umbral_medio": 25, "ii_umbral_alto": 35, "dias_alerta_aplicacion": 10}'),
    tap_h.mod('aplicacion', tap_h.id('ap_op1'), '{"producto": "Del admin"}'),
    tap_h.nuevo('tabla', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'codigo', '3', 'nombre', 'Tabla 3', 'variedad', '', 'activa', true, 'origen', 'manual')),
    -- En B: nada
    tap_h.mod('tabla', tap_h.id('t_b1'), '{"nombre": "invadida"}'),
    tap_h.mod('rancho', tap_h.id('rancho_b'), '{"nombre": "invadido"}'),
    tap_h.mod('recorrido', tap_h.id('rec_b'), '{"eliminado": true}'),
    tap_h.mod('hoja', tap_h.id('ho_b'), '{"grado_gauhl": 6}'),
    -- Membresías: el hito 5 las habilita
    tap_h.mod('membresia', tap_h.id('m_op1'), '{"rol": "administrador"}')
  )) as r;
grant select on r_h to public;
select is(tap_h.resultado((select r from r_h), 0), 'aplicado', 'h. el administrador reabre un recorrido cerrado');
select is(tap_h.resultado((select r from r_h), 1), 'aplicado', 'h. elimina (lógicamente) un recorrido');
select is(tap_h.resultado((select r from r_h), 2), 'aplicado', 'h. edita una tabla');
select is(tap_h.resultado((select r from r_h), 3), 'aplicado', 'h. edita los umbrales del rancho');
select is(tap_h.resultado((select r from r_h), 4), 'aplicado', 'h. edita una aplicación de otro');
select is(tap_h.resultado((select r from r_h), 5), 'aplicado', 'h. crea una tabla');
select is(tap_h.resultado((select r from r_h), 6), 'rechazado', 'h. no toca tablas de B');
select is(tap_h.resultado((select r from r_h), 7), 'rechazado', 'h. no toca el rancho B');
select is(tap_h.resultado((select r from r_h), 8), 'rechazado', 'h. no elimina recorridos de B');
select is(tap_h.resultado((select r from r_h), 9), 'rechazado', 'h. no toca hojas de B');
select is(tap_h.resultado((select r from r_h), 10), 'rechazado', 'h. ni siquiera el administrador escribe membresías (hito 5)');
reset role;
select is((select estado from public.recorrido where id = tap_h.id('rec_cer')), 'en_curso', 'h. el recorrido quedó reabierto');
select ok((select eliminado from public.recorrido where id = tap_h.id('rec_op1')), 'h. el recorrido quedó eliminado lógicamente');
select is((select ii_umbral_alto from public.rancho where id = tap_h.id('rancho_a')), 35::numeric, 'h. los umbrales de A cambiaron');
select is((select dias_alerta_aplicacion from public.rancho where id = tap_h.id('rancho_a')), 10, 'h. y los días de alerta');
select is((select nombre from public.rancho where id = tap_h.id('rancho_b')), 'Rancho B', 'h. B no cambió');
select is((select nombre from public."tabla" where id = tap_h.id('t_b1')), 'Tabla 1 de B', 'h. la tabla de B no cambió');
select ok(not (select eliminado from public.recorrido where id = tap_h.id('rec_b')), 'h. el recorrido de B no se eliminó');
select is(tap_h.cuenta('recorrido'), 6::bigint, 'h. nada se borra físicamente (los 4 de la preparación + los 2 que crearon e y f)');

-- ===========================================================================
-- i. Gana la más reciente; server_updated_at lo pone el servidor
-- ===========================================================================
reset role;
select tap_h.como('admin_a');
create temp table t_i on commit drop as
  select updated_at as ua, server_updated_at as sa from public.hoja where id = tap_h.id('ho_op2');
grant select on t_i to public;
create temp table r_i on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod_en('hoja', tap_h.id('ho_op2'), (select ua from t_i) - interval '1 hour', '{"grado_gauhl": 1}'),
    tap_h.mod_en('hoja', tap_h.id('ho_op2'), (select ua from t_i), '{"grado_gauhl": 2}')
  )) as r;
grant select on r_i to public;
select is(tap_h.resultado((select r from r_i), 0), 'ignorado_version', 'i. updated_at menor → ignorado_version');
select is(tap_h.resultado((select r from r_i), 1), 'ignorado_version', 'i. updated_at igual → ignorado_version');
reset role;
select is((select grado_gauhl from public.hoja where id = tap_h.id('ho_op2')), 2::smallint, 'i. lo ignorado no cambió nada');
select is((select server_updated_at from public.hoja where id = tap_h.id('ho_op2')), (select sa from t_i), 'i. y server_updated_at tampoco se movió');
select tap_h.como('admin_a');
create temp table r_i2 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod_en('hoja', tap_h.id('ho_op2'), (select ua from t_i) + interval '1 second',
      '{"grado_gauhl": 4, "server_updated_at": "2000-01-01T00:00:00Z"}')
  )) as r;
grant select on r_i2 to public;
select is(tap_h.resultado((select r from r_i2), 0), 'aplicado', 'i. updated_at mayor → aplicado');
reset role;
select is((select grado_gauhl from public.hoja where id = tap_h.id('ho_op2')), 4::smallint, 'i. el cambio nuevo quedó guardado');
select ok((select server_updated_at from public.hoja where id = tap_h.id('ho_op2')) > (select sa from t_i), 'i. server_updated_at creció');
select ok((select server_updated_at from public.hoja where id = tap_h.id('ho_op2')) > '2020-01-01', 'i. y es del servidor, no el 2000 que mandó el cliente');
create temp table t_i2 on commit drop as select server_updated_at as sa from public.hoja where id = tap_h.id('ho_op2');
select tap_h.como('admin_a');
create temp table r_i3 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod_en('hoja', tap_h.id('ho_op2'), (select ua from t_i) + interval '2 seconds', '{"grado_gauhl": 5}')
  )) as r;
grant select on r_i3 to public;
reset role;
select ok((select server_updated_at from public.hoja where id = tap_h.id('ho_op2')) > (select sa from t_i2), 'i. server_updated_at crece en cada aplicación');
-- Insert: el cliente tampoco decide server_updated_at.
select tap_h.como('admin_a');
create temp table r_i4 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.nuevo('tabla', jsonb_build_object('id', 'a5900000-0000-0000-0000-000000000009', 'rancho_id', tap_h.id('rancho_a'), 'codigo', '9', 'nombre', 'Nueva',
      'variedad', '', 'activa', true, 'origen', 'manual', 'server_updated_at', '1999-01-01T00:00:00Z'))
  )) as r;
grant select on r_i4 to public;
reset role;
select ok((select server_updated_at from public."tabla" where id = 'a5900000-0000-0000-0000-000000000009') > '2020-01-01', 'i. en un alta, server_updated_at también es del servidor');

-- ===========================================================================
-- j. Restricciones: se rechaza el registro con motivo legible; el resto del lote se aplica
-- ===========================================================================
select tap_h.como('op2');
create temp table r_j on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.nuevo('hoja', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'planta_id', tap_h.id('pl_op2'), 'numero_hoja', 7, 'grado_gauhl', 7)),
    tap_h.mod('planta', tap_h.id('pl_op2'), '{"total_hojas": 0}'),
    tap_h.nuevo('hoja', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'planta_id', tap_h.id('pl_op2'), 'numero_hoja', 1, 'grado_gauhl', 1)),
    tap_h.nuevo('hoja', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'planta_id', tap_h.id('pl_op2'), 'numero_hoja', 9, 'grado_gauhl', 3)),
    tap_h.mod('planta', tap_h.id('pl_op2'), '{"total_hojas": 31}'),
    tap_h.nuevo('hoja', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'planta_id', tap_h.id('pl_op2'), 'numero_hoja', 0, 'grado_gauhl', 1)),
    tap_h.mod('planta', tap_h.id('pl_op2'), '{"hmj_pizca": -1}'),
    tap_h.mod('planta', tap_h.id('pl_op2'), '{"observaciones": "ok"}')
  )) as r;
grant select on r_j to public;
select is(tap_h.resultado((select r from r_j), 0), 'rechazado', 'j. grado 7 → rechazado');
select matches(tap_h.motivo((select r from r_j), 0), 'entre 0 y 6', 'j. …con motivo legible');
select is(tap_h.resultado((select r from r_j), 1), 'rechazado', 'j. total_hojas 0 → rechazado');
select matches(tap_h.motivo((select r from r_j), 1), 'entre 1 y 30', 'j. …con motivo legible');
select is(tap_h.resultado((select r from r_j), 2), 'rechazado', 'j. dos hojas vivas con el mismo número → rechazado');
select matches(tap_h.motivo((select r from r_j), 2), 'hoja viva con ese número', 'j. …con motivo legible');
select is(tap_h.resultado((select r from r_j), 3), 'aplicado', 'j. una hoja válida del mismo lote sí se aplica');
select is(tap_h.resultado((select r from r_j), 4), 'rechazado', 'j. total_hojas 31 → rechazado');
select is(tap_h.resultado((select r from r_j), 5), 'rechazado', 'j. numero_hoja 0 → rechazado');
select is(tap_h.resultado((select r from r_j), 6), 'rechazado', 'j. hmj negativo → rechazado');
select is(tap_h.resultado((select r from r_j), 7), 'aplicado', 'j. un cambio válido después de varios rechazos también se aplica');
reset role;
select is(tap_h.cuenta('hoja', format('planta_id = %L', tap_h.id('pl_op2'))), 2::bigint, 'j. de las hojas del lote solo entró la válida (1 existente + 1)');
select is((select observaciones from public.planta where id = tap_h.id('pl_op2')), 'ok', 'j. el último cambio del lote quedó guardado');
select is((select total_hojas from public.planta where id = tap_h.id('pl_op2')), 10, 'j. el total_hojas inválido no se guardó');

-- Otros rechazos por forma: campos faltantes, valores mal formados
select tap_h.como('admin_a');
create temp table r_j2 on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09', 'semana_iso', '2026-41', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', 'no-es-fecha', 'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('tabla', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'nombre', 'sin código', 'variedad', '', 'activa', true, 'origen', 'manual')),
    '"no soy un objeto"'::jsonb,
    jsonb_build_object('entidad', 'hoja', 'registro', jsonb_build_object('rancho_id', tap_h.id('rancho_a'))),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09', 'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op1'), 'estado', 'terminado'))
  )) as r;
grant select on r_j2 to public;
select matches(tap_h.motivo((select r from r_j2), 0), '^La semana', 'j. semana_iso mal formada → rechazado con motivo legible');
select is(tap_h.resultado((select r from r_j2), 1), 'rechazado', 'j. fecha inválida → rechazado');
select matches(tap_h.motivo((select r from r_j2), 2), 'codigo', 'j. falta un dato obligatorio → el motivo nombra la columna');
select is(tap_h.resultado((select r from r_j2), 3), 'rechazado', 'j. un elemento que no es objeto se rechaza sin abortar el lote');
select is(tap_h.resultado((select r from r_j2), 4), 'rechazado', 'j. un registro sin id se rechaza');
select matches(tap_h.motivo((select r from r_j2), 5), 'en_curso o cerrado', 'j. estado inválido → motivo legible');
reset role;

-- ===========================================================================
-- Semana ISO coherente con la fecha
-- ===========================================================================
select tap_h.como('admin_a');
create temp table r_sem on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-12-31', 'semana_iso', '2026-W53', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2027-01-01', 'semana_iso', '2027-W01', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2024-12-30', 'semana_iso', '2025-W01', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2027-01-01', 'semana_iso', '2026-W53', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso')),
    tap_h.nuevo('recorrido', jsonb_build_object('id', gen_random_uuid(), 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09', 'semana_iso', '2026-W40', 'usuario_id', tap_h.id('op1'), 'estado', 'en_curso'))
  )) as r;
grant select on r_sem to public;
select is(tap_h.resultado((select r from r_sem), 0), 'aplicado', 'semana. 2026-12-31 con 2026-W53 se acepta');
select is(tap_h.resultado((select r from r_sem), 1), 'rechazado', 'semana. 2027-01-01 con 2027-W01 se rechaza (es de la semana 2026-W53)');
select matches(tap_h.motivo((select r from r_sem), 1), 'La semana no corresponde a la fecha', 'semana. …con motivo legible');
select is(tap_h.resultado((select r from r_sem), 2), 'aplicado', 'semana. 2024-12-30 con 2025-W01 se acepta');
select is(tap_h.resultado((select r from r_sem), 3), 'aplicado', 'semana. 2027-01-01 con 2026-W53 se acepta');
select is(tap_h.resultado((select r from r_sem), 4), 'rechazado', 'semana. una semana distinta a la de la fecha se rechaza');
reset role;

-- ===========================================================================
-- usuario.email lo pone el servidor
-- ===========================================================================
select tap_h.como('op1');
create temp table r_mail on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.mod('usuario', tap_h.id('op1'), '{"nombre": "Operador Uno", "email": "otro@ajeno.com"}')
  )) as r;
grant select on r_mail to public;
select is(tap_h.resultado((select r from r_mail), 0), 'aplicado', 'email. el perfil se actualiza');
reset role;
select is((select email from public.usuario where id = tap_h.id('op1')), 'op1@prueba.test', 'email. un correo ajeno se ignora: queda el de la cuenta');
select is((select nombre from public.usuario where id = tap_h.id('op1')), 'Operador Uno', 'email. el resto del perfil sí cambia');

-- ===========================================================================
-- Cierre al final aunque el recorrido llegue primero y con hojas nuevas después; idempotencia de un lote repetido
-- ===========================================================================
select tap_h.como('op1');
create temp table r_rep on commit drop as
  select public.aplicar_cambios(jsonb_build_array(
    tap_h.nuevo('recorrido', jsonb_build_object('id', 'f6000000-0000-0000-0000-000000000001', 'rancho_id', tap_h.id('rancho_a'), 'fecha', '2026-10-09', 'semana_iso', '2026-W41', 'usuario_id', tap_h.id('op1'), 'estado', 'cerrado')),
    tap_h.mod_en('hoja', 'f9000000-0000-0000-0000-000000000001', now() - interval '1 day', '{"grado_gauhl": 1}')
  )) as r;
grant select on r_rep to public;
select is(tap_h.resultado((select r from r_rep), 0), 'ignorado_version', 'repetir un lote ya aplicado no es un error: se ignora por versión');
select is(tap_h.resultado((select r from r_rep), 1), 'ignorado_version', 'tampoco sus hijos');
reset role;

-- ===========================================================================
-- m. Máximo de 500
-- ===========================================================================
select tap_h.como('op1');
select throws_ok(
  $$select public.aplicar_cambios((select jsonb_agg(jsonb_build_object('entidad', 'hoja', 'registro', '{}'::jsonb)) from generate_series(1, 501)))$$,
  'P0001', 'El lote trae 501 cambios y el máximo es 500. Envíalo en partes.', 'm. un lote de 501 elementos da un error claro');
select lives_ok(
  $$select public.aplicar_cambios((select jsonb_agg(jsonb_build_object('entidad', 'hoja', 'registro', '{}'::jsonb)) from generate_series(1, 500)))$$,
  'm. un lote de exactamente 500 elementos se procesa');
select throws_ok($$select public.aplicar_cambios('{"a": 1}'::jsonb)$$, 'P0001', 'El lote debe ser un arreglo de cambios { entidad, registro }.', 'm. un lote que no es arreglo da un error claro');
select is(public.aplicar_cambios('[]'::jsonb), '[]'::jsonb, 'm. un lote vacío devuelve un arreglo vacío');
reset role;

select * from finish();
rollback;

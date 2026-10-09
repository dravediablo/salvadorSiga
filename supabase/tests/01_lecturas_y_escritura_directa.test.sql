-- Hito 3, pruebas de lectura (RLS) y de escritura directa.
-- Casos del hito: a (aislamiento), b (membresía inactiva, lectura), c (escritura directa),
-- k (lectura del operador) y l (RLS activado, ninguna política de escritura).
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

-- ===========================================================================
-- a. Aislamiento: para CADA tabla, los de A ven 0 filas de B y viceversa
-- ===========================================================================
select tap_h.como('admin_a');
select is(tap_h.visibles(t, 'rancho_b'), 0::bigint, 'a. admin A no ve filas de B en ' || t) from unnest(tap_h.tablas()) as t;
reset role;
select tap_h.como('op1');
select is(tap_h.visibles(t, 'rancho_b'), 0::bigint, 'a. operador A1 no ve filas de B en ' || t) from unnest(tap_h.tablas()) as t;
reset role;
select tap_h.como('admin_b');
select is(tap_h.visibles(t, 'rancho_a'), 0::bigint, 'a. admin B no ve filas de A en ' || t) from unnest(tap_h.tablas()) as t;

-- Control positivo: admin B sí ve lo suyo (si no, "0 filas" no probaría nada).
select is(tap_h.visibles(t, 'rancho_b'), 1::bigint, 'a. admin B sí ve su fila en ' || t) from unnest(tap_h.tablas()) as t;
select is(tap_h.total(t), 1::bigint, 'a. admin B ve en total 1 fila de ' || t) from unnest(tap_h.tablas()) as t where t <> 'usuario';
select is(tap_h.total('usuario'), 1::bigint, 'a. admin B ve en usuario solo a quien comparte rancho con él (él mismo)');

-- Admin A ve todo su rancho.
reset role;
select tap_h.como('admin_a');
select is(tap_h.total('recorrido'), 3::bigint, 'a. admin A ve los 3 recorridos de su rancho');
select is(tap_h.total('hoja'), 3::bigint, 'a. admin A ve las 3 hojas de su rancho');
select is(tap_h.total('membresia'), 4::bigint, 'a. admin A ve las 4 membresías de su rancho (incluida la inactiva)');
select is(tap_h.total('usuario'), 3::bigint, 'a. admin A ve en usuario a quienes comparten rancho activo con él (él, A1 y A2); no al inactivo, ni a admin B, ni a la cuenta sin rancho');

-- anon: ni SELECT.
reset role;
select tap_h.como_anon();
select is(tap_h.sqlstate_de(format('select count(*) from public.%I', t)), '42501', 'a. anon no tiene permiso de lectura en ' || t) from unnest(tap_h.tablas()) as t;

-- Un usuario sin rancho ve 0 (en usuario, solo su propia fila).
reset role;
select tap_h.como('solo');
select is(tap_h.total(t), 0::bigint, 'a. usuario sin rancho ve 0 filas de ' || t) from unnest(tap_h.tablas()) as t where t <> 'usuario';
select is(tap_h.total('usuario'), 1::bigint, 'a. usuario sin rancho ve en usuario solo su propia fila');

-- ===========================================================================
-- b. Membresía inactiva: no ve nada
-- ===========================================================================
reset role;
select tap_h.como('inactivo');
select is(tap_h.total(t), 0::bigint, 'b. membresía inactiva: 0 filas de ' || t) from unnest(tap_h.tablas()) as t where t <> 'usuario';
select is(tap_h.total('usuario'), 1::bigint, 'b. membresía inactiva: en usuario solo su propia fila');

-- Se desactiva la membresía de un miembro que antes veía: deja de ver. Y una membresía eliminada tampoco cuenta.
reset role;
update public.membresia set eliminado = true where id = tap_h.id('m_op2');
select tap_h.como('op2');
select is(tap_h.total('tabla'), 0::bigint, 'b. membresía eliminada: 0 tablas');
reset role;
update public.membresia set eliminado = false where id = tap_h.id('m_op2');

-- ===========================================================================
-- c. Escritura directa: INSERT, UPDATE y DELETE fallan en cada tabla para authenticated
-- ===========================================================================
reset role;
select tap_h.como('admin_a');
select is(tap_h.sqlstate_de(format('insert into public.%I default values', t)), '42501', 'c. admin A no puede INSERT directo en ' || t) from unnest(tap_h.tablas()) as t;
select is(tap_h.sqlstate_de(format('update public.%I set eliminado = true', t)), '42501', 'c. admin A no puede UPDATE directo en ' || t) from unnest(tap_h.tablas()) as t;
select is(tap_h.sqlstate_de(format('delete from public.%I', t)), '42501', 'c. admin A no puede DELETE directo en ' || t) from unnest(tap_h.tablas()) as t;
reset role;
select tap_h.como('op1');
select is(tap_h.sqlstate_de(format('insert into public.%I default values', t)), '42501', 'c. operador no puede INSERT directo en ' || t) from unnest(tap_h.tablas()) as t;
select is(tap_h.sqlstate_de(format('update public.%I set eliminado = true', t)), '42501', 'c. operador no puede UPDATE directo en ' || t) from unnest(tap_h.tablas()) as t;
select is(tap_h.sqlstate_de(format('delete from public.%I', t)), '42501', 'c. operador no puede DELETE directo en ' || t) from unnest(tap_h.tablas()) as t;

-- Insertarse una membresía en B (con datos completos, no solo default values).
reset role;
select tap_h.como('op1');
select is(
  tap_h.sqlstate_de(format(
    'insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo) values (gen_random_uuid(), now(), now(), %L, %L, %L, true)',
    tap_h.id('rancho_b'), tap_h.id('op1'), 'administrador')),
  '42501', 'c. un operador no puede insertarse una membresía de administrador en B');
select is(
  tap_h.sqlstate_de(format('update public.membresia set rol = %L, activo = true where id = %L', 'administrador', tap_h.id('m_op1'))),
  '42501', 'c. un operador no puede subirse el rol con UPDATE directo');
-- Ni TRUNCATE.
select is(tap_h.sqlstate_de(format('truncate public.%I', t)), '42501', 'c. no puede TRUNCATE ' || t) from unnest(tap_h.tablas()) as t;

-- Los datos siguen intactos después de tanto intento.
reset role;
select is((select count(*) from public.hoja), 4::bigint, 'c. nada se perdió: siguen las 4 hojas');
select is((select count(*) from public.membresia), 5::bigint, 'c. nada se coló: siguen las 5 membresías');

-- ===========================================================================
-- k. Lectura del operador: ve sus recorridos (abiertos y cerrados) y sus hijos; no los de A2
-- ===========================================================================
select tap_h.como('op1');
select is((select count(*) from public.recorrido), 2::bigint, 'k. A1 ve sus 2 recorridos (uno abierto y uno cerrado)');
select ok(exists (select 1 from public.recorrido where id = tap_h.id('rec_cer') and estado = 'cerrado'), 'k. A1 ve su recorrido cerrado');
select ok(not exists (select 1 from public.recorrido where id = tap_h.id('rec_op2')), 'k. A1 no ve el recorrido de A2');
select is((select count(*) from public.evaluacion_tabla), 2::bigint, 'k. A1 ve solo las evaluaciones de sus recorridos');
select is((select count(*) from public.planta), 2::bigint, 'k. A1 ve solo sus plantas');
select is((select count(*) from public.hoja), 2::bigint, 'k. A1 ve solo sus hojas');
select ok(not exists (select 1 from public.hoja where id = tap_h.id('ho_op2')), 'k. A1 no ve la hoja de A2');
select ok(not exists (select 1 from public.planta where id = tap_h.id('pl_op2')), 'k. A1 no ve la planta de A2');
-- Lo compartido del rancho sí lo ve.
select is((select count(*) from public.tabla), 2::bigint, 'k. A1 ve las tablas de su rancho');
select is((select count(*) from public.aplicacion), 2::bigint, 'k. A1 ve las aplicaciones de su rancho');
-- Los eliminados se leen igual (la sincronización necesita las bajas).
reset role;
update public.hoja set eliminado = true where id = tap_h.id('ho_op1');
select tap_h.como('op1');
select ok(exists (select 1 from public.hoja where id = tap_h.id('ho_op1') and eliminado), 'k. los registros eliminados se siguen leyendo');
reset role;
select tap_h.como('op2');
select is((select count(*) from public.recorrido), 1::bigint, 'k. A2 ve solo su recorrido');

-- ===========================================================================
-- l. RLS activado en todas las tablas de public; ninguna política permite escribir
-- ===========================================================================
reset role;
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint, 'l. todas las tablas de public tienen RLS activado');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity),
  11::bigint, 'l. y son las 11 tablas del modelo');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0::bigint, 'l. ninguna política permite INSERT, UPDATE, DELETE ni ALL');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and cmd = 'SELECT'),
  11::bigint, 'l. hay exactamente una política de lectura por tabla');
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0::bigint, 'l. anon y authenticated no tienen privilegios de escritura en ninguna tabla');
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'),
  0::bigint, 'l. anon no tiene ningún privilegio en las tablas');

select * from finish();
rollback;

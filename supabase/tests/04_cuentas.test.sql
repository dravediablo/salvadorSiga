-- Hito 5, pruebas de cuentas: perfil automático, códigos de alta, cuenta_operador y mi_estado.
begin;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Preparación (se deshace con el rollback final)
--   Rancho A: administrador A, operador A1, operador A2 y un usuario con membresía inactiva.
--   Rancho B: administrador B.   Además, "solo": una cuenta sin ningún rancho.
-- ---------------------------------------------------------------------------
create extension if not exists pgtap with schema extensions;

-- La base de desarrollo trae datos de supabase/seed.sql: las pruebas parten de cero (el rollback final los devuelve).
truncate table public.clima_diario, public.planta_marcada, public.aplicacion, public.hoja, public.planta, public.evaluacion_tabla,
  public.recorrido, public."tabla", public.membresia, public.cuenta_operador, public.codigo_alta, public.usuario, public.rancho;
delete from auth.users;

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

-- "solo" tiene cuenta pero ningún rancho. El perfil lo crea el trigger de auth.users; aquí se le pone nombre.
update public.usuario set nombre = split_part(email, '@', 1) where id in (select id from tap_h.ids);

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

-- Un operador del rancho B y las cuentas de operador de A.
insert into tap_h.ids values ('op_b', 'b2000000-0000-0000-0000-000000000002'), ('nueva', 'e1000000-0000-0000-0000-000000000001'), ('nueva2', 'e2000000-0000-0000-0000-000000000002');
insert into auth.users (id, instance_id, aud, role, email) values (tap_h.id('op_b'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'op_b@prueba.test');
insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo)
  values (gen_random_uuid(), now(), now(), tap_h.id('rancho_b'), tap_h.id('op_b'), 'operador', true);
insert into public.cuenta_operador (usuario_id, rancho_id, alias) values
  (tap_h.id('op1'), tap_h.id('rancho_a'), 'uno'),
  (tap_h.id('op2'), tap_h.id('rancho_a'), 'dos'),
  (tap_h.id('op_b'), tap_h.id('rancho_b'), 'bebe');
insert into public.codigo_alta (codigo) values ('VALIDO23'), ('OTROVAL4');

-- ===========================================================================
-- Perfil automático
-- ===========================================================================
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (tap_h.id('nueva'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@correo.test', '{"nombre": "Ana López"}');
insert into auth.users (id, instance_id, aud, role, email)
  values (tap_h.id('nueva2'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sin.nombre@correo.test');
select is((select nombre from public.usuario where id = tap_h.id('nueva')), 'Ana López', 'perfil. se crea con el nombre de raw_user_meta_data');
select is((select email from public.usuario where id = tap_h.id('nueva')), 'ana@correo.test', 'perfil. y con el correo de la cuenta');
select is((select nombre from public.usuario where id = tap_h.id('nueva2')), '', 'perfil. sin nombre en los metadatos queda vacío');
select ok((select not eliminado and server_updated_at is not null from public.usuario where id = tap_h.id('nueva')), 'perfil. con las columnas comunes puestas');
-- Y la nueva cuenta ya puede crear su rancho (tiene perfil).

-- ===========================================================================
-- Códigos de alta
-- ===========================================================================
select tap_h.como('nueva');
select throws_ok($$select public.crear_rancho('Sin código', null, null, null)$$, 'P0001', 'Escribe tu código de alta.', 'alta. sin código no se crea el rancho');
select throws_ok($$select public.crear_rancho('Vacío', null, null, '   ')$$, 'P0001', 'Escribe tu código de alta.', 'alta. un código vacío tampoco');
select throws_ok($$select public.crear_rancho('Inexistente', null, null, 'NOEXISTE')$$, 'P0001', 'El código de alta no es válido.', 'alta. un código inexistente se rechaza');
create temp table creado as select public.crear_rancho('Rancho de Ana', 18.5, -103.5, 'valido23') as id; -- sin importar mayúsculas
grant select on creado to public;
select ok((select id from creado) is not null, 'alta. un código válido crea el rancho');
reset role;
select is((select usado_por from public.codigo_alta where codigo = 'VALIDO23'), tap_h.id('nueva'), 'alta. y queda marcado como usado por esa persona');
select ok((select usado_en is not null from public.codigo_alta where codigo = 'VALIDO23'), 'alta. con la fecha de uso');
select is((select count(*) from public.rancho where nombre = 'Rancho de Ana'), 1::bigint, 'alta. el rancho se creó una sola vez');
select matches((select codigo from public.rancho where nombre = 'Rancho de Ana'), '^[A-HJ-NP-Z2-9]{6}$', 'alta. el rancho recibe un código de 6 caracteres sin O, I, 0 ni 1');

select tap_h.como('nueva2');
select throws_ok($$select public.crear_rancho('Mismo código', null, null, 'VALIDO23')$$, 'P0001', 'Ese código de alta ya se usó.', 'alta. un código usado se rechaza');
reset role;
select is((select count(*) from public.rancho where nombre = 'Mismo código'), 0::bigint, 'alta. y no deja rancho a medias');
select is((select usado_por from public.codigo_alta where codigo = 'OTROVAL4'), null::uuid, 'alta. los demás códigos siguen sin usar');

-- Códigos de rancho: únicos y con el alfabeto sin ambigüedades.
select is((select count(distinct codigo) from public.rancho), (select count(*) from public.rancho), 'rancho. los códigos son únicos');
select is((select count(*) from public.rancho where codigo !~ '^[A-HJ-NP-Z2-9]{6}$'), 0::bigint, 'rancho. todos usan el alfabeto sin O, I, 0 ni 1');
select is(
  (select count(*) from (select privado.generar_codigo(6) as c from generate_series(1, 2000)) x where c !~ '^[A-HJ-NP-Z2-9]{6}$'),
  0::bigint, 'rancho. 2000 códigos generados: ninguno con caracteres ambiguos');
select cmp_ok((select count(distinct privado.generar_codigo(6)) from generate_series(1, 500)), '>', 480::bigint, 'rancho. y casi nunca se repiten (aleatorios)');

-- Nadie lee codigo_alta
select tap_h.como('admin_a');
select is(tap_h.sqlstate_de('select count(*) from public.codigo_alta'), '42501', 'alta. un administrador no puede leer codigo_alta');
reset role;
select tap_h.como('op1');
select is(tap_h.sqlstate_de('select count(*) from public.codigo_alta'), '42501', 'alta. un operador tampoco');
reset role;
select tap_h.como_anon();
select is(tap_h.sqlstate_de('select count(*) from public.codigo_alta'), '42501', 'alta. anon tampoco');
reset role;
select ok(not exists (select 1 from pg_policies where tablename = 'codigo_alta'), 'alta. y no tiene políticas');

-- ===========================================================================
-- cuenta_operador: RLS
-- ===========================================================================
select tap_h.como('admin_a');
select is((select count(*) from public.cuenta_operador), 2::bigint, 'cuenta. el administrador de A lee las 2 cuentas de su rancho');
select is((select count(*) from public.cuenta_operador where rancho_id = tap_h.id('rancho_b')), 0::bigint, 'cuenta. y ninguna de B');
reset role;
select tap_h.como('op1');
select is((select count(*) from public.cuenta_operador), 0::bigint, 'cuenta. un operador no lee ninguna (ni la suya)');
reset role;
select tap_h.como('admin_b');
select is((select count(*) from public.cuenta_operador), 1::bigint, 'cuenta. el administrador de B lee solo la suya');
select is((select count(*) from public.cuenta_operador where rancho_id = tap_h.id('rancho_a')), 0::bigint, 'cuenta. y nada de A');
reset role;
select tap_h.como('solo');
select is((select count(*) from public.cuenta_operador), 0::bigint, 'cuenta. quien no tiene rancho no ve nada');
reset role;
select tap_h.como_anon();
select is(tap_h.sqlstate_de('select count(*) from public.cuenta_operador'), '42501', 'cuenta. anon no tiene permiso');
reset role;
select tap_h.como('admin_a');
select is(tap_h.sqlstate_de($$update public.cuenta_operador set intentos_fallidos = 0$$), '42501', 'cuenta. el administrador no la modifica directo');
select is(tap_h.sqlstate_de($$select public.registrar_intento_fallido_operador(null)$$), '42501', 'cuenta. ni llama a las funciones de intentos (solo service_role)');
select is(tap_h.sqlstate_de($$select public.reiniciar_intentos_operador(null)$$), '42501', 'cuenta. ni a la de reinicio');
reset role;

-- Intentos fallidos y bloqueos (la lógica SQL que usa entrar_operador)
select is((select intentos_fallidos from public.registrar_intento_fallido_operador(tap_h.id('op1'))), 1, 'intentos. el primero suma 1');
select is((select bloqueado_hasta from public.cuenta_operador where usuario_id = tap_h.id('op1')), null::timestamptz, 'intentos. sin bloqueo todavía');
select count(*) from public.registrar_intento_fallido_operador(tap_h.id('op1'));
select count(*) from public.registrar_intento_fallido_operador(tap_h.id('op1'));
select is((select intentos_fallidos from public.cuenta_operador where usuario_id = tap_h.id('op1')), 3, 'intentos. el 3.º suma 3');
select count(*) from public.registrar_intento_fallido_operador(tap_h.id('op1'));
select is((select bloqueado_hasta is null from public.cuenta_operador where usuario_id = tap_h.id('op1')), true, 'intentos. el 4.º no bloquea');
select count(*) from public.registrar_intento_fallido_operador(tap_h.id('op1'));
select ok((select bloqueado_hasta between now() + interval '14 minutes' and now() + interval '16 minutes' from public.cuenta_operador where usuario_id = tap_h.id('op1')), 'intentos. el 5.º bloquea 15 minutos');
select is((select bloqueado_permanente from public.cuenta_operador where usuario_id = tap_h.id('op1')), false, 'intentos. …no permanente');
update public.cuenta_operador set intentos_fallidos = 9 where usuario_id = tap_h.id('op1');
select count(*) from public.registrar_intento_fallido_operador(tap_h.id('op1'));
select is((select bloqueado_permanente from public.cuenta_operador where usuario_id = tap_h.id('op1')), true, 'intentos. el 10.º bloquea de forma permanente');
select lives_ok($$select public.reiniciar_intentos_operador((select usuario_id from public.cuenta_operador where alias = 'uno'))$$, 'intentos. reiniciar funciona');
select is((select intentos_fallidos || bloqueado_permanente::text || coalesce(bloqueado_hasta::text, 'nulo') from public.cuenta_operador where alias = 'uno'), '0falsenulo', 'intentos. y deja todo en cero');
select is((select intentos_fallidos from public.cuenta_operador where alias = 'dos'), 0, 'intentos. sin tocar las demás cuentas');
select throws_ok($$insert into public.cuenta_operador (usuario_id, rancho_id, alias) values (gen_random_uuid(), (select rancho_id from public.cuenta_operador where alias = 'uno'), 'otro')$$, '23503', null, 'cuenta. (el usuario debe existir)');
select throws_ok(format($$insert into public.cuenta_operador (usuario_id, rancho_id, alias) values (%L, %L, 'UNO')$$, tap_h.id('inactivo'), tap_h.id('rancho_a')), '23514', null, 'cuenta. el alias va en minúsculas, sin espacios ni acentos');
select throws_ok(format($$insert into public.cuenta_operador (usuario_id, rancho_id, alias) values (%L, %L, 'uno')$$, tap_h.id('inactivo'), tap_h.id('rancho_a')), '23505', null, 'cuenta. el alias es único por rancho');
select lives_ok(format($$insert into public.cuenta_operador (usuario_id, rancho_id, alias) values (%L, %L, 'uno')$$, tap_h.id('admin_b'), tap_h.id('rancho_b')), 'cuenta. …pero el mismo alias en otro rancho sí');

-- ===========================================================================
-- mi_estado
-- ===========================================================================
select tap_h.como('op1');
select is((select count(*) from public.mi_estado()), 1::bigint, 'mi_estado. devuelve las membresías de quien llama');
select is((select rol || activo::text from public.mi_estado()), 'operadortrue', 'mi_estado. con rol y activo');
select is((select rancho_id from public.mi_estado()), tap_h.id('rancho_a'), 'mi_estado. y el rancho');
reset role;
select ok((select ultima_sincronizacion between now() - interval '1 minute' and now() + interval '1 minute' from public.cuenta_operador where alias = 'uno' and rancho_id = tap_h.id('rancho_a')), 'mi_estado. actualiza la última sincronización del operador');
select is((select ultima_sincronizacion from public.cuenta_operador where alias = 'dos'), null::timestamptz, 'mi_estado. y solo la suya');

select tap_h.como('inactivo');
select is((select count(*) from public.mi_estado()), 1::bigint, 'mi_estado. una membresía INACTIVA también aparece');
select is((select activo from public.mi_estado()), false, 'mi_estado. marcada como inactiva');
select is((select count(*) from public.rancho), 0::bigint, 'mi_estado. mientras no ve nada de su rancho (RLS)');
reset role;

-- Eliminada: no aparece. Sin membresía: vacío.
update public.membresia set eliminado = true where id = tap_h.id('m_op2');
select tap_h.como('op2');
select is((select count(*) from public.mi_estado()), 0::bigint, 'mi_estado. una membresía eliminada no aparece');
reset role;
select tap_h.como('solo');
select is((select count(*) from public.mi_estado()), 0::bigint, 'mi_estado. sin membresías: vacío');
reset role;
select tap_h.como_anon();
select is(tap_h.sqlstate_de('select * from public.mi_estado()'), '42501', 'mi_estado. anon no puede ejecutarla');
reset role;

select * from finish();
rollback;

-- ---------------------------------------------------------------------------
-- GUARDIA: esta semilla trae cuentas con contraseña conocida y SOLO se carga en el servidor local.
-- La base local (la imagen de Supabase que levanta `supabase start`) trae el JWT secret público por defecto de
-- Supabase en el ajuste app.settings.jwt_secret; un proyecto remoto tiene el suyo, secreto. Si el valor no es el
-- público, se aborta antes de crear nada. (Límite: un Supabase autoalojado que dejara el secreto por defecto
-- pasaría la guardia; el proyecto real vive en Supabase alojado, así que no.)
-- Nunca corras `supabase db reset --linked`; a producción solo `supabase db push` (CLAUDE.md).
-- ---------------------------------------------------------------------------
do $guardia$
begin
  if coalesce(current_setting('app.settings.jwt_secret', true), '') <> 'super-secret-jwt-token-with-at-least-32-characters-long' then
    raise exception 'seed.sql abortado: esta base NO es la local de Supabase (el JWT secret no es el público por defecto). La semilla tiene cuentas con contraseña conocida y solo se carga con `supabase db reset` en local.';
  end if;
end
$guardia$;

-- Datos de desarrollo (se cargan con `supabase db reset`). NUNCA van a un proyecto real.
-- TEMPORAL (hito 4): tres cuentas con contraseña para probar la sincronización; el hito 5 trae el inicio de sesión real.
--
--   admin@prueba.test / op1@prueba.test / op2@prueba.test   contraseña: prueba123
--
-- Rancho "Rancho de prueba" con 3 tablas; admin es administrador y op1 y op2 son operadores.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@prueba.test',
   crypt('prueba123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'op1@prueba.test',
   crypt('prueba123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'op2@prueba.test',
   crypt('prueba123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email in ('admin@prueba.test', 'op1@prueba.test', 'op2@prueba.test');

insert into public.usuario (id, created_at, updated_at, nombre, email) values
  ('d0000000-0000-4000-8000-000000000001', now(), now(), 'Propietario de prueba', 'admin@prueba.test'),
  ('d0000000-0000-4000-8000-000000000002', now(), now(), 'Operador 1', 'op1@prueba.test'),
  ('d0000000-0000-4000-8000-000000000003', now(), now(), 'Operador 2', 'op2@prueba.test');

insert into public.rancho (id, created_at, updated_at, nombre, lat, lon) values
  ('d1000000-0000-4000-8000-000000000001', now(), now(), 'Rancho de prueba', 18.9, -103.9);

insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo) values
  ('d2000000-0000-4000-8000-000000000001', now(), now(), 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'administrador', true),
  ('d2000000-0000-4000-8000-000000000002', now(), now(), 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'operador', true),
  ('d2000000-0000-4000-8000-000000000003', now(), now(), 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'operador', true);

insert into public."tabla" (id, created_at, updated_at, rancho_id, codigo, nombre, superficie_ha, variedad, geometria, activa, origen) values
  ('d3000000-0000-4000-8000-000000000001', now(), now(), 'd1000000-0000-4000-8000-000000000001', '1', 'Tabla 1. Sup. 6.8 ha.', 6.8, 'Gran Enano',
   '{"type":"Polygon","coordinates":[[[-103.5,18.5],[-103.497,18.5],[-103.497,18.4979],[-103.5,18.4979],[-103.5,18.5]]]}', true, 'manual'),
  ('d3000000-0000-4000-8000-000000000002', now(), now(), 'd1000000-0000-4000-8000-000000000001', '2', 'Tabla 2. Sup. 5.1 ha.', 5.1, 'Gran Enano', null, true, 'manual'),
  ('d3000000-0000-4000-8000-000000000003', now(), now(), 'd1000000-0000-4000-8000-000000000001', '3', 'Tabla 3. Sup. 4.2 ha.', 4.2, 'Valery', null, true, 'manual');

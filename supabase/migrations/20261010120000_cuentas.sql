-- Hito 5: cuentas reales.
--   - perfil automático al crearse una cuenta de auth
--   - código de rancho (para que los operadores entren) y códigos de alta (para que un propietario cree su rancho)
--   - cuenta_operador: alias, intentos y bloqueos de cada operador
--   - mi_estado(): las membresías de quien llama, incluidas las inactivas
-- Las migraciones anteriores no se tocan.

-- ---------------------------------------------------------------------------
-- 1. Perfil automático: cada cuenta de auth.users tiene su fila en public.usuario
-- ---------------------------------------------------------------------------
create function privado.crear_perfil() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.usuario (id, created_at, updated_at, nombre, email)
  values (new.id, clock_timestamp(), clock_timestamp(), coalesce(new.raw_user_meta_data ->> 'nombre', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_users_crear_perfil
  after insert on auth.users
  for each row execute function privado.crear_perfil();

-- Las cuentas que ya existían (la semilla local, por ejemplo) también tienen perfil.
insert into public.usuario (id, created_at, updated_at, nombre, email)
select u.id, clock_timestamp(), clock_timestamp(), coalesce(u.raw_user_meta_data ->> 'nombre', ''), coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Código del rancho: 6 caracteres de un alfabeto sin ambigüedades (A–Z y 2–9, sin O, I, 0 ni 1)
-- ---------------------------------------------------------------------------
create function privado.generar_codigo(p_largo integer default 6) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  c_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 caracteres: 24 letras y 8 dígitos
  v_bytes bytea := uuid_send(gen_random_uuid()); -- bytes aleatorios del generador criptográfico de Postgres
  v_codigo text := '';
begin
  for i in 0 .. p_largo - 1 loop
    v_codigo := v_codigo || substr(c_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_codigo;
end;
$$;

create function privado.codigo_rancho_nuevo() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_codigo text;
begin
  loop
    v_codigo := privado.generar_codigo(6);
    exit when not exists (select 1 from public.rancho r where r.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

alter table public.rancho add column codigo text;
update public.rancho set codigo = privado.codigo_rancho_nuevo() where codigo is null;
alter table public.rancho
  alter column codigo set not null,
  alter column codigo set default privado.codigo_rancho_nuevo(),
  add constraint rancho_codigo_key unique (codigo),
  add constraint rancho_codigo_formato_check check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$');

-- ---------------------------------------------------------------------------
-- 3. Códigos de alta: de un solo uso, los reparte el responsable del proyecto. Nadie los lee desde la app.
-- ---------------------------------------------------------------------------
create table public.codigo_alta (
  codigo text primary key,
  usado_por uuid references public.usuario (id),
  usado_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint codigo_alta_uso_check check ((usado_por is null) = (usado_en is null))
);
alter table public.codigo_alta enable row level security;
revoke all on public.codigo_alta from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. crear_rancho(nombre, lat, lon, codigo_alta): ahora exige un código de alta vigente
-- ---------------------------------------------------------------------------
drop function public.crear_rancho(text, double precision, double precision);

create function public.crear_rancho(p_nombre text, p_lat double precision default null, p_lon double precision default null, p_codigo_alta text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ahora timestamptz := clock_timestamp();
  v_codigo public.codigo_alta;
  v_rancho_id uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para crear un rancho.';
  end if;
  if not exists (select 1 from public.usuario u where u.id = v_uid and not u.eliminado) then
    raise exception 'Tu usuario todavía no tiene perfil. Termina de registrarte e inténtalo de nuevo.';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'Escribe el nombre del rancho.';
  end if;
  if p_codigo_alta is null or length(btrim(p_codigo_alta)) = 0 then
    raise exception 'Escribe tu código de alta.';
  end if;

  -- El código se bloquea hasta el final de la transacción: dos personas no pueden usar el mismo.
  select * into v_codigo from public.codigo_alta c where c.codigo = upper(btrim(p_codigo_alta)) for update;
  if not found then
    raise exception 'El código de alta no es válido.';
  end if;
  if v_codigo.usado_por is not null then
    raise exception 'Ese código de alta ya se usó.';
  end if;

  insert into public.rancho (created_at, updated_at, nombre, lat, lon)
  values (v_ahora, v_ahora, btrim(p_nombre), p_lat, p_lon)
  returning id into v_rancho_id;

  insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo)
  values (gen_random_uuid(), v_ahora, v_ahora, v_rancho_id, v_uid, 'administrador', true);

  update public.codigo_alta set usado_por = v_uid, usado_en = v_ahora where codigo = v_codigo.codigo;

  return v_rancho_id;
end;
$$;

revoke execute on function public.crear_rancho(text, double precision, double precision, text) from public, anon;
grant execute on function public.crear_rancho(text, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. cuenta_operador: alias (único por rancho), intentos y bloqueos. Solo la tocan las funciones del servidor.
-- ---------------------------------------------------------------------------
create table public.cuenta_operador (
  usuario_id uuid primary key references public.usuario (id),
  rancho_id uuid not null references public.rancho (id),
  alias text not null,
  intentos_fallidos integer not null default 0,
  bloqueado_hasta timestamptz,
  bloqueado_permanente boolean not null default false,
  ultima_sincronizacion timestamptz,
  creado_en timestamptz not null default now(),
  constraint cuenta_operador_alias_formato_check check (alias ~ '^[a-z0-9]{1,30}$'),
  constraint cuenta_operador_alias_rancho_key unique (rancho_id, alias),
  constraint cuenta_operador_intentos_check check (intentos_fallidos >= 0)
);
create index cuenta_operador_rancho_idx on public.cuenta_operador (rancho_id);

alter table public.cuenta_operador enable row level security;
revoke all on public.cuenta_operador from anon, authenticated;
grant select on public.cuenta_operador to authenticated;
-- Lectura: los administradores del rancho.
create policy cuenta_operador_select on public.cuenta_operador for select to authenticated
  using (public.rol_en(rancho_id) = 'administrador');

-- Intentos fallidos y bloqueos: SQL atómico, ejecutable solo por service_role (la función entrar_operador).
-- A los 5 intentos fallidos: bloqueo de 15 minutos (y cada fallo siguiente lo renueva); a los 10: permanente.
create function public.registrar_intento_fallido_operador(p_usuario_id uuid)
returns table (intentos_fallidos integer, bloqueado_hasta timestamptz, bloqueado_permanente boolean)
language sql security definer
set search_path = ''
as $$
  update public.cuenta_operador c
  set intentos_fallidos = c.intentos_fallidos + 1,
      bloqueado_permanente = c.bloqueado_permanente or c.intentos_fallidos + 1 >= 10,
      bloqueado_hasta = case
        when c.intentos_fallidos + 1 >= 10 then c.bloqueado_hasta
        when c.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
        else c.bloqueado_hasta
      end
  where c.usuario_id = p_usuario_id
  returning c.intentos_fallidos, c.bloqueado_hasta, c.bloqueado_permanente;
$$;

create function public.reiniciar_intentos_operador(p_usuario_id uuid) returns void
language sql security definer
set search_path = ''
as $$
  update public.cuenta_operador
  set intentos_fallidos = 0, bloqueado_hasta = null, bloqueado_permanente = false
  where usuario_id = p_usuario_id;
$$;

revoke execute on function public.registrar_intento_fallido_operador(uuid), public.reiniciar_intentos_operador(uuid) from public, anon, authenticated;
grant execute on function public.registrar_intento_fallido_operador(uuid), public.reiniciar_intentos_operador(uuid) to service_role;
-- service_role escribe en estas tablas (las funciones del servidor crean cuentas y membresías).
grant all on public.codigo_alta, public.cuenta_operador to service_role;

-- ---------------------------------------------------------------------------
-- 6. mi_estado(): las membresías de quien llama, INCLUIDAS las inactivas. La sincronización lo llama al empezar cada ciclo.
-- ---------------------------------------------------------------------------
create function public.mi_estado() returns table (rancho_id uuid, rol text, activo boolean)
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión.';
  end if;
  update public.cuenta_operador c set ultima_sincronizacion = now() where c.usuario_id = auth.uid();
  return query
    select m.rancho_id, m.rol, m.activo
    from public.membresia m
    where m.usuario_id = auth.uid() and not m.eliminado;
end;
$$;

revoke execute on function public.mi_estado() from public, anon;
grant execute on function public.mi_estado() to authenticated;

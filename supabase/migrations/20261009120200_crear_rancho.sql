-- Hito 3: crear_rancho(nombre, lat, lon). Crea el rancho y la membresía de administrador de
-- quien lo llama, en una sola transacción.

create function public.crear_rancho(p_nombre text, p_lat double precision default null, p_lon double precision default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ahora timestamptz := clock_timestamp();
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

  insert into public.rancho (created_at, updated_at, nombre, lat, lon)
  values (v_ahora, v_ahora, btrim(p_nombre), p_lat, p_lon)
  returning id into v_rancho_id;

  insert into public.membresia (id, created_at, updated_at, rancho_id, usuario_id, rol, activo)
  values (gen_random_uuid(), v_ahora, v_ahora, v_rancho_id, v_uid, 'administrador', true);

  return v_rancho_id;
end;
$$;

revoke execute on function public.crear_rancho(text, double precision, double precision) from public, anon;
grant execute on function public.crear_rancho(text, double precision, double precision) to authenticated;

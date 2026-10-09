-- Hito 3: lecturas protegidas por RLS; ninguna escritura directa.

-- ---------------------------------------------------------------------------
-- Privilegios: anon no ve nada; authenticated solo lee. Se escribe por aplicar_cambios.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
-- Las tablas que se creen después tampoco heredan permisos de escritura.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de las políticas. SECURITY DEFINER para leer membresia sin pasar por su propia RLS.
-- Solo cuentan membresías activas y no eliminadas.
-- ---------------------------------------------------------------------------
create function public.es_miembro(p_rancho_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membresia m
    where m.rancho_id = p_rancho_id
      and m.usuario_id = auth.uid()
      and m.activo
      and not m.eliminado
  );
$$;

create function public.rol_en(p_rancho_id uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select m.rol from public.membresia m
  where m.rancho_id = p_rancho_id
    and m.usuario_id = auth.uid()
    and m.activo
    and not m.eliminado
  limit 1;
$$;

-- ¿La persona autenticada comparte algún rancho (como miembro activo) con este usuario?
create function public.comparte_rancho_con(p_usuario_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membresia propia
    join public.membresia otra on otra.rancho_id = propia.rancho_id
    where propia.usuario_id = auth.uid() and propia.activo and not propia.eliminado
      and otra.usuario_id = p_usuario_id and otra.activo and not otra.eliminado
  );
$$;

-- Las políticas se evalúan con los permisos de quien consulta, así que estas tres sí se le conceden.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.es_miembro(uuid), public.rol_en(uuid), public.comparte_rancho_con(uuid) to authenticated;
-- El esquema privado (triggers y piezas internas de aplicar_cambios) no se abre a nadie más que al dueño.
revoke all on all functions in schema privado from public, anon, authenticated;
alter default privileges in schema privado revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.rancho enable row level security;
alter table public.usuario enable row level security;
alter table public.membresia enable row level security;
alter table public."tabla" enable row level security;
alter table public.recorrido enable row level security;
alter table public.evaluacion_tabla enable row level security;
alter table public.planta enable row level security;
alter table public.hoja enable row level security;
alter table public.aplicacion enable row level security;
alter table public.clima_diario enable row level security;
alter table public.planta_marcada enable row level security;

-- Los registros eliminados se leen igual: la sincronización necesita enterarse de las bajas.
create policy rancho_select on public.rancho for select to authenticated
  using (public.es_miembro(id));

create policy usuario_select on public.usuario for select to authenticated
  using (id = auth.uid() or public.comparte_rancho_con(id));

create policy membresia_select on public.membresia for select to authenticated
  using (public.es_miembro(rancho_id));

create policy tabla_select on public."tabla" for select to authenticated
  using (public.es_miembro(rancho_id));

create policy aplicacion_select on public.aplicacion for select to authenticated
  using (public.es_miembro(rancho_id));

create policy clima_diario_select on public.clima_diario for select to authenticated
  using (public.es_miembro(rancho_id));

create policy planta_marcada_select on public.planta_marcada for select to authenticated
  using (public.es_miembro(rancho_id));

-- Recorridos: el administrador ve todo el rancho; el operador, solo los suyos (abiertos y cerrados;
-- la interfaz le muestra solo los abiertos, pero la sincronización necesita los cerrados).
create policy recorrido_select on public.recorrido for select to authenticated
  using (
    public.es_miembro(rancho_id)
    and (public.rol_en(rancho_id) = 'administrador' or usuario_id = auth.uid())
  );

-- Los hijos heredan la visibilidad de su padre: la subconsulta pasa por la RLS del padre.
create policy evaluacion_tabla_select on public.evaluacion_tabla for select to authenticated
  using (
    public.es_miembro(rancho_id)
    and exists (select 1 from public.recorrido r where r.id = evaluacion_tabla.recorrido_id)
  );

create policy planta_select on public.planta for select to authenticated
  using (
    public.es_miembro(rancho_id)
    and exists (select 1 from public.evaluacion_tabla e where e.id = planta.evaluacion_tabla_id)
  );

create policy hoja_select on public.hoja for select to authenticated
  using (
    public.es_miembro(rancho_id)
    and exists (select 1 from public.planta p where p.id = hoja.planta_id)
  );

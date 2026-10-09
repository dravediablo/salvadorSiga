-- Hito 3: modelo de datos (CLAUDE.md, "Modelo de datos").
-- Una tabla por entidad, en singular. Los clientes mandan id, created_at, updated_at y eliminado;
-- server_updated_at lo pone siempre el servidor (trigger).

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- server_updated_at: lo pone el servidor en cada insert y update; lo que mande el cliente se ignora.
-- Estrictamente creciente por registro (el cursor de descarga de la sincronización).
-- ---------------------------------------------------------------------------
create function privado.poner_server_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.server_updated_at := greatest(clock_timestamp(), old.server_updated_at + interval '1 microsecond');
  else
    new.server_updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- rancho
-- ---------------------------------------------------------------------------
create table public.rancho (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  nombre text not null,
  lat double precision,
  lon double precision,
  ii_umbral_medio numeric not null default 20,
  ii_umbral_alto numeric not null default 30,
  dias_alerta_aplicacion integer not null default 14,
  constraint rancho_nombre_check check (length(btrim(nombre)) > 0),
  constraint rancho_lat_check check (lat is null or lat between -90 and 90),
  constraint rancho_lon_check check (lon is null or lon between -180 and 180),
  constraint rancho_umbrales_check check (ii_umbral_medio >= 0 and ii_umbral_alto >= ii_umbral_medio),
  constraint rancho_dias_alerta_check check (dias_alerta_aplicacion >= 0)
);

-- ---------------------------------------------------------------------------
-- usuario: el perfil de cada cuenta de auth.users
-- ---------------------------------------------------------------------------
create table public.usuario (
  id uuid primary key references auth.users (id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  nombre text not null default '',
  email text not null default ''
);

-- ---------------------------------------------------------------------------
-- membresia
-- ---------------------------------------------------------------------------
create table public.membresia (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  usuario_id uuid not null references public.usuario (id),
  rol text not null,
  activo boolean not null default true,
  constraint membresia_rol_check check (rol in ('operador', 'administrador'))
);
-- Una persona tiene a lo más una membresía vigente por rancho.
create unique index membresia_vigente_idx on public.membresia (rancho_id, usuario_id) where not eliminado;

-- ---------------------------------------------------------------------------
-- tabla (lote)
-- ---------------------------------------------------------------------------
create table public."tabla" (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  codigo text not null,
  nombre text not null default '',
  superficie_ha numeric,
  variedad text not null default '',
  geometria jsonb,
  activa boolean not null default true,
  origen text not null default 'manual',
  constraint tabla_id_rancho_key unique (id, rancho_id),
  constraint tabla_superficie_check check (superficie_ha is null or superficie_ha >= 0),
  constraint tabla_geometria_check check (geometria is null or geometria ->> 'type' = 'Polygon'),
  constraint tabla_origen_check check (origen in ('kmz', 'manual'))
);

-- ---------------------------------------------------------------------------
-- recorrido
-- ---------------------------------------------------------------------------
create table public.recorrido (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  fecha date not null,
  semana_iso text not null,
  usuario_id uuid not null references public.usuario (id),
  estado text not null default 'en_curso',
  constraint recorrido_id_rancho_key unique (id, rancho_id),
  constraint recorrido_semana_iso_check check (semana_iso ~ '^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$'),
  constraint recorrido_estado_check check (estado in ('en_curso', 'cerrado'))
);

-- ---------------------------------------------------------------------------
-- evaluacion_tabla
-- ---------------------------------------------------------------------------
create table public.evaluacion_tabla (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  recorrido_id uuid not null,
  tabla_id uuid not null,
  tipo text not null default 'stover',
  hora_inicio timestamptz,
  hora_fin timestamptz,
  constraint evaluacion_tabla_id_rancho_key unique (id, rancho_id),
  constraint evaluacion_tabla_recorrido_fk foreign key (recorrido_id, rancho_id) references public.recorrido (id, rancho_id),
  constraint evaluacion_tabla_tabla_fk foreign key (tabla_id, rancho_id) references public."tabla" (id, rancho_id),
  constraint evaluacion_tabla_tipo_check check (tipo in ('stover', 'preaviso'))
);

-- ---------------------------------------------------------------------------
-- planta
-- ---------------------------------------------------------------------------
create table public.planta (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  evaluacion_tabla_id uuid not null,
  numero_planta integer not null,
  total_hojas integer not null,
  -- Hoja más joven con síntoma: n >= 1 = número de hoja, 0 = "no presenta", null = sin capturar.
  hmj_pizca integer,
  hmj_estria integer,
  hmj_mancha integer,
  observaciones text not null default '',
  gps_lat double precision,
  gps_lon double precision,
  gps_precision_m double precision,
  constraint planta_id_rancho_key unique (id, rancho_id),
  constraint planta_evaluacion_fk foreign key (evaluacion_tabla_id, rancho_id) references public.evaluacion_tabla (id, rancho_id),
  constraint planta_numero_planta_check check (numero_planta >= 1),
  constraint planta_total_hojas_check check (total_hojas between 1 and 30),
  constraint planta_hmj_pizca_check check (hmj_pizca is null or hmj_pizca >= 0),
  constraint planta_hmj_estria_check check (hmj_estria is null or hmj_estria >= 0),
  constraint planta_hmj_mancha_check check (hmj_mancha is null or hmj_mancha >= 0)
);

-- ---------------------------------------------------------------------------
-- hoja
-- ---------------------------------------------------------------------------
create table public.hoja (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  planta_id uuid not null,
  numero_hoja integer not null,
  grado_gauhl smallint,
  constraint hoja_planta_fk foreign key (planta_id, rancho_id) references public.planta (id, rancho_id),
  constraint hoja_numero_hoja_check check (numero_hoja >= 1),
  constraint hoja_grado_gauhl_check check (grado_gauhl is null or grado_gauhl between 0 and 6)
);
-- Nunca dos hojas vivas con el mismo número en una planta.
create unique index hoja_planta_numero_viva_idx on public.hoja (planta_id, numero_hoja) where not eliminado;

-- ---------------------------------------------------------------------------
-- aplicacion: las tablas tratadas van en el arreglo tabla_ids (sin tabla intermedia)
-- ---------------------------------------------------------------------------
create table public.aplicacion (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  fecha date not null,
  tabla_ids uuid[] not null default '{}',
  producto text not null default '',
  ingrediente_activo text not null default '',
  grupo_frac text not null default '',
  dosis numeric,
  unidad text not null default '',
  volumen_mezcla numeric,
  metodo text not null default '',
  usuario_id uuid references public.usuario (id),
  responsable text not null default '',
  observaciones text not null default '',
  constraint aplicacion_dosis_check check (dosis is null or dosis >= 0),
  constraint aplicacion_volumen_mezcla_check check (volumen_mezcla is null or volumen_mezcla >= 0)
);
create index aplicacion_tabla_ids_idx on public.aplicacion using gin (tabla_ids);

-- Rechaza ids que no sean tablas del mismo rancho.
create function privado.validar_tabla_ids() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.tabla_ids) as t (tabla_id)
    where not exists (
      select 1 from public."tabla" x where x.id = t.tabla_id and x.rancho_id = new.rancho_id
    )
  ) then
    raise exception 'La aplicación incluye tablas que no existen o que son de otro rancho.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger aplicacion_validar_tabla_ids
  before insert or update on public.aplicacion
  for each row execute function privado.validar_tabla_ids();

-- ---------------------------------------------------------------------------
-- clima_diario: lo escribe el servidor (hito 7)
-- ---------------------------------------------------------------------------
create table public.clima_diario (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  fecha date not null,
  temp_max numeric,
  temp_min numeric,
  temp_media numeric,
  hr_media numeric,
  precipitacion numeric,
  horas_hr_alta numeric,
  fuente text not null default '',
  constraint clima_diario_rancho_fecha_key unique (rancho_id, fecha)
);

-- ---------------------------------------------------------------------------
-- planta_marcada: espacio para el preaviso biológico (sin lógica todavía)
-- ---------------------------------------------------------------------------
create table public.planta_marcada (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  eliminado boolean not null default false,
  rancho_id uuid not null references public.rancho (id),
  tabla_id uuid not null,
  fecha_marcado date not null,
  constraint planta_marcada_tabla_fk foreign key (tabla_id, rancho_id) references public."tabla" (id, rancho_id)
);

-- ---------------------------------------------------------------------------
-- Triggers de server_updated_at e índices de sincronización (rancho_id, server_updated_at)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['rancho', 'usuario', 'membresia', 'tabla', 'recorrido', 'evaluacion_tabla', 'planta', 'hoja', 'aplicacion', 'clima_diario', 'planta_marcada']
  loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function privado.poner_server_updated_at()',
      t || '_server_updated_at', t
    );
    if t = 'rancho' or t = 'usuario' then
      -- No tienen rancho_id: el cursor es solo server_updated_at.
      execute format('create index %I on public.%I (server_updated_at)', t || '_sync_idx', t);
    else
      execute format('create index %I on public.%I (rancho_id, server_updated_at)', t || '_sync_idx', t);
    end if;
  end loop;
end;
$$;

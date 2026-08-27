-- =========================================================================
--  Hábitos en Familia — esquema de Supabase
--
--  Se ejecuta entero, de una vez, en el SQL Editor del proyecto. Es
--  idempotente: volver a lanzarlo no rompe nada ni borra datos.
--
--  Modelo de acceso: una cuenta para toda la casa. Cada fila lleva el
--  `owner` de quien la escribió y las políticas sólo dejan ver y tocar lo
--  propio, así que sin sesión no se lee absolutamente nada.
-- =========================================================================

-- ------------------------------------------------------------ registros
create table if not exists public.entries (
  id          text primary key,          -- `${profileId}:${YYYY-MM-DD}`
  owner       uuid not null references auth.users (id) on delete cascade,
  profile_id  text not null,
  day         date not null,
  metrics     jsonb not null default '{}'::jsonb,
  note        text,
  notes       jsonb not null default '{}'::jsonb,  -- notas por categoría y de retos
  updated_at  timestamptz not null default now()
);

create index if not exists entries_owner_day_idx on public.entries (owner, profile_id, day);

-- Columnas añadidas después de la primera versión del esquema: quien ya tenga
-- la tabla creada las recibe aquí sin tener que borrar nada.
alter table public.entries
  add column if not exists notes jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------- seguridad
--  Sin estas políticas la clave pública del navegador daría acceso a todo.

alter table public.entries enable row level security;

drop policy if exists "entries propias" on public.entries;
create policy "entries propias" on public.entries
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- ------------------------------------------------- aspecto de los perfiles
--  Fotos y sintonías que sustituyen a las de fábrica. Una fila por ranura
--  personalizada: si la fila no está, ese hueco vuelve a lo que trae el
--  código. Esa ausencia es justamente lo que propaga los borrados, así que
--  aquí no hacen falta lápidas.

create table if not exists public.appearance (
  id          text primary key,          -- `${profileId}:${slot}`
  owner       uuid not null references auth.users (id) on delete cascade,
  profile_id  text not null,
  slot        text not null,             -- photo | hero | cover | card | anthem
  path        text not null,             -- objeto dentro del cubo `aspecto`
  name        text not null default '',  -- nombre del archivo original
  mime        text not null default '',
  size        integer not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists appearance_owner_idx on public.appearance (owner, profile_id);

alter table public.appearance enable row level security;

drop policy if exists "aspecto propio" on public.appearance;
create policy "aspecto propio" on public.appearance
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

--  Cubo privado: las fotos sólo se sirven con una URL firmada.

insert into storage.buckets (id, name, public)
values ('aspecto', 'aspecto', false)
on conflict (id) do nothing;

drop policy if exists "aspecto propio" on storage.objects;
create policy "aspecto propio" on storage.objects
  for all to authenticated
  using (bucket_id = 'aspecto' and owner = auth.uid())
  with check (bucket_id = 'aspecto' and owner = auth.uid());

-- --------------------------------------------------------------- tareas
--  Recados y citas de cada uno: la revisión del dentista, la reunión del
--  colegio, comprar leche. A diferencia de los registros diarios, no hay
--  una fila por día sino una por encargo, con identificador propio.

create table if not exists public.tasks (
  id            text primary key,
  owner         uuid not null references auth.users (id) on delete cascade,
  profile_id    text not null,
  title         text not null,
  detail        text,
  kind          text not null default 'otro',
  due_day       date,                    -- nulo en las tareas sin fecha
  due_time      time,                    -- nulo si ocupa el día entero
  duration      integer,                 -- minutos, sólo cuando hay hora
  remind_before integer,                 -- minutos de antelación del aviso
  repeat_rule   text not null default 'none',
  done          boolean not null default false,
  done_at       timestamptz,
  calendar      jsonb,                   -- evento espejo en Google Calendar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_owner_due_idx on public.tasks (owner, profile_id, due_day);

alter table public.tasks enable row level security;

drop policy if exists "tareas propias" on public.tasks;
create policy "tareas propias" on public.tasks
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- -------------------------------------------- permisos de Google Calendar
--  Una fila por perfil enlazado. Guarda el permiso duradero que deja crear
--  eventos en nombre de esa cuenta, así que es lo más sensible del proyecto
--  y se protege por partida doble:
--
--   1. El token va cifrado con una clave que sólo existe en el entorno del
--      servidor, nunca en la base.
--   2. La tabla tiene RLS activado y **ninguna** política, de modo que la
--      clave pública del navegador no la ve ni con sesión iniciada. Sólo la
--      clave de servicio (`SUPABASE_SERVICE_ROLE_KEY`, que vive en las
--      rutas de `app/api`) puede tocarla.
--
--  Quitar el permiso desde la app borra la fila y lo revoca en Google.

create table if not exists public.calendar_links (
  id            text primary key,        -- `${owner}:${profileId}`
  owner         uuid not null references auth.users (id) on delete cascade,
  profile_id    text not null,
  email         text not null default '',-- cuenta de Google enlazada
  calendar_id   text not null default 'primary',
  calendar_name text not null default '',
  refresh_token text not null,           -- cifrado (AES-256-GCM)
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists calendar_links_owner_idx on public.calendar_links (owner);

alter table public.calendar_links enable row level security;

--  Por si una versión anterior del esquema hubiera dejado alguna abierta.
drop policy if exists "calendarios propios" on public.calendar_links;

-- Columnas añadidas después: quien ya tenga las tablas creadas las recibe
-- aquí sin perder nada.
--
--  `tasks.calendar_pending`  la tarea debía ir al calendario y no llegó
--                            (sin cobertura, o Google falló). Se reintenta.
--  `calendar_links.broken`   Google ha dejado de aceptar el permiso: hay que
--                            volver a conectar esa cuenta, y la app lo dice.
--  `calendar_links.checked_at` última vez que se comprobó que seguía vivo.

alter table public.tasks
  add column if not exists calendar_pending boolean not null default false;

alter table public.calendar_links
  add column if not exists broken boolean not null default false,
  add column if not exists checked_at timestamptz;

-- ------------------------------------------------------ ajustes de casa
--  El modo día/noche, si suenan las sintonías y el PIN del módulo privado.
--  Una sola fila por cuenta: son de la casa, no de cada aparato, y por eso
--  se ponen una vez y valen en todos.
--
--  Del PIN se guarda la huella, nunca el número: la sal y el resumen de
--  PBKDF2-SHA256 que calcula el navegador. Quien mire esta tabla no puede
--  entrar en el módulo con lo que ve. Aun así son cuatro dígitos: es una
--  barrera doméstica, no un cerrojo.

create table if not exists public.settings (
  owner       uuid primary key references auth.users (id) on delete cascade,
  theme       text not null default 'auto',   -- auto | light | dark
  sound       boolean not null default true,
  pin_salt    text,                           -- nulos mientras valga el de fábrica
  pin_hash    text,
  pin_rounds  integer,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "ajustes propios" on public.settings;
create policy "ajustes propios" on public.settings
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- ------------------------------------------------------- campogramas
--  El equipo que cada uno monta con sus cromos: la formación elegida, quién
--  ocupa cada puesto del once, quién espera en el banquillo y cómo se llama
--  el equipo. Una fila por perfil que haya montado alguno.
--
--  El álbum de cromos no está aquí porque no hace falta: se deduce del
--  historial de retos. Esto sí, porque es una decisión y no un cálculo.

create table if not exists public.lineups (
  id          text primary key,          -- `${owner}:${profileId}`
  owner       uuid not null references auth.users (id) on delete cascade,
  profile_id  text not null,
  team_name   text not null default '',
  formation   text not null default '4-3-3',
  eleven      jsonb not null default '{}'::jsonb,  -- ranura -> cromo
  bench       jsonb not null default '[]'::jsonb,  -- cromos del banquillo
  captain     text,                      -- cromo con el brazalete
  updated_at  timestamptz not null default now()
);

create index if not exists lineups_owner_idx on public.lineups (owner, profile_id);

alter table public.lineups enable row level security;

drop policy if exists "campogramas propios" on public.lineups;
create policy "campogramas propios" on public.lineups
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- --------------------------------------------------------- agendas
--  La semana tipo de cada uno: los ratos apartados de lunes a domingo, con
--  el hábito al que va atado cada uno y —en los peques— quién está con ellos.
--  Una fila por perfil que tenga semana montada.
--
--  Es rutina, no cita: lo que ocurre una sola vez sigue viviendo en `tasks`,
--  que tiene fecha y se tacha. Por eso los ratos van en un `jsonb` y no en
--  una tabla de filas: se leen y se escriben siempre juntos, como el
--  campograma, y gana la agenda guardada más tarde.

create table if not exists public.agendas (
  id          text primary key,          -- `${owner}:${profileId}`
  owner       uuid not null references auth.users (id) on delete cascade,
  profile_id  text not null,
  blocks      jsonb not null default '[]'::jsonb,  -- los ratos de la semana
  updated_at  timestamptz not null default now()
);

create index if not exists agendas_owner_idx on public.agendas (owner, profile_id);

alter table public.agendas enable row level security;

drop policy if exists "agendas propias" on public.agendas;
create policy "agendas propias" on public.agendas
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- ---------------------------------------------------------- tiempo real
--  Sin esto, un aparato sólo se entera de lo que escriben los demás cuando
--  vuelve a mirar (al arrancar o en su repaso periódico). Añadiendo las
--  tablas a la publicación, Postgres avisa en el momento y lo registrado en
--  el móvil aparece en el portátil en un par de segundos, sin recargar.
--
--  Se comprueba antes de añadir para que relanzar el archivo no falle.

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['entries', 'tasks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

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
  updated_at  timestamptz not null default now()
);

create index if not exists entries_owner_day_idx on public.entries (owner, profile_id, day);

-- ------------------------------------------------------------- comidas
create table if not exists public.meals (
  id          text primary key,
  owner       uuid not null references auth.users (id) on delete cascade,
  profile_id  text not null,
  day         date not null,
  moment      text not null,
  score       numeric(3, 1) not null,
  title       text not null,
  summary     text not null default '',
  foods       jsonb not null default '[]'::jsonb,
  wins        jsonb not null default '[]'::jsonb,
  tweaks      jsonb not null default '[]'::jsonb,
  photo_path  text,                      -- objeto dentro del cubo `comidas`
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists meals_owner_day_idx on public.meals (owner, profile_id, day);

-- ------------------------------------------------------------ consejos
create table if not exists public.advice (
  id            text primary key,        -- `${profileId}:${YYYY-MM-DD}`
  owner         uuid not null references auth.users (id) on delete cascade,
  profile_id    text not null,
  day           date not null,
  summary       text not null default '',
  tips          jsonb not null default '[]'::jsonb,
  challenge     jsonb,                   -- reto de la próxima sesión
  challenge_done boolean not null default false,
  observations  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists advice_owner_day_idx on public.advice (owner, profile_id, day);

-- ---------------------------------------------------------- seguridad
--  Sin estas políticas la clave pública del navegador daría acceso a todo.

alter table public.entries enable row level security;
alter table public.meals   enable row level security;
alter table public.advice  enable row level security;

drop policy if exists "entries propias" on public.entries;
create policy "entries propias" on public.entries
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists "meals propias" on public.meals;
create policy "meals propias" on public.meals
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists "advice propios" on public.advice;
create policy "advice propios" on public.advice
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- ------------------------------------------------- fotos de las comidas
--  Cubo privado: las miniaturas sólo se sirven con una URL firmada.

insert into storage.buckets (id, name, public)
values ('comidas', 'comidas', false)
on conflict (id) do nothing;

drop policy if exists "fotos propias" on storage.objects;
create policy "fotos propias" on storage.objects
  for all to authenticated
  using (bucket_id = 'comidas' and owner = auth.uid())
  with check (bucket_id = 'comidas' and owner = auth.uid());

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

--  Cubo privado, como el de las comidas.

insert into storage.buckets (id, name, public)
values ('aspecto', 'aspecto', false)
on conflict (id) do nothing;

drop policy if exists "aspecto propio" on storage.objects;
create policy "aspecto propio" on storage.objects
  for all to authenticated
  using (bucket_id = 'aspecto' and owner = auth.uid())
  with check (bucket_id = 'aspecto' and owner = auth.uid());

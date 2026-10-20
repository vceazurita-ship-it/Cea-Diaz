-- ------------------------------------------------ permisos de Google Classroom
--  Una fila por niño enlazado (Leo y Hugo). Guarda el permiso de sólo
--  lectura de su cuenta del colegio y la última foto de sus clases.
--
--  Se protege igual que `calendar_links`: el token va cifrado con una clave
--  que sólo existe en el servidor, y la tabla tiene RLS activado y
--  **ninguna** política. El navegador no la lee nunca: la foto la sirve
--  `/api/classroom`, que usa la clave de servicio.
--
--  Se puede lanzar las veces que haga falta: no rompe nada si ya existe.
--  (El mismo bloque está al final de `supabase/schema.sql`.)

create table if not exists public.classroom_links (
  id            text primary key,          -- `${owner}:${profileId}`
  owner         uuid not null references auth.users (id) on delete cascade,
  profile_id    text not null check (profile_id in ('leo', 'hugo')),
  email         text not null default '',  -- cuenta del colegio enlazada
  refresh_token text not null,             -- cifrado (AES-256-GCM)
  snapshot      jsonb,                     -- la última foto de las clases
  sync_error    text,                      -- el último fallo al bajarlas
  synced_at     timestamptz,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists classroom_links_owner_idx on public.classroom_links (owner);

alter table public.classroom_links enable row level security;

--  Por si alguien hubiera abierto alguna a mano.
drop policy if exists "classroom propio" on public.classroom_links;

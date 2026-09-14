-- ============================================================
-- Fase 7: la moneda deja de elegirse por item, pasa a ser
-- una preferencia de cada usuario, visible en el header
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La preferencia NO va como columna de "profiles" a proposito.
--
-- Hoy la unica politica de update sobre profiles es "admin actualiza
-- roles". Para que cada usuario pudiera guardar su moneda habria que
-- abrir un update sobre su propia fila, y RLS trabaja por FILA, no por
-- columna: el mismo update que cambia la moneda podria cambiar "role".
-- Cualquier colaborador se ascenderia a admin con una sola consulta.
--
-- Con una tabla aparte el problema no existe: no hay ninguna columna
-- sensible que proteger.

create table if not exists public.preferencias_usuario (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  moneda public.moneda not null default 'VES',
  updated_at timestamptz not null default now()
);

alter table public.preferencias_usuario enable row level security;

drop policy if exists "cada usuario ve su preferencia" on public.preferencias_usuario;
create policy "cada usuario ve su preferencia"
  on public.preferencias_usuario for select
  using (auth.uid() = user_id);

drop policy if exists "cada usuario crea su preferencia" on public.preferencias_usuario;
create policy "cada usuario crea su preferencia"
  on public.preferencias_usuario for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada usuario actualiza su preferencia" on public.preferencias_usuario;
create policy "cada usuario actualiza su preferencia"
  on public.preferencias_usuario for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sin politica de delete: la fila se borra sola si se borra el perfil.

-- Los usuarios que ya existen arrancan en VES, que es el flujo con el que
-- se viene trabajando. Cada uno lo cambia desde el header cuando quiera.
insert into public.preferencias_usuario (user_id, moneda)
select p.id, 'VES'::public.moneda
from public.profiles p
on conflict (user_id) do nothing;

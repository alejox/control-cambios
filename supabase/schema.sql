-- ============================================================
-- Control de Cambios — esquema inicial
-- Pega este archivo completo en Supabase → SQL Editor → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type public.user_role as enum ('sin_acceso', 'colaborador', 'admin');
create type public.tipo_flujo as enum ('bs_a_usdt', 'cop_a_usdt');
create type public.moneda as enum ('VES', 'COP');
create type public.par_referencia as enum ('VES_USDT', 'USD_COP');

-- ---------- Perfiles (uno por usuario registrado) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'sin_acceso',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "ver propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin ve todos los perfiles"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "admin actualiza roles"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Cuando alguien se registra en auth.users, crear su fila en profiles
-- automáticamente, siempre con role = 'sin_acceso'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Items (cada cierre con Carlos) ----------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  tipo_flujo public.tipo_flujo not null,
  moneda_origen public.moneda not null,
  tasa numeric(14,4) not null,
  usdt_total numeric(14,2) not null check (usdt_total >= 0),
  comision numeric(14,2) generated always as (
    case when tipo_flujo = 'bs_a_usdt' then round(usdt_total * 0.14, 2) else 0 end
  ) stored,
  detalle text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;

create policy "colaborador y admin ven items"
  on public.items for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

create policy "solo admin escribe items"
  on public.items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Depósitos (sub-filas de cada item) ----------
create table public.depositos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  referencia text not null,
  fecha date not null,
  valor_origen numeric(14,2) not null,
  created_at timestamptz not null default now()
);

alter table public.depositos enable row level security;

create policy "colaborador y admin ven depositos"
  on public.depositos for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

create policy "solo admin escribe depositos"
  on public.depositos for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Tasas de referencia (P2P Binance VES/USDT, USD/COP) ----------
create table public.tasas_referencia (
  id uuid primary key default gen_random_uuid(),
  par public.par_referencia not null,
  valor numeric(14,4) not null,
  consultado_at timestamptz not null default now()
);

alter table public.tasas_referencia enable row level security;

create policy "colaborador y admin ven tasas"
  on public.tasas_referencia for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

create policy "solo admin escribe tasas"
  on public.tasas_referencia for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Índices ----------
create index on public.depositos (item_id);
create index on public.items (numero);
create index on public.tasas_referencia (par, consultado_at desc);

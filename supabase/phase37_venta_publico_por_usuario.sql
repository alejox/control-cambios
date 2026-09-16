-- ============================================================
-- Fase 37: la tasa y los medios de cobro son de cada usuario
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- El catálogo sigue siendo de los dos: las marcas, los grupos, los planes
-- con su ancla en dólares y los textos son el mismo producto revendido, y
-- si sube un precio en dólares tiene que subir para todos.
--
-- Lo que pasa a ser de cada uno es lo que realmente es de cada uno:
--
--   La tasa de venta, porque es el margen de quien vende.
--   Los medios de cobro, porque el Nequi de uno no es el del otro.
--
-- ADITIVA A PROPÓSITO: las columnas de tasa siguen en venta_publico_listas
-- sin tocar. En este proyecto ya se rompió producción migrando antes de
-- tener el front listo; primero existe la tabla nueva, después el front
-- deja de leer las viejas, y recién ahí se limpian.

create table if not exists public.venta_publico_lista_usuario (
  lista_id uuid not null references public.venta_publico_listas(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,

  -- El margen de quien vende, con la misma forma que tenía en la lista.
  tasa numeric(18,6),
  tasa_origen text check (tasa_origen in ('fuente', 'ajuste')),
  tasa_fuente text,
  tasa_detalle text,
  tasa_referencia numeric(18,6),
  tasa_referencia_at timestamptz,

  -- El bloque que reemplaza a {medios} en el pie del mensaje.
  medios_pago text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lista_id, user_id)
);

comment on table public.venta_publico_lista_usuario is
  'Lo propio de cada usuario en una lista: su tasa de venta y sus medios '
  'de cobro. El catálogo (marcas, planes, precio en dólares, textos) vive '
  'compartido en las otras tablas de venta_publico.';

comment on column public.venta_publico_lista_usuario.medios_pago is
  'Reemplaza al marcador {medios} del pie. Vacío = la lista todavía no se '
  'puede mandar: el cliente no sabría por dónde pagar.';

alter table public.venta_publico_lista_usuario enable row level security;

-- Cada uno ve y edita SOLO lo suyo. No es una preferencia de interfaz:
-- la tasa del otro es su margen, y el margen ajeno no se mira.
drop policy if exists "venta publico usuario lee lo suyo" on public.venta_publico_lista_usuario;
create policy "venta publico usuario lee lo suyo"
  on public.venta_publico_lista_usuario for select
  using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  );

drop policy if exists "venta publico usuario escribe lo suyo" on public.venta_publico_lista_usuario;
create policy "venta publico usuario escribe lo suyo"
  on public.venta_publico_lista_usuario for all
  using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  );

-- ---------- El punto de partida de cada uno ----------
-- Los dos arrancan con lo que hay hoy: la misma tasa y los mismos medios.
-- Nadie pierde sus precios, y desde acá cada uno se mueve por su lado.
--
-- El bloque de cobro se recorta del pie: es todo lo que va antes del
-- primer 📝, ⚠️ o *Ejemplo. Verificado en las 12 listas —- recortar y
-- volver a pegar devuelve el pie original byte por byte.
insert into public.venta_publico_lista_usuario
  (lista_id, user_id, tasa, tasa_origen, tasa_fuente, tasa_detalle,
   tasa_referencia, tasa_referencia_at, medios_pago)
select
  l.id, p.id, l.tasa, l.tasa_origen, l.tasa_fuente, l.tasa_detalle,
  l.tasa_referencia, l.tasa_referencia_at,
  coalesce(substring(l.pie from '^(.*?)\n\n(?:📝|⚠️|\*Ejemplo)'), '')
from public.venta_publico_listas l
cross join public.profiles p
where p.role in ('admin', 'colaborador')
on conflict (lista_id, user_id) do nothing;

-- ---------- El pie deja un hueco donde iban los medios ----------
-- Un marcador y no una posición fija: dónde va el bloque de cobro lo
-- decide el texto, igual que {monto} y {etiqueta} en la línea de precio.
update public.venta_publico_listas l
set pie = '{medios}' || substring(l.pie from '(\n\n(?:📝|⚠️|\*Ejemplo).*)$')
where substring(l.pie from '(\n\n(?:📝|⚠️|\*Ejemplo).*)$') is not null;

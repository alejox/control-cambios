-- ============================================================
-- Fase 8: liquidaciones — cerrar cuentas con Carlos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Una liquidacion cierra un corte de cuentas:
--   * Carlos debe pagar el TOTAL de las ventas (suma de usdt_total)
--   * se le debe a Carlos la suma de las comisiones
--   * el neto es la diferencia
--
-- Los totales quedan CONGELADOS en la fila. No se derivan de los items
-- al consultarlos: si dentro de un mes alguien corrige la tasa de un
-- cierre viejo, una liquidacion ya cerrada no puede cambiar de monto.
-- Eso ya se acordo con Carlos.

create table if not exists public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  fecha date not null default current_date,
  cantidad_items integer not null,
  -- Lo que Carlos paga: el total de las ventas.
  total_usdt numeric(14,2) not null,
  -- Lo que se le entrega a Carlos: la suma de sus comisiones.
  total_comision numeric(14,2) not null,
  -- total_usdt - total_comision. Se guarda calculado para no repetir
  -- la resta en cada pantalla y que alguna la haga distinta.
  total_neto numeric(14,2) not null,
  notas text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- on delete set null: borrar una liquidacion devuelve sus items a
-- pendiente. Es la unica forma de deshacer un corte mal hecho.
alter table public.items
  add column if not exists liquidacion_id uuid
  references public.liquidaciones(id) on delete set null;

create index if not exists items_liquidacion_id_idx
  on public.items (liquidacion_id);

alter table public.liquidaciones enable row level security;

drop policy if exists "colaborador y admin ven liquidaciones" on public.liquidaciones;
create policy "colaborador y admin ven liquidaciones"
  on public.liquidaciones for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

drop policy if exists "solo admin escribe liquidaciones" on public.liquidaciones;
create policy "solo admin escribe liquidaciones"
  on public.liquidaciones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Liquidar ----------
-- Los totales se calculan ACA, leyendo los items. El cliente nunca manda
-- los montos: si los mandara, un navegador podria declarar la comision
-- que se le antoje.
create or replace function public.liquidar_pendientes(
  p_fecha date default current_date,
  p_notas text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_numero integer;
  v_ids uuid[];
  v_cantidad integer;
  v_usdt numeric(14,2);
  v_comision numeric(14,2);
begin
  -- Se capturan los IDS, no solo los totales. Si se contara con un where
  -- y despues se actualizara con el mismo where, un item insertado en el
  -- medio quedaria sellado sin estar sumado en los totales congelados.
  select array_agg(id), count(*), coalesce(sum(usdt_total), 0), coalesce(sum(comision), 0)
    into v_ids, v_cantidad, v_usdt, v_comision
    from public.items
   where liquidacion_id is null;

  if v_cantidad = 0 then
    raise exception 'No hay cierres pendientes de liquidar.';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.liquidaciones;

  insert into public.liquidaciones (
    numero, fecha, cantidad_items, total_usdt, total_comision, total_neto,
    notas, created_by
  )
  values (
    v_numero, coalesce(p_fecha, current_date), v_cantidad, v_usdt, v_comision,
    v_usdt - v_comision, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  returning id into v_id;

  -- Exactamente los items que se sumaron, ni uno mas.
  update public.items
     set liquidacion_id = v_id
   where id = any(v_ids);

  return v_id;
end;
$$;

grant execute on function public.liquidar_pendientes to authenticated;

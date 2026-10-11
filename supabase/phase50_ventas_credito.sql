-- ============================================================
-- Fase 50: ventas de créditos que se cruzan en la liquidación
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez; es idempotente, correrlo dos veces no rompe nada)
-- ============================================================
--
-- El lado Bs (el admin, dueño del producto) le vende créditos / USDT al
-- lado COP. Hasta acá esa venta se pagaba por fuera de la app, aunque casi
-- siempre el lado COP tiene saldo a favor en el corte. Pagar por fuera
-- algo que se puede descontar adentro es mover plata dos veces.
--
-- Una venta es un número que el lado COP le debe al lado Bs. Por eso entra
-- en el neto SUMANDO a favor de Bs:
--
--   neto = (usdt_bs - comision_bs) - (usdt_cop - comision_cop) + ventas
--
-- Ejemplo: una venta de 69 USDT sube el neto en 69. Si el corte daba -100
-- (100 a favor de COP), con la venta da -31.
--
-- Reglas del negocio:
--   * La registra solo el admin. No pasa por aprobación ni lleva comisión.
--   * La descripción es opcional.
--   * Una vez liquidada no se toca: misma pared que la fase 24 puso a items.
--
-- LA FIRMA DE liquidar_pendientes NO CAMBIA: el front desplegado la sigue
-- llamando igual. liquidaciones gana una columna con default 0, así que
-- los cortes viejos quedan exactamente con el neto que tenían.

-- ---------- Tabla ----------
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  usdt numeric(14,2) not null check (usdt > 0),
  fecha date not null default current_date,
  descripcion text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  -- Mismo FK que items: on delete set null. El trigger de abajo igual
  -- frena ese camino para una venta liquidada (ver fase 24).
  liquidacion_id uuid references public.liquidaciones(id) on delete set null
);

create index if not exists ventas_liquidacion_id_idx
  on public.ventas (liquidacion_id);

-- ---------- RLS ----------
alter table public.ventas enable row level security;

-- Las dos partes ven las ventas: el lado COP tiene que ver qué se le va a
-- descontar antes de que se descuente.
drop policy if exists "colaborador y admin ven ventas" on public.ventas;
create policy "colaborador y admin ven ventas"
  on public.ventas for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

-- Solo el admin escribe. Separadas por operación para que el select de
-- arriba no quede mezclado con un "for all".
drop policy if exists "solo admin crea ventas" on public.ventas;
create policy "solo admin crea ventas"
  on public.ventas for insert
  with check (public.is_admin());

drop policy if exists "solo admin edita ventas" on public.ventas;
create policy "solo admin edita ventas"
  on public.ventas for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "solo admin borra ventas" on public.ventas;
create policy "solo admin borra ventas"
  on public.ventas for delete
  using (public.is_admin());

-- ---------- Lo liquidado no se toca ----------
-- Copia del criterio de items_liquidados_son_inmutables (fase 24):
--   * una venta liquidada no se borra (el corte quedaría con total_ventas
--     congelado contando algo que ya no existe);
--   * no sale de su corte ni se muda a otro (incluido el SET NULL de
--     borrar la liquidación: hoy no hay "deshacer liquidación");
--   * sus números no cambian. La descripción sí: es texto libre.
-- liquidar_pendientes escribe liquidacion_id sobre ventas que en ese
-- momento lo tienen en null, así que este trigger no le estorba.
create or replace function public.ventas_liquidadas_son_inmutables()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.liquidacion_id is not null then
      raise exception 'La venta ya está liquidada: no se puede eliminar.';
    end if;
    return old;
  end if;

  if old.liquidacion_id is null then
    return new;
  end if;

  if new.liquidacion_id is distinct from old.liquidacion_id then
    raise exception
      'La venta ya está liquidada: no se puede sacar de su corte ni moverla a otro.';
  end if;

  if new.usdt          is distinct from old.usdt
     or new.fecha      is distinct from old.fecha
     or new.created_by is distinct from old.created_by then
    raise exception 'La venta ya está liquidada: sus números no se pueden cambiar.';
  end if;

  return new;
end;
$$;

drop trigger if exists ventas_liquidadas_inmutables on public.ventas;
create trigger ventas_liquidadas_inmutables
  before update or delete on public.ventas
  for each row execute function public.ventas_liquidadas_son_inmutables();

comment on function public.ventas_liquidadas_son_inmutables() is
  'Guardia de tabla: una venta ya liquidada no cambia sus números, no sale '
  'de su corte y no se borra. Vale también para la service_role.';

-- ---------- El corte congela el total de ventas ----------
alter table public.liquidaciones
  add column if not exists total_ventas numeric(14,2) not null default 0;

-- ---------- Liquidar ----------
-- Misma función que la desplegada en producción (fase 16 + la guardia de
-- movimientos sin aprobar), con las ventas sumadas. Lo que no cambia:
--   * security invoker: la autorización la da RLS (solo admin escribe
--     liquidaciones, items y ventas);
--   * se capturan los IDS además de los totales, para sellar exactamente
--     lo que se sumó y nada que entre en el medio;
--   * numeración correlativa.
-- Lo nuevo: un corte puede tener solo ventas y ningún movimiento. Una
-- venta pendiente es plata que se debe; que no haya movimientos ese mes no
-- es motivo para no poder saldarla.
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
  v_usdt_bs numeric(14,2);
  v_usdt_cop numeric(14,2);
  v_com_bs numeric(14,2);
  v_com_cop numeric(14,2);
  v_venta_ids uuid[];
  v_cantidad_ventas integer;
  v_ventas numeric(14,2);
  v_sin_revisar integer;
begin
  -- Guardia que vive en la base de producción pero en ninguna fase del
  -- repo (se agregó a mano en el SQL Editor): no se liquida mientras quede
  -- un movimiento sin aprobar. Se conserva tal cual. Las ventas no pasan
  -- por aprobación, así que no cuentan acá.
  select count(*) into v_sin_revisar
    from public.items
   where liquidacion_id is null and revisado_at is null;

  if v_sin_revisar > 0 then
    raise exception
      'Faltan % movimiento(s) por aprobar. No se puede liquidar hasta que la contraparte revise todo.',
      v_sin_revisar;
  end if;

  select array_agg(id), count(*),
         coalesce(sum(usdt_total), 0),
         coalesce(sum(comision), 0),
         coalesce(sum(usdt_total) filter (where tipo_flujo = 'bs_a_usdt'), 0),
         coalesce(sum(usdt_total) filter (where tipo_flujo = 'cop_a_usdt'), 0),
         coalesce(sum(comision)   filter (where tipo_flujo = 'bs_a_usdt'), 0),
         coalesce(sum(comision)   filter (where tipo_flujo = 'cop_a_usdt'), 0)
    into v_ids, v_cantidad, v_usdt, v_comision,
         v_usdt_bs, v_usdt_cop, v_com_bs, v_com_cop
    from public.items
   where liquidacion_id is null;

  -- Se bloquean las ventas pendientes antes de sumarlas: sin esto, un
  -- borrado concurrente entre la suma y el sellado dejaría el corte con un
  -- total_ventas que cuenta una venta que ya no existe.
  perform 1 from public.ventas where liquidacion_id is null for update;

  select array_agg(id), count(*), coalesce(sum(usdt), 0)
    into v_venta_ids, v_cantidad_ventas, v_ventas
    from public.ventas
   where liquidacion_id is null;

  if v_cantidad = 0 and v_cantidad_ventas = 0 then
    raise exception 'No hay cierres pendientes de liquidar.';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.liquidaciones;

  insert into public.liquidaciones (
    numero, fecha, cantidad_items, total_usdt, total_comision, total_neto,
    usdt_bs, usdt_cop, comision_bs, comision_cop, total_ventas,
    notas, created_by
  )
  values (
    v_numero, coalesce(p_fecha, current_date), v_cantidad, v_usdt, v_comision,
    -- Negativo: el saldo quedó del lado COP. La venta suma a favor de Bs.
    (v_usdt_bs - v_com_bs) - (v_usdt_cop - v_com_cop) + v_ventas,
    v_usdt_bs, v_usdt_cop, v_com_bs, v_com_cop, v_ventas,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  returning id into v_id;

  if v_cantidad > 0 then
    update public.items
       set liquidacion_id = v_id
     where id = any(v_ids);
  end if;

  -- Exactamente las ventas que se sumaron, ni una más.
  if v_cantidad_ventas > 0 then
    update public.ventas
       set liquidacion_id = v_id
     where id = any(v_venta_ids);
  end if;

  return v_id;
end;
$$;

-- create or replace conserva los permisos, pero se reafirma por si esta
-- fase corre en una base donde la fase 46 cerró todo a PUBLIC.
grant execute on function public.liquidar_pendientes(date, text) to authenticated;

-- ---------- Realtime ----------
-- Los items ya se publican (fase 40) para que la otra parte se entere sin
-- recargar. Una venta nueva cambia el neto pendiente igual que un
-- movimiento, así que se publica con el mismo criterio. Se chequea antes
-- porque "add table" sobre una tabla ya publicada revienta.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'ventas'
     ) then
    execute 'alter publication supabase_realtime add table public.ventas';
  end if;
end $$;

-- ============================================================
-- Fase 51: las ventas de créditos comparten la numeración de los movimientos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez; es idempotente, correrlo dos veces no rompe nada)
-- ============================================================
--
-- Una venta de créditos (fase 50) es, para las dos partes, un movimiento
-- más del corte: se nombra igual que los demás ("fijate el 44"). Por eso
-- lleva un número de la MISMA serie que items:
--
--   * entre lo pendiente, un número lo usa un movimiento O una venta,
--     nunca los dos;
--   * dentro de un corte cerrado, lo mismo, por corte (fase 9);
--   * al liquidar, la serie vuelve a empezar, igual que la de items.
--
-- La unicidad dentro de cada tabla la dan índices únicos parciales, copia
-- de los de items. La unicidad ENTRE las dos tablas no la puede dar un
-- índice, así que la dan dos triggers simétricos que toman el mismo lock
-- consultivo que ya usa crear_item_desde_bot (fase 18/20): con eso un
-- movimiento y una venta cargados al mismo tiempo no se llevan el mismo
-- número.
--
-- Lo que ya existe se numera solo: la venta pendiente toma el número que
-- sigue al último pendiente (hoy, la de 69 USDT queda como #44).

-- ---------- Columna ----------
alter table public.ventas add column if not exists numero integer;

-- ---------- Numerar lo que ya existe ----------
-- Pendientes: a continuación del mayor número pendiente de las dos tablas,
-- en orden de fecha y de carga.
with base as (
  select greatest(
    (select coalesce(max(numero), 0) from public.items  where liquidacion_id is null),
    (select coalesce(max(numero), 0) from public.ventas where liquidacion_id is null)
  ) as ultimo
),
orden as (
  select v.id,
         row_number() over (order by v.fecha, v.created_at, v.id) as n
    from public.ventas v
   where v.liquidacion_id is null and v.numero is null
)
update public.ventas v
   set numero = base.ultimo + orden.n
  from orden, base
 where v.id = orden.id;

-- Liquidadas: dentro de su corte, después del último movimiento de ese
-- corte. El trigger de inmutabilidad todavía no mira numero (eso cambia
-- más abajo), así que este update pasa.
with base as (
  select c.liquidacion_id,
         greatest(
           (select coalesce(max(i.numero), 0) from public.items i
             where i.liquidacion_id = c.liquidacion_id),
           (select coalesce(max(v2.numero), 0) from public.ventas v2
             where v2.liquidacion_id = c.liquidacion_id)
         ) as ultimo
    from (select distinct liquidacion_id from public.ventas
           where liquidacion_id is not null and numero is null) c
),
orden as (
  select v.id, v.liquidacion_id,
         row_number() over (
           partition by v.liquidacion_id
           order by v.fecha, v.created_at, v.id
         ) as n
    from public.ventas v
   where v.liquidacion_id is not null and v.numero is null
)
update public.ventas v
   set numero = base.ultimo + orden.n
  from orden
  join base on base.liquidacion_id = orden.liquidacion_id
 where v.id = orden.id;

alter table public.ventas alter column numero set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ventas_numero_positivo'
       and conrelid = 'public.ventas'::regclass
  ) then
    alter table public.ventas
      add constraint ventas_numero_positivo check (numero > 0);
  end if;
end $$;

-- ---------- Unicidad dentro de ventas (copia de items, fase 9) ----------
create unique index if not exists ventas_numero_pendiente_idx
  on public.ventas (numero)
  where liquidacion_id is null;

create unique index if not exists ventas_numero_por_liquidacion_idx
  on public.ventas (liquidacion_id, numero)
  where liquidacion_id is not null;

-- ---------- Unicidad entre items y ventas ----------
-- security definer: la guardia tiene que ver TODAS las filas de la otra
-- tabla, no las que RLS le deje ver a quien carga. El código de error es
-- unique_violation (23505), así el reintento de crear_item_desde_bot lo
-- trata igual que un choque de índice.
create or replace function public.items_numero_no_choca_con_ventas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  if new.liquidacion_id is null then
    if exists (
      select 1 from public.ventas v
       where v.liquidacion_id is null and v.numero = new.numero
    ) then
      raise exception 'El número % ya lo usa una venta pendiente.', new.numero
        using errcode = 'unique_violation';
    end if;
  elsif exists (
    select 1 from public.ventas v
     where v.liquidacion_id = new.liquidacion_id and v.numero = new.numero
  ) then
    raise exception 'El número % ya lo usa una venta de ese corte.', new.numero
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create or replace function public.ventas_numero_no_choca_con_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  if new.liquidacion_id is null then
    if exists (
      select 1 from public.items i
       where i.liquidacion_id is null and i.numero = new.numero
    ) then
      raise exception 'El número % ya lo usa un movimiento pendiente.', new.numero
        using errcode = 'unique_violation';
    end if;
  elsif exists (
    select 1 from public.items i
     where i.liquidacion_id = new.liquidacion_id and i.numero = new.numero
  ) then
    raise exception 'El número % ya lo usa un movimiento de ese corte.', new.numero
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists items_numero_unico_con_ventas on public.items;
create trigger items_numero_unico_con_ventas
  before insert or update of numero, liquidacion_id on public.items
  for each row execute function public.items_numero_no_choca_con_ventas();

drop trigger if exists ventas_numero_unico_con_items on public.ventas;
create trigger ventas_numero_unico_con_items
  before insert or update of numero, liquidacion_id on public.ventas
  for each row execute function public.ventas_numero_no_choca_con_items();

-- Funciones de trigger: fuera de la API pública, como dejó la fase 46.
revoke execute on function public.items_numero_no_choca_con_ventas() from public, anon, authenticated;
revoke execute on function public.ventas_numero_no_choca_con_items() from public, anon, authenticated;

-- ---------- Lo liquidado no se toca: ahora tampoco su número ----------
-- Misma función de la fase 50, con numero entre los campos congelados.
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
     or new.numero     is distinct from old.numero
     or new.created_by is distinct from old.created_by then
    raise exception 'La venta ya está liquidada: sus números no se pueden cambiar.';
  end if;

  return new;
end;
$$;

-- ---------- El bot numera mirando también las ventas ----------
-- Misma función de la fase 20; lo único que cambia es el cálculo del
-- número: el mayor pendiente entre items Y ventas. Sin esto el bot
-- propondría un número que ya tiene una venta, el trigger de arriba lo
-- rechazaría y los tres reintentos chocarían igual.
create or replace function public.crear_item_desde_bot(
  p_user_id uuid,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.user_role;
  v_config_pct numeric;
  v_numero integer;
  v_item_id uuid;
  v_intento integer;
begin
  if p_user_id is null then
    raise exception 'Falta la cuenta a la que atribuir el movimiento.';
  end if;

  select role into v_rol from public.profiles where id = p_user_id;

  if v_rol is null then
    raise exception 'Esa cuenta no existe.';
  end if;
  if v_rol not in ('admin', 'colaborador') then
    raise exception 'Tu cuenta no tiene permiso para registrar movimientos.';
  end if;

  if v_rol = 'colaborador' and p_tipo_flujo <> 'cop_a_usdt' then
    raise exception 'Tu cuenta solo puede registrar movimientos COP → USDT.';
  end if;

  if (p_tipo_flujo = 'bs_a_usdt' and p_moneda_origen <> 'VES')
     or (p_tipo_flujo = 'cop_a_usdt' and p_moneda_origen <> 'COP') then
    raise exception 'El tipo de flujo y la moneda no coinciden.';
  end if;

  if p_usdt_total is null or p_usdt_total <= 0 then
    raise exception 'El total en USDT debe ser mayor que cero.';
  end if;
  if p_tasa is not null and p_tasa <= 0 then
    raise exception 'La tasa debe ser mayor que cero.';
  end if;
  if jsonb_array_length(coalesce(p_depositos, '[]'::jsonb)) = 0 then
    raise exception 'El movimiento necesita al menos un depósito.';
  end if;

  -- Misma regla que en la RPC de la web: la comisión sale de la columna
  -- de la moneda del cierre.
  select case
           when p_tipo_flujo = 'bs_a_usdt' then c.comision_bs_pct
           else c.comision_cop_pct
         end
    into v_config_pct
    from public.configuracion c
   where c.id;

  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  for v_intento in 1..3 loop
    -- Movimientos y ventas comparten la serie (fase 51).
    select greatest(
             (select coalesce(max(i.numero), 0) from public.items i
               where i.liquidacion_id is null),
             (select coalesce(max(v.numero), 0) from public.ventas v
               where v.liquidacion_id is null)
           ) + 1
      into v_numero;

    begin
      insert into public.items (
        numero, tipo_flujo, moneda_origen, tasa, usdt_total,
        comision_pct, detalle, fecha, created_by
      )
      values (
        v_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total,
        v_config_pct, p_detalle, p_fecha, p_user_id
      )
      returning id into v_item_id;

      exit;
    exception when unique_violation then
      if v_intento = 3 then
        raise;
      end if;
      v_item_id := null;
    end;
  end loop;

  insert into public.depositos (
    item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto
  )
  select
    v_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', ''),
    nullif(d->>'comprobante_texto', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;

  return jsonb_build_object('item_id', v_item_id, 'numero', v_numero);
end;
$$;

-- create or replace conserva los permisos; se reafirma lo de la fase 46:
-- solo el webhook (service_role) llama al bot.
revoke execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) from public, anon, authenticated;
grant execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) to service_role;

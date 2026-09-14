-- ============================================================
-- Fase 10: el comprobante pegado como texto tambien es comprobante
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Hasta ahora un deposito solo podia respaldarse con un archivo. Los
-- comprobantes que llegan por WhatsApp como texto quedaban marcados "sin
-- comprobante", que es falso: el respaldo existe, solo que no es una
-- imagen.
--
-- Se guarda el texto completo, no un booleano: el texto ES la prueba, y
-- asi se puede volver a leer despues.

alter table public.depositos
  add column if not exists comprobante_texto text;

-- ---------- RPCs ----------
-- Misma firma: el texto viaja adentro del jsonb de depositos.
create or replace function public.crear_item_con_depositos(
  p_numero integer,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
  v_config_pct numeric;
begin
  select c.comision_pct into v_config_pct from public.configuracion c where c.id;

  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  insert into public.items (
    numero, tipo_flujo, moneda_origen, tasa, usdt_total,
    comision_pct, detalle, fecha, created_by
  )
  values (
    p_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total,
    v_config_pct, p_detalle, p_fecha, auth.uid()
  )
  returning id into v_item_id;

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

  return v_item_id;
end;
$$;

create or replace function public.actualizar_item_con_depositos(
  p_item_id uuid,
  p_numero integer,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.items set
    numero = p_numero,
    tipo_flujo = p_tipo_flujo,
    moneda_origen = p_moneda_origen,
    tasa = p_tasa,
    usdt_total = p_usdt_total,
    detalle = p_detalle,
    fecha = p_fecha
  where id = p_item_id;

  delete from public.depositos where item_id = p_item_id;

  insert into public.depositos (
    item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto
  )
  select
    p_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', ''),
    nullif(d->>'comprobante_texto', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;
end;
$$;

grant execute on function public.crear_item_con_depositos to authenticated;
grant execute on function public.actualizar_item_con_depositos to authenticated;

-- ============================================================
-- Fase 4: soporte para crear/editar/eliminar items desde la app
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Ajustes al esquema: la fecha del cierre no existia como columna
-- propia de "items", y no todo item/deposito trae tasa o referencia.
alter table public.items add column if not exists fecha date;
alter table public.items alter column tasa drop not null;
alter table public.depositos alter column referencia drop not null;

-- Crea un item junto con sus depositos en una sola operacion atomica
-- (o se guardan los dos o no se guarda nada). Corre con los permisos
-- de quien la llama (security invoker), asi que las políticas de RLS
-- de "items"/"depositos" se siguen aplicando exactamente igual.
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
begin
  insert into public.items (numero, tipo_flujo, moneda_origen, tasa, usdt_total, detalle, fecha, created_by)
  values (p_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total, p_detalle, p_fecha, auth.uid())
  returning id into v_item_id;

  insert into public.depositos (item_id, referencia, fecha, valor_origen)
  select v_item_id, nullif(d->>'referencia', ''), (d->>'fecha')::date, (d->>'valor_origen')::numeric
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;

  return v_item_id;
end;
$$;

-- Actualiza un item existente y reemplaza por completo su lista de
-- depositos (mas simple y predecible que comparar cual deposito
-- cambio, se agrego o se borro).
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

  insert into public.depositos (item_id, referencia, fecha, valor_origen)
  select p_item_id, nullif(d->>'referencia', ''), (d->>'fecha')::date, (d->>'valor_origen')::numeric
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;
end;
$$;

grant execute on function public.crear_item_con_depositos to authenticated;
grant execute on function public.actualizar_item_con_depositos to authenticated;

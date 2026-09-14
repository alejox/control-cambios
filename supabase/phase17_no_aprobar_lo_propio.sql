-- ============================================================
-- Fase 17: nadie aprueba sus propios movimientos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La regla del negocio: lo que va de Bs a USDT lo aprueba la parte que
-- trabaja en COP, y al reves.
--
-- Se implementa como "nadie aprueba lo que el mismo cargo" y no como "el
-- de COP aprueba lo de Bs", por dos razones:
--   1. Da el mismo resultado: cada parte sube su propio flujo.
--   2. No depende del selector de moneda, que es una preferencia de
--      interfaz y se cambia de un clic. Esto es una invariante.
--
-- Y es, al final, lo que significa revisar: que lo mire otro.

create or replace function public.revisar_item(
  p_item_id uuid,
  p_usdt_total numeric default null,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.user_role;
  v_liquidacion uuid;
  v_creador uuid;
  v_actual numeric(14,2);
  v_original numeric(14,2);
begin
  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para revisar movimientos.';
  end if;

  select liquidacion_id, usdt_total, usdt_original, created_by
    into v_liquidacion, v_actual, v_original, v_creador
    from public.items where id = p_item_id;

  if not found then
    raise exception 'Ese movimiento no existe.';
  end if;

  if v_creador = auth.uid() then
    raise exception 'No podés aprobar un movimiento que cargaste vos.';
  end if;

  if v_liquidacion is not null then
    raise exception 'Ese movimiento ya está liquidado y no se puede ajustar.';
  end if;

  if p_usdt_total is not null and p_usdt_total <= 0 then
    raise exception 'El total en USDT debe ser mayor que cero.';
  end if;

  update public.items set
    usdt_original = case
      when p_usdt_total is not null and p_usdt_total <> v_actual
        then coalesce(v_original, v_actual)
      else usdt_original
    end,
    usdt_total = coalesce(p_usdt_total, usdt_total),
    nota_revision = nullif(btrim(coalesce(p_nota, '')), ''),
    revisado_at = now(),
    revisado_por = auth.uid()
  where id = p_item_id;
end;
$$;

create or replace function public.revisar_depositos(
  p_item_id uuid,
  p_depositos jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.user_role;
  v_liquidacion uuid;
  v_creador uuid;
  v_total_actual numeric(14,2);
  v_total_origen numeric;
  v_nuevo_total numeric(14,2);
  v_faltan integer;
begin
  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para revisar movimientos.';
  end if;

  select liquidacion_id, usdt_total, created_by
    into v_liquidacion, v_total_actual, v_creador
    from public.items where id = p_item_id;

  if not found then
    raise exception 'Ese movimiento no existe.';
  end if;

  if v_creador = auth.uid() then
    raise exception 'No podés aprobar un movimiento que cargaste vos.';
  end if;

  if v_liquidacion is not null then
    raise exception 'Ese movimiento ya está liquidado y no se puede ajustar.';
  end if;

  if jsonb_array_length(coalesce(p_depositos, '[]'::jsonb)) = 0 then
    raise exception 'No seleccionaste ningún comprobante.';
  end if;

  select sum(valor_origen) into v_total_origen
    from public.depositos where item_id = p_item_id;

  if coalesce(v_total_origen, 0) <= 0 then
    raise exception 'Ese movimiento no tiene depósitos con monto.';
  end if;

  update public.depositos d set
    usdt = coalesce(
      (e->>'usdt')::numeric,
      round(v_total_actual * d.valor_origen / v_total_origen, 2)
    ),
    aprobado_at = now(),
    aprobado_por = auth.uid()
  from jsonb_array_elements(p_depositos) as e
  where d.id = (e->>'id')::uuid
    and d.item_id = p_item_id
    and ((e->>'usdt') is null or (e->>'usdt')::numeric > 0);

  select round(sum(
           coalesce(d.usdt, v_total_actual * d.valor_origen / v_total_origen)
         ), 2)
    into v_nuevo_total
    from public.depositos d
   where d.item_id = p_item_id;

  select count(*) into v_faltan
    from public.depositos
   where item_id = p_item_id and aprobado_at is null;

  update public.items set
    usdt_original = case
      when v_nuevo_total is distinct from usdt_total
        then coalesce(usdt_original, usdt_total)
      else usdt_original
    end,
    usdt_total = coalesce(v_nuevo_total, usdt_total),
    revisado_at = case when v_faltan = 0 then now() else revisado_at end,
    revisado_por = case when v_faltan = 0 then auth.uid() else revisado_por end
  where id = p_item_id;
end;
$$;

revoke execute on function public.revisar_item(uuid, numeric, text) from anon;
revoke execute on function public.revisar_depositos(uuid, jsonb) from anon;
grant execute on function public.revisar_item(uuid, numeric, text) to authenticated;
grant execute on function public.revisar_depositos(uuid, jsonb) to authenticated;

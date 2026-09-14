-- ============================================================
-- Fase 13: aprobar comprobantes en lote, sin deriva del total
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Aprobar de a un deposito hacia DERIVAR el total del movimiento.
--
-- Con total 10 y depositos de 3000 y 7000:
--   apruebo A fijando 4      -> total = 4 + (10 * 0.7) = 11
--   apruebo B sin tocar nada -> total = 4 + (11 * 0.7) = 11.70
-- B se movio solo, porque su parte se recalculaba sobre un total que ya
-- habia cambiado.
--
-- Se arregla de dos formas a la vez:
--   1. Al aprobar, el USDT del deposito se MATERIALIZA. Si no se escribio
--      uno, se guarda su proporcion actual. Un deposito aprobado ya no
--      depende de un calculo que pueda moverse despues.
--   2. El lote entero se aprueba en una sola llamada, prorrateando todos
--      sobre el MISMO total de partida.

drop function if exists public.revisar_deposito(uuid, numeric);

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
  v_total_actual numeric(14,2);
  v_total_origen numeric;
  v_nuevo_total numeric(14,2);
  v_faltan integer;
begin
  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para revisar movimientos.';
  end if;

  select liquidacion_id, usdt_total into v_liquidacion, v_total_actual
    from public.items where id = p_item_id;

  if not found then
    raise exception 'Ese movimiento no existe.';
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

  -- Todos se prorratean sobre el mismo total de partida, y el valor queda
  -- FIJADO: de aca en mas ese deposito vale eso, no una proporcion.
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

  -- Los ya aprobados aportan su valor fijo; los que faltan, su proporcion.
  select round(sum(
           coalesce(
             d.usdt,
             v_total_actual * d.valor_origen / v_total_origen
           )
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

revoke execute on function public.revisar_depositos(uuid, jsonb) from anon;
grant execute on function public.revisar_depositos(uuid, jsonb) to authenticated;

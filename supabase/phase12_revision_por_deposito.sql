-- ============================================================
-- Fase 12: la revisión baja al nivel de comprobante
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Carlos aprueba deposito por deposito, no el movimiento entero. En cada
-- uno puede escribir el USDT real que convirtio, o solo tildarlo si esta
-- bien. Cuando estan todos aprobados, el movimiento queda revisado.

alter table public.depositos
  add column if not exists usdt numeric(14,2),
  add column if not exists aprobado_at timestamptz,
  add column if not exists aprobado_por uuid references public.profiles(id);

create index if not exists depositos_aprobado_at_idx
  on public.depositos (item_id)
  where aprobado_at is null;

-- ---------- Aprobar un deposito ----------
-- security definer por lo mismo que revisar_item: la politica de items y
-- depositos solo deja escribir al admin, y RLS trabaja por FILA, no por
-- columna. Esta funcion valida el rol y toca unicamente lo que debe.
create or replace function public.revisar_deposito(
  p_deposito_id uuid,
  p_usdt numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.user_role;
  v_item_id uuid;
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

  select d.item_id, i.liquidacion_id, i.usdt_total
    into v_item_id, v_liquidacion, v_total_actual
    from public.depositos d
    join public.items i on i.id = d.item_id
   where d.id = p_deposito_id;

  if not found then
    raise exception 'Ese depósito no existe.';
  end if;

  if v_liquidacion is not null then
    raise exception 'Ese movimiento ya está liquidado y no se puede ajustar.';
  end if;

  if p_usdt is not null and p_usdt <= 0 then
    raise exception 'El USDT del depósito debe ser mayor que cero.';
  end if;

  update public.depositos set
    usdt = coalesce(p_usdt, usdt),
    aprobado_at = now(),
    aprobado_por = auth.uid()
  where id = p_deposito_id;

  select sum(valor_origen) into v_total_origen
    from public.depositos where item_id = v_item_id;

  -- El total del movimiento se rearma sumando lo que Carlos fijo. Los
  -- depositos que todavia no tienen USDT propio aportan su parte
  -- proporcional del total actual, asi tildar sin escribir no mueve nada.
  select round(sum(
           coalesce(
             d.usdt,
             case when coalesce(v_total_origen, 0) > 0
               then v_total_actual * d.valor_origen / v_total_origen
               else 0
             end
           )
         ), 2)
    into v_nuevo_total
    from public.depositos d
   where d.item_id = v_item_id;

  select count(*) into v_faltan
    from public.depositos
   where item_id = v_item_id and aprobado_at is null;

  update public.items set
    usdt_original = case
      when v_nuevo_total is distinct from usdt_total
        then coalesce(usdt_original, usdt_total)
      else usdt_original
    end,
    usdt_total = coalesce(v_nuevo_total, usdt_total),
    -- El movimiento queda revisado recien cuando no falta ningun deposito.
    revisado_at = case when v_faltan = 0 then now() else revisado_at end,
    revisado_por = case when v_faltan = 0 then auth.uid() else revisado_por end
  where id = v_item_id;
end;
$$;

revoke execute on function public.revisar_deposito(uuid, numeric) from anon;
grant execute on function public.revisar_deposito(uuid, numeric) to authenticated;

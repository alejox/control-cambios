-- ============================================================
-- Fase 16: la liquidación separa los dos flujos y saca el neto
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- El negocio es simetrico: una parte recibe pagos en Bs y le da comision a
-- la otra; la otra recibe en COP y le da la misma comision a la primera.
-- Los dos suben comprobantes, y el saldo puede quedar a favor de cualquiera.
--
-- Por eso la liquidacion deja de ser "uno paga y el otro cobra": guarda
-- cada flujo por separado y el neto es la RESTA. Si da negativo, el saldo
-- quedo del otro lado. Todo en USDT, que es la tasa intermedia comun.
--
--   neto = (usdt_bs - comision_bs) - (usdt_cop - comision_cop)

alter table public.liquidaciones
  add column if not exists usdt_bs numeric(14,2) not null default 0,
  add column if not exists usdt_cop numeric(14,2) not null default 0,
  add column if not exists comision_bs numeric(14,2) not null default 0,
  add column if not exists comision_cop numeric(14,2) not null default 0;

-- Los cortes ya cerrados eran todos de Bs. Con cop en cero, la formula
-- nueva da exactamente el mismo neto que ya tenian: no se reescribe nada.
update public.liquidaciones
   set usdt_bs = total_usdt, comision_bs = total_comision
 where usdt_bs = 0 and usdt_cop = 0;

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
begin
  -- Se capturan los IDS, no solo los totales: contar con un where y
  -- actualizar con el mismo where dejaria entrar un item en el medio.
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

  if v_cantidad = 0 then
    raise exception 'No hay cierres pendientes de liquidar.';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.liquidaciones;

  insert into public.liquidaciones (
    numero, fecha, cantidad_items, total_usdt, total_comision, total_neto,
    usdt_bs, usdt_cop, comision_bs, comision_cop, notas, created_by
  )
  values (
    v_numero, coalesce(p_fecha, current_date), v_cantidad, v_usdt, v_comision,
    -- El neto puede dar negativo: ahi el saldo quedo del otro lado.
    (v_usdt_bs - v_com_bs) - (v_usdt_cop - v_com_cop),
    v_usdt_bs, v_usdt_cop, v_com_bs, v_com_cop,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  returning id into v_id;

  update public.items
     set liquidacion_id = v_id
   where id = any(v_ids);

  return v_id;
end;
$$;

grant execute on function public.liquidar_pendientes to authenticated;

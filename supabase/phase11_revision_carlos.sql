-- ============================================================
-- Fase 11: revisión de Carlos — ajusta el USDT y confirma
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Carlos (rol colaborador) recibe los movimientos que se van cargando y
-- ajusta a mano el total en USDT cuando no coincide con lo que realmente
-- convirtio. Despues confirma, y el movimiento sale de sus pendientes.
--
-- El ajuste NO se hace con una politica de update sobre "items": RLS
-- trabaja por FILA, no por columna, asi que abrirle el update para que
-- toque usdt_total lo dejaria tocar tambien la tasa, la fecha o el numero.
-- La puerta es una funcion angosta que solo escribe lo que corresponde.

alter table public.items
  add column if not exists revisado_at timestamptz,
  add column if not exists revisado_por uuid references public.profiles(id),
  add column if not exists nota_revision text,
  -- Se guarda el valor que tenia antes del ajuste. Sin esto, un ajuste
  -- borra para siempre lo que decia la conversion original.
  add column if not exists usdt_original numeric(14,2);

create index if not exists items_revisado_at_idx
  on public.items (revisado_at)
  where revisado_at is null;

-- ---------- Revisar ----------
-- security definer a proposito: la politica de items solo deja escribir al
-- admin. Esta funcion es la unica excepcion y por eso valida el rol ella
-- misma y toca exclusivamente las columnas de revision.
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
  v_actual numeric(14,2);
  v_original numeric(14,2);
begin
  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol is null or v_rol not in ('admin', 'colaborador') then
    raise exception 'No tenés permiso para revisar movimientos.';
  end if;

  select liquidacion_id, usdt_total, usdt_original
    into v_liquidacion, v_actual, v_original
    from public.items where id = p_item_id;

  if not found then
    raise exception 'Ese movimiento no existe.';
  end if;

  -- Un movimiento ya liquidado esta cerrado: su USDT entro en los totales
  -- congelados de un corte y no puede moverse.
  if v_liquidacion is not null then
    raise exception 'Ese movimiento ya está liquidado y no se puede ajustar.';
  end if;

  if p_usdt_total is not null and p_usdt_total <= 0 then
    raise exception 'El total en USDT debe ser mayor que cero.';
  end if;

  update public.items set
    -- coalesce para que un segundo ajuste no pise el valor original.
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

revoke execute on function public.revisar_item(uuid, numeric, text) from anon;
grant execute on function public.revisar_item(uuid, numeric, text) to authenticated;

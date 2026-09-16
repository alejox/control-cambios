-- ============================================================
-- Fase 21: escotilla de escape para una comisión mal configurada
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- OJO: la FASE 23 reemplaza esta función. Lo que decidía acá —- "a los ya
-- aprobados no se los toca" —- cambió: ahora el recálculo alcanza a todo lo
-- que no esté liquidado, y lo que estaba aprobado vuelve a revisión en vez
-- de que se le reescriba el número por atrás. Este archivo queda como el
-- paso que fue; el vigente es phase23_recalculo_amplio.sql.

-- items.comision_pct se SELLA por movimiento al crearlo, y items.comision
-- es una columna generada a partir de él. Eso está bien: cambiar la
-- configuración no reescribe el histórico.
--
-- Pero deja sin salida al que configuró mal la comisión y ya cargó
-- movimientos con ella. Esta función es esa salida, y está acotada a lo
-- que todavía no se cerró.
--
-- Es ADITIVA: no toca ninguna firma existente. El front viejo ni sabe que
-- existe.

create or replace function public.recalcular_comisiones_pendientes()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bs numeric;
  v_cop numeric;
  v_total integer;
  v_bs_n integer;
  v_cop_n integer;
begin
  -- La autorización real la da RLS ("solo admin escribe items", que aplica
  -- porque esta función es security invoker, no definer). Este chequeo
  -- existe para cortar con un mensaje claro en vez de actualizar cero
  -- filas en silencio, que desde afuera se ve igual que un éxito.
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Solo un administrador puede recalcular comisiones.';
  end if;

  select c.comision_bs_pct, c.comision_cop_pct
    into v_bs, v_cop
    from public.configuracion c
   where c.id;

  if v_bs is null or v_cop is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  -- Un solo UPDATE para los dos flujos: es una sola transacción y no puede
  -- quedar a medio camino con Bs recalculado y COP no.
  with cambiados as (
    update public.items i
       set comision_pct = case when i.tipo_flujo = 'bs_a_usdt' then v_bs else v_cop end
     -- NUNCA un movimiento liquidado. Esa cuenta ya la saldaron las dos
     -- partes: reescribirla cambiaría plata que ya cambió de manos. No es
     -- negociable ni configurable.
     where i.liquidacion_id is null
       -- Ni uno ya aprobado. Que la contraparte lo haya revisado es un
       -- acuerdo entre dos; cambiarle el número por atrás es exactamente
       -- lo que esta app existe para evitar.
       and i.revisado_at is null
       -- Los que ya tienen el porcentaje vigente no se tocan: así el
       -- "se actualizaron N" es el número de cambios REALES.
       and i.comision_pct is distinct from
           (case when i.tipo_flujo = 'bs_a_usdt' then v_bs else v_cop end)
    returning i.tipo_flujo
  )
  select count(*)::int,
         count(*) filter (where tipo_flujo = 'bs_a_usdt')::int,
         count(*) filter (where tipo_flujo = 'cop_a_usdt')::int
    into v_total, v_bs_n, v_cop_n
    from cambiados;

  -- items.comision no se actualiza acá a propósito: es GENERATED ALWAYS a
  -- partir de comision_pct, así que la recalcula Postgres solo.
  return jsonb_build_object(
    'actualizados', v_total,
    'bs', v_bs_n,
    'cop', v_cop_n,
    'comision_bs_pct', v_bs,
    'comision_cop_pct', v_cop
  );
end;
$$;

grant execute on function public.recalcular_comisiones_pendientes to authenticated;

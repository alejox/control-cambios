-- ============================================================
-- Fase 23: el recálculo alcanza a TODO lo no liquidado
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La fase 21 dejó el recálculo acotado a lo pendiente de revisión: los ya
-- aprobados quedaban afuera porque cambiarles el número por atrás es
-- deshacer un acuerdo entre dos personas sin que la otra se entere.
--
-- La regla ahora es otra: mientras el movimiento NO esté liquidado, la
-- comisión se puede corregir. Lo que no cambia es el fondo del asunto —
-- nadie se entera tarde —, y por eso las dos piezas se combinan:
--
--   un movimiento aprobado que el recálculo toque, VUELVE A REVISIÓN.
--
-- No se le cambia el número en silencio: se le cambia la comisión y se lo
-- devuelve a pendiente con su traza, para que la contraparte vea el número
-- nuevo y lo apruebe otra vez. El acuerdo no se reescribe, se rehace.
--
-- La pared que no se mueve sigue siendo la misma: lo liquidado no se toca.
-- Esa cuenta ya la saldaron las dos partes.
--
-- LA FIRMA NO CAMBIA: sigue siendo recalcular_comisiones_pendientes() sin
-- argumentos, así que el front desplegado la sigue llamando igual. El jsonb
-- que devuelve gana una clave ('devueltos_a_revision'); el front viejo lee
-- solo 'actualizados' y no se entera.

create or replace function public.recalcular_comisiones_pendientes()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bs numeric;
  v_cop numeric;
  v_total integer := 0;
  v_bs_n integer := 0;
  v_cop_n integer := 0;
  v_devueltos integer := 0;
  v_filas integer;
  r record;
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

  -- Se recorre fila por fila y ya no es un solo UPDATE masivo, porque
  -- ahora cada movimiento puede necesitar dos cosas distintas (recalcular,
  -- y además volver a revisión) y el motivo que se escribe menciona SU
  -- porcentaje anterior. Sigue siendo una sola transacción: o queda todo
  -- hecho o no queda nada, nunca Bs recalculado y COP no.
  --
  -- El for update toma el lock antes de decidir: liquidar_pendientes
  -- también escribe items, y sin el lock podría colarse una liquidación
  -- entre el "no está liquidado" y el update.
  for r in
    select i.id,
           i.tipo_flujo,
           i.comision_pct as desde,
           (case when i.tipo_flujo = 'bs_a_usdt' then v_bs else v_cop end) as hacia,
           i.revisado_at is not null as estaba_aprobado
      from public.items i
     -- NUNCA un movimiento liquidado. Esa cuenta ya la saldaron las dos
     -- partes: reescribirla cambiaría plata que ya cambió de manos. No es
     -- negociable ni configurable. (El trigger de la fase 24 lo vuelve a
     -- frenar aunque este where desaparezca.)
     where i.liquidacion_id is null
       -- Los que ya tienen el porcentaje vigente no se tocan: así el
       -- "se actualizaron N" es el número de cambios REALES, y nadie
       -- vuelve a revisión por una corrida que no le cambió nada.
       and i.comision_pct is distinct from
           (case when i.tipo_flujo = 'bs_a_usdt' then v_bs else v_cop end)
     order by i.numero
       for update
  loop
    update public.items set comision_pct = r.hacia where id = r.id;
    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      raise exception 'No se pudo recalcular: tu cuenta no tiene permiso.';
    end if;

    -- Estaba aprobado: el acuerdo se rehace, no se reescribe. Vuelve a
    -- pendiente por el MISMO camino que usa el botón de desaprobar (fase
    -- 22), para que no existan dos formas distintas de dejar algo
    -- "pendiente" que puedan divergir.
    --
    -- El motivo lo genera la base y no se le pide al admin: en este camino
    -- el porqué ya se conoce entero y es siempre el mismo, y pedirle que
    -- lo escriba una vez por movimiento sería pedirle que copie a mano lo
    -- que la máquina ya sabe.
    if r.estaba_aprobado then
      perform public.devolver_item_a_revision(
        r.id,
        format(
          'Recálculo de comisión: pasó de %s%% a %s%%.',
          -- FM saca el relleno de espacios y los ceros de más, y el rtrim
          -- saca el punto que queda colgando cuando no hay decimales:
          -- to_char(14.00, 'FM999990.99') devuelve '14.', no '14'.
          rtrim(to_char(r.desde, 'FM999990.99'), '.'),
          rtrim(to_char(r.hacia, 'FM999990.99'), '.')
        )
      );
      v_devueltos := v_devueltos + 1;
    end if;

    v_total := v_total + 1;
    if r.tipo_flujo = 'bs_a_usdt' then
      v_bs_n := v_bs_n + 1;
    else
      v_cop_n := v_cop_n + 1;
    end if;
  end loop;

  -- items.comision no se actualiza acá a propósito: es GENERATED ALWAYS a
  -- partir de comision_pct, así que la recalcula Postgres solo.
  return jsonb_build_object(
    'actualizados', v_total,
    'bs', v_bs_n,
    'cop', v_cop_n,
    'devueltos_a_revision', v_devueltos,
    'comision_bs_pct', v_bs,
    'comision_cop_pct', v_cop
  );
end;
$$;

grant execute on function public.recalcular_comisiones_pendientes to authenticated;

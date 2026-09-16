-- ============================================================
-- Fase 22: devolver un movimiento aprobado a revisión
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Hasta ahora, cuando la contraparte aprobaba (items.revisado_at), no había
-- vuelta atrás. Eso deja un hueco real: si la comisión estaba mal
-- configurada y el otro aprueba antes de que nadie lo note, ese movimiento
-- se liquida con el número equivocado.
--
-- La salida sana NO es reescribir el número por atrás: eso es exactamente
-- lo que esta app existe para evitar. La salida es devolver el movimiento a
-- revisión, que la contraparte lo vuelva a mirar y lo vuelva a aprobar,
-- esta vez con el número correcto. Se deshace el acuerdo a la vista, no el
-- dato a escondidas.
--
-- Es ADITIVA: no cambia la firma de ninguna función que el front
-- desplegado ya llame.

-- ---------- La traza ----------
-- Devolver un movimiento a revisión deshace un acuerdo entre dos personas.
-- Tiene que quedar escrito quién lo hizo y POR QUÉ: un movimiento que
-- vuelve a pendiente sin explicación es una discusión asegurada dentro de
-- tres meses.
--
-- Van como columnas de items y no como tabla de historial porque lo que se
-- necesita responder es "¿por qué este movimiento está de nuevo acá?", que
-- siempre es la última devolución. El precio: una segunda devolución pisa
-- el motivo de la primera. Si algún día hace falta el historial completo,
-- es una tabla nueva y estas columnas pasan a ser su última fila.
alter table public.items
  add column if not exists desaprobado_at timestamptz,
  add column if not exists desaprobado_por uuid references public.profiles(id),
  add column if not exists desaprobado_motivo text;

comment on column public.items.desaprobado_at is
  'Cuándo se devolvió este movimiento a revisión. NO se limpia al volver a '
  'aprobarlo: junto con revisado_at cuenta la historia completa '
  '(revisado_at null y esto no null = está devuelto ahora; las dos no null '
  '= se devolvió y ya se volvió a aprobar).';
comment on column public.items.desaprobado_por is
  'Quién lo devolvió. A mano solo puede ser un admin (lo garantiza '
  'desaprobar_item); arrastrado por un recálculo, el admin que recalculó.';
comment on column public.items.desaprobado_motivo is
  'Por qué se devolvió. Obligatorio: sin el porqué escrito, dentro de tres '
  'meses nadie puede reconstruir por qué este movimiento volvió atrás.';

-- La traza se escribe entera o no se escribe: un desaprobado_at sin motivo
-- es justo el registro inútil que esta fase vino a evitar. Y como es un
-- CHECK de tabla, vale para cualquier camino que escriba estas columnas,
-- incluso uno que se escriba mal en el futuro.
alter table public.items drop constraint if exists items_desaprobacion_completa_check;
alter table public.items
  add constraint items_desaprobacion_completa_check
  check (
    (desaprobado_at is null
      and desaprobado_por is null
      and desaprobado_motivo is null)
    or (desaprobado_at is not null
      and desaprobado_por is not null
      and desaprobado_motivo is not null
      and btrim(desaprobado_motivo) <> '')
  );

-- ---------- La mecánica, una sola vez ----------
-- Hay DOS caminos que devuelven un movimiento a revisión: el botón del
-- admin (desaprobar_item, acá abajo) y el recálculo de comisiones, que
-- devuelve lo que toca si ya estaba aprobado (fase 23). La mecánica vive
-- una sola vez acá para que no existan dos formas distintas de dejar un
-- movimiento "pendiente" que puedan divergir.
--
-- NO valida rol ni estado: eso es de quien llama, que es el único que sabe
-- si está desaprobando a mano (y entonces pide motivo y exige que esté
-- aprobado) o arrastrado por un recálculo. Lo que sí es suyo es que el item
-- y sus depósitos vuelvan JUNTOS.
--
-- security invoker, igual que recalcular_comisiones_pendientes: así la
-- autorización sigue siendo la de siempre, las políticas de RLS ("solo
-- admin escribe items" y "solo admin escribe depositos"), y no una
-- condición escrita a mano adentro de una función definer, que es una copia
-- de la regla que puede desincronizarse de la original.
create or replace function public.devolver_item_a_revision(
  p_item_id uuid,
  p_motivo text
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_depositos integer;
  v_items integer;
begin
  -- Los depósitos vuelven atrás JUNTO con el movimiento. revisar_depositos
  -- marca aprobado_at en cada uno y recién pone revisado_at en el item
  -- cuando no queda ninguno sin aprobar: limpiar solo el item dejaría la
  -- pantalla "Por revisar" mostrando un movimiento pendiente con todos sus
  -- comprobantes ya tildados. Peor todavía, RevisionItem arranca con los
  -- aprobados tildados, así que la contraparte vería un "Confirmar 3 de 3"
  -- que no le pide mirar nada.
  --
  -- Se borra la APROBACIÓN (aprobado_at / aprobado_por), no la MEDICIÓN
  -- (depositos.usdt). El USDT fijado es cuánto se convirtió de verdad en
  -- ese depósito: es un hecho del banco, no parte del acuerdo que se está
  -- deshaciendo. Y el formulario de revisión lo usa como valor inicial, así
  -- que la contraparte reabre la tarjeta con sus propios números ya
  -- cargados y no tiene que medir todo de nuevo de memoria.
  update public.depositos
     set aprobado_at = null,
         aprobado_por = null
   where item_id = p_item_id
     and aprobado_at is not null;

  get diagnostics v_depositos = row_count;

  -- usdt_total NO se restaura desde usdt_original, y usdt_original no se
  -- limpia. Lo que se deshace es la APROBACIÓN ("estoy de acuerdo con estos
  -- números"), no la medición que la contraparte hizo al revisar. Restaurar
  -- el original sería volver a poner un número que ya sabemos que no es el
  -- que se convirtió, y encima perderlo: usdt_original guarda uno solo, así
  -- que pisarlo borra el rastro. Dejando el ajustado no se pierde nada —
  -- usdt_original sigue mostrando de dónde venía, y la tarjeta de revisión
  -- lo dice en pantalla ("Ya se ajustó antes: venía de X") — y si la
  -- medición también estaba mal, la contraparte la vuelve a corregir en la
  -- misma revisión que ya va a hacer igual.
  --
  -- nota_revision tampoco se borra por lo mismo: es lo que escribió la
  -- contraparte, y revisar_item la pisa sola si vuelve a aprobar con otra.
  update public.items
     set revisado_at = null,
         revisado_por = null,
         desaprobado_at = now(),
         desaprobado_por = auth.uid(),
         desaprobado_motivo = p_motivo
   where id = p_item_id;

  get diagnostics v_items = row_count;

  -- Cero filas no es un éxito: así se ve un permiso denegado por RLS desde
  -- adentro de una función invoker.
  if v_items = 0 then
    raise exception 'No se pudo devolver el movimiento a revisión: tu cuenta no tiene permiso.';
  end if;

  return v_depositos;
end;
$$;

comment on function public.devolver_item_a_revision(uuid, text) is
  'INTERNA. La mecánica compartida por desaprobar_item y '
  'recalcular_comisiones_pendientes. No valida rol ni estado: eso es de '
  'quien la llama. Las paredes que igual la contienen son RLS (solo admin '
  'escribe items y depositos), el CHECK items_desaprobacion_completa_check '
  '(no se puede escribir una traza a medias) y el trigger de la fase 24 '
  '(un movimiento liquidado no cambia su revisado_at).';

revoke execute on function public.devolver_item_a_revision(uuid, text) from anon;
grant execute on function public.devolver_item_a_revision(uuid, text) to authenticated;

-- ---------- El botón del admin ----------
create or replace function public.desaprobar_item(
  p_item_id uuid,
  p_motivo text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_motivo text;
  v_numero integer;
  v_liquidacion uuid;
  v_revisado timestamptz;
  v_depositos integer;
begin
  -- Este chequeo no es la autorización — esa la da RLS —: es el mensaje.
  -- Sin él, a un colaborador RLS le dejaría actualizar cero filas, que
  -- desde afuera se ve igual que un éxito.
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Solo un administrador puede devolver un movimiento a revisión.';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Escribí por qué devolvés el movimiento a revisión.';
  end if;
  -- Corto a propósito: es una razón ("comisión mal configurada"), no un
  -- descargo. Lo largo va en la conversación, no en una celda.
  if length(v_motivo) > 200 then
    raise exception 'El motivo no puede pasar de 200 caracteres.';
  end if;

  -- for update y no un select suelto: liquidar_pendientes también escribe
  -- items. Sin el lock, entre el chequeo de "no está liquidado" y el
  -- update podría colarse una liquidación y quedaría un corte cerrado con
  -- un movimiento sin aprobar adentro.
  select numero, liquidacion_id, revisado_at
    into v_numero, v_liquidacion, v_revisado
    from public.items
   where id = p_item_id
     for update;

  if not found then
    raise exception 'Ese movimiento no existe.';
  end if;

  -- Esa cuenta ya la saldaron las dos partes y su USDT entró en los totales
  -- congelados de un corte. No es negociable ni configurable. (El trigger
  -- de la fase 24 lo vuelve a frenar aunque este chequeo desaparezca.)
  if v_liquidacion is not null then
    raise exception 'Ese movimiento ya está liquidado: no se puede devolver a revisión.';
  end if;

  -- Devolver algo que ya está pendiente no significa nada, y en el camino
  -- escribiría la traza de una devolución que nunca pasó.
  if v_revisado is null then
    raise exception 'Ese movimiento ya está pendiente de revisión.';
  end if;

  v_depositos := public.devolver_item_a_revision(p_item_id, v_motivo);

  return jsonb_build_object(
    'numero', v_numero,
    'depositos_reabiertos', v_depositos
  );
end;
$$;

revoke execute on function public.desaprobar_item(uuid, text) from anon;
grant execute on function public.desaprobar_item(uuid, text) to authenticated;

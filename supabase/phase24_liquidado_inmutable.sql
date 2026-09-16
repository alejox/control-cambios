-- ============================================================
-- Fase 24: lo liquidado se vuelve inmutable EN LA BASE
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- "No se toca lo liquidado" aparece hoy en varios lugares como una
-- condición escrita a mano: un `where liquidacion_id is null` acá, un
-- `raise exception` allá. Eso protege el camino esperado y nada más. No
-- protege contra un bug futuro, ni contra una RPC nueva que alguien
-- escriba distraído, ni contra un UPDATE hecho a mano desde el panel de
-- Supabase con la service_role — que es el camino que NINGUNA política de
-- RLS mira, porque la service_role las saltea todas.
--
-- Un corte liquidado es plata que ya cambió de manos entre dos personas.
-- La regla tiene que vivir donde no se pueda esquivar: en la tabla.
--
-- Es ADITIVA: no cambia ninguna firma ni ninguna columna. Solo agrega dos
-- triggers que rechazan lo que hoy ya nadie debería estar haciendo.

-- ---------- items ----------
create or replace function public.items_liquidados_son_inmutables()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Borrar un movimiento de un corte cerrado deja la liquidación
    -- mintiendo: cantidad_items, total_usdt y total_comision son columnas
    -- CONGELADAS, no se recalculan solas. El corte seguiría diciendo "13
    -- movimientos, 170 USDT" con 12 movimientos adentro.
    if old.liquidacion_id is not null then
      raise exception
        'El movimiento #% ya está liquidado: no se puede eliminar.', old.numero;
    end if;
    return old;
  end if;

  -- Solo miramos filas que YA estaban liquidadas ANTES de este UPDATE.
  -- liquidar_pendientes escribe liquidacion_id sobre items que en ese
  -- momento todavía lo tienen en null, así que este trigger no le estorba:
  -- para esas filas old.liquidacion_id es null y salimos por acá.
  if old.liquidacion_id is null then
    return new;
  end if;

  -- Desliquidar tampoco. Sacarle el corte a un movimiento lo devolvería a
  -- la lista de pendientes y entraría OTRA VEZ en el próximo corte: la
  -- misma plata contada dos veces. Y la liquidación de la que salió
  -- seguiría con sus totales congelados incluyéndolo.
  --
  -- Ojo, esto también frena el borrado de una liquidación: la FK es
  -- ON DELETE SET NULL, así que borrar el corte intentaría poner este
  -- liquidacion_id en null y el trigger lo corta. Es a propósito: hoy la
  -- app no tiene "deshacer liquidación", y si algún día lo tiene va a
  -- tener que ser una RPC explícita que se haga cargo de los totales, no
  -- un DELETE que dispersa los movimientos en silencio.
  if new.liquidacion_id is distinct from old.liquidacion_id then
    raise exception
      'El movimiento #% ya está liquidado: no se puede sacar de su corte ni moverlo a otro.',
      old.numero;
  end if;

  -- Los campos que definen la plata y la identidad del movimiento dentro
  -- del corte. Lo que queda afuera es texto libre (detalle, nota_revision,
  -- la traza de desaprobación): anotar algo sobre un corte cerrado es
  -- legítimo, cambiarle el número no.
  if new.numero        is distinct from old.numero
     or new.tipo_flujo    is distinct from old.tipo_flujo
     or new.moneda_origen is distinct from old.moneda_origen
     or new.tasa          is distinct from old.tasa
     or new.usdt_total    is distinct from old.usdt_total
     or new.usdt_original is distinct from old.usdt_original
     or new.comision_pct  is distinct from old.comision_pct
     or new.fecha         is distinct from old.fecha
     or new.created_by    is distinct from old.created_by
     -- revisado_at / revisado_por: la aprobación de la contraparte es la
     -- condición para haber liquidado. Borrarla dejaría un corte cerrado
     -- con algo sin aprobar adentro.
     or new.revisado_at   is distinct from old.revisado_at
     or new.revisado_por  is distinct from old.revisado_por then
    raise exception
      'El movimiento #% ya está liquidado: sus números no se pueden cambiar.',
      old.numero;
  end if;

  return new;
end;
$$;

drop trigger if exists items_liquidados_inmutables on public.items;
create trigger items_liquidados_inmutables
  before update or delete on public.items
  for each row execute function public.items_liquidados_son_inmutables();

-- ---------- depositos ----------
-- ¿Hace falta también acá? Sí. El corte no guarda una copia de sus
-- depósitos: la pantalla de una liquidación los lee de esta tabla, en
-- vivo. Cambiarle el valor_origen a un depósito de un movimiento liquidado
-- reescribe la columna "Recibido" de un corte cerrado, y agregar o borrar
-- uno cambia de cuántos comprobantes se compone. Es el mismo histórico,
-- vive en otra tabla.
--
-- security definer a propósito: el guardia tiene que poder LEER items
-- siempre. Un guardia que no ve la fila que protege deja pasar todo.
create or replace function public.depositos_de_liquidados_son_inmutables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_destino uuid;
  v_origen uuid;
begin
  -- Se leen por separado y no con coalesce(new, old): en un trigger de
  -- DELETE, new no está asignado y tocarlo revienta.
  --
  -- Se miran los dos lados, el item del que sale y el item al que va, para
  -- que tampoco se pueda mudar un depósito hacia adentro ni hacia afuera
  -- de un corte cerrado.
  if tg_op <> 'INSERT' then v_origen := old.item_id; end if;
  if tg_op <> 'DELETE' then v_destino := new.item_id; end if;

  select i.numero into v_numero
    from public.items i
   where (i.id = v_origen or i.id = v_destino)
     and i.liquidacion_id is not null
   limit 1;

  if v_numero is not null then
    raise exception
      'El movimiento #% ya está liquidado: sus comprobantes no se pueden cambiar.',
      v_numero;
  end if;

  -- Un item que se borra arrastra sus depósitos por la FK (on delete
  -- cascade). Para esa cascada el item ya no existe cuando llega acá, así
  -- que la consulta no encuentra nada y pasa — que es lo correcto: si el
  -- item estaba liquidado, el trigger de items ya frenó todo antes.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists depositos_de_liquidados_inmutables on public.depositos;
create trigger depositos_de_liquidados_inmutables
  before insert or update or delete on public.depositos
  for each row execute function public.depositos_de_liquidados_son_inmutables();

comment on function public.items_liquidados_son_inmutables() is
  'Guardia de tabla: un movimiento ya liquidado no cambia sus números, no '
  'sale de su corte y no se borra. Vale para cualquier camino, incluida la '
  'service_role, que saltea RLS.';
comment on function public.depositos_de_liquidados_son_inmutables() is
  'Lo mismo para los comprobantes: la pantalla de un corte los lee en vivo '
  'de depositos, así que también son parte del histórico congelado.';

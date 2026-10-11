-- ============================================================
-- Fase 52: la numeración de lo pendiente no tiene huecos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez; es idempotente, correrlo dos veces no rompe nada)
-- ============================================================
--
-- Movimientos (items) y ventas de créditos comparten UNA serie entre lo
-- pendiente (fase 51). Hasta ahora, borrar un pendiente dejaba un hueco:
-- se borró el #33 y la lista quedó 1..32, 34..44 con 43 filas. El número
-- más alto ya no decía cuántos movimientos hay, y "fijate el 44" no
-- coincidía con la cuenta.
--
-- Regla nueva: "conservar el orden siempre". Al borrar un pendiente (item
-- o venta), todo lo pendiente que venía después baja un lugar, en las DOS
-- tablas. Los números quedan 1..N, iguales a la cantidad real, y el orden
-- relativo no cambia nunca.
--
-- Lo liquidado no se toca: tiene su propia numeración por corte, es
-- inmutable (fase 24 para items, ventas_liquidadas_son_inmutables para
-- ventas) y no se puede borrar.
--
-- ---------- Cómo se renumera sin chocar ----------
-- Los índices únicos parciales (items_numero_pendiente_idx,
-- ventas_numero_pendiente_idx) NO son diferibles, y los triggers cruzados
-- de la fase 51 (items_numero_unico_con_ventas /
-- ventas_numero_unico_con_items) miran la otra tabla en cada
-- `update of numero`. Un `update ... set numero = numero - 1` masivo podría
-- pisar transitoriamente un número que todavía está ocupado.
--
-- Por eso se recorre lo pendiente de las dos tablas juntas, en orden
-- ASCENDENTE de número, y a cada fila se le da su posición (1, 2, 3...) de
-- a una por vez. Nunca choca: cuando le toca a la fila de la posición k,
-- las anteriores ya tienen 1..k-1 y las siguientes tienen números mayores
-- que el suyo, que es >= k. El número k está libre (o ya es el suyo), así
-- que ni el índice ni el trigger cruzado ven nunca un repetido. No hace
-- falta ningún desplazamiento negativo (que además rompería el
-- check numero > 0 de ventas).
--
-- Compactar (dejar 1..N) en vez de "restar 1 a lo que está después del
-- borrado" da el mismo resultado cuando la serie ya es continua, y además
-- es correcto cuando un solo DELETE borra varias filas: los triggers por
-- fila corren al final de la sentencia y el old.numero del segundo ya no
-- describe dónde están las demás. Compactar es idempotente: la segunda
-- llamada no encuentra nada que mover.
--
-- ---------- Qué más se dispara al cambiar el número ----------
-- Revisado en todas las fases: sobre items solo hay dos triggers,
--   * items_liquidados_inmutables (fase 24): para una fila pendiente
--     (old.liquidacion_id null) devuelve new sin mirar nada;
--   * items_numero_unico_con_ventas (fase 51): el chequeo cruzado de
--     arriba, que nunca ve un repetido.
-- No hay trigger que resetee la aprobación: revisado_at / revisado_por
-- solo los tocan las RPCs (aprobar, desaprobar_item, el recálculo de
-- comisiones de las fases 21/23), no un UPDATE cualquiera. Cambiar el
-- número de un movimiento aprobado lo deja aprobado. Tampoco hay
-- recálculo de comisión ni de usdt_original por trigger.
-- Sobre ventas, lo mismo: ventas_liquidadas_inmutables deja pasar lo
-- pendiente y ventas_numero_unico_con_items es el chequeo cruzado.

-- ---------- La compactación, una sola vez acá ----------
-- security definer: quien borra puede no ver (o no poder actualizar, por
-- RLS) todas las filas de las dos tablas, y la serie es una sola.
create or replace function public.compactar_numeracion_pendiente()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_posicion integer := 0;
begin
  -- El mismo lock que toman el bot y los triggers cruzados: nadie numera
  -- un pendiente nuevo mientras la serie se está acomodando.
  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  -- El FOR abre la consulta una vez: los updates de adentro no cambian lo
  -- que se recorre. Un número lo usa un item O una venta, nunca los dos
  -- (fase 51), así que el orden por número no tiene empates.
  for r in
    select 'item'::text as tabla, i.id, i.numero
      from public.items i
     where i.liquidacion_id is null
    union all
    select 'venta'::text, v.id, v.numero
      from public.ventas v
     where v.liquidacion_id is null
     order by numero
  loop
    v_posicion := v_posicion + 1;

    if r.numero <> v_posicion then
      if r.tabla = 'item' then
        update public.items set numero = v_posicion where id = r.id;
      else
        update public.ventas set numero = v_posicion where id = r.id;
      end if;
    end if;
  end loop;
end;
$$;

-- ---------- Al borrar un pendiente, lo de atrás baja ----------
-- AFTER: la fila ya no está, su número quedó libre. Devuelve null porque
-- en un AFTER el valor de retorno se ignora.
create or replace function public.renumerar_tras_borrar_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.compactar_numeracion_pendiente();
  return null;
end;
$$;

-- create or replace trigger (Postgres 14+): idempotente sin drop.
-- El when deja afuera lo liquidado (que igual no se puede borrar).
create or replace trigger items_renumerar_tras_borrar
  after delete on public.items
  for each row
  when (old.liquidacion_id is null)
  execute function public.renumerar_tras_borrar_pendiente();

create or replace trigger ventas_renumerar_tras_borrar
  after delete on public.ventas
  for each row
  when (old.liquidacion_id is null)
  execute function public.renumerar_tras_borrar_pendiente();

-- Fuera de la API pública, como dejó la fase 46: la compactación corre
-- solo desde los triggers (y desde este archivo, abajo).
revoke execute on function public.compactar_numeracion_pendiente() from public, anon, authenticated;
revoke execute on function public.renumerar_tras_borrar_pendiente() from public, anon, authenticated;

-- ---------- Cerrar los huecos que ya existen ----------
-- Hoy: 42 movimientos + 1 venta pendientes con el #33 vacío. Queda 1..43
-- en el mismo orden (la venta, que era #44, pasa a #43). Va después de los
-- triggers, pero no los dispara: solo hace updates.
select public.compactar_numeracion_pendiente();

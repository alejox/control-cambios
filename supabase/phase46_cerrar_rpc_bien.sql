-- ============================================================
-- Fase 46: cerrar de verdad las funciones a los anónimos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- La fase 45 revocó EXECUTE a `anon` y no sirvió de nada. El motivo es un
-- clásico de Postgres que conviene dejar escrito: toda función nace con
-- EXECUTE otorgado al pseudo-rol PUBLIC, y anon lo HEREDA. Revocarle a
-- anon no toca lo que tiene por ser parte de PUBLIC, así que el permiso
-- sobrevive y `has_function_privilege('anon', ...)` sigue dando true.
--
-- Lo mismo vale para el `revoke ... from anon` de la fase 22: nunca cerró
-- nada.
--
-- La forma correcta es revocar a PUBLIC y volver a otorgar a quien de
-- verdad lo necesita. Se hace por consulta y no a mano para que no haya
-- una función olvidada en la lista:
--
--   authenticated  las que llama la app y las que viven dentro de una
--                  política RLS (is_admin). Todas menos las de trigger y
--                  menos crear_item_desde_bot, que es solo del bot.
--   service_role   crear_item_desde_bot, que llama el webhook.
--   nadie          las cuatro funciones de trigger. Un trigger no pide
--                  EXECUTE al usuario que dispara el INSERT —- eso se
--                  valida al crear el trigger -—, así que sacarlas de la
--                  API pública no rompe nada.

-- ---------- Cerrar todo ----------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

-- ---------- Y reabrir solo lo necesario ----------
do $$
declare
  f record;
  abiertas int := 0;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- Las de trigger quedan fuera de la API: nadie las invoca a mano.
      and p.prorettype::regtype::text <> 'trigger'
  loop
    if f.proname = 'crear_item_desde_bot' then
      execute format('grant execute on function %s to service_role', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
      execute format('grant execute on function %s to service_role', f.firma);
    end if;
    abiertas := abiertas + 1;
  end loop;
  raise notice 'EXECUTE otorgado explicitamente en % funciones', abiertas;
end $$;

-- ---------- Que las próximas nazcan cerradas ----------
-- Sin esto habría que acordarse de correr esto de nuevo cada vez que se
-- agrega una función, y nadie se acuerda.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

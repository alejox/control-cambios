-- ============================================================
-- Fase 45: nadie sin sesión puede llamar a una función de la app
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- PostgREST publica toda función de `public` en /rest/v1/rpc/<nombre>, y
-- por omisión el rol `anon` —- el de cualquiera que tenga la anon key, que
-- viaja al navegador y por lo tanto es pública -— puede ejecutarlas.
--
-- Hoy eso NO es explotable: revisar_item y revisar_depositos chequean
-- auth.uid() y el rol por dentro, así que a un anónimo le fallan. Pero
-- depender de que cada función se defienda sola es una apuesta que se
-- pierde el día que alguien escribe la próxima y se olvida. La puerta se
-- cierra una vez, acá.
--
-- Lo que NO se toca, y por qué:
--
--   authenticated conserva EXECUTE sobre revisar_item, revisar_depositos
--   e is_admin. Las dos primeras las llama la app desde revision/actions;
--   is_admin vive DENTRO de dos políticas RLS de profiles ("admin ve
--   todos los perfiles" y "admin actualiza roles") y una política se
--   evalúa con los permisos de quien consulta: revocarla dejaría al admin
--   sin ver ningún perfil.
--
--   Las funciones de trigger sí se revocan a los dos roles. Un trigger no
--   pide EXECUTE al usuario que dispara el INSERT —- eso se valida al
--   crear el trigger -—, así que revocarlas no rompe nada y saca de la
--   API pública dos funciones que nadie debería poder invocar a mano.

do $$
declare
  f record;
  revocadas int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from anon', f.firma);
    revocadas := revocadas + 1;
  end loop;
  raise notice 'EXECUTE revocado a anon en % funciones', revocadas;
end $$;

-- Las de trigger, también a los usuarios con sesión.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.depositos_de_liquidados_son_inmutables() from authenticated;

-- Y que las próximas nazcan cerradas, en vez de depender de que alguien
-- se acuerde de correr esto otra vez.
alter default privileges in schema public revoke execute on functions from anon;

-- ============================================================
-- Fase 9: la numeración de movimientos reinicia en cada corte
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Hasta ahora "numero" era unico en toda la tabla. Si la numeracion
-- vuelve a 1 despues de liquidar, el movimiento #1 nuevo choca contra el
-- #1 que ya quedo guardado en un corte anterior.
--
-- La unicidad pasa a ser por corte, y se arma con DOS indices parciales
-- en vez de un unique (liquidacion_id, numero) a secas: en Postgres los
-- NULL se consideran distintos entre si, asi que ese unique dejaria
-- convivir dos pendientes con el mismo numero sin protestar.

alter table public.items drop constraint if exists items_numero_key;

-- Entre los pendientes, el numero no se repite.
drop index if exists public.items_numero_pendiente_idx;
create unique index items_numero_pendiente_idx
  on public.items (numero)
  where liquidacion_id is null;

-- Dentro de un mismo corte tampoco. Entre cortes distintos si puede
-- repetirse: cada liquidacion arranca de nuevo en 1.
drop index if exists public.items_numero_por_liquidacion_idx;
create unique index items_numero_por_liquidacion_idx
  on public.items (liquidacion_id, numero)
  where liquidacion_id is not null;

-- ============================================================
-- Fase 28: la tasa de venta no guarda quién la tocó
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La fase 27 guardaba el autor del último cambio de cada lista. El
-- usuario dijo que no le interesa, y una columna que nadie mira es
-- deuda, no previsión: hay que mantenerla, migrarla y explicarla para
-- siempre, sin que nadie la lea nunca.
--
-- Las cuatro columnas estaban vacías: todavía no se calculó ninguna
-- tasa. No se pierde nada.
--
-- Lo que SÍ queda es CUÁNDO se consultó Binance (tasa_binance_at). Eso
-- no es traza de autor, es lo que evita mandar una lista calculada con
-- la tasa de hace tres horas creyendo que es de ahora.

alter table public.venta_publico_listas
  drop column if exists tasa_por,
  drop column if exists tasa_por_email,
  drop column if exists tasa_at,
  drop column if exists updated_by;

comment on column public.venta_publico_listas.tasa is
  'La tasa de venta de esta lista: el dólar más el margen del usuario. '
  'Ajustar un precio en bolívares a mano la reescribe, y todos los '
  'precios se re-derivan desde su ancla en dólares.';

comment on column public.venta_publico_listas.tasa_binance_at is
  'Cuándo se consultó el P2P por última vez. Se muestra en pantalla: un '
  'precio calculado con una tasa vieja es un precio viejo disfrazado de '
  'nuevo.';

-- ============================================================
-- Fase 29: la sección en pesos, y el redondeo como dato de la lista
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- ---------- La tasa ya no es siempre de Binance ----------
-- Para bolívares la referencia es el P2P de Binance; para pesos es la
-- TRM oficial. El criterio está explicado en src/lib/tasa-referencia.ts
-- y no se repite acá: lo que cambia en la base es que las columnas ya no
-- pueden llamarse "binance" sin mentir la mitad de las veces.
alter table public.venta_publico_listas
  rename column tasa_binance to tasa_referencia;
alter table public.venta_publico_listas
  rename column tasa_binance_at to tasa_referencia_at;

-- Qué fuente se usó, con las palabras que devolvió la propia fuente
-- ("Binance P2P", "TRM oficial") y su detalle ("mediana ... · N
-- anuncios", "última publicada (16/09/26)"). Se guarda en vez de
-- deducirse de la moneda para que la pantalla diga lo que realmente
-- pasó, y no lo que debería haber pasado.
alter table public.venta_publico_listas
  add column if not exists tasa_fuente text,
  add column if not exists tasa_detalle text;

-- Y por lo mismo, el origen deja de llamarse 'binance': lo que importa
-- es si la tasa vino de la fuente del día o de un ajuste a mano.
alter table public.venta_publico_listas
  drop constraint if exists venta_publico_listas_tasa_origen_check;
update public.venta_publico_listas set tasa_origen = 'fuente' where tasa_origen = 'binance';
alter table public.venta_publico_listas
  add constraint venta_publico_listas_tasa_origen_check
  check (tasa_origen in ('fuente', 'ajuste'));

-- ---------- El redondeo es de cada lista ----------
-- Hacia arriba siempre, por lo de siempre: nunca vender por debajo del
-- ancla en dólares. Lo que cambia es el paso. En bolívares redondear de
-- a 100 tiene sentido; en pesos, donde 7 USD son ~28.000 COP, es una
-- precisión que nadie usa en una lista de precios.
alter table public.venta_publico_listas
  add column if not exists redondeo integer not null default 100;

alter table public.venta_publico_listas
  drop constraint if exists venta_publico_listas_redondeo_check;
alter table public.venta_publico_listas
  add constraint venta_publico_listas_redondeo_check check (redondeo > 0);

comment on column public.venta_publico_listas.redondeo is
  'Paso al que se redondea el precio convertido, siempre hacia arriba. '
  '100 en bolívares, 1000 en pesos. En dólares no aplica: el precio ya '
  'está en la moneda de la lista.';

-- ---------- Las listas en pesos ----------
-- Los cuatro proveedores, vacías: el usuario todavía no pasó los textos
-- en pesos. Nacen avisadas para que la pantalla diga qué falta en vez de
-- dejar armar medio mensaje.
insert into public.venta_publico_listas (proveedor_id, moneda, redondeo, revisar)
select
  p.id,
  'COP',
  1000,
  'Faltan los textos en pesos: el encabezado, el pie, el formato de la línea y las etiquetas de cada plan. Los precios en dólares ya están; lo que falta es cómo se cuenta esta lista.'
from public.venta_publico_proveedores p
on conflict (proveedor_id, moneda) do nothing;

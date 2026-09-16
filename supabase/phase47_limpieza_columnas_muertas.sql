-- ============================================================
-- Fase 47: sacar las columnas que quedaron sin uso
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Las fases 37, 39, 42 y 43 movieron datos de lugar y dejaron las
-- columnas viejas en pie A PROPÓSITO: en este proyecto ya se rompió
-- producción migrando antes de que el front estuviera listo. El front ya
-- hace rato que no las lee, así que ahora se van.
--
-- Antes de correr esto se verificó, y conviene repetir el método la
-- próxima vez porque las tres cosas importan:
--
--   1. QUE EL CÓDIGO NO LAS LEA. Ojo con el falso positivo: tasa_origen,
--      tasa_fuente, tasa_detalle y tasa_referencia SIGUEN vivas en
--      venta_publico_lista_usuario, y un grep a secas dice "en uso"
--      cuando lo que está en uso es la columna del mismo nombre en la
--      OTRA tabla. Hay que mirar de qué tabla sale cada referencia.
--
--   2. QUE NADA EN LA BASE DEPENDA DE ELLAS. Cero vistas en public, cero
--      funciones que las nombren, ningún índice ni constraint fuera de
--      los de la propia columna (que se van con ella).
--
--   3. QUE EL DATO ESTÉ EN EL LUGAR NUEVO, valor por valor y no solo
--      "el campo nuevo no está vacío". Se comprobó que la url vieja de
--      cada panel está dentro de urls, y que su usuario y su clave están
--      dentro de cuentas. Para las tasas, que ninguna lista tenga una
--      tasa que no aparezca en alguna fila de venta_publico_lista_usuario.
--
-- Lo que NO se toca: venta_publico_lista_usuario conserva sus columnas de
-- tasa, que son las vivas.

-- ---------- La tasa dejó de ser de la lista y pasó a ser de cada uno ----------
alter table public.venta_publico_listas
  drop column if exists tasa,
  drop column if exists tasa_origen,
  drop column if exists tasa_fuente,
  drop column if exists tasa_detalle,
  drop column if exists tasa_referencia,
  drop column if exists tasa_referencia_at;

-- ---------- Los medios de cobro dejaron de ser de la lista ----------
-- Ahora viven en venta_publico_medios_pago, uno por moneda y no uno por
-- marca: se cobra con la misma cuenta se venda Stella u Oleada.
alter table public.venta_publico_lista_usuario
  drop column if exists medios_pago;

-- ---------- Un panel tiene varios links y varias cuentas ----------
alter table public.paneles
  drop column if exists url,
  drop column if exists usuario,
  drop column if exists clave;

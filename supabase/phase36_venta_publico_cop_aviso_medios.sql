-- ============================================================
-- Fase 36: el aviso de los medios de pago en pesos ya no aplica
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- La fase 32 avisó que faltaban los medios de pago en pesos. La 34 se los
-- puso (Llave Bre-B, Nequi, Daviplata) en las cuatro marcas, pero no
-- levantó el aviso: en Stella y FlujoTV se fue de casualidad, pisado por
-- el aviso de la tasa; en Oleada y Telelatino quedó pidiendo algo que ya
-- estaba hecho.
--
-- Es la tercera vez en esta tanda que una migración cambia datos y deja
-- un aviso mintiendo. La regla, escrita acá para que no se pierda: toda
-- migración que toca datos tiene que preguntarse qué 'revisar' deja
-- viejo. Un aviso falso no es ruido inofensivo —- entrena a saltear los
-- rojos, y el próximo rojo es el que manda una lista mal a un cliente.
--
-- La condición mira el pie y no la marca: levanta el aviso solo donde los
-- medios de pago realmente están cargados.
update public.venta_publico_listas
set revisar = ''
where moneda = 'COP'
  and revisar like 'Faltan los medios de pago en pesos%'
  and pie like '%Llave (Bre-B)%'
  and pie not like '%(faltan los medios de pago en pesos)%';

-- ============================================================
-- Fase 35: los precios en pesos quedan firmes, y se limpian sus avisos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- El usuario confirmó los cuatro precios en pesos tal como quedan con la
-- tasa 3.613,35: 29.000, 87.000, 177.000 y 315.000. No hay nada que
-- recalcular —- la base ya da exactamente esos números —- pero sí dos
-- avisos que arreglar.
--
-- 1. El aviso de la tasa quedó viejo. Pedía decidir entre aceptar el
--    desvío o clavar otro precio, y eso ya está decidido. Un aviso que
--    describe una decisión tomada no avisa nada: gasta la atención que
--    hace falta para los que sí importan.
--
--    Que la tasa es de la casa y no del día ya lo dice la pantalla sola:
--    tasa_origen = 'ajuste' se muestra como "Ajustada a mano", y el botón
--    de calcular pide confirmación antes de pisarla.
--
-- 2. La fase 34 escribió ese aviso con "=" en vez de agregarlo al final,
--    y se llevó puesto el de FlujoTV en pesos: el que recuerda que sus
--    textos salen de Stella con la marca reemplazada. En dólares y en
--    bolívares sigue estando; en pesos había desaparecido. Se repone.

update public.venta_publico_listas l
set revisar = case
  when p.slug = 'flujotv'
    then 'Los textos salen de Stella con el nombre de la marca reemplazado. Confirmá cómo se escribe FLUJOTV antes de mandar la lista.'
  else ''
end
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'COP'
  and l.revisar like 'La tasa 3.613,35%';

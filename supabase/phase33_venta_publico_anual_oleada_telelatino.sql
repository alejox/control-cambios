-- ============================================================
-- Fase 33: el aviso viejo de Oleada, y el que sí corresponde
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- 1. Oleada arrastraba un aviso que ya no es cierto: avisaba que su lista
--    en bolívares decía "paga 10 meses y lleva 14" y la de dólares
--    "12 meses +2 gratis". Después de unificar los textos las dos dicen
--    lo mismo, así que el aviso quedó mintiendo. Un aviso que miente es
--    peor que ninguno: enseña a ignorarlos.
--
-- 2. Pero al verificarlo apareció lo de abajo, que sí es cierto y sigue
--    abierto: en Oleada y Telelatino el plan anual se anuncia como
--    "12 meses +2 gratis" y el precio no da esa cuenta.
--
--        3 dispositivos: mensual US$7,0 · anual US$69 -> 9,86 mensualidades
--        1 dispositivo:  mensual US$3,5 · anual US$35 -> 10,00 mensualidades
--
--    O sea el cliente paga ~10 meses y recibe 14: es "10 meses + 4 gratis",
--    la misma redacción que el usuario eligió para Stella. Con "12 meses"
--    el anual de 3 dispositivos tendría que costar US$84, no US$69.
--
--    No se corrige acá porque el texto comercial lo decide quien vende.
--    Se avisa, que es para lo que existe el campo.

-- ---------- El aviso que quedó viejo ----------
update public.venta_publico_listas l
set revisar = ''
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug = 'oleada'
  and l.moneda = 'VES'
  and l.revisar like 'Las etiquetas salen de la lista vieja en bolívares%';

-- ---------- El que sí corresponde ----------
-- Va en las tres monedas de las dos marcas, porque después de la fase 32
-- la etiqueta del anual es la misma en todas. Se agrega al final del
-- aviso que ya hubiera, sin pisarlo.
update public.venta_publico_listas l
set revisar = case when l.revisar = '' then '' else l.revisar || E'\n' end ||
  'El plan anual se anuncia como “12 meses +2 gratis”, pero el precio dice otra cosa: US$69 sobre una mensualidad de US$7 son 9,86 mensualidades, y US$35 sobre US$3,5 son 10 justas. Es “10 meses + 4 gratis”, igual que en Stella. Con 12 meses el anual de 3 dispositivos tendría que costar US$84.'
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('oleada', 'telelatino');

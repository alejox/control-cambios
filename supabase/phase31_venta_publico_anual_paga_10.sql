-- ============================================================
-- Fase 31: el anual se cuenta como "10 + 4", no como "12 + 2"
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- La fase 30 cargó el anual en dólares como "12 meses + 2 meses gratis",
-- copiado del texto de la marca. Contradecía a la lista en bolívares, que
-- lo vende como "paga 10 meses y recibe 14".
--
-- Gana la de 10. No es una preferencia de redacción: es la única que
-- cierra con el precio. Con la mensualidad en US$8:
--
--     paga 6 y recibe 7   -> 48,90 / 8 = 6,11 mensualidades  ✓
--     paga 10 y recibe 14 -> 86,90 / 8 = 10,86 mensualidades ✓
--     "12 meses + 2"      -> tendría que costar ~96, no 86,90  ✗
--
-- El cliente recibe 14 meses por US$86,90 en las dos redacciones, así que
-- la oferta es la misma. Lo que se corrige es el número que la cuenta.
update public.venta_publico_planes_texto pt
set sufijo = ' — 10 meses + 4 meses gratis (4 dispositivos)'
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where pt.plan_id = pl.id
  and pt.moneda = 'USD'
  and p.slug in ('stella', 'flujotv')
  and pl.etiqueta = 'Paga 10 meses y recibe 14 meses';

-- ---------- Queda un solo desacuerdo entre las dos listas ----------
-- El del anual se resolvió. El de los dispositivos sigue abierto: el
-- encabezado en bolívares promete "hasta (3)" para todos los planes y el
-- de dólares dice que el semestral y el anual dan 4. Un mismo plan no
-- puede dar distinta cantidad de pantallas según en qué moneda te lo
-- cobren, así que el aviso se queda hasta que alguien lo empareje.
update public.venta_publico_listas l
set revisar = replace(
  l.revisar,
  'El texto en dólares no coincide con esta lista: el anual allá es “12 meses + 2 meses gratis” (pagar 12, recibir 14) y acá es “paga 10 y recibe 14”; y el semestral y el anual allá dan 4 dispositivos, no 3. Definí cuál vale y emparejá las dos antes de mandar.',
  'En dólares el semestral y el anual dicen 4 dispositivos, y el encabezado de acá promete hasta 3 para todos. Emparejá las dos antes de mandar: el mismo plan no puede dar distintas pantallas según la moneda.')
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'VES';

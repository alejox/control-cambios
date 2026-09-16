-- ============================================================
-- Fase 44: el anual de Oleada y Telelatino se cuenta como 10 + 4
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Se anunciaba como "12 meses +2 gratis" y el precio decía otra cosa:
--
--     3 dispositivos: mensual US$7,0 · anual US$69 -> 9,86 mensualidades
--     1 dispositivo:  mensual US$3,5 · anual US$35 -> 10,00 mensualidades
--
-- El cliente paga ~10 mensualidades y recibe 14, o sea "10 meses + 4
-- gratis". Con 12 meses el anual de 3 dispositivos tendría que costar
-- US$84, no 69.
--
-- Gana la etiqueta, no el precio: el usuario confirmó que cobra bien y
-- contaba mal la promo. Es la misma corrección que ya se hizo en Stella
-- (fase 31), y deja a las cuatro marcas contando igual.
--
-- Se respeta el estilo de la casa —- barra y "+N gratis", como el
-- semestral de estas mismas marcas -— en vez de copiar el de Stella.

update public.venta_publico_planes_texto pt
set sufijo = replace(pt.sufijo, '12 meses +2 gratis', '10 meses +4 gratis')
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where pt.plan_id = pl.id
  and p.slug in ('oleada', 'telelatino')
  and pt.sufijo like '%12 meses +2 gratis%';

-- ---------- El aviso ya no aplica ----------
-- Se saca la frase y se deja lo demás: Telelatino además arrastra el
-- recordatorio del nombre de marca, que sigue abierto.
update public.venta_publico_listas l
set revisar = trim(both E'\n' from replace(
  l.revisar,
  'El plan anual se anuncia como “12 meses +2 gratis”, pero el precio dice otra cosa: US$69 sobre una mensualidad de US$7 son 9,86 mensualidades, y US$35 sobre US$3,5 son 10 justas. Es “10 meses + 4 gratis”, igual que en Stella. Con 12 meses el anual de 3 dispositivos tendría que costar US$84.',
  ''))
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('oleada', 'telelatino');

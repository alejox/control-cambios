-- ============================================================
-- Fase 34: la lista en pesos, con sus medios de pago y sus textos
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Los medios de pago en pesos son colombianos y valen para las cuatro
-- marcas: Llave (Bre-B), Nequi y Daviplata. Reemplazan al hueco que dejó
-- la fase 32.
--
-- Stella y FlujoTV además reciben el texto en pesos que pasó el usuario,
-- que NO es el de dólares traducido: en pesos los planes se cuentan con
-- los meses adelante ("6 meses + 1 mes adicional") en vez de "Semestral",
-- y el bloque se titula "3 dispositivos" en vez de "3 y 4". Se respeta
-- como vino: es la lista que el usuario manda por WhatsApp.
--
-- Lo que esta fase NO hace es poner la tasa. Ver el aviso al final.

-- ---------- Medios de pago, las cuatro marcas ----------
update public.venta_publico_listas
set pie = replace(
  pie,
  E'Medios de pago disponibles:\n\n🏦 (faltan los medios de pago en pesos)\n',
  E'🏦 Métodos de pago disponibles\n\nLlave (Bre-B)\n\nNequi\n\nDaviplata\n')
where moneda = 'COP';

-- ---------- El encabezado en pesos de Stella y FlujoTV ----------
-- Sin la línea "(Algunos planes incluyen 4 dispositivos…)": acá esa
-- información va pegada a cada plan que la da, que es donde se lee.
update public.venta_publico_listas l
set encabezado = replace(
  E'🌟 STELLA TV 🌟\n\n'
  || E'STELLA TV es una plataforma de televisión por suscripción que te brinda acceso a canales en vivo, deportes, películas, series, contenido infantil y mucho más, todo con calidad de alta definición.\n\n'
  || E'Podrás disfrutar de todo el contenido en hasta 3 dispositivos conectados simultáneamente: celulares, televisores o tabletas.',
  'STELLA TV', case when p.slug = 'stella' then 'STELLA TV' else 'FLUJOTV' end),
  plantilla_linea = E'📆 {etiqueta}: ${monto}{sufijo}'
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'COP';

-- ---------- El título del bloque ----------
update public.venta_publico_grupos_texto gt
set titulo = E'💥🎁 Planes y precios – 3 dispositivos 📺📲'
from public.venta_publico_grupos g
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where gt.grupo_id = g.id
  and gt.moneda = 'COP'
  and p.slug in ('stella', 'flujotv');

-- ---------- Cómo se llama cada plan en pesos ----------
update public.venta_publico_planes_texto pt
set etiqueta = v.etiqueta_cop, sufijo = ''
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p on p.id = g.proveedor_id
join (values
  ('1 mes',                           '1 mes'),
  ('3 meses',                         '3 meses'),
  ('Paga 6 meses y recibe 7 meses',   '6 meses + 1 mes adicional (7 meses) + 1 dispositivo extra (4 dispositivos en total)'),
  ('Paga 10 meses y recibe 14 meses', '10 meses + 4 meses adicionales (14 meses) + 1 dispositivo extra (4 dispositivos en total)')
) as v(etiqueta_interna, etiqueta_cop) on v.etiqueta_interna = pl.etiqueta
where pt.plan_id = pl.id
  and pt.moneda = 'COP'
  and p.slug in ('stella', 'flujotv');

-- ---------- La tasa de venta en pesos ----------
-- Los cuatro precios que pasó el usuario implican CUATRO tasas distintas,
-- y esta pantalla convierte con una sola:
--
--     29.000 / 8,0  = 3.625,0      176.800 / 48,9 = 3.615,5
--     86.000 / 23,9 = 3.598,3      315.200 / 86,9 = 3.627,2
--
-- O sea que ninguna tasa los reproduce a los cuatro. 3.613,35 es la que
-- menos se aleja con el redondeo de 1.000 que pidió el usuario: deja el
-- mensual exacto y desvía los otros tres 1.000, 200 y 200 pesos.
--
--     1 mes     29.000 -> 29.000   (exacto)
--     3 meses   86.000 -> 87.000   (+1.000)
--     7 meses  176.800 -> 177.000  (+200)
--     14 meses 315.200 -> 315.000  (-200)
--
-- Va como 'ajuste' y no como 'fuente' porque es la tasa del usuario, no
-- la TRM del día. Cualquiera de los cuatro precios se puede reescribir
-- desde la pantalla: eso recalcula la tasa y re-deriva los otros tres.
update public.venta_publico_listas l
set tasa = 3613.35,
    tasa_origen = 'ajuste',
    revisar = 'La tasa 3.613,35 es la que menos se aleja de los cuatro precios que definiste, pero ninguna los da a todos: el mensual queda exacto en 29.000, el trimestral sube a 87.000, el de 7 meses a 177.000 y el de 14 baja a 315.000. Ajustá cualquiera de los cuatro desde acá si preferís clavar otro.'
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'COP';

-- ---------- El ejemplo de compra, como lo escribe el usuario ----------
-- "1 año", no "un año": el pie vino heredado del texto en dólares y esa
-- palabra es la única que el usuario escribe distinto en pesos.
update public.venta_publico_listas l
set pie = replace(l.pie, '“Quiero comprar un año para 3 dispositivos.”',
                         '“Quiero comprar 1 año para 3 dispositivos.”')
where l.moneda = 'COP'
  and l.proveedor_id in (
    select id from public.venta_publico_proveedores where slug in ('stella', 'flujotv'));

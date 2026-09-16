-- ============================================================
-- Fase 30: Stella y FlujoTV en dólares
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Las dos marcas ya tenían su lista en bolívares, pero sus cuatro planes
-- no tenían ancla en dólares (precio_usd null). Sin ancla no hay nada que
-- convertir ni que mostrar, y por eso no aparecían en la sección USD.
--
-- FlujoTV va con los mismos precios y la misma estructura que Stella:
-- es lo mismo vendido con otro nombre.

-- ---------- El ancla en dólares ----------
-- Un solo precio por plan, compartido por todas las monedas de esa marca.
update public.venta_publico_planes pl
set precio_usd = v.precio
from public.venta_publico_grupos g,
     public.venta_publico_proveedores p,
     (values
       ('1 mes',                            8.0),
       ('3 meses',                         23.9),
       ('Paga 6 meses y recibe 7 meses',   48.9),
       ('Paga 10 meses y recibe 14 meses', 86.9)
     ) as v(etiqueta, precio)
where pl.grupo_id = g.id
  and g.proveedor_id = p.id
  and p.slug in ('stella', 'flujotv')
  and pl.etiqueta = v.etiqueta;

-- ---------- Las listas en dólares ----------
insert into public.venta_publico_listas
  (proveedor_id, moneda, redondeo, encabezado, plantilla_linea, pie, revisar)
select
  p.id,
  'USD',
  100,   -- No se usa: en dólares el precio ya está en la moneda de la lista.
  replace(
    E'🌟 STELLA TV 🌟\n\n'
    || E'STELLA TV es una plataforma de televisión por suscripción que te brinda acceso a canales en vivo, deportes, películas, series, contenido infantil y mucho más, todo con calidad de alta definición.\n\n'
    || E'Podrás disfrutar de todo el contenido en hasta 3 dispositivos conectados simultáneamente: celulares, televisores o tabletas.\n'
    || E'(Algunos planes incluyen 4 dispositivos según tu selección.)',
    'STELLA TV', p.marca),
  E'📆 {etiqueta}: US${monto}{sufijo}',
  replace(
    E'Medios de pago disponibles:\n\n'
    || E'🏦 Astropay\n🏦 Wise\n🏦 Paypal\n🏦 DolarApp\n🏦 Binance\n🏦 Cuenta usd\n🏦 Cuenta euro\n\n'
    || E'📝 Ejemplo de compra\n\n'
    || E'“Quiero comprar un año para 3 dispositivos.”\n\n'
    || E'Una vez confirmado el pago, se procede inmediatamente con la activación del servicio.\n\n'
    || E'⚠️ Aviso importante\n\n'
    || E'El servicio brindado consiste en facilitar acceso a contenido alojado en diversas plataformas de streaming.\n'
    || E'STELLA TV no posee derechos de retransmisión, ni garantiza la disponibilidad, estabilidad o continuidad del contenido ofrecido por terceros.\n\n'
    || E'El acceso puede presentar cambios, variaciones o suspensiones sin previo aviso. La compra es responsabilidad del usuario.\n\n'
    || E'No se realizan reembolsos ni devoluciones de dinero bajo ninguna circunstancia.',
    'STELLA TV', p.marca),
  p.aviso
from (
  select id, 'STELLA TV' as marca, '' as aviso
    from public.venta_publico_proveedores where slug = 'stella'
  union all
  select id, 'FLUJOTV',
         'Los textos salen de Stella con el nombre de la marca reemplazado. Confirmá cómo se escribe FLUJOTV antes de mandar la lista.'
    from public.venta_publico_proveedores where slug = 'flujotv'
) as p
on conflict (proveedor_id, moneda) do nothing;

-- ---------- El título del bloque de precios ----------
insert into public.venta_publico_grupos_texto (grupo_id, moneda, titulo)
select g.id, 'USD', E'💥🎁 Planes y precios – 3 y 4 dispositivos 📺📲'
from public.venta_publico_grupos g
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where p.slug in ('stella', 'flujotv')
on conflict (grupo_id, moneda) do nothing;

-- ---------- Cómo se llama cada plan en dólares ----------
-- En bolívares el plan se cuenta como "paga N y recibe M"; en dólares se
-- cuenta como "Semestral / Anual" y el detalle va en el sufijo. Es la
-- misma oferta dicha de dos maneras, que es justo para lo que existe la
-- tabla de textos por moneda.
insert into public.venta_publico_planes_texto (plan_id, moneda, etiqueta, sufijo)
select pl.id, 'USD', v.etiqueta_usd, v.sufijo
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p on p.id = g.proveedor_id
join (values
  ('1 mes',                            'Mensual',     ''),
  ('3 meses',                          'Trimestral',  ''),
  ('Paga 6 meses y recibe 7 meses',    'Semestral',   ' — 6 meses + 1 mes gratis (4 dispositivos)'),
  ('Paga 10 meses y recibe 14 meses',  'Anual',       ' — 12 meses + 2 meses gratis (4 dispositivos)')
) as v(etiqueta_interna, etiqueta_usd, sufijo) on v.etiqueta_interna = pl.etiqueta
where p.slug in ('stella', 'flujotv')
on conflict (plan_id, moneda) do nothing;

-- ---------- Lo que no cierra entre las dos listas ----------
-- El texto en dólares contradice a la lista en bolívares que ya está
-- andando, en dos puntos. No se resuelve acá: se avisa en pantalla para
-- que lo decida quien vende, antes de mandarle una lista a un cliente.
--
--   1. El anual. En bolívares el plan es "paga 10 meses y recibe 14".
--      En dólares el texto dice "12 meses + 2 meses gratis", o sea pagar
--      12 y recibir 14. Mismo ancla de US$86,9, dos ofertas distintas:
--      la lista en bolívares estaría regalando dos meses.
--
--   2. Los dispositivos. En bolívares todos los planes dicen "hasta (3)".
--      En dólares el semestral y el anual dicen 4.
update public.venta_publico_listas l
set revisar = trim(both E'\n' from coalesce(nullif(l.revisar, ''), '') || E'\n' ||
  'El texto en dólares no coincide con esta lista: el anual allá es “12 meses + 2 meses gratis” (pagar 12, recibir 14) y acá es “paga 10 y recibe 14”; y el semestral y el anual allá dan 4 dispositivos, no 3. Definí cuál vale y emparejá las dos antes de mandar.')
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'VES';

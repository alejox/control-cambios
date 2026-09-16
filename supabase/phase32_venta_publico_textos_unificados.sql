-- ============================================================
-- Fase 32: un solo texto por marca, en las tres monedas
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Hasta acá cada moneda contaba la misma marca con palabras distintas: el
-- encabezado en bolívares decía "hasta (3) dispositivos" y el de dólares
-- decía que algunos planes dan 4; los planes se llamaban "Paga 6 meses y
-- recibe 7" de un lado y "Semestral" del otro. Dos versiones de la misma
-- oferta es una que está desactualizada y nadie sabe cuál.
--
-- La de dólares manda, porque es la que el usuario acaba de revisar.
--
-- Lo que NO se unifica y por qué: los medios de pago. No se puede pagar
-- en bolívares con Wise ni en pesos con Pago Móvil. Cada moneda se queda
-- con los suyos, y la de pesos —- que no tiene —- queda avisada en vez de
-- heredar una lista de medios que no le sirven a nadie.

-- ---------- El encabezado ----------
update public.venta_publico_listas destino
set encabezado = fuente.encabezado
from public.venta_publico_listas fuente
where fuente.proveedor_id = destino.proveedor_id
  and fuente.moneda = 'USD'
  and destino.moneda in ('VES', 'COP');

-- ---------- El título de cada bloque de planes ----------
insert into public.venta_publico_grupos_texto (grupo_id, moneda, titulo)
select gt.grupo_id, m.moneda, gt.titulo
from public.venta_publico_grupos_texto gt
cross join (values ('VES'), ('COP')) as m(moneda)
where gt.moneda = 'USD'
on conflict (grupo_id, moneda) do update set titulo = excluded.titulo;

-- ---------- Cómo se llama cada plan ----------
insert into public.venta_publico_planes_texto (plan_id, moneda, etiqueta, sufijo)
select pt.plan_id, m.moneda, pt.etiqueta, pt.sufijo
from public.venta_publico_planes_texto pt
cross join (values ('VES'), ('COP')) as m(moneda)
where pt.moneda = 'USD'
on conflict (plan_id, moneda) do update
  set etiqueta = excluded.etiqueta, sufijo = excluded.sufijo;

-- ---------- La línea de precio ----------
-- Misma forma que en dólares (etiqueta primero, monto después), con el
-- símbolo de cada moneda. El asterisco de WhatsApp se conserva donde ya
-- estaba: en bolívares la lista salía en negrita y perder eso sería un
-- cambio de formato disfrazado de unificación de texto.
update public.venta_publico_listas destino
set plantilla_linea = case destino.moneda
  when 'COP' then replace(fuente.plantilla_linea, 'US${monto}', '${monto} COP')
  when 'VES' then replace(fuente.plantilla_linea, '{etiqueta}: US${monto}', '*{etiqueta}: {monto} Bs*')
end
from public.venta_publico_listas fuente
where fuente.proveedor_id = destino.proveedor_id
  and fuente.moneda = 'USD'
  and destino.moneda in ('VES', 'COP');

-- ---------- El pie en pesos ----------
-- Sale del de dólares, que trae el ejemplo de compra y el aviso legal
-- —- eso sí es igual en toda moneda -— con el bloque de medios de pago
-- reemplazado por un hueco visible. Un hueco que se ve es un texto que
-- alguien completa; una lista de medios equivocada se manda tal cual.
update public.venta_publico_listas destino
set pie = regexp_replace(fuente.pie, '(🏦[^\n]*\n?)+',
                         E'🏦 (faltan los medios de pago en pesos)\n', 'g')
from public.venta_publico_listas fuente
where fuente.proveedor_id = destino.proveedor_id
  and fuente.moneda = 'USD'
  and destino.moneda = 'COP';

-- ---------- Los avisos ----------
-- Lo que falta en pesos ya no son "los textos": es una sola cosa concreta.
update public.venta_publico_listas
set revisar = 'Faltan los medios de pago en pesos. El resto del mensaje ya está; completá el bloque 🏦 antes de mandar la lista.'
where moneda = 'COP';

-- Y el desacuerdo de los dispositivos se terminó solo: el encabezado de
-- bolívares ahora es el de dólares, que ya dice que algunos planes dan 4.
update public.venta_publico_listas
set revisar = trim(both E'\n' from replace(revisar,
  'En dólares el semestral y el anual dicen 4 dispositivos, y el encabezado de acá promete hasta 3 para todos. Emparejá las dos antes de mandar: el mismo plan no puede dar distintas pantallas según la moneda.',
  ''))
where moneda = 'VES';

-- ============================================================
-- Fase 26: la lista de Stella
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez). Aditiva: solo carga datos de venta_publico_*.
-- ============================================================

-- Stella tiene UN solo grupo, no dos como Oleada, y sus etiquetas son
-- distintas aunque los precios coincidan ("Paga ... y recibe ..." contra
-- "paga ... y lleva ..."). Son textos que el usuario le manda a sus
-- clientes: van como los escribió, sin unificar con los de Oleada.
--
-- OJO CON EL PIE: el usuario lo mandó cortado a mitad de palabra, y así
-- queda guardado. Completarlo sería inventarle una cláusula legal. La
-- pantalla avisa que está incompleto y él lo termina desde la app.

update public.venta_publico_proveedores
   set encabezado = $enc$💥🎁 *STELLA TV – PLANES Y PRECIOS* 💥🥳

Es una aplicación de televisión de pago que te brinda acceso a canales de televisión, deportes, películas, series y contenido infantil con calidad de alta gama.

Tendrás acceso a todo el contenido conectando hasta *(3) dispositivos o pantallas en simultáneo*.$enc$,
       pie = $pie$💳 *¿Por qué medio desea realizar el pago?*

🏦 *Pago Móvil*

*Ejemplo:* 👇👇👇👇

Quiero comprar *1 año para 3 dispositivos*.

Una vez verificado el pago, se procede a su respectiva activación.

⚠️ *Aviso importante*

El servicio ofrecido consiste en el acceso a contenido de diferentes plataformas de streaming. No contamos con los derechos de retransmisión ni somos responsables por la disponibilidad, continuidad o calidad del contenido proporcionado por dichas plataformas.

El acceso al servicio puede v$pie$,
       updated_at = now()
 where slug = 'stella'
   and encabezado = '';

insert into public.venta_publico_grupos (proveedor_id, titulo, orden)
select p.id, '📺📲 *Plan hasta 3 dispositivos*', 1
  from public.venta_publico_proveedores p
 where p.slug = 'stella'
   and not exists (
     select 1 from public.venta_publico_grupos x where x.proveedor_id = p.id
   );

-- Mismas anclas que Oleada porque los precios en Bs son los mismos:
-- 6.400/800 = 8, 19.200/800 = 24, 33.800/800 = 42,25 y 64.000/800 = 80.
insert into public.venta_publico_planes (grupo_id, etiqueta, precio_usd, orden)
select g.id, v.etiqueta, v.precio_usd, v.orden
  from public.venta_publico_grupos g
  join public.venta_publico_proveedores p
    on p.id = g.proveedor_id and p.slug = 'stella'
  join (values
    ('1 mes', 8.00, 1),
    ('3 meses', 24.00, 2),
    ('Paga 6 meses y recibe 7 meses', 42.25, 3),
    ('Paga 10 meses y recibe 14 meses', 80.00, 4)
  ) as v(etiqueta, precio_usd, orden) on true
 where not exists (
   select 1 from public.venta_publico_planes x where x.grupo_id = g.id
 );

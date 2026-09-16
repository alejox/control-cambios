-- ============================================================
-- Fase 38: Stella y FlujoTV son de 3 dispositivos, y el pie en Bs
--          estaba cortado de verdad
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- 1. El aviso "el pie parece cortado" NO era un falso positivo. El pie en
--    bolívares de Stella y FlujoTV termina en "El acceso al servicio puede
--    v": cortado a mitad de "variar". Tiene 453 caracteres contra los 711
--    del mismo texto legal en Oleada.
--
--    Se completa desde la versión entera en vez de apagar el aviso. Un
--    chequeo que molesta y acierta no se saca: se le hace caso.
--
-- 2. Stella y FlujoTV vienen SOLO para 3 dispositivos. La mención a los 4
--    salía del texto que se cargó en la fase 30 y no corresponde: se va
--    del encabezado, del título del bloque y de los cuatro planes en las
--    tres monedas.

-- ---------- El pie que estaba cortado ----------
update public.venta_publico_listas l
set pie = left(l.pie, length(l.pie) - length('El acceso al servicio puede v')) ||
  'El acceso al servicio puede variar, estar sujeto a cambios o suspensión sin previo aviso, por lo que la decisión de compra es responsabilidad exclusiva del usuario.'
  || E'\n\n' ||
  'Al adquirir el servicio, el usuario acepta que *no se realizan reembolsos ni devoluciones de dinero bajo ninguna circunstancia.* ⚠️'
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv')
  and l.moneda = 'VES'
  and l.pie like '%El acceso al servicio puede v';

-- ---------- Solo 3 dispositivos: el encabezado ----------
update public.venta_publico_listas l
set encabezado = replace(l.encabezado,
  E'\n(Algunos planes incluyen 4 dispositivos según tu selección.)', '')
from public.venta_publico_proveedores p
where p.id = l.proveedor_id
  and p.slug in ('stella', 'flujotv');

-- ---------- ...el título del bloque... ----------
update public.venta_publico_grupos_texto gt
set titulo = replace(gt.titulo, '3 y 4 dispositivos', '3 dispositivos')
from public.venta_publico_grupos g
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where gt.grupo_id = g.id
  and p.slug in ('stella', 'flujotv');

-- ---------- ...y cada plan ----------
-- El dispositivo extra era parte de la promo del semestral y del anual.
-- Sin él, lo que queda es solo el regalo en meses, que es lo que de
-- verdad ofrecen estas dos marcas.
update public.venta_publico_planes_texto pt
set etiqueta = replace(pt.etiqueta, ' + 1 dispositivo extra (4 dispositivos en total)', ''),
    sufijo   = replace(pt.sufijo,   ' (4 dispositivos)', '')
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p on p.id = g.proveedor_id
where pt.plan_id = pl.id
  and p.slug in ('stella', 'flujotv');

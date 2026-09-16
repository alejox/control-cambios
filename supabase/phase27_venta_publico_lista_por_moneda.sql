-- ============================================================
-- Fase 27: un solo precio en dólares, cada moneda como
-- presentación, tasa de venta por lista y edición compartida
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La fase 25 guardaba el encabezado, el pie y el precio contra el
-- proveedor, como si cada moneda fuera una lista de precios aparte. Está
-- mal: si el precio viviera dos veces, el día que el usuario suba Mensual
-- de 7 a 8 dólares lo va a cambiar en una lista y no en la otra, y va a
-- estar vendiendo a dos precios distintos sin enterarse.
--
-- El modelo bueno: el precio vive UNA vez, en dólares, colgado del plan.
-- Cada moneda es una PRESENTACIÓN de esos mismos planes, y lo único que
-- cambia es lo visual y lo textual: encabezado, pie, formato de línea,
-- el título de cada grupo y la etiqueta de cada plan. El usuario las
-- escribe distinto —- en dólares "Mensual", en bolívares "1 mes" -— pero
-- es el mismo plan al mismo precio.

-- ---------- El precio puede estar pendiente ----------
-- Stella y FlujoTV tienen los planes cargados pero el usuario todavía no
-- dio sus valores en dólares. Null es "todavía no sé", que es distinto
-- de cero: un cero se vería como un precio y saldría publicado.
alter table public.venta_publico_planes alter column precio_usd drop not null;

alter table public.venta_publico_planes
  drop constraint if exists venta_publico_planes_precio_usd_check;
alter table public.venta_publico_planes
  add constraint venta_publico_planes_precio_usd_check
  check (precio_usd is null or precio_usd > 0);

comment on column public.venta_publico_planes.precio_usd is
  'El precio, en dólares y una sola vez. Null = todavía sin definir. Las '
  'listas en bolívares lo convierten con la tasa de venta de la lista; '
  'nunca guardan un precio propio.';

comment on column public.venta_publico_planes.etiqueta is
  'Nombre interno del plan, para reconocerlo en el panel. Lo que sale en '
  'el mensaje es la etiqueta de venta_publico_planes_texto, que cambia '
  'con la moneda.';

comment on column public.venta_publico_grupos.titulo is
  'Nombre interno del grupo. El título que sale en el mensaje vive en '
  'venta_publico_grupos_texto, que cambia con la moneda.';

-- ---------- La lista: un proveedor presentado en una moneda ----------
create table if not exists public.venta_publico_listas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null
    references public.venta_publico_proveedores(id) on delete cascade,
  -- Texto con check y no el enum public.moneda: ese enum es de
  -- contabilidad (VES | COP) y agregarle 'USD' lo ensancharía para items
  -- y depósitos, que no tienen nada que ver con estas listas.
  moneda text not null check (moneda in ('VES', 'COP', 'USD')),
  encabezado text not null default '',
  pie text not null default '',
  -- El formato de línea no puede estar hardcodeado: en Bs la línea es
  --   📆 *6.400 Bs / 1 mes*
  -- y en USD es
  --   •⁠  ⁠📆 Mensual: US$7
  -- Marcadores: {monto}, {etiqueta} y {sufijo}.
  plantilla_linea text not null default '{etiqueta}: {monto}{sufijo}',
  -- Motivo por el que esta lista todavía no es confiable. Vacío = nada
  -- que revisar. Lo escribe quien siembra o migra datos, y lo borra
  -- cualquiera de los dos roles desde la app cuando confirmó que está
  -- bien.
  revisar text not null default '',

  -- ---- La tasa de venta de ESTA lista ----
  -- El precio en bolívares no es el precio en dólares convertido: es el
  -- precio en dólares convertido MÁS el margen del usuario, que es su
  -- negocio. Ese margen vive acá, explícito, en vez de estar escondido
  -- en números que alguien tipeó una vez y nadie recuerda de dónde
  -- salieron.
  --
  -- Ajustar un precio en bolívares a mano ES editar esta tasa: se divide
  -- el monto tipeado por el ancla en dólares de ese plan y todos los
  -- demás precios se re-derivan desde su propia ancla. Escalar los
  -- valores ya redondeados por un factor arrastraría el error de
  -- redondeo de cada uno y la lista se iría desviando del ancla.
  --
  -- Persiste porque una lista de precios que se resetea cada vez que
  -- abrís la pantalla no es una lista de precios.
  tasa numeric(18,6) check (tasa is null or tasa > 0),
  tasa_at timestamptz,
  tasa_origen text check (tasa_origen in ('binance', 'ajuste')),
  -- La tasa es compartida: si uno la ajusta, cambia para el otro. Está
  -- bien que sea así (es la lista de la empresa, no de una persona), pero
  -- tiene que verse quién la tocó, o un precio que cambió solo es una
  -- discusión asegurada.
  tasa_por uuid references public.profiles(id),
  -- El email va copiado y no leído de profiles a propósito: un
  -- colaborador solo puede ver SU perfil (política "ver propio perfil"),
  -- así que si el cartel saliera de un join, vería "—" cada vez que la
  -- tasa la tocó el admin. Es además el email que tenía al momento del
  -- cambio, que es lo que corresponde a una traza.
  tasa_por_email text,
  -- La referencia de Binance con la que se comparó por última vez, para
  -- poder mostrar a qué distancia quedó la tasa de venta.
  tasa_binance numeric(18,6) check (tasa_binance is null or tasa_binance > 0),
  tasa_binance_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (proveedor_id, moneda)
);

-- ---------- Los textos que cambian con la moneda ----------
create table if not exists public.venta_publico_grupos_texto (
  grupo_id uuid not null
    references public.venta_publico_grupos(id) on delete cascade,
  moneda text not null check (moneda in ('VES', 'COP', 'USD')),
  titulo text not null,
  primary key (grupo_id, moneda)
);

create table if not exists public.venta_publico_planes_texto (
  plan_id uuid not null
    references public.venta_publico_planes(id) on delete cascade,
  moneda text not null check (moneda in ('VES', 'COP', 'USD')),
  etiqueta text not null,
  -- Va pegado después del precio, en la misma línea:
  --   •⁠  ⁠📆 Semestral: US$39/ 6 meses +1 gratis
  -- Campo aparte y no parte de la etiqueta porque la etiqueta va ANTES
  -- del monto y el sufijo DESPUÉS.
  sufijo text not null default '',
  primary key (plan_id, moneda)
);

-- ============================================================
-- RLS: Venta público es una herramienta de trabajo compartida
-- ============================================================

-- Acá NO vale el criterio de "configuracion" (leen los dos, escribe el
-- admin). Esto no es configuración de administrador: son las listas de
-- precios con las que trabajan los dos roles, y los dos las editan.
-- La única puerta es la de siempre: sin_acceso no entra.
--
-- Esto reemplaza las políticas de solo-admin de la fase 25.

alter table public.venta_publico_proveedores enable row level security;
alter table public.venta_publico_grupos enable row level security;
alter table public.venta_publico_planes enable row level security;
alter table public.venta_publico_listas enable row level security;
alter table public.venta_publico_grupos_texto enable row level security;
alter table public.venta_publico_planes_texto enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'venta_publico_proveedores',
    'venta_publico_grupos',
    'venta_publico_planes',
    'venta_publico_listas',
    'venta_publico_grupos_texto',
    'venta_publico_planes_texto'
  ] loop
    -- Las de la fase 25, que daban escritura solo al admin.
    execute format('drop policy if exists %I on public.%I',
                   'solo admin escribe ' || replace(t, 'venta_publico_', '') || ' de venta', t);
    execute format('drop policy if exists %I on public.%I',
                   'colaborador y admin leen ' || replace(t, 'venta_publico_', '') || ' de venta', t);
    execute format('drop policy if exists %I on public.%I', 'venta publico lee ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'venta publico escribe ' || t, t);

    execute format($f$
      create policy %I on public.%I for select
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'colaborador')
        )
      )
    $f$, 'venta publico lee ' || t, t);

    execute format($f$
      create policy %I on public.%I for all
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'colaborador')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'colaborador')
        )
      )
    $f$, 'venta publico escribe ' || t, t);
  end loop;
end $$;

-- ============================================================
-- Semilla
-- ============================================================

-- Los grupos y planes sembrados en la fase 25 se rehacen enteros: sus
-- precios salían de dividir la lista vieja en bolívares por 800, y esa
-- tasa ya no corre. Los precios buenos son los de la lista en dólares.
-- No hay datos de usuario acá: todo esto se sembró en esta misma tanda.
delete from public.venta_publico_grupos;

-- ---------- Las listas ----------
-- Bs de Oleada y de Stella: los textos estaban en el proveedor (fase 25)
-- y se mudan tal cual a la lista de su moneda.
insert into public.venta_publico_listas
  (proveedor_id, moneda, plantilla_linea, encabezado, pie, revisar)
select
  p.id,
  'VES',
  '📆 *{monto} Bs / {etiqueta}*{sufijo}',
  p.encabezado,
  p.pie,
  case when p.slug = 'oleada' then
    'Las etiquetas salen de la lista vieja en bolívares. Ojo con el plan Anual: en Bs dice "paga 10 meses y lleva 14 meses" y en dólares "12 meses +2 gratis", que no es la misma promoción.'
  else '' end
from public.venta_publico_proveedores p
where p.slug in ('oleada', 'stella')
on conflict (proveedor_id, moneda) do nothing;

-- Telelatino copia a Oleada y FlujoTV copia a Stella, porque el usuario
-- dijo que son iguales. El nombre de la marca va reemplazado de la forma
-- más literal posible: si se copiara tal cual, el mensaje de Telelatino
-- diría "OLEADA TV" y eso terminaría en el chat de un cliente. Queda
-- marcado para revisar porque la grafía exacta no la sabemos.
insert into public.venta_publico_listas
  (proveedor_id, moneda, plantilla_linea, encabezado, pie, revisar)
select
  destino.id,
  origen_lista.moneda,
  origen_lista.plantilla_linea,
  replace(origen_lista.encabezado, copia.de, copia.a),
  replace(origen_lista.pie, copia.de, copia.a),
  'Los textos se copiaron de ' || copia.nombre_origen ||
  ' reemplazando el nombre de la marca. Confirmá cómo se escribe antes de mandar la lista.'
from (values
  ('telelatino', 'oleada', 'OLEADA', 'TELELATINO', 'Oleada'),
  ('flujotv', 'stella', 'STELLA', 'FLUJOTV', 'Stella')
) as copia(slug_destino, slug_origen, de, a, nombre_origen)
join public.venta_publico_proveedores destino on destino.slug = copia.slug_destino
join public.venta_publico_proveedores origen on origen.slug = copia.slug_origen
join public.venta_publico_listas origen_lista on origen_lista.proveedor_id = origen.id
on conflict (proveedor_id, moneda) do nothing;

-- La lista en dólares de Oleada. chr(8288) es el WORD JOINER (U+2060)
-- que el usuario tiene entre el bullet y el emoji: es invisible, así que
-- va explícito para que se vea que está ahí y no se pierda en una
-- edición. Esta versión no usa asteriscos de negrita y la de Bs sí: son
-- textos del usuario, no se uniforman.
insert into public.venta_publico_listas
  (proveedor_id, moneda, plantilla_linea, encabezado, pie)
select
  p.id,
  'USD',
  '•' || chr(8288) || '  ' || chr(8288) || '📆 {etiqueta}: US${monto}{sufijo}',
  $enc$OLEADA TV
Es una aplicación de televisión de pago que te brinda acceso a canales de televisión, deportes, películas, series, contenido infantil con calidad de alta gama. Tendrás acceso a todo el contenido conectando hasta (3) dispositivos o pantallas en simultáneo.

💥🎁 Planes y precios: 💥🥳$enc$,
  $pie$Medios de pago disponibles:

🏦 Astropay
🏦 Wise
🏦 Paypal
🏦 DolarApp
🏦 Binance
🏦 Cuenta usd

⚠️El servicio ofrecido consiste en el acceso a contenido de diferentes plataformas de streaming. No contamos con los derechos de retransmisión ni somos responsables por la disponibilidad, continuidad o calidad del contenido proporcionado por dichas plataformas.

El acceso al servicio puede variar, estar sujeto a cambios o suspensión sin previo aviso, por lo que la decisión de compra es responsabilidad exclusiva del usuario.

Al adquirir el servicio, el usuario acepta que no se realizan reembolsos ni devoluciones de dinero, bajo ninguna circunstancia.⚠️$pie$
from public.venta_publico_proveedores p
where p.slug = 'oleada'
on conflict (proveedor_id, moneda) do nothing;

insert into public.venta_publico_listas
  (proveedor_id, moneda, plantilla_linea, encabezado, pie, revisar)
select
  destino.id,
  'USD',
  origen_lista.plantilla_linea,
  replace(origen_lista.encabezado, 'OLEADA', 'TELELATINO'),
  replace(origen_lista.pie, 'OLEADA', 'TELELATINO'),
  'Los textos se copiaron de Oleada reemplazando el nombre de la marca. Confirmá cómo se escribe antes de mandar la lista.'
from public.venta_publico_proveedores destino
join public.venta_publico_proveedores origen on origen.slug = 'oleada'
join public.venta_publico_listas origen_lista
  on origen_lista.proveedor_id = origen.id and origen_lista.moneda = 'USD'
where destino.slug = 'telelatino'
on conflict (proveedor_id, moneda) do nothing;

-- Los textos ya no viven en el proveedor. Se vacían en vez de dropearse
-- para no romper nada que todavía los lea, pero no queda una segunda
-- copia dando vueltas: dos copias del mismo texto es cómo empiezan los
-- mensajes desactualizados.
update public.venta_publico_proveedores set encabezado = '', pie = '';

comment on column public.venta_publico_proveedores.encabezado is
  'OBSOLETA. El encabezado vive en venta_publico_listas, una por moneda.';
comment on column public.venta_publico_proveedores.pie is
  'OBSOLETA. El pie vive en venta_publico_listas, una por moneda.';
comment on column public.venta_publico_proveedores.moneda is
  'OBSOLETA. Un proveedor ya no tiene una sola moneda: tiene una lista '
  'por moneda en venta_publico_listas.';

-- ---------- Los grupos ----------
insert into public.venta_publico_grupos (proveedor_id, titulo, orden)
select p.id, g.titulo, g.orden
from public.venta_publico_proveedores p
cross join (values
  ('Plan 3 dispositivos', 1),
  ('Plan 1 dispositivo', 2)
) as g(titulo, orden)
where p.slug in ('oleada', 'telelatino');

insert into public.venta_publico_grupos (proveedor_id, titulo, orden)
select p.id, 'Plan hasta 3 dispositivos', 1
from public.venta_publico_proveedores p
where p.slug in ('stella', 'flujotv');

insert into public.venta_publico_grupos_texto (grupo_id, moneda, titulo)
select g.id, 'VES', t.titulo
from public.venta_publico_grupos g
join (values
  ('Plan 3 dispositivos', '📺📲 *Plan 3 dispositivos*'),
  ('Plan 1 dispositivo', '📺📱 *Plan 1 dispositivo (TV o móvil)*'),
  ('Plan hasta 3 dispositivos', '📺📲 *Plan hasta 3 dispositivos*')
) as t(interno, titulo) on t.interno = g.titulo;

insert into public.venta_publico_grupos_texto (grupo_id, moneda, titulo)
select g.id, 'USD', t.titulo
from public.venta_publico_grupos g
join public.venta_publico_proveedores p on p.id = g.proveedor_id
join (values
  ('Plan 3 dispositivos', 'Plan 3 dispositivos: 📺📲'),
  ('Plan 1 dispositivo', 'Plan 1 dispositivo: (tv📺) o (móvil📱)')
) as t(interno, titulo) on t.interno = g.titulo
where p.slug in ('oleada', 'telelatino');

-- ---------- Los planes ----------
-- Un solo precio, el de la lista en dólares. Los de la lista vieja en
-- bolívares (8, 24, 42,25, 80) se descartan: salían de una tasa que ya
-- no corre.
insert into public.venta_publico_planes (grupo_id, etiqueta, precio_usd, orden)
select g.id, v.interno, v.precio, v.orden
from public.venta_publico_grupos g
join public.venta_publico_proveedores p
  on p.id = g.proveedor_id and p.slug in ('oleada', 'telelatino')
join (values
  ('Plan 3 dispositivos', 'Mensual', 7.00, 1),
  ('Plan 3 dispositivos', 'Trimestral', 21.00, 2),
  ('Plan 3 dispositivos', 'Semestral', 39.00, 3),
  ('Plan 3 dispositivos', 'Anual', 69.00, 4),
  ('Plan 1 dispositivo', 'Mensual', 3.50, 1),
  ('Plan 1 dispositivo', 'Trimestral', 10.50, 2),
  ('Plan 1 dispositivo', 'Semestral', 21.00, 3),
  ('Plan 1 dispositivo', 'Anual', 35.00, 4)
) as v(grupo, interno, precio, orden) on v.grupo = g.titulo;

-- Stella y FlujoTV: los cuatro planes, sin precio. El usuario todavía no
-- dio sus valores en dólares y no hay de dónde deducirlos.
insert into public.venta_publico_planes (grupo_id, etiqueta, precio_usd, orden)
select g.id, v.interno, null::numeric, v.orden
from public.venta_publico_grupos g
join public.venta_publico_proveedores p
  on p.id = g.proveedor_id and p.slug in ('stella', 'flujotv')
cross join (values
  ('1 mes', 1),
  ('3 meses', 2),
  ('Paga 6 meses y recibe 7 meses', 3),
  ('Paga 10 meses y recibe 14 meses', 4)
) as v(interno, orden);

-- Etiquetas en bolívares de Oleada y Telelatino. Los dos grupos usan las
-- mismas, tal como estaban en la lista que mandó el usuario.
insert into public.venta_publico_planes_texto (plan_id, moneda, etiqueta, sufijo)
select pl.id, 'VES', t.etiqueta, ''
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p
  on p.id = g.proveedor_id and p.slug in ('oleada', 'telelatino')
join (values
  ('Mensual', '1 mes'),
  ('Trimestral', '3 meses'),
  ('Semestral', 'paga 6 meses y lleva 7 meses'),
  ('Anual', 'paga 10 meses y lleva 14 meses')
) as t(interno, etiqueta) on t.interno = pl.etiqueta;

-- Etiquetas en dólares. El sufijo va pegado al precio:
--   US$39/ 6 meses +1 gratis
-- En bolívares la misma promoción se cuenta dentro de la etiqueta, por
-- eso ahí el sufijo va vacío.
insert into public.venta_publico_planes_texto (plan_id, moneda, etiqueta, sufijo)
select pl.id, 'USD', t.etiqueta, t.sufijo
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p
  on p.id = g.proveedor_id and p.slug in ('oleada', 'telelatino')
join (values
  ('Mensual', 'Mensual', ''),
  ('Trimestral', 'Trimestral', ''),
  ('Semestral', 'Semestral', '/ 6 meses +1 gratis'),
  ('Anual', 'Anual', '/ 12 meses +2 gratis')
) as t(interno, etiqueta, sufijo) on t.interno = pl.etiqueta;

-- Stella y FlujoTV solo tienen lista en bolívares, y sus etiquetas son
-- distintas de las de Oleada aunque el plan se parezca: dicen "Paga" y
-- "recibe" donde Oleada dice "paga" y "lleva".
insert into public.venta_publico_planes_texto (plan_id, moneda, etiqueta, sufijo)
select pl.id, 'VES', pl.etiqueta, ''
from public.venta_publico_planes pl
join public.venta_publico_grupos g on g.id = pl.grupo_id
join public.venta_publico_proveedores p
  on p.id = g.proveedor_id and p.slug in ('stella', 'flujotv');

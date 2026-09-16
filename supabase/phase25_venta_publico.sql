-- ============================================================
-- Fase 25: Venta público — listas de precios ancladas en dólares
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez). Es 100% aditiva: no toca ninguna tabla existente.
-- ============================================================

-- El precio se guarda en USD y NO en bolívares, y no es una preferencia
-- de diseño: si lo guardado fueran los Bs, "recalcular" no tendría de
-- dónde partir. La lista en Bs es el resultado de aplicar la tasa del día
-- al ancla en dólares, no el dato.
--
-- Tres tablas y no una sola con todo adentro porque el mensaje de
-- WhatsApp tiene exactamente esa forma: un proveedor con su presentación
-- y su cierre, adentro grupos de planes con su título, y adentro de cada
-- grupo las líneas de precio.

-- ---------- Proveedor: una lista de precios completa ----------
create table if not exists public.venta_publico_proveedores (
  id uuid primary key default gen_random_uuid(),
  -- El slug identifica la solapa en la URL y en el código sin depender
  -- de un uuid ni del nombre, que el usuario puede querer cambiar.
  slug text not null unique,
  nombre text not null,
  -- La moneda de la lista es la que agrupa las secciones de la pantalla.
  -- Hoy solo hay listas en Bs; el día que haya en COP alcanza con
  -- insertar filas con moneda = 'COP'.
  moneda public.moneda not null default 'VES',
  orden integer not null default 0,
  -- Los dos textos libres del mensaje: la presentación del servicio y el
  -- cierre (medios de pago + advertencia legal). Son del usuario, van
  -- tal cual los escribe, con sus emojis y sus asteriscos de WhatsApp.
  encabezado text not null default '',
  pie text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Grupo de planes dentro de un proveedor ----------
create table if not exists public.venta_publico_grupos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null
    references public.venta_publico_proveedores(id) on delete cascade,
  -- El título ya viene con el formato de WhatsApp puesto por el usuario,
  -- por ejemplo: 📺📲 *Plan 3 dispositivos*
  titulo text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists venta_publico_grupos_proveedor_idx
  on public.venta_publico_grupos (proveedor_id, orden);

-- ---------- Plan: una línea de precio ----------
create table if not exists public.venta_publico_planes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null
    references public.venta_publico_grupos(id) on delete cascade,
  etiqueta text not null,
  -- El ancla. Mayor que cero: un plan gratis no existe en esta lista, y
  -- un 0 guardado por error saldría publicado en el mensaje.
  precio_usd numeric(12,2) not null check (precio_usd > 0),
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists venta_publico_planes_grupo_idx
  on public.venta_publico_planes (grupo_id, orden);

-- ---------- RLS: mismo criterio que "configuracion" ----------
-- Leen los dos roles (el colaborador también arma listas para mandar),
-- escribe solo el admin. La autorización real vive acá: el chequeo de
-- rol en las server actions es solo para dar un mensaje claro.
alter table public.venta_publico_proveedores enable row level security;
alter table public.venta_publico_grupos enable row level security;
alter table public.venta_publico_planes enable row level security;

drop policy if exists "colaborador y admin leen proveedores de venta" on public.venta_publico_proveedores;
create policy "colaborador y admin leen proveedores de venta"
  on public.venta_publico_proveedores for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

drop policy if exists "solo admin escribe proveedores de venta" on public.venta_publico_proveedores;
create policy "solo admin escribe proveedores de venta"
  on public.venta_publico_proveedores for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "colaborador y admin leen grupos de venta" on public.venta_publico_grupos;
create policy "colaborador y admin leen grupos de venta"
  on public.venta_publico_grupos for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

drop policy if exists "solo admin escribe grupos de venta" on public.venta_publico_grupos;
create policy "solo admin escribe grupos de venta"
  on public.venta_publico_grupos for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "colaborador y admin leen planes de venta" on public.venta_publico_planes;
create policy "colaborador y admin leen planes de venta"
  on public.venta_publico_planes for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

drop policy if exists "solo admin escribe planes de venta" on public.venta_publico_planes;
create policy "solo admin escribe planes de venta"
  on public.venta_publico_planes for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Semilla ----------
-- Los cuatro proveedores que el usuario maneja hoy. Solo Oleada viene con
-- planes y textos porque es la única lista que ya está armada; las otras
-- tres nacen vacías para que las cargue desde la app.
insert into public.venta_publico_proveedores (slug, nombre, moneda, orden)
values
  ('oleada', 'Oleada', 'VES', 1),
  ('stella', 'Stella', 'VES', 2),
  ('flujotv', 'FlujoTV', 'VES', 3),
  ('telelatino', 'Telelatino', 'VES', 4)
on conflict (slug) do nothing;

-- Los textos de Oleada son del usuario y van literales: emojis,
-- asteriscos y saltos de línea son parte del mensaje que manda.
update public.venta_publico_proveedores
   set encabezado = $enc$💥🎁 *OLEADA TV – PLANES Y PRECIOS* 💥🥳

Es una aplicación de televisión de pago que te brinda acceso a canales de televisión, deportes, películas, series y contenido infantil con calidad de alta gama.

Tendrás acceso a todo el contenido conectando hasta *3 dispositivos o pantallas en simultáneo*.$enc$,
       pie = $pie$💳 *¿Por qué medio desea realizar el pago?*

🏦 *Pago Móvil*

*Ejemplo 👇👇👇👇*
Quiero comprar 1 año para 3 dispositivos.

Una vez verificado el pago, se procede a su respectiva activación.

⚠️ *IMPORTANTE*

El servicio ofrecido consiste en el acceso a contenido de diferentes plataformas de streaming. No contamos con los derechos de retransmisión ni somos responsables por la disponibilidad, continuidad o calidad del contenido proporcionado por dichas plataformas.

El acceso al servicio puede variar, estar sujeto a cambios o suspensión sin previo aviso, por lo que la decisión de compra es responsabilidad exclusiva del usuario.

Al adquirir el servicio, el usuario acepta que *no se realizan reembolsos ni devoluciones de dinero bajo ninguna circunstancia.* ⚠️$pie$,
       updated_at = now()
 where slug = 'oleada'
   and encabezado = '';

insert into public.venta_publico_grupos (proveedor_id, titulo, orden)
select p.id, g.titulo, g.orden
  from public.venta_publico_proveedores p
 cross join (values
   ('📺📲 *Plan 3 dispositivos*', 1),
   ('📺📱 *Plan 1 dispositivo (TV o móvil)*', 2)
 ) as g(titulo, orden)
 where p.slug = 'oleada'
   and not exists (
     select 1 from public.venta_publico_grupos x where x.proveedor_id = p.id
   );

-- Las anclas salen de dividir los precios que el usuario tiene hoy en Bs
-- por 800, que es la tasa a la que los fijó: 6.400/800 = 8, 19.200/800 = 24,
-- 33.800/800 = 42,25, 64.000/800 = 80, 3.200/800 = 4, 9.600/800 = 12,
-- 18.000/800 = 22,50 y 32.000/800 = 40. Todas dan exacto.
insert into public.venta_publico_planes (grupo_id, etiqueta, precio_usd, orden)
select g.id, v.etiqueta, v.precio_usd, v.orden
  from public.venta_publico_grupos g
  join public.venta_publico_proveedores p
    on p.id = g.proveedor_id and p.slug = 'oleada'
  join (values
    ('📺📲 *Plan 3 dispositivos*', '1 mes', 8.00, 1),
    ('📺📲 *Plan 3 dispositivos*', '3 meses', 24.00, 2),
    ('📺📲 *Plan 3 dispositivos*', 'paga 6 meses y lleva 7 meses', 42.25, 3),
    ('📺📲 *Plan 3 dispositivos*', 'paga 10 meses y lleva 14 meses', 80.00, 4),
    ('📺📱 *Plan 1 dispositivo (TV o móvil)*', '1 mes', 4.00, 1),
    ('📺📱 *Plan 1 dispositivo (TV o móvil)*', '3 meses', 12.00, 2),
    ('📺📱 *Plan 1 dispositivo (TV o móvil)*', 'paga 6 meses y lleva 7 meses', 22.50, 3),
    ('📺📱 *Plan 1 dispositivo (TV o móvil)*', 'paga 10 meses y lleva 14 meses', 40.00, 4)
  ) as v(titulo, etiqueta, precio_usd, orden)
    on v.titulo = g.titulo
 where not exists (
   select 1 from public.venta_publico_planes x where x.grupo_id = g.id
 );

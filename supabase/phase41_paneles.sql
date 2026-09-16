-- ============================================================
-- Fase 41: mis paneles — dónde entro, con qué usuario y con qué clave
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- El problema que resuelve no es de seguridad, es de memoria: son varios
-- paneles de proveedor y se pierde cómo se entraba a cada uno.
--
-- Lo que esto protege y lo que NO, escrito acá para que nadie se confunda
-- dentro de seis meses:
--
--   SÍ  · Que el otro usuario vea tus paneles. Lo corta RLS.
--   SÍ  · Que la clave quede a la vista de quien mire tu pantalla: sale
--         enmascarada y se revela a pedido.
--   NO  · A quien tenga acceso a la base. El panel de Supabase, la
--         service_role key o un backup muestran estas claves en texto.
--
-- No se encriptan en la base a propósito. Una clave que el servidor puede
-- desencriptar para mostrártela, la puede desencriptar cualquiera que
-- llegue al servidor: sería teatro, y teatro que hace creer que hay una
-- caja fuerte donde hay un cuaderno con llave. Encriptar de verdad pide
-- una clave maestra que el servidor nunca vea, y eso es otra decisión.

create table if not exists public.paneles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Cómo lo llamás vos, que es lo único que no se puede deducir mirando.
  nombre  text not null,
  url     text not null default '',
  usuario text not null default '',
  clave   text not null default '',
  notas   text not null default '',

  -- Para que el que usás todos los días quede arriba.
  orden integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.paneles is
  'Los accesos a los paneles de proveedor de cada usuario. Las claves se '
  'guardan en texto: protegen de la otra persona de la app (RLS) y de una '
  'mirada a la pantalla, NO de quien tenga acceso a la base.';

create index if not exists paneles_user_orden_idx
  on public.paneles (user_id, orden, created_at);

alter table public.paneles enable row level security;

-- Tuyos y de nadie más. Ni siquiera el admin ve los del colaborador: acá
-- no hay nada que auditar ni que aprobar, son sus cuentas.
drop policy if exists "paneles: cada uno los suyos" on public.paneles;
create policy "paneles: cada uno los suyos"
  on public.paneles for all
  using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  );

-- ============================================================
-- Fase 39: los medios de cobro son de cada moneda, no de cada lista
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- La fase 37 los guardó por lista, o sea uno por marca y por moneda: doce
-- lugares donde editar el mismo Nequi. Pero no es así como funciona: se
-- cobra con la misma cuenta se venda Stella u Oleada. Lo que cambia entre
-- una cuenta y otra es la MONEDA -— en bolívares Pago Móvil, en pesos
-- Nequi, en dólares Wise -— y nada más.
--
-- Siguen siendo de cada usuario: son sus cuentas, no las de la casa.
--
-- Al colapsar, en USD había dos variantes: Oleada y Telelatino con seis
-- medios, Stella y FlujoTV con los mismos seis más "Cuenta euro". La
-- segunda contiene a la primera, así que se queda la larga y las cuatro
-- marcas ganan esa opción. Al revés se habría perdido una forma de cobrar.

create table if not exists public.venta_publico_medios_pago (
  moneda  text not null check (moneda in ('VES', 'COP', 'USD')),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto   text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (moneda, user_id)
);

comment on table public.venta_publico_medios_pago is
  'Los medios de cobro de cada usuario en cada moneda. Reemplazan al '
  'marcador {medios} del pie, en las listas de las cuatro marcas.';

alter table public.venta_publico_medios_pago enable row level security;

drop policy if exists "medios de pago lee lo suyo" on public.venta_publico_medios_pago;
create policy "medios de pago lee lo suyo"
  on public.venta_publico_medios_pago for select
  using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin', 'colaborador'))
  );

drop policy if exists "medios de pago escribe lo suyo" on public.venta_publico_medios_pago;
create policy "medios de pago escribe lo suyo"
  on public.venta_publico_medios_pago for all
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

-- ---------- Lo que ya había, colapsado por moneda ----------
-- distinct on con orden por largo: donde hubo más de una variante gana la
-- más completa. Es el criterio seguro en la única dirección que importa
-- acá —- de más medios a menos se pierde una venta, al revés no.
insert into public.venta_publico_medios_pago (moneda, user_id, texto)
select distinct on (l.moneda, lu.user_id)
  l.moneda, lu.user_id, lu.medios_pago
from public.venta_publico_lista_usuario lu
join public.venta_publico_listas l on l.id = lu.lista_id
where lu.medios_pago <> ''
order by l.moneda, lu.user_id, length(lu.medios_pago) desc
on conflict (moneda, user_id) do nothing;

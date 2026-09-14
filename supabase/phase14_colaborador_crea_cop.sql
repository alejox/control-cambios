-- ============================================================
-- Fase 14: el colaborador registra movimientos COP -> USDT
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Carlos (colaborador) pasa a poder cargar movimientos, pero UNICAMENTE del
-- flujo COP -> USDT. Los de Bs siguen siendo solo del admin.
--
-- Esto SI se puede hacer con RLS, a diferencia de los casos anteriores: la
-- condicion es sobre el VALOR de la fila (tipo_flujo), no sobre que columnas
-- puede tocar. RLS trabaja por fila, y acá justamente lo que se filtra es la
-- fila entera.
--
-- Las politicas nuevas son PERMISIVAS, asi que se suman por OR a las que ya
-- existen: el admin conserva todo lo que podia hacer.

drop policy if exists "colaborador crea movimientos cop" on public.items;
create policy "colaborador crea movimientos cop"
  on public.items for insert
  with check (
    tipo_flujo = 'cop_a_usdt'
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'colaborador'
    )
  );

-- Los depositos solo puede colgarlos de SUS propios movimientos COP: sin el
-- created_by podria agregarle depositos a un cierre ajeno.
drop policy if exists "colaborador crea depositos de sus cop" on public.depositos;
create policy "colaborador crea depositos de sus cop"
  on public.depositos for insert
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id
        and i.tipo_flujo = 'cop_a_usdt'
        and i.created_by = auth.uid()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'colaborador'
    )
  );

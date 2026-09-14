-- ============================================================
-- Fase 15: el colaborador también puede subir comprobantes
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- La fase 14 le abrio al colaborador la creacion de movimientos COP, pero
-- quedo afuera el bucket: "solo admin sube comprobantes" rechazaba sus
-- archivos con "new row violates row-level security policy".
--
-- El archivo se sube ANTES de que exista el item (el nombre es un uuid
-- suelto), asi que no hay forma de atarlo a un movimiento en la politica.
-- Se habilita por rol: el colaborador ya podia LEER todos los comprobantes,
-- asi que poder subir no le agrega alcance sobre datos ajenos.
--
-- Borrar y actualizar siguen siendo solo del admin.

drop policy if exists "colaborador sube comprobantes" on storage.objects;
create policy "colaborador sube comprobantes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'colaborador'
    )
  );

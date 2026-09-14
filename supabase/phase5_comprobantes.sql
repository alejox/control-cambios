-- ============================================================
-- Fase 5: comprobante por deposito + tasa de referencia Binance
-- Ya aplicado en el proyecto remoto vía migraciones:
--   depositos_comprobante_y_storage
--   rpc_depositos_con_comprobante
-- Se deja aquí para poder recrear la base desde cero.
-- ============================================================

alter table public.depositos
  add column if not exists comprobante_path text;

-- Bucket privado: los comprobantes traen datos bancarios. La app genera
-- signed URLs de corta duración en vez de servirlos públicos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Mismas reglas que items/depositos: colaborador y admin leen, solo admin escribe.
drop policy if exists "colaborador y admin ven comprobantes" on storage.objects;
create policy "colaborador y admin ven comprobantes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

drop policy if exists "solo admin sube comprobantes" on storage.objects;
create policy "solo admin sube comprobantes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "solo admin actualiza comprobantes" on storage.objects;
create policy "solo admin actualiza comprobantes"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'comprobantes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "solo admin borra comprobantes" on storage.objects;
create policy "solo admin borra comprobantes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Las RPCs ahora arrastran comprobante_path dentro del jsonb de depositos.
-- (Cuerpo completo en la migración rpc_depositos_con_comprobante.)

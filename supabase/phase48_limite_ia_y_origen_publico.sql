-- ============================================================
-- Fase 48: cupo distribuido para OCR/IA
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez, ANTES de desplegar el código que lo invoca)
-- ============================================================
--
-- La lectura de comprobantes llama a Gemini y tiene costo. Un contador en
-- memoria no sirve cuando Next corre en más de una instancia: cada una tendría
-- su propio cupo. Esta tabla y RPC viven en Postgres, por lo que el cupo es el
-- mismo para todas las instancias y las actualizaciones se serializan por
-- usuario con SELECT ... FOR UPDATE.
--
-- El algoritmo es un token bucket: capacidad 5, recarga uniforme de 1 lectura
-- cada 120 segundos. Así permite una carga normal de varias fotos, pero limita
-- a 5 lecturas iniciales y a 30 por hora como máximo por cuenta.

create table if not exists public.comprobante_ia_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tokens numeric not null check (tokens >= 0 and tokens <= 5),
  updated_at timestamptz not null default now()
);

alter table public.comprobante_ia_rate_limits enable row level security;

-- No hay políticas: el cliente no puede leer ni modificar cupos directamente.
-- La única puerta es la RPC, que usa auth.uid() y no acepta un user_id externo.

create or replace function public.consumir_cupo_comprobante_ia()
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  limite constant numeric := 5;
  recarga_por_segundo constant numeric := 1.0 / 120.0;
  fila public.comprobante_ia_rate_limits%rowtype;
  disponibles numeric;
begin
  if auth.uid() is null then
    return query select false, 60;
    return;
  end if;

  -- El primer cupo se crea con cuatro tokens restantes. En una carrera el
  -- segundo INSERT espera al primero y luego el FOR UPDATE lee su fila.
  insert into public.comprobante_ia_rate_limits (user_id, tokens, updated_at)
  values (auth.uid(), limite - 1, now())
  on conflict (user_id) do nothing;

  if found then
    return query select true, 0;
    return;
  end if;

  select * into fila
  from public.comprobante_ia_rate_limits
  where user_id = auth.uid()
  for update;

  disponibles := least(
    limite,
    fila.tokens + extract(epoch from now() - fila.updated_at) * recarga_por_segundo
  );

  if disponibles >= 1 then
    update public.comprobante_ia_rate_limits
    set tokens = disponibles - 1, updated_at = now()
    where user_id = auth.uid();

    return query select true, 0;
  else
    update public.comprobante_ia_rate_limits
    set tokens = disponibles, updated_at = now()
    where user_id = auth.uid();

    return query select false, greatest(1, ceil((1 - disponibles) / recarga_por_segundo)::integer);
  end if;
end;
$$;

revoke all on table public.comprobante_ia_rate_limits from public, anon, authenticated;
revoke execute on function public.consumir_cupo_comprobante_ia() from public, anon;
grant execute on function public.consumir_cupo_comprobante_ia() to authenticated, service_role;

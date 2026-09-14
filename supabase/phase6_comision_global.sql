-- ============================================================
-- Fase 6: la comisión se configura en un solo lugar, y solo el admin
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Hasta ahora el 14% estaba escrito dentro de la fórmula de la columna
-- generada "items.comision". Cambiarlo obligaba a tocar el esquema.
--
-- Ahora vive en una tabla de configuración de una sola fila, que solo
-- puede modificar un admin. Los items NO guardan un porcentaje editable:
-- guardan el sello del porcentaje vigente el día que se crearon, porque
-- "comision" es una columna generada y si leyera el valor global en vivo,
-- cambiar la comisión reescribiría la de todos los cierres históricos.

-- ---------- Configuración global (fila única) ----------
-- El truco del id booleano con check: la primary key solo admite el
-- valor true, así que es imposible que exista una segunda fila.
create table if not exists public.configuracion (
  id boolean primary key default true check (id),
  comision_pct numeric(5,2) not null default 14
    check (comision_pct >= 0 and comision_pct <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.configuracion (id) values (true) on conflict (id) do nothing;

alter table public.configuracion enable row level security;

-- Leer: cualquiera que ya ve datos, porque el formulario muestra el
-- porcentaje vigente aunque no lo pueda cambiar.
drop policy if exists "colaborador y admin leen configuracion" on public.configuracion;
create policy "colaborador y admin leen configuracion"
  on public.configuracion for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

-- Escribir: solo admin. No hay política de insert ni de delete, así que
-- con RLS activo nadie puede crear ni borrar la fila de configuración.
drop policy if exists "solo admin cambia configuracion" on public.configuracion;
create policy "solo admin cambia configuracion"
  on public.configuracion for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Sello del porcentaje en cada item ----------
alter table public.items
  add column if not exists comision_pct numeric(5,2);

-- Los items ya cargados conservan exactamente la comisión que tenían el
-- día que se registraron: 14% en Bs, 0% en COP. Que de ahora en adelante
-- COP también cobre no cambia lo que ya se cobró.
update public.items
   set comision_pct = case when tipo_flujo = 'bs_a_usdt' then 14 else 0 end
 where comision_pct is null;

-- Sin default a propósito: un insert que se olvide del sello tiene que
-- fallar a gritos, no guardar una comisión de 0 en silencio.
alter table public.items alter column comision_pct set not null;

alter table public.items drop constraint if exists items_comision_pct_check;
alter table public.items
  add constraint items_comision_pct_check
  check (comision_pct >= 0 and comision_pct <= 100);

-- La fórmula deja de tener el 14 adentro: ahora lee el sello de la fila.
alter table public.items drop column if exists comision;
alter table public.items
  add column comision numeric(14,2)
    generated always as (round(usdt_total * comision_pct / 100, 2)) stored;

-- ---------- RPCs ----------
-- La firma no cambia: el cliente nunca manda el porcentaje. Se lee de la
-- configuración acá adentro, que es el único lugar donde puede estar.
create or replace function public.crear_item_con_depositos(
  p_numero integer,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
  v_config_pct numeric;
begin
  select c.comision_pct into v_config_pct from public.configuracion c where c.id;

  -- Si RLS tapó la lectura, v_config_pct queda null. Cortamos acá en vez
  -- de guardar un 0% que nadie pidió.
  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  -- El porcentaje aplica por igual a los dos flujos: Bs -> USDT y
  -- COP -> USDT. No hay excepción por tipo de flujo.
  insert into public.items (
    numero, tipo_flujo, moneda_origen, tasa, usdt_total,
    comision_pct, detalle, fecha, created_by
  )
  values (
    p_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total,
    v_config_pct, p_detalle, p_fecha, auth.uid()
  )
  returning id into v_item_id;

  insert into public.depositos (item_id, referencia, fecha, valor_origen, comprobante_path)
  select
    v_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;

  return v_item_id;
end;
$$;

-- Editar un item NO re-sella el porcentaje: el cierre se pactó con el que
-- estaba vigente ese día y ahí se queda, pase lo que pase con el global.
create or replace function public.actualizar_item_con_depositos(
  p_item_id uuid,
  p_numero integer,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.items set
    numero = p_numero,
    tipo_flujo = p_tipo_flujo,
    moneda_origen = p_moneda_origen,
    tasa = p_tasa,
    usdt_total = p_usdt_total,
    detalle = p_detalle,
    fecha = p_fecha
  where id = p_item_id;

  delete from public.depositos where item_id = p_item_id;

  insert into public.depositos (item_id, referencia, fecha, valor_origen, comprobante_path)
  select
    p_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;
end;
$$;

grant execute on function public.crear_item_con_depositos to authenticated;
grant execute on function public.actualizar_item_con_depositos to authenticated;

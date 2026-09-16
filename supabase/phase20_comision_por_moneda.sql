-- ============================================================
-- Fase 20: una comisión para Bs y otra para COP
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Hasta ahora había UNA comisión para los dos flujos (fase 6). Los dos
-- mercados no se cobran igual, así que cada moneda pasa a tener la suya.
--
-- La migración es ADITIVA a propósito: se aplica con el front viejo
-- todavía desplegado. Las dos columnas nuevas nacen con el valor exacto
-- que tiene hoy comision_pct, así que mientras nadie las cambie la app
-- cobra exactamente lo mismo que cobraba ayer. Nada de ventanas rotas.

-- ---------- Las dos columnas nuevas ----------
-- Se crean nullable, se siembran leyendo el valor vigente y recién
-- después se marcan not null: así el seed no depende de un default
-- hardcodeado que puede no ser el número que hay en producción.
alter table public.configuracion
  add column if not exists comision_bs_pct numeric(5,2),
  add column if not exists comision_cop_pct numeric(5,2);

update public.configuracion
   set comision_bs_pct = coalesce(comision_bs_pct, comision_pct),
       comision_cop_pct = coalesce(comision_cop_pct, comision_pct);

alter table public.configuracion
  alter column comision_bs_pct set not null,
  alter column comision_cop_pct set not null,
  alter column comision_bs_pct set default 14,
  alter column comision_cop_pct set default 14;

alter table public.configuracion drop constraint if exists configuracion_comision_bs_pct_check;
alter table public.configuracion
  add constraint configuracion_comision_bs_pct_check
  check (comision_bs_pct >= 0 and comision_bs_pct <= 100);

alter table public.configuracion drop constraint if exists configuracion_comision_cop_pct_check;
alter table public.configuracion
  add constraint configuracion_comision_cop_pct_check
  check (comision_cop_pct >= 0 and comision_cop_pct <= 100);

comment on column public.configuracion.comision_bs_pct is
  'Comisión vigente para los cierres Bs -> USDT. Se sella en items.comision_pct al crear.';
comment on column public.configuracion.comision_cop_pct is
  'Comisión vigente para los cierres COP -> USDT. Se sella en items.comision_pct al crear.';

-- ---------- La columna vieja queda, pero obsoleta ----------
-- No se dropea todavía porque el front que está EN PRODUCCIÓN ahora mismo
-- la lee para mostrar el porcentaje en pantalla. Borrarla acá dejaría el
-- panel roto hasta el deploy.
comment on column public.configuracion.comision_pct is
  'OBSOLETA. La reemplazan comision_bs_pct y comision_cop_pct. Sigue viva solo '
  'porque el front desplegado todavía la lee. DROPEAR (junto con el trigger '
  'configuracion_sincroniza_comision_legacy y su función) una vez que el front '
  'con comisión por moneda esté arriba.';

-- ---------- Puente temporal con el front viejo ----------
-- El front desplegado guarda SOLO comision_pct: no sabe que existen las
-- columnas por moneda. Sin este puente, un admin que cambiara la comisión
-- desde la app vieja vería "Guardado" mientras los movimientos nuevos
-- siguen sellando el porcentaje anterior. Plata real cobrada mal, en
-- silencio. El trigger replica ese cambio a las dos monedas, que es
-- exactamente lo que ese front cree estar haciendo.
--
-- Se dropea junto con comision_pct cuando el front nuevo esté arriba.
create or replace function public.sincronizar_comision_legacy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Solo si el update tocó la columna vieja y NO las nuevas: así una
  -- escritura del front nuevo (que manda las dos por moneda) nunca queda
  -- pisada por este puente.
  if new.comision_pct is distinct from old.comision_pct
     and new.comision_bs_pct is not distinct from old.comision_bs_pct
     and new.comision_cop_pct is not distinct from old.comision_cop_pct then
    new.comision_bs_pct := new.comision_pct;
    new.comision_cop_pct := new.comision_pct;
  end if;
  return new;
end;
$$;

drop trigger if exists configuracion_sincroniza_comision_legacy on public.configuracion;
create trigger configuracion_sincroniza_comision_legacy
  before update on public.configuracion
  for each row execute function public.sincronizar_comision_legacy();

-- ---------- Las RPCs eligen columna según el flujo ----------
-- LAS FIRMAS NO CAMBIAN: el cliente sigue sin mandar el porcentaje. Lo
-- único que cambia es de qué columna sale. Como las tres arrancan con el
-- mismo número, el front viejo sigue cobrando igual hasta que alguien
-- configure comisiones distintas.

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
  -- La comisión depende de la moneda del cierre: Bs y COP son dos
  -- mercados distintos y se cobran distinto.
  select case
           when p_tipo_flujo = 'bs_a_usdt' then c.comision_bs_pct
           else c.comision_cop_pct
         end
    into v_config_pct
    from public.configuracion c
   where c.id;

  -- Si RLS tapó la lectura, v_config_pct queda null. Cortamos acá en vez
  -- de guardar un 0% que nadie pidió.
  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  insert into public.items (
    numero, tipo_flujo, moneda_origen, tasa, usdt_total,
    comision_pct, detalle, fecha, created_by
  )
  values (
    p_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total,
    v_config_pct, p_detalle, p_fecha, auth.uid()
  )
  returning id into v_item_id;

  insert into public.depositos (
    item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto
  )
  select
    v_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', ''),
    nullif(d->>'comprobante_texto', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;

  return v_item_id;
end;
$$;

create or replace function public.crear_item_desde_bot(
  p_user_id uuid,
  p_tipo_flujo public.tipo_flujo,
  p_moneda_origen public.moneda,
  p_tasa numeric,
  p_usdt_total numeric,
  p_detalle text,
  p_fecha date,
  p_depositos jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.user_role;
  v_config_pct numeric;
  v_numero integer;
  v_item_id uuid;
  v_intento integer;
begin
  if p_user_id is null then
    raise exception 'Falta la cuenta a la que atribuir el movimiento.';
  end if;

  select role into v_rol from public.profiles where id = p_user_id;

  if v_rol is null then
    raise exception 'Esa cuenta no existe.';
  end if;
  if v_rol not in ('admin', 'colaborador') then
    raise exception 'Tu cuenta no tiene permiso para registrar movimientos.';
  end if;

  if v_rol = 'colaborador' and p_tipo_flujo <> 'cop_a_usdt' then
    raise exception 'Tu cuenta solo puede registrar movimientos COP → USDT.';
  end if;

  if (p_tipo_flujo = 'bs_a_usdt' and p_moneda_origen <> 'VES')
     or (p_tipo_flujo = 'cop_a_usdt' and p_moneda_origen <> 'COP') then
    raise exception 'El tipo de flujo y la moneda no coinciden.';
  end if;

  if p_usdt_total is null or p_usdt_total <= 0 then
    raise exception 'El total en USDT debe ser mayor que cero.';
  end if;
  if p_tasa is not null and p_tasa <= 0 then
    raise exception 'La tasa debe ser mayor que cero.';
  end if;
  if jsonb_array_length(coalesce(p_depositos, '[]'::jsonb)) = 0 then
    raise exception 'El movimiento necesita al menos un depósito.';
  end if;

  -- Misma regla que en la RPC de la web: la comisión sale de la columna
  -- de la moneda del cierre.
  select case
           when p_tipo_flujo = 'bs_a_usdt' then c.comision_bs_pct
           else c.comision_cop_pct
         end
    into v_config_pct
    from public.configuracion c
   where c.id;

  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  for v_intento in 1..3 loop
    select coalesce(max(i.numero), 0) + 1 into v_numero
      from public.items i
     where i.liquidacion_id is null;

    begin
      insert into public.items (
        numero, tipo_flujo, moneda_origen, tasa, usdt_total,
        comision_pct, detalle, fecha, created_by
      )
      values (
        v_numero, p_tipo_flujo, p_moneda_origen, p_tasa, p_usdt_total,
        v_config_pct, p_detalle, p_fecha, p_user_id
      )
      returning id into v_item_id;

      exit;
    exception when unique_violation then
      if v_intento = 3 then
        raise;
      end if;
      v_item_id := null;
    end;
  end loop;

  insert into public.depositos (
    item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto
  )
  select
    v_item_id,
    nullif(d->>'referencia', ''),
    (d->>'fecha')::date,
    (d->>'valor_origen')::numeric,
    nullif(d->>'comprobante_path', ''),
    nullif(d->>'comprobante_texto', '')
  from jsonb_array_elements(coalesce(p_depositos, '[]'::jsonb)) as d;

  return jsonb_build_object('item_id', v_item_id, 'numero', v_numero);
end;
$$;

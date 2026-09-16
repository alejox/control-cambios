-- ============================================================
-- Fase 18: cargar comprobantes desde un bot de Telegram
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Todo lo de esta fase es ADITIVO: tablas y funciones NUEVAS. No se toca
-- ninguna tabla, columna, politica ni funcion que ya exista, asi que la
-- app desplegada sigue funcionando igual desde el primer segundo, tanto
-- antes como despues de aplicar esto.

-- ------------------------------------------------------------
-- Quien es quien del otro lado del chat
-- ------------------------------------------------------------
-- Un chat de Telegram no dice quien es: dice un chat_id. Sin esta tabla
-- el bot no puede saber a nombre de quien crear un movimiento, y
-- "created_by" es justamente lo que decide despues quien NO puede
-- aprobarlo (fase 17).
create table if not exists public.telegram_vinculos (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- unique: un chat pertenece a una sola cuenta. Sin esto, dos personas
  -- podrian atar el mismo chat y el bot no sabria a quien atribuirle el
  -- comprobante.
  chat_id bigint not null unique,
  vinculado_at timestamptz not null default now()
);

alter table public.telegram_vinculos enable row level security;

drop policy if exists "cada uno ve su vinculo de telegram" on public.telegram_vinculos;
create policy "cada uno ve su vinculo de telegram"
  on public.telegram_vinculos for select
  using (auth.uid() = user_id);

-- Desvincular si puede: es sacarse a uno mismo, no tocar nada ajeno.
drop policy if exists "cada uno desvincula su telegram" on public.telegram_vinculos;
create policy "cada uno desvincula su telegram"
  on public.telegram_vinculos for delete
  using (auth.uid() = user_id);

-- A proposito NO hay politica de insert para usuarios: el vinculo lo crea
-- unicamente el bot (service_role) despues de validar un codigo. Si un
-- usuario pudiera insertar "lo suyo", podria atar el chat_id de OTRA
-- persona a su propia cuenta y quedarse con los comprobantes que esa
-- persona mande. El unico que sabe de verdad de que chat viene un mensaje
-- es el webhook.

-- ------------------------------------------------------------
-- Codigos de un solo uso para vincular
-- ------------------------------------------------------------
create table if not exists public.telegram_codigos (
  codigo text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creado_at timestamptz not null default now(),
  -- 15 minutos: el codigo se genera en la web y se tipea en el chat al
  -- instante. Una ventana larga solo agranda el rato en el que un codigo
  -- filtrado sirve para hacerse pasar por su dueño.
  expira_at timestamptz not null default (now() + interval '15 minutes'),
  usado_at timestamptz
);

create index if not exists telegram_codigos_user_idx
  on public.telegram_codigos (user_id, creado_at desc);

alter table public.telegram_codigos enable row level security;

drop policy if exists "cada uno ve sus codigos de telegram" on public.telegram_codigos;
create policy "cada uno ve sus codigos de telegram"
  on public.telegram_codigos for select
  using (auth.uid() = user_id);

drop policy if exists "cada uno crea sus codigos de telegram" on public.telegram_codigos;
create policy "cada uno crea sus codigos de telegram"
  on public.telegram_codigos for insert
  with check (
    auth.uid() = user_id
    -- Nadie nace usado, y la expiracion no se puede estirar desde el
    -- cliente: el limite lo pone la politica, no la aplicacion.
    and usado_at is null
    and expira_at <= now() + interval '15 minutes'
    -- Vincular Telegram es cargar movimientos. Quien no puede cargarlos
    -- desde la web tampoco tiene por que tener un codigo.
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'colaborador')
    )
  );

-- Marcar un codigo como usado es solo del bot: si el usuario pudiera
-- hacer update, podria reusar un codigo ya quemado poniendo usado_at en
-- null.

-- ------------------------------------------------------------
-- Idempotencia: un update de Telegram se procesa UNA vez
-- ------------------------------------------------------------
-- Telegram reintenta el mismo update_id cuando el webhook no contesta a
-- tiempo. Aca un reintento no es "volver a consultar": es cargar el mismo
-- comprobante dos veces y descuadrar la contabilidad. El webhook reclama
-- el update_id ANTES de trabajar; si el insert no agrega fila, ese update
-- ya esta tomado y se ignora.
create table if not exists public.telegram_updates (
  update_id bigint primary key,
  chat_id bigint,
  recibido_at timestamptz not null default now()
);

alter table public.telegram_updates enable row level security;
-- Sin ninguna politica: con RLS activo y cero policies, nadie que entre
-- con la anon key lee ni escribe. El bot entra con service_role, que se
-- saltea RLS.

-- ------------------------------------------------------------
-- El movimiento que crea el bot
-- ------------------------------------------------------------
-- Es SECURITY DEFINER porque el bot no tiene sesion de usuario: auth.uid()
-- es null y ninguna politica de items lo dejaria insertar. Y ahi esta el
-- riesgo: una funcion DEFINER se saltea RLS, asi que si no repitiera las
-- reglas de la app, el bot seria una puerta de atras a los permisos.
-- Por eso valida el rol explicitamente contra p_user_id.
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

  -- La MISMA regla que la politica "colaborador crea movimientos cop" de
  -- la fase 14. Si esto no estuviera, mandarle una foto al bot seria la
  -- forma de registrar un movimiento en Bs que la web rechaza.
  if v_rol = 'colaborador' and p_tipo_flujo <> 'cop_a_usdt' then
    raise exception 'Tu cuenta solo puede registrar movimientos COP → USDT.';
  end if;

  -- El par flujo/moneda llega de afuera y no se le cree: cruzado, guardaria
  -- un movimiento en Bs contabilizado como COP.
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

  -- Misma lectura que crear_item_con_depositos: el porcentaje vive en un
  -- solo lugar y se sella en la fila.
  select c.comision_pct into v_config_pct from public.configuracion c where c.id;
  if v_config_pct is null then
    raise exception 'No se pudo leer la configuración de comisión.';
  end if;

  -- Dos fotos que llegan en el mismo segundo calculan el mismo max+1 y la
  -- segunda choca contra items_numero_pendiente_idx. El lock es de
  -- transaccion: se suelta solo al terminar, no hay que liberarlo a mano.
  perform pg_advisory_xact_lock(hashtext('items.numero.pendiente'));

  -- El lock ordena al bot contra si mismo, pero no contra la web, que
  -- calcula su numero al renderizar el formulario y no toma este lock
  -- (tocar esa RPC seria cambiar algo que ya funciona). Por eso, si aun
  -- asi choca, se recalcula y se reintenta en vez de perder el comprobante.
  for v_intento in 1..3 loop
    -- Solo entre los pendientes: al liquidar, el contador vuelve a 1.
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

  -- Devuelve tambien el numero porque es lo que el bot le responde al
  -- usuario en el chat; pedirlo despues seria una consulta mas.
  return jsonb_build_object('item_id', v_item_id, 'numero', v_numero);
end;
$$;

-- El grant por defecto de una funcion nueva es a PUBLIC. Sin este revoke,
-- cualquiera con la anon key podria crear movimientos a nombre de otro.
revoke execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) from public;
revoke execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) from anon;
revoke execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) from authenticated;
grant execute on function public.crear_item_desde_bot(
  uuid, public.tipo_flujo, public.moneda, numeric, numeric, text, date, jsonb
) to service_role;

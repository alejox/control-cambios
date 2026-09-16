-- ============================================================
-- Fase 19: varias fotos mandadas juntas = UN movimiento
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================

-- Todo lo de esta fase es ADITIVO: una tabla NUEVA y nada mas. No se toca
-- ninguna tabla, columna, politica, indice ni funcion existente. En
-- particular NO se toca crear_item_desde_bot: esa funcion ya acepta un
-- array de depositos, que es justamente lo que hace falta.
--
-- Mientras esta tabla no exista, el webhook sigue cargando una foto por
-- movimiento; mientras exista pero el codigo viejo este desplegado, la
-- tabla simplemente queda vacia. Los dos sentidos son seguros.

-- ------------------------------------------------------------
-- Las piezas de un album
-- ------------------------------------------------------------
-- Un album de Telegram NO es un mensaje: son N updates separados, cada uno
-- con su propio update_id, que solo comparten un campo (media_group_id).
-- Pueden caer en invocaciones distintas, en paralelo y en maquinas
-- distintas, asi que no hay ningun lugar en memoria donde juntarlos. El
-- unico punto comun es esta base.
--
-- Cada invocacion procesa SU foto (bajarla, guardarla, leerla con el
-- modelo: la parte cara, y conviene que pase en paralelo) y deja el
-- resultado aca como una pieza. Despues una sola de ellas arma el
-- movimiento con todas las piezas que haya.
create table if not exists public.telegram_piezas (
  -- El unico hilo que Telegram deja para emparentar las fotos.
  media_group_id text not null,
  -- El mismo update_id que ya se reclama en telegram_updates. Se repite
  -- aca a proposito: telegram_updates es el candado de idempotencia y no
  -- se toca, esta tabla es la que junta el album.
  update_id bigint not null,
  chat_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- ---------- Lo que se saco de ESTA foto ----------
  -- 'lista'   -> se leyo y sirve para armar un deposito.
  -- 'fallida' -> no se pudo (no bajo, no se leyo, sin monto, sin moneda).
  --              Se guarda igual: una foto que no entro al movimiento hay
  --              que contarla en el chat, no dejarla desaparecer.
  estado text not null default 'lista' check (estado in ('lista', 'fallida')),
  -- Por que fallo, ya escrito para una persona. Nunca lleva contenido del
  -- comprobante: solo el motivo.
  motivo text,
  comprobante_path text,
  monto numeric,
  fecha date,
  referencia text,
  moneda public.moneda,
  banco text,
  -- Telegram le pone el caption a UNA sola foto del album, no a todas.
  -- Se guarda por pieza para poder aplicarlo despues a todo el grupo: si
  -- alguien escribio "COP" junto al album, eso vale para las N fotos.
  caption text,
  avisos jsonb not null default '[]'::jsonb,
  recibido_at timestamptz not null default now(),

  -- ---------- El candado del grupo ----------
  -- armado_at null = esta pieza todavia no forma parte de ningun
  -- movimiento. Tomar el grupo es un unico
  --
  --   update ... set armado_at = now()
  --    where media_group_id = $1 and armado_at is null
  --   returning ...
  --
  -- que es atomico por definicion: Postgres bloquea cada fila, y la
  -- segunda invocacion que llega vuelve a evaluar el where contra la fila
  -- YA actualizada, ve armado_at no nulo y la saltea. Se lleva cero filas
  -- y se va sin hacer nada. Es el mismo truco con el que la fase 18 quema
  -- un codigo de vinculacion.
  --
  -- Leer primero y marcar despues no serviria: entre la lectura y la
  -- marca las dos invocaciones se creerian ganadoras y cargarian el mismo
  -- dinero dos veces.
  armado_at timestamptz,
  -- En que movimiento quedo. A proposito SIN foreign key contra items:
  -- una referencia obligaria a items a consultar esta tabla cada vez que
  -- se borra un movimiento, y eso seria cambiarle el comportamiento a una
  -- tabla existente. Aca es bitacora del bot, no integridad contable.
  item_id uuid,
  item_numero integer,

  -- La pieza se identifica por el grupo y el update que la trajo. Con
  -- esto, un reintento de Telegram sobre el mismo update no puede
  -- duplicar una pieza aunque el candado de telegram_updates fallara.
  primary key (media_group_id, update_id)
);

alter table public.telegram_piezas enable row level security;
-- Sin ninguna politica, igual que telegram_updates: con RLS activo y cero
-- policies nadie que entre con la anon key lee ni escribe. El bot entra
-- con service_role, que se saltea RLS.

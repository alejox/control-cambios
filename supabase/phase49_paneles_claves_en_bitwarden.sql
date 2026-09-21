-- ============================================================
-- Fase 49: las claves de los paneles pasan a Bitwarden
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- La fase 41 dejó escrito por qué las claves estaban en texto: encriptarlas
-- con una llave que el propio servidor guarda es teatro, porque quien
-- llegue al servidor llega también a la llave. Eso sigue siendo cierto. Lo
-- que cambió es que ahora la llave NO está en el servidor: está en
-- Bitwarden Secrets Manager, y lo que guarda esta app es una referencia.
--
-- Qué cambia de verdad:
--
--   ANTES · Quien viera la base -— el panel de Supabase, la service_role
--           key, un backup, un dump que alguien se lleva -— leía todas las
--           claves de todos los paneles.
--   AHORA · Ve un uuid. Para convertirlo en una clave hace falta además el
--           BITWARDEN_ACCESS_TOKEN, que vive en las variables de entorno
--           de Vercel y nunca en la base.
--
-- Lo que NO cambia, para que nadie lo suponga: quien tenga el token de
-- Bitwarden Y acceso a la base sigue pudiendo leer todo. Esto separa dos
-- cosas que antes estaban juntas; no crea una caja fuerte.
--
-- ------------------------------------------------------------
-- ESTA MIGRACIÓN NO BORRA NINGUNA CLAVE.
-- ------------------------------------------------------------
--
-- Es aditiva, como la 42 y la 43, y por el mismo motivo: en este proyecto
-- ya se rompió producción migrando antes de tiempo. Cada cuenta de
-- `cuentas` estrena una tercera propiedad, `secret_id`, y conserva su
-- `clave` en texto. Los dos valores conviven mientras dure la verificación.
--
-- El front prefiere el valor de Bitwarden y cae al texto de la base cuando
-- el gestor no contesta, así que un corte del gestor no deja a nadie
-- afuera de sus paneles.
--
-- La forma nueva de cada elemento de `cuentas`:
--
--   { "usuario": "...", "clave": "...", "secret_id": "uuid" }
--
-- `secret_id` es opcional: una cuenta sin él no está rota, está sin
-- respaldar. La app las cuenta y ofrece respaldarlas desde
-- /dashboard/paneles (que llama a POST /api/bitwarden/migrar).

comment on column public.paneles.cuentas is
  'Las cuentas del panel, cada una {usuario, clave, secret_id}, en el orden '
  'en que las puso el usuario. Van juntas y no en arreglos paralelos porque '
  'un usuario sin SU clave no sirve para entrar. secret_id apunta al secreto '
  'en Bitwarden Secrets Manager: es ahí donde vive la clave de verdad. La '
  'propiedad clave conserva el texto plano SOLO mientras dure la migración, '
  'para poder volver atrás; se retira en la fase siguiente.';

comment on table public.paneles is
  'Los accesos a los paneles de proveedor de cada usuario. Las claves se '
  'están migrando a Bitwarden Secrets Manager (cuentas[].secret_id) y '
  'todavía conservan una copia en texto en cuentas[].clave. RLS sigue '
  'siendo lo que impide que un usuario vea los paneles de otro.';

-- ------------------------------------------------------------
-- LA FASE SIGUIENTE, ya escrita y a propósito NO ejecutada
-- ------------------------------------------------------------
--
-- Esto retira el texto plano. Correrlo antes de tiempo borra la única
-- copia que se sabe buena, y no hay vuelta atrás: la base no guarda
-- historial de esta columna.
--
-- Precondición, sin excepciones: entrar a /dashboard/paneles CON CADA
-- USUARIO que tenga paneles —- el diagnóstico corre bajo RLS y solo ve los
-- del que pregunta, así que el "está todo bien" de uno no dice nada de los
-- del otro -— y que los dos den:
--
--   pendientes: 0 · noResuelven: [] · difieren: 0
--   listoParaRetirarTextoPlano: true
--
-- Recién entonces, descomentar y correr:
--
--   update public.paneles
--   set cuentas = (
--     select coalesce(jsonb_agg(
--       case when c ? 'secret_id'
--            then jsonb_set(c, '{clave}', '""'::jsonb)
--            else c
--       end
--       order by orden_cuenta
--     ), '[]'::jsonb)
--     from jsonb_array_elements(cuentas)
--       with ordinality as t(c, orden_cuenta)
--   )
--   where cuentas <> '[]'::jsonb;
--
-- El `order by orden_cuenta` no es decorativo: sin él, jsonb_agg puede
-- devolver las cuentas en otro orden y cada usuario terminaría emparejado
-- con la clave de otra fila. Es la misma trampa que la fase 43 vino a
-- cerrar, reaparecida en la consulta que iba a cerrarla.
--
-- El `case` deja intacta la cuenta que NO tiene secret_id: borrarle la
-- clave a una cuenta sin respaldo es perderla.

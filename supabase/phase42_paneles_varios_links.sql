-- ============================================================
-- Fase 42: un panel puede tener más de un link
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Un mismo proveedor suele tener más de una puerta: la de administración,
-- la de reventa, a veces un espejo. Guardar una sola obligaba a crear dos
-- paneles con el mismo usuario y la misma clave, que después se
-- desincronizan en cuanto cambia la contraseña.
--
-- Va como arreglo en la misma fila y no como tabla aparte porque los
-- links no tienen vida propia: no se buscan, no se ordenan por su cuenta
-- y no existen sin su panel. Una tabla aparte sería un join y una
-- política de RLS más para no ganar nada.
--
-- ADITIVA: la columna url vieja se queda hasta que el front deje de
-- leerla. En este proyecto ya se rompió producción migrando antes de
-- tiempo, y no se repite.

alter table public.paneles
  add column if not exists urls text[] not null default '{}';

comment on column public.paneles.urls is
  'Los links del panel, en el orden en que los puso el usuario. El primero '
  'es el que se usa para entrar; los demás son puertas alternativas del '
  'mismo proveedor.';

-- Lo que había en url pasa a ser el primer elemento. Una url vacía no se
-- convierte en un arreglo con un string vacío: sería un link roto que la
-- pantalla tendría que aprender a ignorar.
update public.paneles
set urls = array[url]
where urls = '{}' and url <> '';

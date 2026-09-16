-- ============================================================
-- Fase 43: un panel puede tener varias cuentas
-- Pega este archivo completo en Supabase -> SQL Editor -> Run
-- (una sola vez)
-- ============================================================
--
-- Un panel no tiene "varios usuarios" y "varias claves": tiene varias
-- CUENTAS, y cada una es un usuario CON su clave. La diferencia no es de
-- palabras.
--
-- Guardarlo como dos arreglos paralelos —- usuarios[] y claves[] -— se
-- rompe solo: alcanza con borrar la segunda fila de uno y no del otro
-- para que la clave de la tercera cuenta quede pegada a la segunda. Y el
-- día que pasa, no falla nada: simplemente no entrás, y el error se ve
-- como "me cambiaron la contraseña".
--
-- Por eso va un jsonb con objetos {usuario, clave}. Un par no se puede
-- desalinear de sí mismo.
--
-- ADITIVA: usuario y clave siguen siendo columnas hasta que el front deje
-- de leerlas.

alter table public.paneles
  add column if not exists cuentas jsonb not null default '[]'::jsonb;

comment on column public.paneles.cuentas is
  'Las cuentas del panel, cada una {usuario, clave}, en el orden en que '
  'las puso el usuario. Van juntas y no en arreglos paralelos porque un '
  'usuario sin SU clave no sirve para entrar.';

-- Lo que había en las columnas sueltas pasa a ser la primera cuenta. Un
-- panel sin usuario ni clave no estrena una cuenta vacía: se queda sin
-- ninguna, que es la verdad.
update public.paneles
set cuentas = jsonb_build_array(
  jsonb_build_object('usuario', usuario, 'clave', clave)
)
where cuentas = '[]'::jsonb
  and (usuario <> '' or clave <> '');

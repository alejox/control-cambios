/**
 * El estado que comparten los formularios de esta pantalla.
 *
 * Vive acá y no en actions.ts porque un archivo "use server" solo puede
 * exportar funciones async: un objeto exportado desde ahí revienta al
 * evaluar el módulo, no al compilar.
 */
export type PanelState = {
  error: string | null;
  ok: boolean;
  /**
   * Se guardó, pero algo de segundo orden no salió bien: casi siempre que
   * Bitwarden no contestó y la clave quedó solo en la base.
   *
   * Va separado de `error` a propósito. Mezclarlos obligaría a elegir entre
   * mentir ("guardado" cuando el respaldo falló) o asustar ("no se guardó"
   * cuando sí se guardó), y las dos llevan al usuario a hacer lo
   * equivocado: la primera a confiar en un respaldo que no existe, la
   * segunda a volver a escribir una clave que ya estaba bien.
   */
  aviso?: string | null;
};

export const ESTADO_INICIAL: PanelState = { error: null, ok: false, aviso: null };

export type Panel = {
  id: string;
  nombre: string;
  /** En el orden en que los puso el usuario. El primero es el de entrar. */
  urls: string[];
  cuentas: Cuenta[];
  notas: string;
};

/**
 * Un usuario CON su clave. Van juntos y no en dos listas paralelas porque
 * un usuario sin su clave no sirve para entrar, y dos listas se
 * desalinean en cuanto se borra una fila de una sola.
 *
 * `secret_id` es dónde vive la clave de verdad: una referencia al secreto
 * en Bitwarden. Mientras dure la migración conviven las dos cosas —- la
 * referencia y el texto en la base -— y la pantalla prefiere el valor de
 * Bitwarden cuando lo consigue.
 *
 * Es opcional porque una cuenta puede no tenerlo todavía: la cargaron
 * antes de la migración, o Bitwarden no contestó cuando se guardó. Una
 * cuenta sin `secret_id` no está rota, está sin respaldar.
 */
export type Cuenta = {
  usuario: string;
  clave: string;
  secret_id?: string;
  /**
   * La cuenta tiene un `secret_id` que Bitwarden no resolvió: el secreto
   * se borró a mano allá, o el gestor no contestó. La pantalla lo dice en
   * vez de mostrar un campo vacío, que se lee como "no tiene clave".
   */
  claveNoDisponible?: boolean;
};

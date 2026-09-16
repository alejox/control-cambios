/**
 * El estado que comparten los formularios de esta pantalla.
 *
 * Vive acá y no en actions.ts porque un archivo "use server" solo puede
 * exportar funciones async: un objeto exportado desde ahí revienta al
 * evaluar el módulo, no al compilar.
 */
export type PanelState = { error: string | null; ok: boolean };

export const ESTADO_INICIAL: PanelState = { error: null, ok: false };

export type Panel = {
  id: string;
  nombre: string;
  /** En el orden en que los puso el usuario. El primero es el de entrar. */
  urls: string[];
  usuario: string;
  clave: string;
  notas: string;
};

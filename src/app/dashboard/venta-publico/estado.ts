/**
 * El estado que comparten los formularios de esta pantalla.
 *
 * Vive acá y no en actions.ts porque un archivo "use server" solo puede
 * exportar funciones async: todo lo demás es una promesa que Next no
 * puede cumplir del otro lado de la red. Un objeto exportado desde ahí
 * revienta al evaluar el módulo, no al compilar, así que el error espera
 * escondido hasta que alguien monta el primer formulario.
 */
export type VentaState = { error: string | null; ok: boolean };

export const ESTADO_INICIAL: VentaState = { error: null, ok: false };

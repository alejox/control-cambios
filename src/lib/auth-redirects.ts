/**
 * Destinos a los que /auth/callback puede enviar al usuario después de
 * canjear el código por una sesión.
 *
 * Es una lista blanca a propósito. Si el parámetro `next` se usara tal
 * como viene en la URL, cualquiera podría armar un enlace del tipo
 * /auth/callback?next=https://sitio-falso.com y convertir el callback en
 * un open redirect: el usuario llegaría al sitio del atacante con la
 * sesión recién creada. Validar "que empiece con /" tampoco alcanza,
 * porque //sitio-falso.com también es una URL absoluta para el navegador.
 */
const DESTINOS_PERMITIDOS = ["/dashboard", "/update-password"] as const;

export type DestinoAuth = (typeof DESTINOS_PERMITIDOS)[number];

export const DESTINO_POR_DEFECTO: DestinoAuth = "/dashboard";

/** Devuelve el destino pedido solo si está en la lista blanca. */
export function resolverDestino(valor: string | null): DestinoAuth {
  return DESTINOS_PERMITIDOS.find((ruta) => ruta === valor) ?? DESTINO_POR_DEFECTO;
}

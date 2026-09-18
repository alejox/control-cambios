/**
 * Nombre y valores de la cookie que recuerda si la barra lateral quedo
 * colapsada.
 *
 * Vive en su propio archivo, sin dependencias y sin "use client", porque lo
 * necesitan los DOS lados: el servidor la lee en el layout y el cliente la
 * escribe al apretar el boton. Si la constante viviera en cualquiera de los
 * dos, el otro tendria que repetir el string a mano —- y dos copias de un
 * nombre de cookie se desincronizan el dia que alguien toca una sola.
 */
export const COOKIE_SIDEBAR = "sidebar_colapsado";

export const COOKIE_SIDEBAR_SI = "1";
export const COOKIE_SIDEBAR_NO = "0";

/** Un anio. Es una preferencia de comodidad: que dure. */
export const COOKIE_SIDEBAR_DURACION = 60 * 60 * 24 * 365;

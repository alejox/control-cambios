import type { MetadataRoute } from "next";

/**
 * Lo que hace que el navegador ofrezca instalar la app.
 *
 * start_url apunta a /dashboard y no a /: es donde se quiere caer al
 * abrir el icono. Sin sesión, /dashboard redirige solo a /login, así que
 * no hace falta decidirlo acá.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cotejo",
    short_name: "Cotejo",
    description: "Cambios a USDT, cotejados con la contraparte.",
    lang: "es",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // El de la pantalla de carga y el de la barra de estado. background es
    // el fondo de la app y theme el del header, que es lo que queda pegado
    // arriba cuando corre sin la barra del navegador.
    background_color: "#f5f6f1",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // El mismo archivo como maskable: la marca ocupa el 78% del lado, así
      // que entra entera en la zona segura del 80% que recorta Android para
      // darle al icono la forma del sistema. Ese 78% lo fija
      // scripts/genera-iconos.py, que es quien produce estos PNG.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

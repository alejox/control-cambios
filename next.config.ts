import type { NextConfig } from "next";

/**
 * El origen de Supabase sale del entorno y no de una constante: el
 * navegador le habla a ESE host para la API, para el WebSocket de Realtime
 * y para las URLs firmadas de los comprobantes. Escribirlo a mano acá
 * significaría que el día que se cambie de proyecto la app deja de cargar
 * imágenes sin que nadie entienda por qué.
 *
 * Si la variable falta —- un build mal configurado -— se omite en vez de
 * poner "undefined" en la política, que dejaría una CSP rota y silenciosa.
 */
const supabase = (() => {
  const crudo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!crudo) return { http: "", ws: "" };
  try {
    const { origin, host } = new URL(crudo);
    return { http: origin, ws: `wss://${host}` };
  } catch {
    return { http: "", ws: "" };
  }
})();

const enDesarrollo = process.env.NODE_ENV === "development";

/**
 * Qué puede cargar y a dónde puede hablar esta página.
 *
 * Lo que de verdad compra cada línea, para que nadie la afloje sin saber
 * lo que está aflojando:
 *
 *   frame-ancestors 'none'  Nadie puede meter la app en un iframe. Es la
 *                           defensa contra clickjacking: sin esto, una
 *                           página ajena puede superponer un botón
 *                           invisible sobre "Aprobar" y hacerte liquidar
 *                           un movimiento creyendo que aceptás cookies.
 *   connect-src             La app solo puede hablarle a Supabase y a sí
 *                           misma. Si algún día entra un script de más,
 *                           no tiene a dónde mandar lo que lea.
 *   object-src 'none'       Sin Flash, sin applets, sin <embed>.
 *   base-uri 'self'         Nadie puede reescribir la base de las URLs
 *                           relativas y desviar a otro dominio.
 *   form-action 'self'      Un formulario no puede postear afuera.
 *
 * Y lo que NO compra, dicho para no vivir con una falsa sensación:
 * script-src lleva 'unsafe-inline' porque Next arranca con un script
 * inline, así que esta CSP NO es una defensa fuerte contra XSS. Serlo
 * pide nonces generados por request en el proxy, que con Turbopack es
 * frágil. La defensa real contra XSS acá sigue siendo React, que escapa
 * todo lo que interpola, y no usar dangerouslySetInnerHTML.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabase.http}`.trim(),
  `connect-src 'self' ${supabase.http} ${supabase.ws}`.trim().replace(/\s+/g, " "),
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Next anuncia su presencia en cada respuesta. No es un agujero, pero
  // decirle a un escáner automático qué stack corre acá es trabajo que se
  // le regala gratis.
  poweredByHeader: false,

  // El SDK de Bitwarden usa un binding N-API nativo. Mantenerlo externo
  // permite que Vercel cargue el binario Linux correspondiente en runtime,
  // en lugar de intentar empaquetarlo dentro del bundle de Next.
  serverExternalPackages: ["@bitwarden/sdk-napi"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          {
            // Dos años y con preload: una vez que el navegador la vio, ya
            // no acepta hablarle a este dominio por http, ni siquiera la
            // primera vez. Corta el ataque de red que degrada la conexión
            // antes de que exista la sesión.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Redundante con frame-ancestors para navegadores modernos, pero
          // los viejos solo entienden esta.
          { key: "X-Frame-Options", value: "DENY" },
          // Sin esto, un archivo subido como imagen que en realidad es
          // HTML puede ejecutarse como HTML.
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            // Al salir a un panel de proveedor no viaja la ruta interna
            // desde la que se fue, solo el dominio.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // La app no usa nada de esto. Declararlo apagado significa que
            // un script de más tampoco puede.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

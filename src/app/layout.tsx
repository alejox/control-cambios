import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegistrarSW from "./registrar-sw";

export const metadata: Metadata = {
  title: "Control de Cambios",
  description: "Control de cambios y conversión a USDT",
  // iOS no lee el manifest: para que el icono de la pantalla de inicio
  // abra sin la barra del navegador hacen falta estas dos.
  appleWebApp: {
    capable: true,
    title: "Cambios",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // viewportFit cover NO es cosmético: sin esto env(safe-area-inset-bottom)
  // devuelve 0, y el menú de abajo queda debajo de la franja del gesto de
  // inicio del iPhone. La app instalada es justo donde más se nota, porque
  // ahí no hay barra del navegador que haga de colchón.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}

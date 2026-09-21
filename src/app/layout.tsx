import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import RegistrarSW from "./registrar-sw";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-display",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Cotejo",
  description: "Cambios a USDT, cotejados con la contraparte.",
  // iOS no lee el manifest: sin esto el icono de la pantalla de inicio
  // abre con la barra del navegador encima.
  appleWebApp: {
    capable: true,
    title: "Cotejo",
    statusBarStyle: "default",
  },
  // Los iconos NO se declaran aca a proposito: van por convencion de
  // archivos (src/app/favicon.ico, icon.svg y apple-icon.png). Poner
  // `icons` a mano PISA la convencion, y eso fue exactamente lo que
  // pasaba: con `icons.apple` declarado, el icon.svg existia y no se
  // enlazaba nunca. El unico <link rel="icon"> del HTML era el de Apple.
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
    <html
      lang="es"
      className={`h-full antialiased ${fraunces.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}

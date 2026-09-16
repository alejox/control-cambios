import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/telegram queda afuera a proposito. El webhook del bot lo llama
  // Telegram, que no tiene cookies ni sesion: si pasara por acá, updateSession
  // no encontraria usuario y lo redirigiria a /login con un 307. El handler
  // nunca correria y los comprobantes se perderian en silencio.
  //
  // No es un agujero: ese endpoint se defiende con el secreto que Telegram
  // manda en cada llamada, y de paso se ahorra una consulta de sesion por
  // cada mensaje que llega.
  //
  // manifest.webmanifest y sw.js quedan afuera por la misma razon que
  // api/telegram: los pide el NAVEGADOR sin sesion, antes de que exista
  // una. Si pasaran por aca, updateSession no encuentra usuario y los
  // manda a /login con un 307; el navegador recibe el HTML del login
  // donde esperaba un manifest, concluye que no hay, y no ofrece
  // instalar. Nada falla: simplemente no aparece el boton.
  //
  // El icono si funcionaba porque la lista de extensiones de abajo ya lo
  // dejaba pasar, lo que hacia el sintoma todavia mas confuso.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/telegram|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};

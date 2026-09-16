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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/telegram|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

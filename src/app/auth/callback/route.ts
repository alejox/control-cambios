import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverDestino } from "@/lib/auth-redirects";

/**
 * Adonde Supabase redirige cuando se abre el enlace de recuperación
 * enviado desde /forgot-password. No hay alta pública: las cuentas se
 * crean a mano desde Supabase.
 *
 * El parámetro `next` decide dónde termina el usuario, pero pasa siempre
 * por la lista blanca de @/lib/auth-redirects.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const destino = resolverDestino(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // El enlace venció, ya se usó una vez, o se abrió en un navegador
    // distinto al que lo pidió: el verificador PKCE vive en una cookie
    // de ese navegador. Antes este error se ignoraba y el usuario caía
    // en /dashboard sin sesión, para que el proxy lo rebotara a /login
    // sin ninguna explicación.
    const fallback =
      destino === "/update-password" ? "/forgot-password" : "/login";
    const url = new URL(fallback, origin);
    url.searchParams.set("error", "enlace_invalido");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(destino, origin));
}

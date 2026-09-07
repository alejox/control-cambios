import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Adonde Supabase redirige después de un login con Google o de
 * confirmar el correo en el signup por contraseña.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPanelSecretMetadata } from "@/lib/bitwarden-secrets";

export const runtime = "nodejs";

/** Server-only smoke test; it never returns secret values. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión vencida." }, { status: 401 });
  }

  try {
    const secrets = await listPanelSecretMetadata();
    return NextResponse.json({ ok: true, secretCount: secrets.length });
  } catch (error) {
    console.error("[bitwarden] no se pudo comprobar Secrets Manager:", error);
    return NextResponse.json(
      { error: "No pudimos conectar con el gestor de secretos." },
      { status: 503 },
    );
  }
}

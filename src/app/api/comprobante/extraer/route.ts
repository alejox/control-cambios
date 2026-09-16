import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extraerConIA } from "@/lib/comprobante-ia";

const BUCKET = "comprobantes";

// Vercel corta a los 300s por defecto en TODOS los planes. 30s es de sobra
// para una extraccion y evita que una llamada colgada siga corriendo (y
// facturando) mucho despues de que el usuario se fue.
export const maxDuration = 30;

// La lectura en si (prompt, esquema, modelo, parseo) vive en
// @/lib/comprobante-ia porque el bot de Telegram hace exactamente lo mismo
// sin pasar por acá. Este handler solo aporta lo que es propio de la web:
// la sesión, el permiso y bajar el archivo del bucket con RLS puesto.
export async function POST(request: Request) {
  const supabase = await createClient();

  // El route corre con la sesión del usuario, así que las políticas de RLS
  // del bucket aplican igual. Este chequeo es para dar un mensaje claro.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión vencida." }, { status: 401 });
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // El error NO se descarta. Si esta consulta falla —y falla: quedo un 504
  // de PostgREST en los logs— "perfil" viene null, el rol cae a
  // "sin_acceso" y el usuario recibe "no tenes permiso" por un timeout.
  // Acusar de falta de permisos a alguien que si los tiene manda a buscar
  // el problema al lado exactamente equivocado.
  if (errorPerfil) {
    console.error("[comprobante] no se pudo leer el perfil:", errorPerfil.message);
    return NextResponse.json(
      { error: "No pudimos verificar tu cuenta en este momento. Probá de nuevo." },
      { status: 503 },
    );
  }

  // Colaborador tambien: registra movimientos COP y necesita leer sus
  // comprobantes igual que el admin.
  const rol = perfil?.role ?? "sin_acceso";
  if (rol !== "admin" && rol !== "colaborador") {
    return NextResponse.json(
      { error: `Tu cuenta tiene el rol "${rol}" y no puede leer comprobantes.` },
      { status: 403 },
    );
  }

  let path: unknown;
  try {
    ({ path } = await request.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // El path viene del cliente, así que no se confía: solo un nombre de
  // archivo plano, sin "/" ni ".." que permitan salir de la carpeta.
  if (typeof path !== "string" || path === "" || !/^[\w.-]+$/.test(path)) {
    return NextResponse.json({ error: "Ruta de comprobante inválida." }, { status: 400 });
  }

  const { data: archivo, error: errorDescarga } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (errorDescarga || !archivo) {
    return NextResponse.json(
      { error: errorDescarga?.message ?? "No pudimos leer el comprobante." },
      { status: 404 },
    );
  }

  const resultado = await extraerConIA({
    bytes: await archivo.arrayBuffer(),
    tipo: archivo.type || "application/octet-stream",
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.json(resultado.datos);
}

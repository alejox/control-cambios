import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extraerConIA } from "@/lib/comprobante-ia";

const BUCKET = "comprobantes";
const RATE_LIMIT_ERROR =
  "La lectura automática llegó a su límite. Esperá unos minutos o cargá los datos a mano.";

// Vercel corta a los 300s por defecto en TODOS los planes. Este numero es
// el TECHO de los tres presupuestos que tiene una lectura, y tienen que
// estar ordenados de mayor a menor o el de abajo mata al de arriba:
//
//   ruta (60s)  >  navegador (45s)  >  Gemini (18s x 2 intentos = 36s)
//
// Estaba en 30s mientras Gemini tenia 20s y ningun reintento. Cuando se
// agrego el reintento nadie recalculo, asi que el segundo intento no
// entraba y las lecturas morian canceladas sin explicacion.
export const maxDuration = 60;

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

  // Este cupo se reserva en Postgres, no en memoria del proceso: la app puede
  // correr en varias instancias y todas tienen que ver el mismo límite. Se
  // hace antes de bajar el archivo y, sobre todo, antes de llamar a Gemini.
  const { data: cupos, error: errorCupo } = await supabase.rpc(
    "consumir_cupo_comprobante_ia",
  );
  if (errorCupo) {
    // Si la migración no está aplicada o PostgREST no puede llegar a la base,
    // no se deja pasar una llamada pagada sin haber podido limitarla.
    console.error("[comprobante] no se pudo reservar el cupo de IA:", errorCupo.message);
    return NextResponse.json(
      { error: "No pudimos verificar el cupo de lectura automática. Probá de nuevo." },
      { status: 503 },
    );
  }

  const cupo = cupos?.[0];
  if (!cupo?.allowed) {
    const retryAfter = Math.max(1, Math.ceil(Number(cupo?.retry_after_seconds) || 60));
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
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

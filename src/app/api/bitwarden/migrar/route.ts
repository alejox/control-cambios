import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estaConfigurado, mensajeDeError } from "@/lib/bitwarden-secrets";
import {
  cuentasGuardadas,
  respaldarPendientes,
  verificarRespaldo,
  type FilaParaMigrar,
} from "@/lib/paneles-secretos";

// El SDK de Bitwarden es un binding nativo: necesita Node, no Edge.
export const runtime = "nodejs";

// Migrar toca el gestor una vez por cuenta pendiente. Con pocos paneles
// sobra, pero el techo por defecto de Vercel (300s) es demasiado silencio
// para una pantalla que espera: si a los 90s no terminó, algo anda mal y
// conviene enterarse ahora y reintentar, no a los cinco minutos.
export const maxDuration = 90;

/**
 * Pasa las claves que están en texto plano en Supabase a Bitwarden.
 *
 *   GET   diagnostica y no escribe nada.
 *   POST  crea los secretos que falten y vuelve a diagnosticar.
 *
 * CADA USUARIO MIGRA LO SUYO. Esto no usa la service_role key a propósito,
 * aunque un solo botón de admin habría sido más cómodo: migrar implica
 * LEER las claves, y en esta app ni el admin ve los paneles del
 * colaborador —- eso lo decidió la política "paneles: cada uno los suyos"
 * y no lo va a deshacer una tarea de mantenimiento. Corriendo con la
 * sesión de quien llama, RLS garantiza que solo se tocan sus propias
 * filas sin que este archivo tenga que acordarse de filtrar.
 *
 * Es idempotente: solo crea secretos para cuentas que no tienen. Correrlo
 * dos veces no duplica nada y no pisa lo que ya está en el gestor.
 */
async function panelesDelUsuario() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sesión vencida." }, { status: 401 }) };
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // El error NO se descarta: si esta consulta falla, "perfil" viene null,
  // el rol cae a "sin_acceso" y le diríamos "no tenés permiso" a alguien
  // que sí lo tiene, mandándolo a buscar el problema al lado equivocado.
  if (errorPerfil) {
    console.error("[migración] no se pudo leer el perfil:", errorPerfil.message);
    return {
      error: NextResponse.json(
        { error: "No pudimos verificar tu cuenta en este momento." },
        { status: 503 },
      ),
    };
  }

  const rol = perfil?.role ?? "sin_acceso";
  if (rol !== "admin" && rol !== "colaborador") {
    return {
      error: NextResponse.json(
        { error: "Tu cuenta no tiene acceso a los paneles." },
        { status: 403 },
      ),
    };
  }

  if (!estaConfigurado()) {
    return {
      error: NextResponse.json(
        { error: "El gestor de secretos no está configurado en este entorno." },
        { status: 503 },
      ),
    };
  }

  // Sin filtrar por usuario: RLS ya deja pasar solo las filas propias.
  const { data, error } = await supabase
    .from("paneles")
    .select("id, nombre, cuentas")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[migración] no se pudieron leer los paneles:", error.message);
    return {
      error: NextResponse.json(
        { error: "No pudimos leer tus paneles." },
        { status: 503 },
      ),
    };
  }

  return { supabase, filas: (data ?? []) as FilaParaMigrar[] };
}

/** Diagnóstico de solo lectura: cuánto falta para poder borrar el texto plano. */
export async function GET() {
  const contexto = await panelesDelUsuario();
  if (contexto.error) return contexto.error;

  try {
    return NextResponse.json(await verificarRespaldo(contexto.filas));
  } catch (error) {
    console.error("[migración] el diagnóstico falló:", mensajeDeError(error));
    return NextResponse.json(
      { error: "No pudimos consultar el gestor de secretos." },
      { status: 503 },
    );
  }
}

export async function POST() {
  const contexto = await panelesDelUsuario();
  if (contexto.error) return contexto.error;
  const { supabase, filas } = contexto;

  let creados = 0;
  let fallidos = 0;

  // De a un panel por vez. Adentro de cada panel las cuentas van en
  // paralelo, pero lanzar todos los paneles juntos convertiría una cuenta
  // de treinta secretos en treinta llamadas simultáneas al gestor, que es
  // la forma más rápida de comerse un límite de tasa a mitad de camino y
  // quedar con la migración por la mitad.
  for (const fila of filas) {
    const cuentas = cuentasGuardadas(fila.cuentas);
    const resultado = await respaldarPendientes({
      panelId: fila.id,
      nombrePanel: fila.nombre,
      cuentas,
    });

    creados += resultado.creados;
    fallidos += resultado.fallidos;

    // Sin nada nuevo no se escribe: un update por panel en cada pasada
    // ensuciaría updated_at y haría que "migrar" parezca una edición.
    if (resultado.creados === 0) continue;

    // Se escribe SOLO la columna cuentas. El texto plano de cada clave
    // sigue ahí, intacto: esta fase agrega la referencia, no retira nada.
    // Retirar es la fase siguiente y pide que el diagnóstico de abajo dé
    // listoParaRetirarTextoPlano en true.
    const { error } = await supabase
      .from("paneles")
      .update({ cuentas: resultado.cuentas })
      .eq("id", fila.id)
      .select("id");

    if (error) {
      // El secreto quedó creado pero la fila no guardó su referencia. No se
      // borra el secreto: la próxima pasada crea otro y este queda
      // huérfano, que es basura recuperable. Borrarlo acá, en cambio,
      // podría estar borrando el respaldo de una fila que sí se guardó en
      // una carrera con otra pestaña.
      fallidos += resultado.creados;
      console.error(
        `[migración] el panel ${fila.id} no guardó sus referencias:`,
        error.message,
      );
    }
  }

  try {
    // Se relee de la base en vez de confiar en lo que acabamos de escribir:
    // el diagnóstico tiene que reflejar lo que quedó guardado, no lo que
    // creímos guardar. Es justo la diferencia que importa cuando un update
    // falló arriba.
    const { data } = await supabase
      .from("paneles")
      .select("id, nombre, cuentas")
      .order("created_at", { ascending: true });

    const diagnostico = await verificarRespaldo((data ?? []) as FilaParaMigrar[]);
    return NextResponse.json({ creados, fallidos, ...diagnostico });
  } catch (error) {
    console.error("[migración] el diagnóstico falló:", mensajeDeError(error));
    return NextResponse.json(
      { creados, fallidos, error: "Migramos, pero no pudimos verificar el resultado." },
      { status: 207 },
    );
  }
}

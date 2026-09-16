"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ComisionState = { error: string | null; ok: boolean };

/**
 * Lee un porcentaje del formulario y lo valida.
 *
 * Number("") es 0: sin el chequeo de vacío, mandar el campo en blanco
 * dejaba la comisión en cero sin que nadie lo pidiera.
 */
function leerPorcentaje(formData: FormData, campo: string, moneda: string) {
  const raw = ((formData.get(campo) as string) ?? "").trim();

  if (raw === "") {
    return { valor: null, error: `Escribí el porcentaje de ${moneda}.` };
  }

  const valor = Number(raw);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    return { valor: null, error: `El porcentaje de ${moneda} debe estar entre 0 y 100.` };
  }

  return { valor, error: null };
}

/**
 * Cambia las dos comisiones: la de Bs y la de COP.
 *
 * Van juntas en un solo update, no en dos acciones separadas: es un
 * formulario con dos campos y guardar uno sí y el otro no dejaría la
 * configuración a medio camino.
 *
 * NO se toca comision_pct, la columna vieja. Sigue viva solo para el front
 * anterior y hay un trigger en la base que la replica hacia estas dos
 * cuando la escribe ese front; si escribiéramos las tres juntas, ese
 * trigger podría pisar lo que acaba de elegir el admin. Se dropea la
 * columna —y el trigger— cuando el front nuevo lleve un rato arriba.
 *
 * La autorización real no está acá: la política de RLS "solo admin cambia
 * configuracion" es la que decide. Este chequeo previo existe solo para
 * dar un mensaje claro en vez de un update que afecta cero filas.
 *
 * Los items ya registrados no se tocan: cada uno guarda el sello del
 * porcentaje con el que se creó.
 */
export async function actualizarComisiones(
  _prevState: ComisionState,
  formData: FormData,
): Promise<ComisionState> {
  const bs = leerPorcentaje(formData, "comision_bs_pct", "Bs");
  if (bs.error !== null) return { error: bs.error, ok: false };

  const cop = leerPorcentaje(formData, "comision_cop_pct", "COP");
  if (cop.error !== null) return { error: cop.error, ok: false };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión venció. Vuelve a iniciar sesión.", ok: false };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin") {
    return { error: "Solo un administrador puede cambiar la comisión.", ok: false };
  }

  const { data, error } = await supabase
    .from("configuracion")
    .update({
      comision_bs_pct: bs.valor,
      comision_cop_pct: cop.valor,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", true)
    .select("comision_bs_pct");

  if (error) {
    return { error: error.message, ok: false };
  }

  // Un update que no afecta ninguna fila no es un éxito: con RLS activo,
  // así se ve un permiso denegado desde PostgREST.
  if (!data || data.length === 0) {
    return { error: "No se pudo guardar: tu cuenta no tiene permiso.", ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/items/new");
  // La pantalla de revisión también muestra el porcentaje de cada flujo.
  revalidatePath("/dashboard/revision");
  return { error: null, ok: true };
}

export type RecalculoState = { error: string | null; mensaje: string | null };

/**
 * Aplica las comisiones vigentes a todo lo que todavía no se liquidó. Es la
 * salida para el que configuró mal el porcentaje y ya cargó movimientos
 * con él.
 *
 * Alcanza también a los ya aprobados, pero no les cambia el número por
 * atrás: a esos la base los DEVUELVE A REVISIÓN, para que la contraparte
 * vea el número nuevo y lo apruebe otra vez (ver
 * supabase/phase23_recalculo_amplio.sql).
 *
 * El alcance, las reglas y la atomicidad viven en la RPC
 * recalcular_comisiones_pendientes, no acá: un UPDATE armado desde el
 * cliente podría pedir cualquier alcance, y el que NUNCA hay que poder
 * pedir es el de los liquidados. Desde acá no se manda ningún filtro
 * justamente por eso.
 *
 * El chequeo de admin de este archivo es para el mensaje; el que manda es
 * el de la base (RLS "solo admin escribe items" + el raise de la función).
 */
export async function recalcularComisiones(): Promise<RecalculoState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión venció. Volvé a iniciar sesión.", mensaje: null };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin") {
    return {
      error: "Solo un administrador puede recalcular comisiones.",
      mensaje: null,
    };
  }

  const { data, error } = await supabase.rpc("recalcular_comisiones_pendientes");

  if (error) {
    return { error: error.message, mensaje: null };
  }

  const resultado = data as {
    actualizados?: number;
    devueltos_a_revision?: number;
  } | null;
  const actualizados = Number(resultado?.actualizados ?? 0);
  const devueltos = Number(resultado?.devueltos_a_revision ?? 0);

  // El layout entero y no solo la página: si algún movimiento volvió a
  // revisión, la campanita —- que vive en el layout —- tiene que subir en el
  // mismo momento. Esta forma arrastra también a /dashboard/revision.
  revalidatePath("/dashboard", "layout");

  // Cero no se disfraza de éxito: si no cambió nada hay que decirlo con
  // esas palabras, porque normalmente significa que ya estaban al día.
  if (actualizados === 0) {
    return {
      error: null,
      mensaje: "No se actualizó ningún movimiento: ya tenían la comisión vigente.",
    };
  }

  const base =
    actualizados === 1
      ? "Se actualizó 1 movimiento."
      : `Se actualizaron ${actualizados} movimientos.`;

  // Lo que volvió a revisión se dice siempre que haya pasado: es trabajo
  // que se le acaba de generar a la contraparte, no un detalle interno.
  const cola =
    devueltos === 0
      ? ""
      : devueltos === 1
        ? " 1 estaba aprobado y volvió a revisión."
        : ` ${devueltos} estaban aprobados y volvieron a revisión.`;

  return { error: null, mensaje: base + cola };
}

export type CodigoTelegramState = { error: string | null; codigo: string | null };

// Sin I, O, 0 ni 1: el código se lee de una pantalla y se tipea en otra, y
// esos cuatro caracteres son los que se confunden entre sí.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO = 8;

function codigoAlAzar() {
  const bytes = crypto.getRandomValues(new Uint8Array(LARGO));
  // 256 es múltiplo de 32, así que el resto no favorece a ninguna letra:
  // los 8 caracteres son 40 bits repartidos parejo.
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/**
 * Código de un solo uso para atar un chat de Telegram a esta cuenta.
 *
 * El vínculo NO se crea acá: acá solo nace el código. Quien lo convierte en
 * vínculo es el webhook, porque es el único que sabe de verdad de qué chat
 * viene un mensaje. Si esta pantalla pudiera crear el vínculo, cualquiera
 * podría atar el chat de otro a su propia cuenta.
 *
 * La expiración no se manda: la pone el default de la tabla (15 minutos) con
 * el reloj de la base. Calcularla acá y mandarla sería exponerse a que una
 * diferencia de segundos entre los dos relojes haga fallar la política.
 */
// Sin parámetros: useActionState le pasa el estado anterior y el FormData,
// pero acá no hay nada que leer del formulario ni que arrastrar del intento
// anterior. Declararlos solo para ignorarlos sería ruido.
export async function generarCodigoTelegram(): Promise<CodigoTelegramState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión venció. Volvé a iniciar sesión.", codigo: null };
  }

  // La autorización real es la política "cada uno crea sus codigos de
  // telegram"; este chequeo es para dar un mensaje claro en vez de un
  // insert rechazado.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin" && perfil?.role !== "colaborador") {
    return {
      error: "Tu cuenta todavía no tiene un rol asignado, así que no puede cargar movimientos.",
      codigo: null,
    };
  }

  // La primary key puede chocar. Con 40 bits es rarísimo, pero perder la
  // vinculación por eso sería absurdo: se reintenta.
  for (let intento = 0; intento < 3; intento++) {
    const codigo = codigoAlAzar();
    const { error } = await supabase
      .from("telegram_codigos")
      .insert({ codigo, user_id: user.id });

    if (!error) return { error: null, codigo };
    if (error.code !== "23505") {
      return { error: `No se pudo generar el código: ${error.message}`, codigo: null };
    }
  }

  return { error: "No se pudo generar un código. Probá de nuevo.", codigo: null };
}

export type DesvincularTelegramState = { error: string | null; ok: boolean };

/**
 * Corta el vínculo con el chat. A partir de acá el bot deja de reconocerlo y
 * vuelve a ignorarlo como a cualquier desconocido.
 */
export async function desvincularTelegram(): Promise<DesvincularTelegramState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció. Volvé a iniciar sesión.", ok: false };

  const { error } = await supabase
    .from("telegram_vinculos")
    .delete()
    .eq("user_id", user.id);

  if (error) return { error: error.message, ok: false };

  revalidatePath("/dashboard", "layout");
  return { error: null, ok: true };
}

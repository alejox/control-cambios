"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ComisionState = { error: string | null; ok: boolean };

/**
 * Cambia el porcentaje de comisión global.
 *
 * La autorización real no está acá: la política de RLS "solo admin cambia
 * configuracion" es la que decide. Este chequeo previo existe solo para
 * dar un mensaje claro en vez de un update que afecta cero filas.
 *
 * Los items ya registrados no se tocan: cada uno guarda el sello del
 * porcentaje con el que se creó.
 */
export async function actualizarComisionGlobal(
  _prevState: ComisionState,
  formData: FormData,
): Promise<ComisionState> {
  const raw = ((formData.get("comision_pct") as string) ?? "").trim();

  // Number("") es 0: sin este chequeo, mandar el campo vacío dejaba la
  // comisión en cero sin que nadie lo pidiera.
  if (raw === "") {
    return { error: "Escribe un porcentaje.", ok: false };
  }

  const comision_pct = Number(raw);
  if (!Number.isFinite(comision_pct) || comision_pct < 0 || comision_pct > 100) {
    return { error: "El porcentaje debe estar entre 0 y 100.", ok: false };
  }

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
      comision_pct,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", true)
    .select("comision_pct");

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
  return { error: null, ok: true };
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

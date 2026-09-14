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

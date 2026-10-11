"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leerVenta } from "@/lib/ventas";

export type VentaState = { error: string | null; ok: boolean };

/**
 * Pide la sesión y confirma que sea admin. La autorización real la da RLS
 * ("solo admin crea/borra ventas", fase 50); esto existe para dar un
 * mensaje claro en vez de un insert rechazado o un delete que no toca nada.
 */
async function adminActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, error: "Tu sesión venció. Vuelve a iniciar sesión." };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin") {
    return { supabase, error: "Solo un administrador puede registrar ventas de créditos." };
  }
  return { supabase, error: null };
}

/**
 * Registra una venta de créditos del lado Bs al lado COP. Queda pendiente
 * hasta el próximo corte, que la descuenta del saldo del lado COP.
 */
export async function crearVenta(
  _prevState: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const leida = leerVenta({
    usdt: formData.get("usdt"),
    fecha: formData.get("fecha"),
    descripcion: formData.get("descripcion"),
  });
  if (leida.error !== null) return { error: leida.error, ok: false };

  const { supabase, error: errorSesion } = await adminActual();
  if (errorSesion) return { error: errorSesion, ok: false };

  const { error } = await supabase.from("ventas").insert(leida.venta);
  if (error) {
    if (error.message.includes("row-level security")) {
      return { error: "Tu cuenta no tiene permiso para registrar ventas.", ok: false };
    }
    return { error: error.message, ok: false };
  }

  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

/**
 * Borra una venta que todavía no entró en ningún corte. Una liquidada no se
 * borra: el filtro de acá da el mensaje, el trigger de la fase 50 es la
 * pared.
 */
export async function eliminarVenta(ventaId: string) {
  const { supabase, error: errorSesion } = await adminActual();
  if (errorSesion) throw new Error(errorSesion);

  const { data, error } = await supabase
    .from("ventas")
    .delete()
    .eq("id", ventaId)
    .is("liquidacion_id", null)
    .select("id");

  if (error) throw new Error(error.message);
  // Cero filas: ya estaba liquidada, ya no existía o RLS la tapó.
  if (!data || data.length === 0) {
    throw new Error("No se pudo eliminar: la venta ya está liquidada o no existe.");
  }

  revalidatePath("/dashboard");
}

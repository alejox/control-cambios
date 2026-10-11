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
    numero: formData.get("numero"),
  });
  if (leida.error !== null) return { error: leida.error, ok: false };

  const { supabase, error: errorSesion } = await adminActual();
  if (errorSesion) return { error: errorSesion, ok: false };

  const { error } = await supabase.from("ventas").insert(leida.venta);
  if (error) {
    if (error.message.includes("row-level security")) {
      return { error: "Tu cuenta no tiene permiso para registrar ventas.", ok: false };
    }
    // Choque de número: el índice único de ventas da el mensaje crudo de
    // Postgres; el trigger de la fase 51 (choque con un movimiento) ya da
    // uno en castellano y pasa tal cual.
    if (
      error.message.includes("ventas_numero_pendiente_idx") ||
      error.message.includes("duplicate key")
    ) {
      return { error: "Ya hay una venta pendiente con ese número.", ok: false };
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
 *
 * Devuelve el resultado en vez de tirar: en producción Next tapa el mensaje
 * de un error lanzado desde una server action, y el usuario vería un
 * genérico en lugar del motivo.
 */
export async function eliminarVenta(ventaId: string): Promise<VentaState> {
  const { supabase, error: errorSesion } = await adminActual();
  if (errorSesion) return { error: errorSesion, ok: false };

  const { data, error } = await supabase
    .from("ventas")
    .delete()
    .eq("id", ventaId)
    .is("liquidacion_id", null)
    .select("id");

  if (error) return { error: error.message, ok: false };
  // Cero filas: ya estaba liquidada, ya no existía o RLS la tapó.
  if (!data || data.length === 0) {
    return { error: "No se pudo eliminar: la venta ya está liquidada o no existe.", ok: false };
  }

  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

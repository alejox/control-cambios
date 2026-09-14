"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LiquidarState = { error: string | null };

/**
 * Cierra todos los cierres pendientes en una liquidacion.
 *
 * Los totales NO viajan desde el navegador: los calcula la RPC leyendo los
 * items. Si los mandara el cliente, cualquiera podria declarar la comision
 * que se le antoje.
 */
export async function liquidar(
  _prevState: LiquidarState,
  formData: FormData,
): Promise<LiquidarState> {
  const notas = ((formData.get("notas") as string) ?? "").trim() || null;
  const fechaRaw = ((formData.get("fecha") as string) ?? "").trim();

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("liquidar_pendientes", {
    p_fecha: fechaRaw || null,
    p_notas: notas,
  });

  if (error) {
    if (error.message.includes("No hay cierres pendientes")) {
      return { error: "No hay cierres pendientes de liquidar." };
    }
    if (error.message.includes("row-level security") || error.message.includes("permission denied")) {
      return { error: "Tu cuenta no tiene permiso de admin para liquidar." };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/liquidaciones");
  redirect(`/dashboard/liquidaciones/${data as string}`);
}

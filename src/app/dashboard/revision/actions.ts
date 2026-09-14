"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RevisionState = { error: string | null; ok: boolean };

/**
 * Confirma la revisión de un movimiento.
 *
 * Es UNA sola acción a propósito, aunque por dentro tenga dos caminos. Antes
 * el componente elegía entre dos acciones distintas con un ternario, y eso
 * cambia el identificador que React manda en el formulario: el servidor
 * recibe una referencia que ya no es la que renderizó y responde algo que el
 * cliente no sabe leer ("An unexpected response was received from the
 * server").
 *
 * Los dos caminos:
 *  - Con comprobantes tildados -> se aprueban esos depósitos en lote.
 *  - Sin depósitos -> se confirma el movimiento entero.
 */
export async function confirmarRevision(
  _prevState: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const itemId = (formData.get("item_id") as string) ?? "";
  if (!itemId) return { error: "Falta el movimiento.", ok: false };

  const ids = formData.getAll("seleccion") as string[];
  const supabase = await createClient();

  if (ids.length > 0) {
    const lote: { id: string; usdt: number | null }[] = [];

    for (const id of ids) {
      // Los montos van con nombre por id y no por indice: los no tildados no
      // mandan su checkbox, asi que las posiciones no coincidirian.
      const crudo = ((formData.get(`usdt_${id}`) as string) ?? "").trim();

      if (crudo === "") {
        lote.push({ id, usdt: null });
        continue;
      }

      const usdt = Number(crudo);
      if (!Number.isFinite(usdt) || usdt <= 0) {
        return { error: "Los montos en USDT deben ser mayores que cero.", ok: false };
      }
      lote.push({ id, usdt });
    }

    const { error } = await supabase.rpc("revisar_depositos", {
      p_item_id: itemId,
      p_depositos: lote,
    });
    if (error) return { error: error.message, ok: false };
  } else {
    const usdtRaw = ((formData.get("usdt_total") as string) ?? "").trim();
    const nota = ((formData.get("nota") as string) ?? "").trim() || null;

    // Vacio = confirmar sin cambiar nada. Un texto que no sea numero si
    // frena: Number("") es 0 y guardaria un total en cero sin que nadie lo
    // pidiera.
    let usdt: number | null = null;
    if (usdtRaw !== "") {
      usdt = Number(usdtRaw);
      if (!Number.isFinite(usdt) || usdt <= 0) {
        return { error: "El total en USDT debe ser mayor que cero.", ok: false };
      }
    }

    const { error } = await supabase.rpc("revisar_item", {
      p_item_id: itemId,
      p_usdt_total: usdt,
      p_nota: nota,
    });
    if (error) return { error: error.message, ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revision");
  return { error: null, ok: true };
}

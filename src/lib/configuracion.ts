import { createClient } from "@/lib/supabase/server";

/** Porcentaje que se usa si la configuración todavía no se pudo leer. */
export const COMISION_PCT_FALLBACK = 14;

/**
 * Lee el porcentaje de comisión vigente. Vive en una tabla de una sola
 * fila que solo un admin puede modificar (ver supabase/phase6_comision_global.sql).
 *
 * Esto es únicamente para mostrar en pantalla: el valor que termina
 * guardado en cada item lo sella la propia base dentro de la RPC, así que
 * un cliente que mienta acá no cambia lo que se cobra.
 */
export async function leerComisionGlobal(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("configuracion")
    .select("comision_pct")
    .single();

  return data ? Number(data.comision_pct) : COMISION_PCT_FALLBACK;
}

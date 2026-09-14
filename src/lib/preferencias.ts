import { createClient } from "@/lib/supabase/server";
import type { Moneda } from "@/lib/items";

export const MONEDA_POR_DEFECTO: Moneda = "VES";

/**
 * Moneda con la que trabaja este usuario. Es la que decide el tipo de flujo
 * de los cierres nuevos; se cambia desde el selector del header.
 *
 * Si todavia no hay fila (usuario nuevo, o la migracion phase7 sin correr)
 * se devuelve VES en vez de fallar: es una preferencia, no un dato critico.
 */
export async function leerMonedaPreferida(): Promise<Moneda> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return MONEDA_POR_DEFECTO;

  const { data } = await supabase
    .from("preferencias_usuario")
    .select("moneda")
    .eq("user_id", user.id)
    .maybeSingle();

  return (data?.moneda as Moneda | undefined) ?? MONEDA_POR_DEFECTO;
}

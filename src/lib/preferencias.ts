import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_SIDEBAR, COOKIE_SIDEBAR_SI } from "@/lib/sidebar";
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

/**
 * Si la barra lateral quedo colapsada la ultima vez que este navegador la
 * toco.
 *
 * Va en cookie y no en localStorage a proposito: el layout se arma en el
 * servidor, y una preferencia que solo existe en el cliente obliga a pintar
 * la barra ancha primero y encogerla despues de hidratar. Ese salto se ve.
 *
 * Tampoco va en la base como la moneda: la moneda decide DATOS (el tipo de
 * flujo de los cierres), esto decide cuantos pixeles ocupa un menu. No vale
 * un viaje a Supabase por pantalla, ni seguir a la persona entre
 * dispositivos: en un monitor chico se quiere angosta y en uno grande no.
 */
export async function leerSidebarColapsado(): Promise<boolean> {
  const almacen = await cookies();
  return almacen.get(COOKIE_SIDEBAR)?.value === COOKIE_SIDEBAR_SI;
}

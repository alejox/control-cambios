import { createClient } from "@/lib/supabase/server";
import type { Comisiones } from "@/lib/items";

/** Porcentaje que se usa si la configuración todavía no se pudo leer. */
export const COMISION_PCT_FALLBACK = 14;

/**
 * Lee las comisiones vigentes. Viven en una tabla de una sola fila que
 * solo un admin puede modificar (ver supabase/phase6_comision_global.sql
 * y supabase/phase20_comision_por_moneda.sql).
 *
 * Son DOS y no una: Bs y COP son mercados distintos y no se cobran igual.
 * Se leen juntas en una sola consulta porque casi todas las pantallas
 * muestran los dos flujos a la vez, y porque el formulario necesita las
 * dos para poder cambiar de número si cambia el flujo.
 *
 * Esto es únicamente para mostrar en pantalla: el valor que termina
 * guardado en cada item lo sella la propia base dentro de la RPC, que
 * elige la columna según el flujo, así que un cliente que mienta acá no
 * cambia lo que se cobra.
 *
 * El tipo y el helper para elegir una de las dos (comisionDeFlujo) viven
 * en lib/items: este módulo arrastra el cliente de servidor y no puede
 * importarse desde un componente de cliente.
 */
export async function leerComisiones(): Promise<Comisiones> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("configuracion")
    .select("comision_bs_pct, comision_cop_pct")
    .single();

  if (!data) {
    return { bs: COMISION_PCT_FALLBACK, cop: COMISION_PCT_FALLBACK };
  }

  return {
    bs: Number(data.comision_bs_pct),
    cop: Number(data.comision_cop_pct),
  };
}

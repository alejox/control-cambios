import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ParReferencia } from "@/lib/binance";
import {
  obtenerFuenteTasa,
  PARES,
  type FuenteTasa,
  type RespuestaReferencia,
} from "@/lib/tasa-referencia";

// La eleccion de fuente por moneda y el cache viven en
// @/lib/tasa-referencia: el bot de Telegram pide la misma tasa para el
// mismo comprobante y tiene que salirle igual. Este handler solo agrega lo
// propio de la web: la sesion, el permiso y guardar la muestra del P2P.
export type { FuenteTasa, RespuestaReferencia };

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const par = parametros.get("par") as ParReferencia | null;
  const fecha = parametros.get("fecha");

  if (!par || !PARES.includes(par)) {
    return NextResponse.json({ error: "Par no valido." }, { status: 400 });
  }
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha no valida." }, { status: 400 });
  }

  // La referencia solo se expone a usuarios con acceso: es la misma
  // informacion operativa que los items, no un endpoint publico.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "colaborador") {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  let fuente: FuenteTasa;
  let fresca: boolean;
  try {
    ({ fuente, fresca } = await obtenerFuenteTasa(par, fecha));
  } catch (e) {
    return NextResponse.json(
      { error: `No pudimos leer la tasa de referencia: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  const cuerpo: RespuestaReferencia = { fuente };

  // Solo se guarda el P2P, y solo cuando se acaba de consultar: la TRM ya
  // es una serie oficial consultable por fecha para siempre, mientras que
  // el precio del P2P es efimero. Los aciertos de cache no se guardan
  // porque serian la misma lectura repetida.
  if (fresca && fuente.id === "p2p") {
    await supabase.from("tasas_referencia").insert({
      par,
      valor: fuente.valor,
      consultado_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(cuerpo);
}

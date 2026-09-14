import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerTasaP2P, type ParReferencia } from "@/lib/binance";
import { obtenerTrm } from "@/lib/trm";
import { formatMonto, type Moneda } from "@/lib/items";

const PARES: ParReferencia[] = ["VES_USDT", "USD_COP"];
const MONEDA_POR_PAR: Record<ParReferencia, Moneda> = { VES_USDT: "VES", USD_COP: "COP" };

export type FuenteTasa = {
  id: "p2p" | "trm";
  etiqueta: string;
  descripcion: string;
  valor: number;
  detalle: string;
};

export type RespuestaReferencia = { fuente: FuenteTasa };

// Una fuente por moneda, y no es una preferencia estetica:
//
//   COP -> TRM oficial (Superintendencia Financiera). Es auditable, se puede
//          consultar por fecha para siempre, y en COP queda a menos de 1% del
//          P2P, asi que no se pierde realidad usandola.
//
//   VES -> Binance P2P. La tasa oficial del BCV esta ~19% por debajo del
//          mercado donde realmente se convierte. Usarla descuadraria casi la
//          quinta parte de la plata de cada cierre.
//
// Google no es una opcion: no tiene API publica, solo HTML para raspar, y el
// numero que muestra es el spot interbancario, no la tasa oficial.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { cuerpo: RespuestaReferencia; guardado: number }>();

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

async function obtenerFuente(par: ParReferencia, fecha: string | null): Promise<FuenteTasa> {
  if (par === "USD_COP") {
    const trm = await obtenerTrm(fecha ?? undefined);
    return {
      id: "trm",
      etiqueta: "TRM oficial",
      descripcion: "Superintendencia Financiera",
      valor: trm.valor,
      detalle: trm.es_ultima_disponible
        ? `última publicada (${fechaCorta(trm.vigencia_desde)})`
        : `vigente ${fechaCorta(trm.vigencia_desde)} → ${fechaCorta(trm.vigencia_hasta)}`,
    };
  }

  const p2p = await obtenerTasaP2P(par);
  return {
    id: "p2p",
    etiqueta: "Binance P2P",
    descripcion: "Promedio para comprar USDT",
    valor: p2p.promedio,
    detalle: `mediana ${formatMonto(p2p.mediana, MONEDA_POR_PAR[par])} · ${p2p.muestras} anuncios`,
  };
}

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

  const clave = `${par}|${fecha ?? ""}`;
  const enCache = cache.get(clave);
  if (enCache && Date.now() - enCache.guardado < TTL_MS) {
    return NextResponse.json(enCache.cuerpo);
  }

  let fuente: FuenteTasa;
  try {
    fuente = await obtenerFuente(par, fecha);
  } catch (e) {
    return NextResponse.json(
      { error: `No pudimos leer la tasa de referencia: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  const cuerpo: RespuestaReferencia = { fuente };
  cache.set(clave, { cuerpo, guardado: Date.now() });

  // Solo se guarda el P2P: la TRM ya es una serie oficial consultable por
  // fecha para siempre, mientras que el precio del P2P es efimero.
  if (fuente.id === "p2p") {
    await supabase.from("tasas_referencia").insert({
      par,
      valor: fuente.valor,
      consultado_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(cuerpo);
}

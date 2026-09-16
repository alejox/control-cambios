// La tasa de referencia de cada moneda, en un solo lugar.
//
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
//
// Vive en lib y ya no adentro del route handler porque el bot de Telegram
// necesita exactamente la misma tasa para el mismo comprobante: si cada
// puerta eligiera su fuente, el mismo deposito valdria distinto segun por
// donde entro.

import { obtenerTasaP2P, type ParReferencia } from "@/lib/binance";
import { obtenerTrm } from "@/lib/trm";
import { formatMonto, type Moneda } from "@/lib/items";

export const PARES: ParReferencia[] = ["VES_USDT", "USD_COP"];

const MONEDA_POR_PAR: Record<ParReferencia, Moneda> = {
  VES_USDT: "VES",
  USD_COP: "COP",
};

export type FuenteTasa = {
  id: "p2p" | "trm";
  etiqueta: string;
  descripcion: string;
  valor: number;
  detalle: string;
};

export type RespuestaReferencia = { fuente: FuenteTasa };

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { fuente: FuenteTasa; guardado: number }>();

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

async function consultarFuente(
  par: ParReferencia,
  fecha: string | null,
): Promise<FuenteTasa> {
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

/**
 * Tasa de referencia para un par y una fecha. Lanza si la fuente no
 * responde: no hay valor por defecto posible, y uno inventado terminaria
 * guardado en un movimiento.
 *
 * El cache es del proceso, con 5 minutos de vida: las dos fuentes son
 * externas y gratuitas, y el formulario las pide en cada tipeo de fecha.
 *
 * `fresca` dice si el valor se acaba de consultar. Importa: la muestra del
 * P2P se guarda en tasas_referencia como historial, y guardar tambien los
 * aciertos de cache llenaria la tabla de la misma lectura repetida.
 */
export async function obtenerFuenteTasa(
  par: ParReferencia,
  fecha: string | null,
): Promise<{ fuente: FuenteTasa; fresca: boolean }> {
  const clave = `${par}|${fecha ?? ""}`;
  const enCache = cache.get(clave);
  if (enCache && Date.now() - enCache.guardado < TTL_MS) {
    return { fuente: enCache.fuente, fresca: false };
  }

  const fuente = await consultarFuente(par, fecha);
  cache.set(clave, { fuente, guardado: Date.now() });
  return { fuente, fresca: true };
}

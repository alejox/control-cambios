// Tasa de referencia del P2P de Binance.
//
// Es el mercado real contra el que se compara un cierre: si la contraparte entrega
// USDT a 950 y el P2P esta en 967, la diferencia es visible al instante.
// El endpoint es el mismo que usa la web publica de Binance P2P: no pide
// API key, pero tampoco tiene contrato de estabilidad, asi que todo error
// se degrada a "sin referencia" en vez de romper el formulario.

export type ParReferencia = "VES_USDT" | "USD_COP";

// En ambos flujos se recibe fiat y se convierte a USDT, o sea que siempre
// se COMPRA USDT. Ese es el lado del libro que hay que mirar.
const TRADE_TYPE = "BUY";
const URL_P2P = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// Anuncios con muy poco USDT disponible distorsionan el promedio: son
// precios que en la practica no se pueden tomar.
const MINIMO_DISPONIBLE_USDT = 20;
const MUESTRAS_MINIMAS = 5;
const FILAS = 20;

const FIAT: Record<ParReferencia, string> = {
  VES_USDT: "VES",
  USD_COP: "COP",
};

export const PAR_POR_MONEDA: Record<"VES" | "COP", ParReferencia> = {
  VES: "VES_USDT",
  COP: "USD_COP",
};

export type TasaReferencia = {
  par: ParReferencia;
  fiat: string;
  promedio: number;
  mediana: number;
  min: number;
  max: number;
  muestras: number;
  consultado_at: string;
};

type AnuncioP2P = {
  adv?: {
    price?: string;
    surplusAmount?: string;
  };
};

function mediana(ordenados: number[]) {
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad];
}

function redondear(valor: number) {
  return Math.round(valor * 10000) / 10000;
}

export async function obtenerTasaP2P(par: ParReferencia): Promise<TasaReferencia> {
  const respuesta = await fetch(URL_P2P, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Sin User-Agent de navegador el endpoint responde 403.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    body: JSON.stringify({
      asset: "USDT",
      fiat: FIAT[par],
      tradeType: TRADE_TYPE,
      page: 1,
      rows: FILAS,
      payTypes: [],
      publisherType: null,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!respuesta.ok) {
    throw new Error(`Binance respondio ${respuesta.status}`);
  }

  const json = (await respuesta.json()) as { data?: AnuncioP2P[] };
  const anuncios = json.data ?? [];

  const conVolumen = anuncios.filter(
    (a) => Number(a.adv?.surplusAmount ?? 0) >= MINIMO_DISPONIBLE_USDT,
  );
  // Si el filtro deja la muestra demasiado chica, es preferible un promedio
  // con anuncios pequenos que no dar ninguna referencia.
  const usados = conVolumen.length >= MUESTRAS_MINIMAS ? conVolumen : anuncios;

  const precios = usados
    .map((a) => Number(a.adv?.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (precios.length === 0) {
    throw new Error("Binance no devolvio anuncios utilizables");
  }

  return {
    par,
    fiat: FIAT[par],
    promedio: redondear(precios.reduce((acc, p) => acc + p, 0) / precios.length),
    mediana: redondear(mediana(precios)),
    min: redondear(precios[0]),
    max: redondear(precios[precios.length - 1]),
    muestras: precios.length,
    consultado_at: new Date().toISOString(),
  };
}

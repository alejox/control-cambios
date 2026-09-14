// TRM: Tasa Representativa del Mercado, la tasa oficial USD/COP que publica
// la Superintendencia Financiera de Colombia.
//
// Fuente: dataset abierto en datos.gov.co (Socrata). Sin API key, JSON, y
// consultable POR FECHA, que es lo que importa para un registro auditable:
// interesa la TRM del dia del cierre, no la de hoy.
//
// Nota sobre Google: no existe una API publica de tipos de cambio. La unica
// via seria raspar el HTML de google.com/finance, que es fragil y ademas
// devuelve el spot interbancario, no la TRM oficial. No vale la pena.

const URL_TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json";

export type Trm = {
  valor: number;
  vigencia_desde: string; // yyyy-mm-dd
  vigencia_hasta: string; // yyyy-mm-dd
  // true cuando la fecha pedida todavia no tiene TRM publicada y se cayo
  // a la ultima disponible.
  es_ultima_disponible: boolean;
};

type FilaTrm = {
  valor: string;
  vigenciadesde: string;
  vigenciahasta: string;
};

async function consultar(params: Record<string, string>): Promise<FilaTrm[]> {
  const url = `${URL_TRM}?${new URLSearchParams(params)}`;
  const respuesta = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) {
    throw new Error(`datos.gov.co respondio ${respuesta.status}`);
  }
  return (await respuesta.json()) as FilaTrm[];
}

function mapear(fila: FilaTrm, esUltima: boolean): Trm {
  return {
    valor: Number(fila.valor),
    vigencia_desde: fila.vigenciadesde.slice(0, 10),
    vigencia_hasta: fila.vigenciahasta.slice(0, 10),
    es_ultima_disponible: esUltima,
  };
}

/**
 * TRM vigente para una fecha. Cada TRM cubre un rango (la del viernes rige
 * hasta el lunes), por eso se busca por interseccion de vigencia y no por
 * igualdad de fecha.
 */
export async function obtenerTrm(fecha?: string): Promise<Trm> {
  if (fecha) {
    const instante = `${fecha}T00:00:00`;
    const filas = await consultar({
      $where: `vigenciadesde <= '${instante}' AND vigenciahasta >= '${instante}'`,
      $limit: "1",
    });
    if (filas.length > 0) return mapear(filas[0], false);
  }

  // Sin fecha, o fecha futura sin TRM publicada todavia.
  const ultimas = await consultar({ $limit: "1", $order: "vigenciadesde DESC" });
  if (ultimas.length === 0) {
    throw new Error("datos.gov.co no devolvio ninguna TRM");
  }
  return mapear(ultimas[0], Boolean(fecha));
}

export type TipoFlujo = "bs_a_usdt" | "cop_a_usdt";
export type Moneda = "VES" | "COP";

export type Deposito = {
  id?: string;
  referencia: string | null;
  fecha: string; // yyyy-mm-dd
  valor_origen: number;
  // Ruta dentro del bucket privado "comprobantes" (no una URL: se firma
  // al momento de abrirla).
  comprobante_path: string | null;
  /** El comprobante cuando llego como texto pegado. Tambien es respaldo. */
  comprobante_texto: string | null;
};

export type Item = {
  id: string;
  numero: number;
  tipo_flujo: TipoFlujo;
  moneda_origen: Moneda;
  tasa: number | null;
  usdt_total: number;
  /** Sello del porcentaje global vigente el día que se creó el item.
   *  No se edita: existe para que cambiar la comisión global no
   *  reescriba la de los cierres ya registrados. */
  comision_pct: number;
  /** Columna generada en Postgres: usdt_total * comision_pct / 100. */
  comision: number;
  detalle: string | null;
  fecha: string | null;
  /** null = todavia no se liquido. */
  liquidacion_id: string | null;
  /** null = la contraparte todavia no lo reviso. */
  revisado_at: string | null;
  nota_revision: string | null;
  /** El USDT que tenia antes del ajuste en revision. null = sin ajustes. */
  usdt_original: number | null;
  created_at: string;
};

export function monedaDeFlujo(tipo: TipoFlujo): Moneda {
  return tipo === "bs_a_usdt" ? "VES" : "COP";
}

export function flujoDeMoneda(moneda: Moneda): TipoFlujo {
  return moneda === "VES" ? "bs_a_usdt" : "cop_a_usdt";
}

export const ETIQUETA_FLUJO: Record<TipoFlujo, string> = {
  bs_a_usdt: "Bs → USDT",
  cop_a_usdt: "COP → USDT",
};

export function calcularComision(usdtTotal: number, comisionPct: number) {
  return Math.round(usdtTotal * comisionPct) / 100;
}

/**
 * Reparte un total entre varias partes segun sus pesos, garantizando que la
 * suma de las partes sea EXACTAMENTE el total.
 *
 * Calcular cada parte por separado y redondearla no sirve: tres partes de
 * un tercio sobre 1,00 dan 0,33 + 0,33 + 0,33 = 0,99. Se pierde un centavo
 * y las cuentas del hijo no cuadran con las del padre.
 *
 * El truco es redondear el ACUMULADO, no cada parte: a cada una se le
 * asigna la diferencia entre el acumulado redondeado hasta ahi y lo que ya
 * se repartio. El ultimo se lleva lo que falte, sin importar el redondeo.
 */
export function repartir(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((acc, p) => acc + p, 0);
  if (suma <= 0 || pesos.length === 0) return pesos.map(() => 0);

  const partes: number[] = [];
  let exactoAcumulado = 0;
  let asignado = 0;

  for (const peso of pesos) {
    exactoAcumulado += (total * peso) / suma;
    const hasta = Math.round(exactoAcumulado * 100) / 100;
    partes.push(Math.round((hasta - asignado) * 100) / 100);
    asignado = hasta;
  }

  return partes;
}

export function formatMonto(valor: number | null | undefined, moneda: Moneda | "USDT") {
  if (valor === null || valor === undefined) return "—";
  const formatted = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
  if (moneda === "USDT") return `${formatted} USDT`;
  if (moneda === "VES") return `Bs${formatted}`;
  return `$${formatted}`;
}

export function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

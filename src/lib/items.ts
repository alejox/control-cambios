export type TipoFlujo = "bs_a_usdt" | "cop_a_usdt";
export type Moneda = "VES" | "COP";

export type Deposito = {
  id?: string;
  referencia: string | null;
  fecha: string; // yyyy-mm-dd
  valor_origen: number;
};

export type Item = {
  id: string;
  numero: number;
  tipo_flujo: TipoFlujo;
  moneda_origen: Moneda;
  tasa: number | null;
  usdt_total: number;
  comision: number;
  detalle: string | null;
  fecha: string | null;
  created_at: string;
};

export function monedaDeFlujo(tipo: TipoFlujo): Moneda {
  return tipo === "bs_a_usdt" ? "VES" : "COP";
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

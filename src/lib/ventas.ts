/**
 * Una venta de créditos: el lado Bs (el admin) le vende créditos / USDT al
 * lado COP. No pasa por aprobación ni lleva comisión, y en vez de pagarse
 * por fuera se descuenta en el próximo corte: suma entera a lo que cobra el
 * lado Bs (ver cobraCadaLado y supabase/phase50_ventas_credito.sql).
 */
export type Venta = {
  id: string;
  usdt: number;
  fecha: string;
  descripcion: string | null;
  created_by: string | null;
  created_at: string;
  liquidacion_id: string | null;
};

export const VENTA_DESCRIPCION_MAX = 200;

/** Las columnas que se leen siempre, en el mismo orden en todas las pantallas. */
export const COLUMNAS_VENTA =
  "id, usdt, fecha, descripcion, created_by, created_at, liquidacion_id";

/** numeric llega como texto desde PostgREST: se suma como número y en centavos. */
export function sumarVentas(ventas: Pick<Venta, "usdt">[]) {
  const total = ventas.reduce((acc, v) => acc + Number(v.usdt), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Lee y valida lo que manda el formulario. Vive acá y no en la acción para
 * que la regla —- monto positivo, fecha real, descripción corta -— sea una
 * sola y se pueda probar sin servidor.
 */
export function leerVenta(campos: {
  usdt: FormDataEntryValue | null;
  fecha: FormDataEntryValue | null;
  descripcion: FormDataEntryValue | null;
}):
  | { error: string; venta: null }
  | { error: null; venta: { usdt: number; fecha: string; descripcion: string | null } } {
  const usdtTexto = String(campos.usdt ?? "").trim().replace(",", ".");
  const usdt = Number(usdtTexto);
  if (!usdtTexto || !Number.isFinite(usdt) || usdt <= 0) {
    return { error: "El monto en USDT tiene que ser mayor que cero.", venta: null };
  }
  // numeric(14,2): dos decimales y no más de 12 dígitos enteros.
  if (Math.round(usdt * 100) / 100 !== usdt || usdt >= 1e12) {
    return { error: "El monto admite hasta dos decimales.", venta: null };
  }

  const fecha = String(campos.fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    return { error: "La fecha no es válida.", venta: null };
  }

  const descripcion = String(campos.descripcion ?? "").trim() || null;
  if (descripcion && descripcion.length > VENTA_DESCRIPCION_MAX) {
    return {
      error: `La descripción admite hasta ${VENTA_DESCRIPCION_MAX} caracteres.`,
      venta: null,
    };
  }

  return { error: null, venta: { usdt, fecha, descripcion } };
}

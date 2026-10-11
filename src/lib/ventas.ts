/**
 * Una venta de créditos: el lado Bs (el admin) le vende créditos / USDT al
 * lado COP. No pasa por aprobación ni lleva comisión, y en vez de pagarse
 * por fuera se descuenta en el próximo corte: suma entera a lo que cobra el
 * lado Bs (ver cobraCadaLado y supabase/phase50_ventas_credito.sql).
 */
export type Venta = {
  id: string;
  /** Comparte la numeración de los movimientos pendientes (fase 51). */
  numero: number;
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
  "id, numero, usdt, fecha, descripcion, created_by, created_at, liquidacion_id";

/** numeric llega como texto desde PostgREST: se suma como número y en centavos. */
export function sumarVentas(ventas: Pick<Venta, "usdt">[]) {
  const total = ventas.reduce((acc, v) => acc + Number(v.usdt), 0);
  return Math.round(total * 100) / 100;
}

/**
 * El número que se le propone al próximo movimiento o venta: uno más que el
 * mayor de lo pendiente, mirando las DOS tablas. Movimientos y ventas
 * comparten la numeración (fase 51), así que mirar una sola propondría un
 * número que la base después rechaza.
 */
export function siguienteNumeroPendiente(
  numerosItems: number[],
  numerosVentas: number[],
) {
  return Math.max(0, ...numerosItems, ...numerosVentas) + 1;
}

/**
 * Lo que dice la tarjeta "Movimientos" del panel. El número grande cuenta
 * todo lo pendiente: items y ventas de créditos (el "canje de créditos"),
 * que comparten la numeración, así que coincide con el último número de la
 * lista. El desglose de canjes va en su propia línea y solo si hay alguno.
 * El estado de aprobación es solo de items: las ventas no pasan por
 * aprobación.
 */
export function resumenTarjetaMovimientos(
  items: { revisado_at: string | null }[],
  ventasPendientes: number,
) {
  const movimientos = items.length + ventasPendientes;
  const sinAprobar = items.filter((i) => i.revisado_at === null).length;
  const estado =
    items.length > 0
      ? sinAprobar > 0
        ? `${sinAprobar} sin aprobar`
        : "Todos aprobados"
      : ventasPendientes > 0
        ? null
        : "Nada que liquidar";
  const canjes = ventasPendientes > 0 ? `Canje de créditos: ${ventasPendientes}` : null;
  return { movimientos, estado, canjes };
}

/** "AAAA-MM-DD" que existe en el calendario: el 31 de febrero no pasa. */
function esFechaReal(fecha: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Date.UTC desborda en silencio (31/02 -> 03/03): se valida que vuelva
  // con el mismo año, mes y día que se le dio.
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Lee y valida lo que manda el formulario. Vive acá y no en la acción para
 * que la regla —- monto positivo, fecha real, descripción corta, número
 * entero positivo -— sea una sola y se pueda probar sin servidor.
 */
export function leerVenta(campos: {
  usdt: FormDataEntryValue | null;
  fecha: FormDataEntryValue | null;
  descripcion: FormDataEntryValue | null;
  numero: FormDataEntryValue | null;
}):
  | { error: string; venta: null }
  | {
      error: null;
      venta: { usdt: number; fecha: string; descripcion: string | null; numero: number };
    } {
  const numeroTexto = String(campos.numero ?? "").trim();
  const numero = Number(numeroTexto);
  if (!numeroTexto || !Number.isInteger(numero) || numero <= 0) {
    return { error: "El número tiene que ser un entero mayor que cero.", venta: null };
  }

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
  if (!esFechaReal(fecha)) {
    return { error: "La fecha no es válida.", venta: null };
  }

  const descripcion = String(campos.descripcion ?? "").trim() || null;
  if (descripcion && descripcion.length > VENTA_DESCRIPCION_MAX) {
    return {
      error: `La descripción admite hasta ${VENTA_DESCRIPCION_MAX} caracteres.`,
      venta: null,
    };
  }

  return { error: null, venta: { usdt, fecha, descripcion, numero } };
}

export type Liquidacion = {
  id: string;
  numero: number;
  fecha: string;
  cantidad_items: number;
  /** Total de las ventas del corte. */
  total_usdt: number;
  /** Suma de las comisiones del corte. */
  total_comision: number;
  /** Puede ser NEGATIVO: ahi el saldo quedo del otro lado. */
  total_neto: number;
  usdt_bs: number;
  usdt_cop: number;
  comision_bs: number;
  comision_cop: number;
  /**
   * Ventas de créditos del lado Bs al lado COP que entraron en el corte.
   * Suman a favor de Bs. Default 0 en la base para los cortes viejos.
   */
  total_ventas: number;
  notas: string | null;
  created_at: string;
};

/**
 * A favor de quién quedó el corte. El neto se guarda con signo —positivo si
 * quedó del lado de Bs— pero a la vista va SIEMPRE en positivo: nadie
 * piensa su saldo en negativo. El signo se convierte en una frase.
 */
export function favorDe(neto: number): {
  monto: number;
  lado: "bs" | "cop" | "ninguno";
  frase: string;
} {
  const n = Number(neto);
  if (n === 0) {
    return { monto: 0, lado: "ninguno", frase: "Los dos lados se compensan" };
  }
  return n > 0
    ? { monto: n, lado: "bs", frase: "A favor de quien recibió en bolívares" }
    : { monto: -n, lado: "cop", frase: "A favor de quien recibió en pesos" };
}

/**
 * Un corte genera CUATRO deudas, no dos:
 *
 *   el lado COP  ->  paga las ventas en Bs         (usdt_bs)
 *   el lado Bs   ->  paga la comisión de esas ventas (comision_bs)
 *   el lado Bs   ->  paga las ventas en COP        (usdt_cop)
 *   el lado COP  ->  paga la comisión de esas      (comision_cop)
 *
 * Cada lado COBRA sus propias ventas MÁS la comisión que le genera el otro.
 * La comisión no se evapora: cambia de manos.
 *
 * Y una quinta, cuando la hay:
 *
 *   el lado COP  ->  paga las ventas de créditos  (total_ventas)
 *
 * Una venta de créditos es algo que el lado Bs le vendió al lado COP. No
 * lleva comisión: entra entera en lo que cobra el lado Bs.
 *
 * Restar las dos columnas da el mismo neto que
 * (usdt_bs - comision_bs) - (usdt_cop - comision_cop) + total_ventas, que
 * es la cuenta de liquidar_pendientes, pero se puede verificar mirándolo.
 */
export type TotalesDeCorte = {
  usdt_bs: number;
  usdt_cop: number;
  comision_bs: number;
  comision_cop: number;
  /** Opcional: sin ventas la cuenta es la de siempre. */
  total_ventas?: number | string | null;
};

export function cobraCadaLado(l: TotalesDeCorte) {
  const ventas = Number(l.total_ventas ?? 0) || 0;
  const bs =
    Math.round((Number(l.usdt_bs) + Number(l.comision_cop) + ventas) * 100) / 100;
  const cop = Math.round((Number(l.usdt_cop) + Number(l.comision_bs)) * 100) / 100;
  return { bs, cop };
}

/**
 * La lectura completa de un corte que TODAVIA no existe: los totales de lo
 * pendiente leidos igual que un corte ya cerrado.
 *
 * Vive aca y no en cada pantalla porque hay dos lugares que muestran esta
 * misma previa —- las tarjetas del panel y el dialogo de liquidar —- y son
 * la misma cuenta. Dos restas iguales escritas en dos archivos distintos
 * terminan, tarde o temprano, redondeando distinto la plata que se debe.
 *
 * Un corte ya liquidado NO pasa por aca: ese lee su total_neto congelado,
 * que es el numero que las dos partes acordaron y no se recalcula.
 */
export function previaDeCorte(totales: TotalesDeCorte) {
  const cobra = cobraCadaLado(totales);
  const neto = Math.round((cobra.bs - cobra.cop) * 100) / 100;
  return { cobra, neto, favor: favorDe(neto) };
}

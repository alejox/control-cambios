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
  /**
   * Cuando se devolvio este movimiento a revision. NO se limpia al volver a
   * aprobarlo, asi que junto con revisado_at cuenta la historia entera:
   * revisado_at null + esto no null = esta devuelto AHORA; las dos no null =
   * se devolvio y la contraparte ya lo volvio a aprobar.
   */
  desaprobado_at: string | null;
  desaprobado_por: string | null;
  /** Por que se devolvio. Nunca vacio: lo garantiza un check en la base. */
  desaprobado_motivo: string | null;
  created_at: string;
};

/**
 * Largo maximo del motivo de una devolucion a revision. Vive aca, con el
 * dominio puro, porque lo tienen que respetar los tres: el textarea del
 * dialogo, la server action y la RPC. Tres numeros distintos serian un
 * formulario que deja escribir algo que despues la base rechaza.
 */
export const MOTIVO_DESAPROBACION_MAX = 200;

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
 * Las dos comisiones vigentes, una por moneda de origen. Bs y COP son
 * mercados distintos y no se cobran igual.
 */
export type Comisiones = {
  /** Cierres Bs → USDT. */
  bs: number;
  /** Cierres COP → USDT. */
  cop: number;
};

/**
 * La comisión que le corresponde a un flujo.
 *
 * Vive acá, con el resto del dominio puro, y no junto a la lectura de la
 * configuracion: el formulario es un componente de cliente y ese modulo
 * arrastra el cliente de Supabase de servidor (next/headers), que no puede
 * entrar al bundle del navegador.
 */
export function comisionDeFlujo(comisiones: Comisiones, tipo: TipoFlujo): number {
  return tipo === "bs_a_usdt" ? comisiones.bs : comisiones.cop;
}

/** Lo que cambiaria un recalculo, por flujo. */
export type ResumenFlujo = {
  cantidad: number;
  /**
   * De esos, cuantos estan APROBADOS. Esos no solo cambian de numero:
   * vuelven a revision, porque un numero acordado no se reescribe a
   * espaldas de la contraparte. Se cuenta aparte para poder avisarlo antes.
   */
  aprobados: number;
  /** Los porcentajes que tienen hoy esos movimientos, sin repetir. */
  desde: number[];
  hacia: number;
};

export type ResumenRecalculo = {
  bs: ResumenFlujo;
  cop: ResumenFlujo;
  total: number;
  /** Cuantos, en total, van a volver a revision. */
  vuelvenARevision: number;
};

/**
 * Cuenta que pasaria si se recalcularan las comisiones, para poder
 * decirlo ANTES de tocar nada.
 *
 * Reproduce exactamente el alcance de la RPC
 * recalcular_comisiones_pendientes: todo lo que NO este liquidado y no
 * tenga ya el porcentaje vigente —- aprobado o no. Si los dos alcances se
 * separan, el dialogo miente. La que manda es la RPC: esto es solo la
 * vista previa, y lo que se informa despues es el numero que devuelve la
 * base.
 */
export function resumirRecalculo(items: Item[], comisiones: Comisiones): ResumenRecalculo {
  const porFlujo = (tipo: TipoFlujo): ResumenFlujo => {
    const hacia = comisionDeFlujo(comisiones, tipo);
    const afectados = items.filter(
      (i) =>
        i.tipo_flujo === tipo &&
        i.liquidacion_id === null &&
        Number(i.comision_pct) !== hacia,
    );

    return {
      cantidad: afectados.length,
      aprobados: afectados.filter((i) => i.revisado_at !== null).length,
      desde: [...new Set(afectados.map((i) => Number(i.comision_pct)))].sort((a, b) => a - b),
      hacia,
    };
  };

  const bs = porFlujo("bs_a_usdt");
  const cop = porFlujo("cop_a_usdt");

  return {
    bs,
    cop,
    total: bs.cantidad + cop.cantidad,
    vuelvenARevision: bs.aprobados + cop.aprobados,
  };
}

/**
 * El USDT de un movimiento: la SUMA de sus depositos en la moneda de origen
 * dividida entre la tasa, redondeada a centavos.
 *
 * Vive aca y no adentro del formulario porque ahora hay dos puertas que
 * hacen exactamente esta cuenta: la web y el bot de Telegram, que desde que
 * arma albumes tambien suma varios depositos. Dos implementaciones de la
 * misma division terminan, tarde o temprano, redondeando distinto el mismo
 * movimiento.
 */
export function usdtDesdeOrigen(totalOrigen: number, tasa: number): number {
  return Math.round((totalOrigen / tasa) * 100) / 100;
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

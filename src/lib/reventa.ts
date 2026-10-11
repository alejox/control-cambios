// Reventa: las listas mayoristas de créditos de cada proveedor y la cuenta
// para revenderlos.
//
// Es dato de referencia, no contabilidad: no hay tabla ni editor. Las
// listas llegan por chat y cambian poco; el día que cambien seguido, esto
// pasa a la base. Hasta entonces un archivo tipado es más fácil de revisar
// en un diff que una fila editada a mano.
//
// Se guarda solo el TOTAL de cada tramo. El precio por crédito se deriva
// (total / créditos): los mensajes de los proveedores a veces traen un
// "c/u" que no coincide con su propio total, y dos números para el mismo
// dato terminan diciendo cosas distintas.
//
// Las monedas, sus nombres y el formato de montos son los de Venta
// público: el listado para revendedores es la misma idea aplicada a otro
// catálogo, y dos formas de escribir "12.420" terminan diciendo cosas
// distintas.

import { formatMonto } from "@/lib/items";
import {
  formatMontoLista,
  NOMBRE_MONEDA,
  type MonedaLista,
} from "@/lib/venta-publico";

export type MonedaVenta = "USDT" | "COP" | "VES";

export type Tramo = {
  creditos: number;
  totalUsdt: number;
};

/** Recarga por crédito suelto, para cantidades por debajo del primer tramo. */
export type Suelto = {
  precioUsdt: number;
  min: number;
  max: number;
};

export type Variante = {
  id: string;
  /** "Multidispositivo", "Un dispositivo"… null cuando el proveedor tiene una sola. */
  nombre: string | null;
  /** "3 pantallas", "1 pantalla"… */
  alcance: string | null;
  /** En qué equipos funciona. */
  equipos: string | null;
  suelto: Suelto | null;
  tramos: Tramo[];
};

/** A partir de cuántos créditos el proveedor abre cada tipo de panel. */
export type UmbralPanel = {
  desde: number;
  panel: string;
};

export type Proveedor = {
  id: string;
  nombre: string;
  variantes: Variante[];
  paneles: UmbralPanel[];
  notas: string[];
};

export const PROVEEDORES: Proveedor[] = [
  {
    id: "stellatv",
    nombre: "StellaTV",
    variantes: [
      {
        id: "unica",
        nombre: null,
        alcance: null,
        equipos: null,
        suelto: null,
        tramos: [
          { creditos: 15, totalUsdt: 37.5 },
          { creditos: 30, totalUsdt: 69 },
          { creditos: 50, totalUsdt: 110 },
          { creditos: 100, totalUsdt: 200 },
          { creditos: 300, totalUsdt: 585 },
          { creditos: 500, totalUsdt: 950 },
          { creditos: 1000, totalUsdt: 1850 },
        ],
      },
    ],
    paneles: [
      { desde: 15, panel: "Panel nuevo" },
      { desde: 100, panel: "Super panel" },
      { desde: 500, panel: "Admin panel" },
    ],
    notas: [
      "Panel nuevo a partir de 15 créditos.",
      "Super panel a partir de 100 créditos.",
      "Admin panel a partir de 500 créditos.",
    ],
  },
  {
    id: "oleadatv",
    nombre: "OleadaTV",
    variantes: [
      {
        id: "multi",
        nombre: "Multidispositivo",
        alcance: "3 pantallas",
        equipos: "TV Box, Smart TV y celular",
        suelto: { precioUsdt: 2.8, min: 1, max: 29 },
        tramos: [
          { creditos: 30, totalUsdt: 57 },
          { creditos: 50, totalUsdt: 90 },
          { creditos: 100, totalUsdt: 170 },
          { creditos: 200, totalUsdt: 320 },
          { creditos: 300, totalUsdt: 465 },
          { creditos: 400, totalUsdt: 600 },
          { creditos: 500, totalUsdt: 700 },
        ],
      },
      {
        id: "uno",
        nombre: "Un dispositivo",
        alcance: "1 pantalla",
        equipos: "Solo celulares y tablets",
        suelto: { precioUsdt: 1.8, min: 1, max: 29 },
        tramos: [
          { creditos: 30, totalUsdt: 33 },
          { creditos: 50, totalUsdt: 52.5 },
          { creditos: 100, totalUsdt: 100 },
          { creditos: 200, totalUsdt: 190 },
          { creditos: 300, totalUsdt: 270 },
          { creditos: 400, totalUsdt: 340 },
          { creditos: 500, totalUsdt: 400 },
        ],
      },
    ],
    paneles: [],
    notas: ["Apertura de panel inmediata y soporte activo."],
  },
  {
    id: "flujotv",
    nombre: "Flujo TV",
    variantes: [
      {
        id: "multi",
        nombre: "Multidispositivo",
        alcance: "3 dispositivos",
        equipos: null,
        suelto: null,
        tramos: [
          { creditos: 30, totalUsdt: 75 },
          { creditos: 50, totalUsdt: 115 },
          { creditos: 100, totalUsdt: 220 },
          { creditos: 300, totalUsdt: 600 },
          { creditos: 500, totalUsdt: 950 },
          { creditos: 1000, totalUsdt: 1850 },
          { creditos: 2000, totalUsdt: 3500 },
        ],
      },
    ],
    paneles: [
      { desde: 50, panel: "Super panel" },
      { desde: 500, panel: "Admin panel" },
    ],
    notas: [
      "Super panel a partir de 50 créditos.",
      "Admin panel a partir de 500 créditos.",
    ],
  },
  {
    id: "telelatino",
    nombre: "TeleLatino",
    variantes: [
      {
        id: "multi",
        nombre: "Multidispositivo",
        alcance: "3 dispositivos",
        equipos: null,
        suelto: null,
        tramos: [
          { creditos: 30, totalUsdt: 66 },
          { creditos: 50, totalUsdt: 105 },
          { creditos: 100, totalUsdt: 200 },
          { creditos: 200, totalUsdt: 380 },
          { creditos: 300, totalUsdt: 555 },
          { creditos: 400, totalUsdt: 720 },
          { creditos: 500, totalUsdt: 875 },
        ],
      },
      {
        id: "uno",
        nombre: "Un dispositivo",
        alcance: "1 dispositivo",
        equipos: null,
        suelto: null,
        tramos: [
          { creditos: 30, totalUsdt: 42 },
          { creditos: 50, totalUsdt: 65 },
          { creditos: 100, totalUsdt: 120 },
          { creditos: 200, totalUsdt: 220 },
          // TODO(precio): confirmar con el usuario. Sale a 1,15 c/u, más
          // caro que el tramo de 200 (1,10 c/u): al revés de un descuento.
          { creditos: 300, totalUsdt: 345 },
          { creditos: 400, totalUsdt: 400 },
          // TODO(precio): confirmar con el usuario. El mensaje decía
          // 0,8 c/u, pero $450 / 500 = 0,90 c/u. Se cargó el total.
          { creditos: 500, totalUsdt: 450 },
        ],
      },
    ],
    paneles: [],
    notas: [],
  },
];

export function buscarProveedor(proveedorId: string): Proveedor | null {
  return PROVEEDORES.find((p) => p.id === proveedorId) ?? null;
}

export function buscarVariante(proveedorId: string, varianteId: string): Variante | null {
  return buscarProveedor(proveedorId)?.variantes.find((v) => v.id === varianteId) ?? null;
}

/** Redondeo a centavos que no arrastra el ruido del punto flotante. */
function centavos(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function precioPorCredito(tramo: Tramo) {
  return tramo.totalUsdt / tramo.creditos;
}

/**
 * El crédito más caro de la variante: contra él se mide el ahorro.
 *
 * Cuando hay recarga suelta, es la suelta: es lo que paga quien compra
 * de a poco, y el descuento de un tramo se entiende frente a eso.
 */
export function precioReferencia(variante: Variante) {
  const porTramo = variante.tramos.map(precioPorCredito);
  if (variante.suelto) porTramo.push(variante.suelto.precioUsdt);
  return Math.max(...porTramo);
}

/** Cuánto más barato sale cada crédito de este tramo, en %. */
export function ahorroPct(variante: Variante, tramo: Tramo) {
  const referencia = precioReferencia(variante);
  return centavos((1 - precioPorCredito(tramo) / referencia) * 100);
}

export function mejorTramo(variante: Variante): Tramo {
  return variante.tramos.reduce((mejor, t) =>
    precioPorCredito(t) < precioPorCredito(mejor) ? t : mejor,
  );
}

/** El panel que abre esa cantidad de créditos, o null si no abre ninguno. */
export function panelDe(proveedor: Proveedor, creditos: number): string | null {
  let panel: string | null = null;
  for (const u of proveedor.paneles) {
    if (creditos >= u.desde) panel = u.panel;
  }
  return panel;
}

/**
 * Lo que cuesta una cantidad de créditos, en USDT.
 *
 * Regla: un tramo exacto cuesta su total; por debajo del primer tramo,
 * si la variante tiene recarga suelta, cada crédito al precio suelto.
 * Cualquier otra cantidad (40, 45, 120…) da null: el proveedor no tiene
 * precio para eso, y prorratear un tramo sería inventar uno que después
 * no se consigue.
 */
export function costoUsdt(variante: Variante, creditos: number): number | null {
  if (!Number.isInteger(creditos) || creditos <= 0) return null;
  const tramo = variante.tramos.find((t) => t.creditos === creditos);
  if (tramo) return tramo.totalUsdt;
  const s = variante.suelto;
  if (s && creditos >= s.min && creditos <= s.max) return centavos(creditos * s.precioUsdt);
  return null;
}

export function aplicarMargen(costo: number, margenPct: number) {
  return centavos(costo * (1 + margenPct / 100));
}

export function convertir(usdt: number, tasa: number) {
  return centavos(usdt * tasa);
}

/** A cuánto se redondea el precio de venta en cada moneda. */
export const PASO_REDONDEO: Record<MonedaVenta, number> = {
  USDT: 0.01,
  COP: 1000,
  VES: 10,
};

/**
 * Una millonésima de paso: por debajo de cualquier diferencia que exista
 * como plata, y suficiente para que el ruido del punto flotante
 * (331.000,0000001) no salte al escalón de arriba. Es la misma tolerancia
 * de precioDePlan en Venta público.
 */
const TOLERANCIA = 1e-6;

function haciaArriba(valor: number, paso: number) {
  return Math.ceil(valor / paso - TOLERANCIA) * paso;
}

/**
 * Precio de venta presentable: pesos al millar, bolívares a la decena,
 * USDT a centavos.
 *
 * Siempre HACIA ARRIBA, como en Venta público: al más cercano, la mitad
 * de los precios de cada lista quedaría por debajo del margen elegido, y
 * siempre para el mismo lado.
 */
export function redondearVenta(valor: number, moneda: MonedaVenta) {
  if (moneda === "USDT") return centavos(valor);
  return haciaArriba(valor, PASO_REDONDEO[moneda]);
}

export type Reventa = {
  costoUsdt: number;
  ventaUsdt: number;
  gananciaUsdt: number;
  ventaPorCreditoUsdt: number;
  ventaCop: number | null;
  ventaCopRedondeada: number | null;
  ventaVes: number | null;
  ventaVesRedondeada: number | null;
};

/** null cuando la cantidad no tiene precio (ver costoUsdt). */
export function calcularReventa({
  variante,
  creditos,
  margenPct,
  tasaCop,
  tasaVes,
}: {
  variante: Variante;
  creditos: number;
  margenPct: number;
  tasaCop: number | null;
  tasaVes: number | null;
}): Reventa | null {
  const costo = costoUsdt(variante, creditos);
  if (costo === null) return null;
  const venta = aplicarMargen(costo, margenPct);
  const ventaCop = tasaCop !== null && tasaCop > 0 ? convertir(venta, tasaCop) : null;
  const ventaVes = tasaVes !== null && tasaVes > 0 ? convertir(venta, tasaVes) : null;
  return {
    costoUsdt: costo,
    ventaUsdt: venta,
    gananciaUsdt: centavos(venta - costo),
    ventaPorCreditoUsdt: centavos(venta / creditos),
    ventaCop,
    ventaCopRedondeada: ventaCop === null ? null : redondearVenta(ventaCop, "COP"),
    ventaVes,
    ventaVesRedondeada: ventaVes === null ? null : redondearVenta(ventaVes, "VES"),
  };
}

const numero = (decimales: number) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

const USDT_FMT = numero(2);
const ENTERO_FMT = numero(0);

/** Formato es-VE como el resto de la app: punto de miles, coma decimal. */
export function formatear(valor: number, moneda: MonedaVenta, { exacto = false } = {}) {
  const fmt = moneda === "USDT" || exacto ? USDT_FMT : ENTERO_FMT;
  const texto = fmt.format(valor);
  if (moneda === "USDT") return `${texto} USDT`;
  if (moneda === "COP") return `${texto} COP`;
  return `Bs ${texto}`;
}

/** "Multidispositivo · 3 pantallas", o null si la variante no tiene nombre. */
export function etiquetaVariante(variante: Variante) {
  const partes = [variante.nombre, variante.alcance].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** El mensaje corto que se le manda al cliente. */
export function textoCotizacion({
  proveedor,
  variante,
  creditos,
  resultado,
}: {
  proveedor: string;
  variante: Variante;
  creditos: number;
  resultado: Reventa;
}) {
  const etiqueta = etiquetaVariante(variante);
  const lineas = [
    etiqueta ? `${proveedor} · ${etiqueta}` : proveedor,
    `${creditos} ${creditos === 1 ? "crédito" : "créditos"}`,
    `Precio: ${formatear(resultado.ventaUsdt, "USDT")}`,
  ];
  if (resultado.ventaCopRedondeada !== null) {
    lineas.push(`En pesos: ${formatear(resultado.ventaCopRedondeada, "COP")}`);
  }
  if (resultado.ventaVesRedondeada !== null) {
    lineas.push(`En bolívares: ${formatear(resultado.ventaVesRedondeada, "VES")}`);
  }
  return lineas.join("\n");
}

// --- Listado para WhatsApp ---------------------------------------------------
//
// La lista mayorista de un proveedor, con el margen aplicado y convertida a
// una moneda, lista para mandarle a un revendedor. Cada moneda es una
// lista independiente —- su margen y su tasa —-, como en Venta público.

/**
 * A cuánto se redondea el precio POR CRÉDITO de cada moneda: pesos a la
 * decena y bolívares a la unidad. Es más fino que el del total porque el
 * número es chico: 11.066 pesos al millar diría 12.000, un 8 % de más.
 * También hacia arriba, y sale del total ya redondeado, así lo que dice
 * el c/u es lo que de verdad cuesta cada crédito del paquete.
 */
const PASO_POR_CREDITO: Record<"VES" | "COP", number> = { VES: 1, COP: 10 };

const SEPARADOR = "──────────────";

/** Un precio de la lista en su moneda: Bs/COP sin decimales, USD con dos. */
function montoListado(valor: number, moneda: MonedaLista) {
  if (moneda === "USD") return `$ ${formatMonto(valor, "COP").replace(/^\$/, "")} USD`;
  if (moneda === "COP") return `$ ${formatMontoLista(valor, "COP")} COP`;
  return `Bs ${formatMontoLista(valor, "VES")}`;
}

/** El c/u va sin el código detrás: en la misma línea ya está el total. */
function montoPorCredito(valor: number, moneda: MonedaLista) {
  if (moneda === "USD") return `$ ${formatMonto(valor, "COP").replace(/^\$/, "")}`;
  if (moneda === "COP") return `$ ${formatMontoLista(valor, "COP")}`;
  return `Bs ${formatMontoLista(valor, "VES")}`;
}

/**
 * Un monto en USDT del proveedor, con el margen, en la moneda de la lista.
 * Pasa por las mismas funciones que la calculadora para que los dos digan
 * el mismo número.
 */
function precioEn(usdt: number, moneda: MonedaLista, margenPct: number, tasa: number) {
  const venta = aplicarMargen(usdt, margenPct);
  return moneda === "USD" ? venta : redondearVenta(convertir(venta, tasa), moneda);
}

function porCreditoEn(valor: number, moneda: MonedaLista) {
  return moneda === "USD" ? Math.ceil(valor * 100 - TOLERANCIA) / 100 : haciaArriba(valor, PASO_POR_CREDITO[moneda]);
}

const ETIQUETA_MONEDA: Record<MonedaLista, string> = { VES: "Bs", USD: "USD", COP: "COP" };

/** Créditos donde empieza cada panel: la etiqueta va ahí, no en cada fila. */
export function iniciosDePanel(proveedor: Proveedor, variante: Variante) {
  const inicios = new Map<number, string>();
  let anterior: string | null = null;
  for (const t of variante.tramos) {
    const panel = panelDe(proveedor, t.creditos);
    if (panel && panel !== anterior) inicios.set(t.creditos, panel);
    anterior = panel;
  }
  return inicios;
}

/**
 * El mensaje entero para WhatsApp, o null si la lista convierte (Bs, COP)
 * y todavía no tiene tasa: un listado sin precios no se manda.
 *
 * Arma bloques separados por una línea en blanco, como armarMensaje en
 * Venta público: encabezado, una sección por variante, las condiciones del
 * proveedor y, al final, los medios de cobro de esa moneda. No lleva ni el
 * costo ni el margen: es lo que ve el revendedor.
 */
export function listadoWhatsApp({
  proveedor,
  moneda,
  margenPct,
  tasa,
  mediosPago = "",
}: {
  proveedor: Proveedor;
  moneda: MonedaLista;
  margenPct: number;
  /** Unidades de la moneda por USDT. Se ignora en USD. */
  tasa: number | null;
  mediosPago?: string;
}): string | null {
  const factor = moneda === "USD" ? 1 : tasa;
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return null;

  const bloques = [
    `*${proveedor.nombre} · Créditos para revendedores*\nPrecios en ${NOMBRE_MONEDA[moneda]} (${ETIQUETA_MONEDA[moneda]})`,
    SEPARADOR,
  ];

  for (const variante of proveedor.variantes) {
    const lineas: string[] = [];
    if (variante.suelto) {
      const s = variante.suelto;
      // El precio suelto ES un precio por crédito: se redondea con el paso
      // del c/u, no con el del total (504 Bs, no 510).
      const venta = aplicarMargen(s.precioUsdt, margenPct);
      const unidad = porCreditoEn(moneda === "USD" ? venta : convertir(venta, factor), moneda);
      lineas.push(
        `🔸 Recarga suelta de ${s.min} a ${s.max} créditos ➜ ${montoPorCredito(unidad, moneda)} c/u`,
      );
    }
    const paneles = iniciosDePanel(proveedor, variante);
    for (const t of variante.tramos) {
      const total = precioEn(t.totalUsdt, moneda, margenPct, factor);
      const cu = porCreditoEn(total / t.creditos, moneda);
      const panel = paneles.get(t.creditos);
      lineas.push(
        `🔹 ${t.creditos.toLocaleString("es-VE")} créditos ➜ ${montoListado(total, moneda)} (${montoPorCredito(cu, moneda)} c/u)${
          panel ? ` · *${panel}*` : ""
        }`,
      );
    }

    const etiqueta = etiquetaVariante(variante);
    const titulo = etiqueta
      ? [`📺 *${etiqueta}*`, ...(variante.equipos ? [`_${variante.equipos}_`] : [])].join("\n")
      : null;
    bloques.push(titulo ? `${titulo}\n\n${lineas.join("\n")}` : lineas.join("\n"));
  }

  if (proveedor.notas.length > 0) {
    bloques.push(SEPARADOR, proveedor.notas.map((n) => `✅ ${n}`).join("\n"));
  }

  const medios = mediosPago.trim();
  if (medios) bloques.push(medios);

  return bloques.join("\n\n");
}

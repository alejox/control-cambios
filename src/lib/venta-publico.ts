// Las listas de precios que el usuario manda por WhatsApp.
//
// El precio vive UNA sola vez, en dólares, colgado del plan. Cada moneda
// es una PRESENTACIÓN de esos mismos planes: cambia el encabezado, el
// pie, el formato de la línea, el título del grupo y la etiqueta —- el
// usuario dice "Mensual" en dólares y "1 mes" en bolívares -— pero el
// precio es el mismo. Si viviera dos veces, el día que suba Mensual de 7
// a 8 dólares lo iba a cambiar en una lista y no en la otra.
//
// Este módulo es puro a propósito: lo importan componentes de cliente y
// server actions, así que no puede arrastrar nada de servidor.

import { formatMonto } from "@/lib/items";
import { PAR_POR_MONEDA, type ParReferencia } from "@/lib/binance";

export type MonedaLista = "VES" | "COP" | "USD";

/** El orden en que se muestran las secciones. */
export const ORDEN_MONEDAS: MonedaLista[] = ["VES", "USD", "COP"];

export const ETIQUETA_SECCION: Record<MonedaLista, string> = {
  VES: "En Bs",
  USD: "En USD",
  COP: "En COP",
};

export const NOMBRE_MONEDA: Record<MonedaLista, string> = {
  VES: "bolívares",
  USD: "dólares",
  COP: "pesos",
};

export type PlanLista = {
  id: string;
  /** Nombre interno, para reconocer el plan en el panel. */
  nombre: string;
  precioUsd: number | null;
  orden: number;
  /** Lo que sale en el mensaje de ESTA moneda. Null = todavía sin texto. */
  etiqueta: string | null;
  /** Va pegado después del precio: "US$39/ 6 meses +1 gratis". */
  sufijo: string;
};

export type GrupoLista = {
  id: string;
  nombre: string;
  orden: number;
  titulo: string | null;
  planes: PlanLista[];
};

export type Lista = {
  id: string;
  proveedorId: string;
  slug: string;
  proveedor: string;
  moneda: MonedaLista;
  encabezado: string;
  pie: string;
  plantilla: string;
  revisar: string;
  /** Paso al que se redondea el precio convertido, siempre hacia arriba. */
  redondeo: number;

  // De acá para abajo NO es de la lista: es de quien la está mirando.
  // El catálogo (marcas, planes, precio en dólares, textos) es de los dos,
  // pero la tasa es el margen de quien vende y los medios de cobro son sus
  // cuentas. Salen de venta_publico_lista_usuario, que RLS ya filtra por
  // auth.uid(): nadie ve el margen del otro.

  /**
   * El bloque que reemplaza a {medios} en el pie. Vacío = falta.
   *
   * Es de la MONEDA, no de esta lista: se cobra con la misma cuenta se
   * venda Stella u Oleada. Llega ya resuelto desde la pantalla.
   */
  mediosPago: string;
  tasa: number | null;
  tasaOrigen: "fuente" | "ajuste" | null;
  /** El nombre que dio la fuente: "Binance P2P", "TRM oficial". */
  tasaFuente: string | null;
  tasaDetalle: string | null;
  tasaReferencia: number | null;
  tasaReferenciaAt: string | null;
  grupos: GrupoLista[];
};

/** Una lista en dólares no convierte nada: el precio ya está en su moneda. */
export function necesitaTasa(moneda: MonedaLista): boolean {
  return moneda !== "USD";
}

/** Qué fuente de tasa le corresponde a la moneda de la lista. */
export function parDeMoneda(moneda: MonedaLista): ParReferencia | null {
  return moneda === "USD" ? null : PAR_POR_MONEDA[moneda];
}

/**
 * El precio de un plan en la moneda de su lista.
 *
 * Null cuando todavía no se puede saber: o el plan no tiene ancla en
 * dólares, o la lista no tiene tasa de venta.
 */
export function precioDePlan(lista: Lista, plan: PlanLista): number | null {
  if (plan.precioUsd === null) return null;
  if (!necesitaTasa(lista.moneda)) return plan.precioUsd;
  if (lista.tasa === null) return null;

  // Siempre HACIA ARRIBA, nunca al más cercano: 24 USD a 959,30 dan
  // 23.023,20, y redondear al más cercano daría 23.000, o sea vender por
  // debajo del ancla. Son 23 bolívares en un plan, pero el redondeo se
  // aplica a todos los planes de todas las listas y siempre para el mismo
  // lado: hacia abajo, la lista entera queda regalada de a poquito.
  //
  // El paso lo trae la lista y no una tabla por moneda: 100 en bolívares
  // es fino, y en pesos —- donde 7 USD son ~28.000 -— es una precisión
  // que nadie pone en una lista de precios.
  const paso = lista.redondeo;

  // La tolerancia NO es paranoia de punto flotante: arregla un precio que
  // salía mal a la vista.
  //
  // La tasa se guarda con seis decimales, así que ajustar un precio a mano
  // casi nunca vuelve a dar el número tipeado. Escribir 29.000 sobre un
  // plan de 7 USD guarda 29.000/7 = 4.142,857142857… redondeado a
  // 4.142,857143 —- hacia ARRIBA -— y 7 × 4.142,857143 da 29.000,000001.
  // Ese millonésimo de peso le alcanza a ceil para leer "se pasó" y saltar
  // al escalón siguiente: escribías 29.000 y la lista te devolvía 30.000.
  //
  // Una millonésima de paso es 0,001 pesos o 0,0001 bolívares: por debajo
  // de cualquier diferencia que exista como plata. Un excedente de verdad,
  // aunque sea de un peso, sigue subiendo al escalón de arriba.
  const TOLERANCIA = 1e-6;
  return Math.ceil((plan.precioUsd * lista.tasa) / paso - TOLERANCIA) * paso;
}

/**
 * La tasa de venta que implica cobrar `monto` por un plan que ancla en
 * `precioUsd`. Es la regla de tres que pidió el usuario, pero escrita
 * como lo que realmente es: editar un precio en bolívares es editar la
 * tasa. Los demás precios se re-derivan después desde su propia ancla,
 * así ninguno arrastra el error de redondeo del anterior.
 */
export function tasaDesdeMonto(monto: number, precioUsd: number): number | null {
  if (!Number.isFinite(monto) || monto <= 0) return null;
  if (!Number.isFinite(precioUsd) || precioUsd <= 0) return null;

  const tasa = monto / precioUsd;
  // El techo es el de la columna numeric(18,6); más que eso no es una
  // tasa, es un tipeo con el cero pegado.
  if (!Number.isFinite(tasa) || tasa <= 0 || tasa > 1_000_000_000) return null;

  return Math.round(tasa * 1_000_000) / 1_000_000;
}

/**
 * El monto como lo escribe el usuario: "6.400" en bolívares, "7" o "3,5"
 * en dólares.
 *
 * El número sale de formatMonto, que es el formateador de toda la app.
 * Lo que se saca es el símbolo —- en el mensaje va donde diga la
 * plantilla, no adelante -— y los decimales que no aportan: el usuario
 * escribe "US$7", no "US$7,00".
 */
export function formatMontoLista(valor: number, moneda: MonedaLista): string {
  const base = formatMonto(valor, moneda === "VES" ? "VES" : "COP");
  return base
    .replace(/^(Bs|\$)/, "")
    .replace(/,00$/, "")
    .replace(/(,\d)0$/, "$1");
}

/** El ancla en dólares, para mostrar en la tabla del panel. */
export function formatUsd(valor: number | null): string {
  if (valor === null) return "—";
  // El "$" de formatMonto significa pesos en esta app, así que acá el
  // código va detrás.
  return `${formatMontoLista(valor, "USD")} USD`;
}

/** La tasa de venta, con los decimales que tiene una tasa. */
export function formatTasa(valor: number, moneda: MonedaLista): string {
  return formatMonto(valor, moneda === "VES" ? "VES" : "COP");
}

/**
 * Cuánto se está cobrando por encima (o por debajo) de la tasa de
 * referencia del día: el P2P de Binance en bolívares, la TRM oficial en
 * pesos. Es el margen del usuario hecho explícito —- sin esto, ajustar
 * un precio a ojo es adivinar.
 */
export function margenSobreReferencia(lista: Lista): number | null {
  if (lista.tasa === null || !lista.tasaReferencia) return null;
  return (lista.tasa / lista.tasaReferencia - 1) * 100;
}

export function formatMargen(margen: number): string {
  const signo = margen > 0 ? "+" : "";
  return `${signo}${margen.toFixed(1).replace(".", ",")}%`;
}

/** Una línea del mensaje, o null si al plan todavía le falta algo. */
export function lineaDePlan(lista: Lista, plan: PlanLista): string | null {
  const precio = precioDePlan(lista, plan);
  if (precio === null || !plan.etiqueta) return null;

  return lista.plantilla
    .replaceAll("{monto}", formatMontoLista(precio, lista.moneda))
    .replaceAll("{etiqueta}", plan.etiqueta)
    .replaceAll("{sufijo}", plan.sufijo);
}

/**
 * El mensaje completo para WhatsApp: encabezado, cada grupo con su
 * título y sus líneas, y el pie.
 *
 * Un plan sin precio o sin etiqueta en esta moneda NO sale: es preferible
 * que falte una línea a mandarle a un cliente un "pendiente". Que falte
 * se avisa aparte, en pantalla.
 */
export function armarMensaje(lista: Lista): string {
  const bloques: string[] = [];

  const encabezado = lista.encabezado.trim();
  if (encabezado) bloques.push(encabezado);

  for (const grupo of lista.grupos) {
    const lineas = grupo.planes
      .map((plan) => lineaDePlan(lista, plan))
      .filter((linea): linea is string => linea !== null);

    if (lineas.length === 0) continue;

    const titulo = grupo.titulo?.trim();
    bloques.push((titulo ? [titulo, "", ...lineas] : lineas).join("\n"));
  }

  // El pie es del catálogo, pero lleva un {medios} que llena cada usuario
  // con sus propias cuentas. Si todavía no cargó ninguna el marcador se
  // borra en vez de salir crudo: es preferible un mensaje sin medios de
  // pago —- que se avisa aparte —- a uno que le muestre "{medios}" a un
  // cliente.
  const pie = lista.pie.replaceAll("{medios}", lista.mediosPago).trim();
  if (pie) bloques.push(pie);

  return bloques.join("\n\n");
}

export type Aviso = { tono: "alerta" | "falta"; texto: string };

/**
 * Un texto que termina en letra o número se quedó a mitad de una frase.
 *
 * Es al revés de lo que parece: los textos del usuario terminan en emoji
 * ("⚠️"), en punto o en asterisco de WhatsApp, así que pedir un final
 * "de verdad" daría falsos positivos. Lo que delata un corte es terminar
 * en medio de una palabra.
 */
function pareceCortado(texto: string): boolean {
  const limpio = texto.trimEnd();
  if (!limpio) return false;

  // Por punto de código y no por índice: el último carácter puede ser un
  // emoji, que ocupa dos posiciones.
  const ultimo = [...limpio].at(-1);
  return ultimo !== undefined && /[\p{L}\p{N}]/u.test(ultimo);
}

/**
 * Todo lo que hace que esta lista todavía no se pueda mandar tranquilo.
 *
 * Existe porque el daño acá no es un error en pantalla: es un mensaje que
 * sale para el chat de un cliente con el nombre de otra marca, con una
 * frase cortada a la mitad o sin la mitad de los precios. Si no se ve,
 * se manda.
 */
export function avisosDeLista(lista: Lista): Aviso[] {
  const avisos: Aviso[] = [];

  if (lista.revisar.trim()) {
    avisos.push({ tono: "alerta", texto: lista.revisar.trim() });
  }

  for (const [campo, texto] of [
    ["encabezado", lista.encabezado],
    ["pie", lista.pie],
  ] as const) {
    if (!texto.trim()) {
      avisos.push({ tono: "falta", texto: `Falta el ${campo} del mensaje.` });
    } else if (pareceCortado(texto)) {
      avisos.push({
        tono: "alerta",
        texto: `El ${campo} parece cortado: termina a mitad de una frase. Terminá de escribirlo antes de mandar la lista.`,
      });
    }
  }

  for (const marcador of ["{monto}", "{etiqueta}"]) {
    if (!lista.plantilla.includes(marcador)) {
      avisos.push({
        tono: "falta",
        texto: `El formato de línea no usa ${marcador}, así que eso no va a salir en el mensaje.`,
      });
    }
  }

  const planes = lista.grupos.flatMap((g) => g.planes);
  const sinPrecio = planes.filter((p) => p.precioUsd === null);
  const sinEtiqueta = planes.filter((p) => !p.etiqueta);

  if (sinPrecio.length > 0) {
    avisos.push({
      tono: "falta",
      texto: `${sinPrecio.length === 1 ? "Un plan" : `${sinPrecio.length} planes`} sin precio en dólares (${nombres(sinPrecio)}): no ${sinPrecio.length === 1 ? "sale" : "salen"} en el mensaje.`,
    });
  }

  if (sinEtiqueta.length > 0) {
    avisos.push({
      tono: "falta",
      texto: `${sinEtiqueta.length === 1 ? "Un plan" : `${sinEtiqueta.length} planes`} sin etiqueta en ${NOMBRE_MONEDA[lista.moneda]} (${nombres(sinEtiqueta)}): no ${sinEtiqueta.length === 1 ? "sale" : "salen"} en el mensaje.`,
    });
  }

  // Sin medios de cobro la lista se manda igual, con el bloque en blanco,
  // y el cliente se queda sin saber por dónde pagar. Eso no es un detalle
  // de formato: es la venta que no se cierra.
  if (lista.pie.includes("{medios}") && !lista.mediosPago.trim()) {
    avisos.push({
      tono: "falta",
      texto: `No cargaste tus medios de cobro en ${NOMBRE_MONEDA[lista.moneda]}: el mensaje sale sin decirle al cliente por dónde pagar. Se cargan una vez y valen para las cuatro marcas.`,
    });
  }

  const gruposSinTitulo = lista.grupos.filter((g) => !g.titulo && g.planes.length > 0);
  if (gruposSinTitulo.length > 0) {
    avisos.push({
      tono: "falta",
      texto: `Sin título en ${NOMBRE_MONEDA[lista.moneda]}: ${gruposSinTitulo.map((g) => g.nombre).join(", ")}. Los planes salen igual, pero sin encabezar el bloque.`,
    });
  }

  return avisos;
}

function nombres(planes: PlanLista[]): string {
  const hasta = planes.slice(0, 3).map((p) => p.nombre);
  return planes.length > 3 ? `${hasta.join(", ")}…` : hasta.join(", ");
}

/** La forma cruda con la que vuelven los proveedores desde Supabase. */
type FilaProveedor = {
  id: string;
  slug: string;
  nombre: string;
  orden: number;
  venta_publico_listas: FilaLista[] | null;
  venta_publico_grupos: FilaGrupo[] | null;
};

type FilaLista = {
  id: string;
  moneda: string;
  encabezado: string;
  pie: string;
  plantilla_linea: string;
  revisar: string;
  redondeo: number;
  /**
   * Lo propio del usuario que consulta. Llega como arreglo porque es una
   * tabla anidada, pero RLS deja pasar como mucho una fila: la suya. Vacío
   * cuando todavía no tiene uno —- un usuario nuevo empieza sin tasa y sin
   * medios de cobro, que es exactamente la verdad.
   */
  venta_publico_lista_usuario: FilaListaUsuario[] | null;
};

type FilaListaUsuario = {
  tasa: number | string | null;
  tasa_origen: string | null;
  tasa_fuente: string | null;
  tasa_detalle: string | null;
  tasa_referencia: number | string | null;
  tasa_referencia_at: string | null;
};

/** Los medios de cobro del usuario, uno por moneda. */
export type MediosPorMoneda = Partial<Record<MonedaLista, string>>;

type FilaGrupo = {
  id: string;
  titulo: string;
  orden: number;
  venta_publico_grupos_texto: { moneda: string; titulo: string }[] | null;
  venta_publico_planes: FilaPlan[] | null;
};

type FilaPlan = {
  id: string;
  etiqueta: string;
  precio_usd: number | string | null;
  orden: number;
  venta_publico_planes_texto:
    | { moneda: string; etiqueta: string; sufijo: string }[]
    | null;
};

function aNumero(valor: number | string | null): number | null {
  // numeric puede llegar como texto, y un string en una multiplicación
  // daría NaN en pantalla.
  return valor === null || valor === "" ? null : Number(valor);
}

/**
 * Arma una lista por cada combinación proveedor × moneda.
 *
 * El orden se resuelve acá y no en la consulta: PostgREST necesita
 * sintaxis propia para ordenar tablas anidadas a varios niveles, y todas
 * las listas de precios juntas entran en memoria sin despeinarse.
 */
export function construirListas(
  filas: FilaProveedor[],
  medios: MediosPorMoneda = {},
): Lista[] {
  const listas: Lista[] = [];

  const proveedores = [...filas].sort((a, b) => a.orden - b.orden);

  for (const moneda of ORDEN_MONEDAS) {
    for (const proveedor of proveedores) {
      const fila = (proveedor.venta_publico_listas ?? []).find(
        (l) => l.moneda === moneda,
      );
      if (!fila) continue;

      // RLS deja pasar como mucho una fila, la del usuario que consulta.
      const mio = (fila.venta_publico_lista_usuario ?? [])[0];

      const grupos: GrupoLista[] = (proveedor.venta_publico_grupos ?? [])
        .map((grupo) => ({
          id: grupo.id,
          nombre: grupo.titulo,
          orden: grupo.orden,
          titulo:
            (grupo.venta_publico_grupos_texto ?? []).find((t) => t.moneda === moneda)
              ?.titulo ?? null,
          planes: (grupo.venta_publico_planes ?? [])
            .map((plan) => {
              const texto = (plan.venta_publico_planes_texto ?? []).find(
                (t) => t.moneda === moneda,
              );
              return {
                id: plan.id,
                nombre: plan.etiqueta,
                precioUsd: aNumero(plan.precio_usd),
                orden: plan.orden,
                etiqueta: texto?.etiqueta ?? null,
                sufijo: texto?.sufijo ?? "",
              };
            })
            .sort((a, b) => a.orden - b.orden),
        }))
        .sort((a, b) => a.orden - b.orden);

      listas.push({
        id: fila.id,
        proveedorId: proveedor.id,
        slug: proveedor.slug,
        proveedor: proveedor.nombre,
        moneda,
        encabezado: fila.encabezado,
        pie: fila.pie,
        plantilla: fila.plantilla_linea,
        revisar: fila.revisar,
        redondeo: fila.redondeo,
        mediosPago: medios[moneda] ?? "",
        tasa: aNumero(mio?.tasa ?? null),
        tasaOrigen:
          mio?.tasa_origen === "fuente" || mio?.tasa_origen === "ajuste"
            ? mio.tasa_origen
            : null,
        tasaFuente: mio?.tasa_fuente ?? null,
        tasaDetalle: mio?.tasa_detalle ?? null,
        tasaReferencia: aNumero(mio?.tasa_referencia ?? null),
        tasaReferenciaAt: mio?.tasa_referencia_at ?? null,
        grupos,
      });
    }
  }

  return listas;
}

/**
 * El monto que tipea el usuario, que puede venir en dos formatos.
 *
 * "7.800" son siete mil ochocientos —- así los escribe y así se los
 * mostramos -— pero "10.5" son diez con cincuenta, porque el precio en
 * dólares se tipea igual de seguido con el punto del teclado numérico.
 * Number() a secas se equivocaría en uno de los dos casos, y equivocarse
 * acá significa cobrar diez veces de más o de menos.
 *
 * La regla: la coma siempre decide decimales. El punto solo es decimal
 * si aparece una vez y no deja tres dígitos atrás —- "1.500" se lee como
 * mil quinientos, que es lo que significa en una lista de precios.
 */
export function parsearMonto(crudo: string): number | null {
  const limpio = crudo.replace(/\s/g, "");
  if (!limpio || !/^[\d.,]+$/.test(limpio)) return null;

  const puntos = limpio.split(".").length - 1;
  const ultimoPunto = limpio.lastIndexOf(".");
  const puntoEsDecimal =
    !limpio.includes(",") &&
    puntos === 1 &&
    limpio.length - ultimoPunto - 1 !== 3;

  const normalizado = puntoEsDecimal
    ? limpio
    : limpio.replace(/\./g, "").replace(",", ".");

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}
